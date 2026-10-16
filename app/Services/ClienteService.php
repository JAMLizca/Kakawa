<?php

namespace App\Services;

use App\Enums\Estado;
use App\Enums\Rol;
use App\Exceptions\ReglaNegocioException;
use App\Models\Producto;
use App\Models\Solicitud;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Compradores y solicitudes de compra.
 * - El registro siempre crea el rol "cliente": el rol no se recibe del formulario.
 * - Solo se puede solicitar un producto liberado, de un lote no bloqueado y con existencia.
 * - Aceptar vuelve a validar el estado: si el producto se bloqueó después (hora 12), no se acepta.
 * - Las solicitudes no descuentan inventario; el balance de masa no cambia.
 */
class ClienteService
{
    /** @param array{nombre:string,usuario:string,correo:string,telefono:string,ciudad:string,documento:string,password:string} $datos */
    public function registrar(array $datos): User
    {
        $usuario = new User;
        $usuario->forceFill([
            'usuario' => mb_strtolower(trim($datos['usuario'])),
            'nombre' => trim($datos['nombre']),
            'correo' => mb_strtolower(trim($datos['correo'])),
            'telefono' => trim($datos['telefono']),
            'ciudad' => trim($datos['ciudad']),
            'documento' => strtoupper(trim($datos['documento'])),
            'password' => $datos['password'],   // el modelo la guarda cifrada (cast "hashed")
            'rol' => Rol::Cliente,               // asignado por el servidor, nunca por el formulario
            'activo' => true,
        ])->save();

        return $usuario->refresh();
    }

    /** Productos que se pueden comprar: liberados, de lote no bloqueado y con existencia. */
    public function disponibles(): Collection
    {
        return Producto::with('lote')
            ->where('estado', Estado::Liberado->value)
            ->orderBy('id')
            ->get()
            ->filter(fn (Producto $p) => $p->lote && $p->lote->estado !== Estado::Bloqueado && $p->cantidadDisponible() > 0)
            ->values();
    }

    /** Catálogo. El precio solo se muestra a compradores con sesión. */
    public function catalogo(bool $conPrecio): array
    {
        return $this->disponibles()->map(fn (Producto $p) => array_filter([
            'codigo' => $p->id,
            'nombre' => $p->nombre,
            'cantidad_disponible' => $p->cantidadDisponible(),
            'unidad' => $p->unidad,
            'origen' => $p->lote->origen,
            'departamento' => 'Huila',
            'lote' => $p->lote_id,
            'etapas' => $p->lote->transformaciones()->count(),
            'precio_venta' => $conPrecio ? ($p->precio_venta === null ? null : (float) $p->precio_venta) : false,
        ], fn ($v) => $v !== false))->all();
    }

    public function solicitar(User $cliente, string $productoId, float $cantidad, ?string $mensaje): Solicitud
    {
        if ($cliente->rol !== Rol::Cliente) {
            throw ReglaNegocioException::prohibido('Solo los compradores registrados pueden solicitar compras.');
        }
        if ($cantidad <= 0) {
            throw ReglaNegocioException::invalido('La cantidad debe ser mayor que cero.');
        }

        return DB::transaction(function () use ($cliente, $productoId, $cantidad, $mensaje) {
            $producto = Producto::with('lote')->whereKey(strtoupper(trim($productoId)))->lockForUpdate()->first()
                ?? throw ReglaNegocioException::noEncontrado('No encontramos ese producto.');

            $this->validarVendible($producto, $cantidad);

            return Solicitud::create([
                'cliente_id' => $cliente->id,
                'producto_id' => $producto->id,
                'cantidad' => round($cantidad, 3),
                'unidad' => $producto->unidad,
                'mensaje' => $mensaje !== null && trim($mensaje) !== '' ? trim($mensaje) : null,
                'cliente_nombre' => $cliente->nombre,
                'cliente_correo' => $cliente->correo,
                'cliente_telefono' => $cliente->telefono,
            ]);
        });
    }

