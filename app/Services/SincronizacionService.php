<?php

namespace App\Services;

use App\Exceptions\ReglaNegocioException;
use App\Http\Controllers\Api\LoteController;
use App\Http\Requests\CambiarEstadoRequest;
use App\Http\Requests\CambiarPrecioRequest;
use App\Http\Requests\ResponderSolicitudRequest;
use App\Http\Requests\SolicitudCompraRequest;
use App\Http\Requests\StoreLoteRequest;
use App\Http\Requests\StoreTransformacionRequest;
use App\Models\Sincronizacion;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Routing\Redirector;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Captura sin conexión: aplica en MySQL las operaciones que el navegador guardó en IndexedDB.
 *
 * Reglas:
 *  - Cada operación pasa por la MISMA validación (FormRequest) y el MISMO servicio que su ruta normal:
 *    inventario, bloqueos, permisos y auditoría se aplican igual que con conexión.
 *  - Cada operación se aplica en su propia transacción: si una falla, las demás siguen.
 *  - Idempotente: una operación con un id_temporal ya aplicado devuelve el resultado guardado.
 *  - Los identificadores TMP-… que lleguen en los datos se traducen al id real ya generado,
 *    en este mismo envío o en uno anterior.
 *  - DELETE se rechaza: en Kakawa la trazabilidad no se borra (también lo impiden los triggers).
 */
class SincronizacionService
{
    /** Campos de `datos` que pueden traer un identificador TMP-… creado sin conexión. */
    private const REFERENCIAS = ['id', 'lote_id', 'entrada_producto_id', 'producto_id'];

    /** Roles que pueden hacer cada operación. Cada servicio vuelve a validar su permiso. */
    private const PERMISOS = [
        'lote.CREATE' => ['operador', 'administrador'],
        'transformacion.CREATE' => ['operador', 'administrador'],
        'lote.UPDATE' => ['administrador'],
        'producto.UPDATE' => ['administrador'],
        'solicitud.CREATE' => ['cliente'],
        'solicitud.UPDATE' => ['administrador'],
    ];

    /** @var array<string, string> TMP-… => id real, dentro del envío actual. */
    private array $mapa = [];

    public function __construct(
        private LoteService $lotes,
        private TransformacionService $transformaciones,
        private EstadoService $estados,
        private ProductoService $productos,
        private ClienteService $clientes,
    ) {}

    /**
     * @param  list<array{id_temporal: string, entidad: string, accion: string, datos: array}>  $operaciones
     * @return list<array> un resultado por operación, en el mismo orden
     */
    public function procesar(array $operaciones, User $usuario): array
    {
        $this->mapa = [];

        return array_map(fn (array $op) => $this->procesarUna($op, $usuario), $operaciones);
    }

