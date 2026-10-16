<?php

namespace App\Services;

use App\Enums\Estado;
use App\Exceptions\ReglaNegocioException;
use App\Models\Lote;
use App\Models\Producto;
use App\Models\Transformacion;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * RF02 y RF08
 */
class TransformacionService
{
    private const TOLERANCIA = 0.0005;

    public function __construct(
        private AuditoriaService $auditoria,
        private AnalisisService $analisis,
    ) {}

    /**
     * @return array{transformacion: Transformacion, repetida: bool, analisis: array}
     */
    public function registrar(array $datos, User $usuario): array
    {
        $operacionId = trim((string) ($datos['operacion_id'] ?? ''));

        if ($operacionId === '') {
            throw ReglaNegocioException::invalido('Falta el identificador de la operación (operacion_id).');
        }

        $huella = $this->huella($datos);

        // Reenvío de una operación ya registrada.
        if ($existente = Transformacion::where('operacion_id', $operacionId)->first()) {
            return $this->repetida($existente, $huella);
        }

        try {
            $transformacion = DB::transaction(fn () => $this->ejecutar($datos, $usuario, $operacionId, $huella));
        } catch (UniqueConstraintViolationException $e) {
            
            if ($existente = Transformacion::where('operacion_id', $operacionId)->first()) {
                return $this->repetida($existente, $huella);
            }
            throw $e;
        }

        return [
            'transformacion' => $transformacion,
            'repetida' => false,
            'analisis' => $this->analisis->analizar($transformacion),
        ];
    }

    private function ejecutar(array $datos, User $usuario, string $operacionId, string $huella): Transformacion
    {
        // Bloquea la fila del lote
        $lote = Lote::whereKey($datos['lote_id'] ?? null)->lockForUpdate()->first()

            ?? throw ReglaNegocioException::noEncontrado('El lote indicado no existe.');

        if ($lote->estado === Estado::Bloqueado) {
            throw ReglaNegocioException::conflicto(
                "El lote {$lote->id} está bloqueado; no se puede transformar.", 'lote_bloqueado');
        }

        $entradaProducto = null;
        if (filled($datos['entrada_producto_id'] ?? null)) {
            $entradaProducto = Producto::whereKey($datos['entrada_producto_id'])->lockForUpdate()->first()
                ?? throw ReglaNegocioException::noEncontrado('El producto de entrada no existe.');

            if ($entradaProducto->lote_id !== $lote->id) {
                throw ReglaNegocioException::invalido('La entrada debe provenir del mismo lote (un solo lote por operación).');
            }
            if ($entradaProducto->estado === Estado::Bloqueado) {
                throw ReglaNegocioException::conflicto(
                    "El producto {$entradaProducto->id} está bloqueado; no se puede transformar.", 'producto_bloqueado');
            }
        }

        $unidad = $lote->unidad;
        if (filled($datos['unidad'] ?? null) && $datos['unidad'] !== $unidad) {
            throw ReglaNegocioException::invalido("La unidad debe ser la del lote ({$unidad}).");
        }

        $entrada = round((float) ($datos['cantidad_entrada'] ?? 0), 3);
        $salida = round((float) ($datos['cantidad_salida'] ?? -1), 3);
        if ($entrada <= 0) {
            throw ReglaNegocioException::invalido('La cantidad de entrada debe ser mayor que cero.');
        }
        if ($salida < 0) {

            throw ReglaNegocioException::invalido('La cantidad de salida no puede ser negativa.');
        }

        // RF08 
        $origen = $entradaProducto ?? $lote;
        $disponible = $origen->cantidadDisponible();
        if ($entrada > $disponible + self::TOLERANCIA) {
            throw ReglaNegocioException::conflicto(
                sprintf('Existencia insuficiente: disponible %s %s, solicitado %s %s.',
                    Calculos::num($disponible), $unidad, Calculos::num($entrada), $unidad),
                'existencia_insuficiente',
                ['disponible' => $disponible, 'solicitado' => $entrada, 'unidad' => $unidad],
            );
        }

        $insumos = filled($datos['insumos_agregados'] ?? null) ? trim($datos['insumos_agregados']) : null;
        if ($salida > $entrada + self::TOLERANCIA && $insumos === null) {
            throw ReglaNegocioException::invalido(
                'Una salida mayor que la entrada requiere registrar los insumos agregados.');
        }

        $etapa = trim((string) $datos['etapa']);

        $producto = Producto::create([
            'id' => $this->siguienteProductoId($lote),
            'nombre' => filled($datos['producto_nombre'] ?? null) ? trim($datos['producto_nombre']) : "{$etapa} de {$lote->id}",
            'lote_id' => $lote->id,
            'cantidad' => $salida,
            'unidad' => $unidad,
            'precio_venta' => filled($datos['precio_venta'] ?? null) ? round((float) $datos['precio_venta'], 2) : null,
            'estado' => Estado::Pendiente,
        ]);


        $transformacion = Transformacion::create([
            'operacion_id' => $operacionId,
            'huella' => $huella,
            'lote_id' => $lote->id,
            'entrada_producto_id' => $entradaProducto?->id,
            'producto_id' => $producto->id,
            'etapa' => $etapa,
            'responsable' => trim((string) $datos['responsable']),
            'fecha' => $datos['fecha'],
            'cantidad_entrada' => $entrada,
            'cantidad_salida' => $salida,
            'unidad' => $unidad,
            'insumos_agregados' => $insumos,
            'incidencias' => $datos['incidencias'] ?? null,
            'costo_etapa' => round((float) ($datos['costo_etapa'] ?? 0), 2),
            'costos_incluidos' => $datos['costos_incluidos'] ?? null,
            'registrado_por' => $usuario->id,
        ]);

        // RF10
        $this->auditoria->registrar($usuario, 'transformar',
            $entradaProducto ? 'producto' : 'lote', $origen->id,
            'cantidad_disponible',
            Calculos::num($disponible).' '.$unidad,
            Calculos::num(round($disponible - $entrada, 3)).' '.$unidad,
            "Operación {$operacionId}: etapa {$etapa}");

        $this->auditoria->registrar($usuario, 'crear', 'producto', $producto->id,
            'cantidad', null, Calculos::num($salida).' '.$unidad,
            "Salida de la etapa {$etapa} del lote {$lote->id}");


        return $transformacion->load(['producto', 'lote']);
    }

    
    private function siguienteProductoId(Lote $lote): string
    {
        $cantidad = Producto::where('lote_id', $lote->id)->count();

        return sprintf('%s-P%02d', $lote->id, $cantidad + 1);
    }