    /** El administrador acepta o rechaza una solicitud pendiente. */
    public function responder(int $id, string $estado, ?string $respuesta, User $admin): Solicitud
    {
        if (! $admin->esAdministrador()) {
            throw ReglaNegocioException::prohibido('Solo el administrador puede responder solicitudes.');
        }
        if (! in_array($estado, ['aceptada', 'rechazada'], true)) {
            throw ReglaNegocioException::invalido('La respuesta debe ser "aceptada" o "rechazada".');
        }
        $respuesta = $respuesta !== null ? trim($respuesta) : '';
        if ($estado === 'rechazada' && $respuesta === '') {
            throw ReglaNegocioException::invalido('Explique al comprador por qué se rechaza.');
        }

        return DB::transaction(function () use ($id, $estado, $respuesta, $admin) {
            $solicitud = Solicitud::whereKey($id)->lockForUpdate()->first()
                ?? throw ReglaNegocioException::noEncontrado("La solicitud {$id} no existe.");

            if ($solicitud->estado !== 'pendiente') {
                throw ReglaNegocioException::conflicto("La solicitud {$id} ya fue {$solicitud->estado}.", 'sin_cambio');
            }

            if ($estado === 'aceptada') {
                $producto = Producto::with('lote')->whereKey($solicitud->producto_id)->lockForUpdate()->first();
                $this->validarVendible($producto, (float) $solicitud->cantidad);
            }

            $solicitud->update([
                'estado' => $estado,
                'respuesta' => $respuesta !== '' ? $respuesta : null,
                'atendida_por' => $admin->id,
                'atendida_en' => now(),
            ]);

            return $solicitud->refresh();
        });
    }

    public function deCliente(User $cliente): Collection
    {
        return Solicitud::with('producto')->where('cliente_id', $cliente->id)->latest('id')->get();
    }

    public function todas(?string $estado): Collection
    {
        return Solicitud::with('producto')
            ->when($estado, fn ($q) => $q->where('estado', $estado))
            ->latest('id')->limit(500)->get();
    }

    public static function aArreglo(Solicitud $s, bool $conContacto): array
    {
        $datos = [
            'id' => $s->id,
            'producto_id' => $s->producto_id,
            'producto' => $s->producto?->nombre,
            'cantidad' => (float) $s->cantidad,
            'unidad' => $s->unidad,
            'mensaje' => $s->mensaje,
            'estado' => $s->estado,
            'respuesta' => $s->respuesta,
            'creada' => $s->created_at?->toIso8601String(),
            'atendida' => $s->atendida_en?->toIso8601String(),
        ];
        if ($conContacto) {
            $datos['cliente'] = [
                'nombre' => $s->cliente_nombre,
                'correo' => $s->cliente_correo,
                'telefono' => $s->cliente_telefono,
            ];
        }

        return $datos;
    }

    private function validarVendible(?Producto $producto, float $cantidad): void
    {
        if (! $producto) {
            throw ReglaNegocioException::noEncontrado('El producto ya no existe.');
        }
        if ($producto->estado === Estado::Bloqueado || $producto->lote?->estado === Estado::Bloqueado) {
            throw ReglaNegocioException::conflicto(
                "{$producto->id} está bloqueado y no se puede vender.", 'producto_bloqueado');
        }
        if ($producto->estado !== Estado::Liberado) {
            throw ReglaNegocioException::conflicto(
                "{$producto->id} aún no está liberado para la venta.", 'producto_no_liberado');
        }
        $disponible = $producto->cantidadDisponible();
        if ($cantidad > $disponible) {
            throw ReglaNegocioException::conflicto(
                'Solo hay '.Calculos::num($disponible)." {$producto->unidad} disponibles de {$producto->id}.",
                'existencia_insuficiente', ['disponible' => $disponible]);
        }
    }
}