    private function procesarUna(array $op, User $usuario): array
    {
        $base = ['id_temporal' => $op['id_temporal'], 'entidad' => $op['entidad'], 'accion' => $op['accion']];
        $clave = "{$op['entidad']}.{$op['accion']}";

        // 1. Ya aplicada antes (el navegador no recibió la respuesta y reenvió): no se aplica dos veces.
        $previa = Sincronizacion::where('id_temporal', $op['id_temporal'])->first();
        if ($previa) {
            if ((int) $previa->usuario_id !== (int) $usuario->id) {
                return $base + $this->rechazo('id_temporal_en_uso', 'Ese identificador temporal pertenece a otro usuario.');
            }
            if ($previa->id_real !== null) {
                $this->mapa[$op['id_temporal']] = $previa->id_real;
            }

            return $base + [
                'estado' => 'aplicada',
                'repetida' => true,
                'id_real' => $previa->id_real,
                'mensaje' => 'Ya estaba sincronizada; no se aplicó dos veces.',
                'datos' => $previa->resultado,
            ];
        }

        // 2. Operación y permiso.
        if ($op['accion'] === 'DELETE') {
            return $base + $this->rechazo('no_permitido',
                'En Kakawa los registros de trazabilidad no se borran. Para retirar un lote o producto, bloquéelo con un motivo.');
        }
        if (! isset(self::PERMISOS[$clave])) {
            return $base + $this->rechazo('operacion_invalida', "La operación {$clave} no se puede capturar sin conexión.");
        }
        if (! in_array($usuario->rol->value, self::PERMISOS[$clave], true)) {
            return $base + $this->rechazo('permiso_denegado', 'Su usuario no tiene permiso para esta acción.');
        }

        // 3. Aplicar con la validación y el servicio de siempre.
        try {
            $datos = $this->resolverReferencias($op['datos'] ?? [], $usuario);

            $resultado = DB::transaction(function () use ($op, $clave, $datos, $usuario) {
                $r = $this->ejecutar($clave, $datos, $usuario);

                Sincronizacion::create([
                    'id_temporal' => $op['id_temporal'],
                    'usuario_id' => $usuario->id,
                    'entidad' => $op['entidad'],
                    'accion' => $op['accion'],
                    'id_real' => $r['id_real'],
                    'resultado' => $r['datos'],
                ]);

                return $r;
            });
        } catch (ValidationException $e) {
            return $base + [
                'estado' => 'rechazada',
                'codigo' => 'dato_invalido',
                'mensaje' => collect($e->errors())->flatten()->first() ?? 'Revise los datos.',
                'errores' => $e->errors(),
            ];
        } catch (ReglaNegocioException $e) {
            return $base + $this->rechazo($e->codigo, $e->getMessage(), $e->datos ?: null);
        } catch (Throwable $e) {
            // Falla inesperada (p. ej. la base no responde): el navegador la reintenta más tarde.
            report($e);

            return $base + [
                'estado' => 'reintentar',
                'codigo' => 'error_interno',
                'mensaje' => 'El servidor no pudo aplicar este registro ahora; se intentará de nuevo.',
            ];
        }

        if ($resultado['id_real'] !== null) {
            $this->mapa[$op['id_temporal']] = $resultado['id_real'];
        }

        return $base + [
            'estado' => 'aplicada',
            'repetida' => $resultado['repetida'],
            'id_real' => $resultado['id_real'],
            'mensaje' => $resultado['mensaje'],
            'datos' => $resultado['datos'],
        ];
    }

    /** @return array{id_real: ?string, repetida: bool, mensaje: string, datos: array} */
    private function ejecutar(string $clave, array $datos, User $usuario): array
    {
        return match ($clave) {
            'lote.CREATE' => $this->crearLote($datos, $usuario),
            'transformacion.CREATE' => $this->crearTransformacion($datos, $usuario),
            'lote.UPDATE' => $this->cambiarEstado('lote', $datos, $usuario),
            'producto.UPDATE' => array_key_exists('precio_venta', $datos)
                ? $this->cambiarPrecio($datos, $usuario)
                : $this->cambiarEstado('producto', $datos, $usuario),
            'solicitud.CREATE' => $this->crearSolicitud($datos, $usuario),
            'solicitud.UPDATE' => $this->responderSolicitud($datos, $usuario),
        };
    }

    private function crearLote(array $datos, User $usuario): array
    {
        $lote = $this->lotes->registrar($this->validar(StoreLoteRequest::class, $datos, $usuario), $usuario);

        return [
            'id_real' => $lote->id,
            'repetida' => false,
            'mensaje' => "Lote {$lote->id} registrado.",
            'datos' => LoteController::resumen($lote),
        ];
    }

    /** El operacion_id ya es idempotente en TransformacionService: un reenvío no consume dos veces. */
    private function crearTransformacion(array $datos, User $usuario): array
    {
        $r = $this->transformaciones->registrar($this->validar(StoreTransformacionRequest::class, $datos, $usuario), $usuario);
        $t = $r['transformacion'];

        return [
            'id_real' => $t->producto_id,
            'repetida' => $r['repetida'],
            'mensaje' => $r['repetida']
                ? "La transformación ya estaba registrada (producto {$t->producto_id})."
                : "Transformación registrada. Producto generado: {$t->producto_id}.",
            'datos' => [
                'operacion_id' => $t->operacion_id,
                'lote_id' => $t->lote_id,
                'entrada_desde' => $t->entrada_producto_id ?? $t->lote_id,
                'producto_id' => $t->producto_id,
                'etapa' => $t->etapa,
                'cantidad_entrada' => $t->cantidad_entrada,
                'cantidad_salida' => $t->cantidad_salida,
                'unidad' => $t->unidad,
            ],
        ];
    }