    private function repetida(Transformacion $existente, string $huella): array
    {
        if (! hash_equals($existente->huella, $huella)) {
            throw ReglaNegocioException::conflicto(
                'Este identificador de operación ya se usó con datos distintos. Genere una operación nueva.',
                'operacion_en_conflicto', ['operacion_id' => $existente->operacion_id]);
        }

        $existente->load(['producto', 'lote']);

        return [
            'transformacion' => $existente,
            'repetida' => true,
            'analisis' => $this->analisis->analizar($existente),
        ];
    }

  
    private function huella(array $datos): string
    {
        $num = fn ($v, int $d) => filled($v) ? number_format((float) $v, $d, '.', '') : null;

        $txt = fn ($v) => filled($v) ? trim((string) $v) : null;

        $normalizado = [
            'lote_id' => $txt($datos['lote_id'] ?? null),
            'entrada_producto_id' => $txt($datos['entrada_producto_id'] ?? null),
            'etapa' => $txt($datos['etapa'] ?? null),
            'responsable' => $txt($datos['responsable'] ?? null),
            'fecha' => $txt($datos['fecha'] ?? null),
            'cantidad_entrada' => $num($datos['cantidad_entrada'] ?? null, 3),
            'cantidad_salida' => $num($datos['cantidad_salida'] ?? null, 3),
            'insumos_agregados' => $txt($datos['insumos_agregados'] ?? null),
            'incidencias' => $txt($datos['incidencias'] ?? null),
            'costo_etapa' => $num($datos['costo_etapa'] ?? null, 2),
            'costos_incluidos' => $txt($datos['costos_incluidos'] ?? null),
            'precio_venta' => $num($datos['precio_venta'] ?? null, 2),
            'producto_nombre' => $txt($datos['producto_nombre'] ?? null),
        ];

        return hash('sha256', json_encode($normalizado, JSON_UNESCAPED_UNICODE));
    }
}