    private function cambiarEstado(string $tipo, array $datos, User $usuario): array
    {
        $id = $this->idObligatorio($datos);
        $v = $this->validar(CambiarEstadoRequest::class, $datos, $usuario);
        $r = $this->estados->cambiar($tipo, $id, $v['estado'], $v['motivo'], $usuario);
        $e = $r['entidad'];

        return [
            'id_real' => $e->id,
            'repetida' => false,
            'mensaje' => ucfirst($tipo)." {$e->id}: {$e->estado->etiqueta()}.",
            'datos' => ['id' => $e->id, 'estado' => $e->estado->value, 'productos_afectados' => $r['productos_afectados']],
        ];
    }

    private function cambiarPrecio(array $datos, User $usuario): array
    {
        $id = $this->idObligatorio($datos);
        $v = $this->validar(CambiarPrecioRequest::class, $datos, $usuario);
        $p = $this->productos->cambiarPrecio($id, (float) $v['precio_venta'], $v['motivo'] ?? null, $usuario);

        return [
            'id_real' => $p->id,
            'repetida' => false,
            'mensaje' => "Precio de {$p->id} actualizado.",
            'datos' => ['id' => $p->id, 'precio_venta' => $p->precio_venta],
        ];
    }

    private function crearSolicitud(array $datos, User $usuario): array
    {
        $v = $this->validar(SolicitudCompraRequest::class, $datos, $usuario);
        $s = $this->clientes->solicitar($usuario, $v['producto_id'], (float) $v['cantidad'], $v['mensaje'] ?? null);

        return [
            'id_real' => (string) $s->id,
            'repetida' => false,
            'mensaje' => "Solicitud enviada: {$s->producto_id}.",
            'datos' => ClienteService::aArreglo($s->load('producto'), false),
        ];
    }

    private function responderSolicitud(array $datos, User $usuario): array
    {
        $id = $this->idObligatorio($datos);
        if (! ctype_digit($id)) {
            throw ReglaNegocioException::invalido('El número de la solicitud no es válido.');
        }
        $v = $this->validar(ResponderSolicitudRequest::class, $datos, $usuario);
        $s = $this->clientes->responder((int) $id, $v['estado'], $v['respuesta'] ?? null, $usuario);

        return [
            'id_real' => (string) $s->id,
            'repetida' => false,
            'mensaje' => "Solicitud {$s->id} {$s->estado}.",
            'datos' => ['id' => $s->id, 'estado' => $s->estado, 'respuesta' => $s->respuesta],
        ];
    }

    /**
     * Valida con el FormRequest de la ruta normal: mismas reglas, mismos mensajes en español
     * y mismo prepareForValidation/withValidator (p. ej. la fecha no puede ser anterior a la recepción).
     */
    private function validar(string $clase, array $datos, User $usuario): array
    {
        /** @var FormRequest $peticion */
        $peticion = $clase::create('/api/sincronizar', 'POST', $datos);
        $peticion->setContainer(app())->setRedirector(app(Redirector::class));
        $peticion->setUserResolver(fn () => $usuario);
        $peticion->validateResolved();

        return $peticion->validated();
    }

    private function idObligatorio(array $datos): string
    {
        $id = strtoupper(trim((string) ($datos['id'] ?? '')));
        if ($id === '') {
            throw ReglaNegocioException::invalido('Falta el identificador del registro que se va a modificar.');
        }

        return $id;
    }

    /** Cambia TMP-… por el id real (de este envío o de uno anterior del mismo usuario). */
    private function resolverReferencias(array $datos, User $usuario): array
    {
        foreach (self::REFERENCIAS as $campo) {
            $valor = $datos[$campo] ?? null;
            if (! is_string($valor) || ! str_starts_with(strtoupper($valor), 'TMP-')) {
                continue;
            }
            $temporal = strtoupper($valor);

            $real = $this->mapa[$temporal]
                ?? Sincronizacion::where('id_temporal', $temporal)->where('usuario_id', $usuario->id)->value('id_real');

            if ($real === null) {
                throw ReglaNegocioException::conflicto(
                    'Depende de un registro hecho sin conexión que no se pudo sincronizar. Revise primero ese registro.',
                    'dependencia_pendiente', ['referencia' => $temporal]);
            }
            $datos[$campo] = $real;
        }

        return $datos;
    }

    private function rechazo(string $codigo, string $mensaje, ?array $datos = null): array
    {
        return array_filter([
            'estado' => 'rechazada',
            'codigo' => $codigo,
            'mensaje' => $mensaje,
            'datos' => $datos,
        ], fn ($v) => $v !== null);
    }
}
