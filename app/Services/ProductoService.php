<?php

namespace App\Services;

use App\Enums\Estado;
use App\Exceptions\ReglaNegocioException;
use App\Models\Producto;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Precio de venta (RF12) y ficha pública (RF06). */
class ProductoService
{
    public function __construct(private AuditoriaService $auditoria) {}

    /** RF12 y RF10 */
    public function cambiarPrecio(string $id, float $precio, ?string $motivo, User $usuario): Producto
    {
        if (! $usuario->esAdministrador()) {
            throw ReglaNegocioException::prohibido('Solo el administrador puede fijar el precio de venta.');
        }
        if ($precio <= 0) {
            throw ReglaNegocioException::invalido('El precio debe ser mayor que cero.');
        }

        return DB::transaction(function () use ($id, $precio, $motivo, $usuario) {
            $producto = Producto::whereKey($id)->lockForUpdate()->first()
                ?? throw ReglaNegocioException::noEncontrado("El producto {$id} no existe.");

            $anterior = $producto->precio_venta;
            $producto->update(['precio_venta' => round($precio, 2)]);


            $this->auditoria->registrar($usuario, 'cambiar_precio', 'producto', $producto->id, 'precio_venta',
                $anterior === null ? null : Calculos::num($anterior).' COP',
                Calculos::num(round($precio, 2)).' COP',
                $motivo ?: 'Actualización del precio de venta');

            return $producto->refresh();
        });
    }

    /**
     * RF06 */
    public function fichaPublica(string $id): array
    {
        $producto = Producto::with(['lote', 'transformacionOrigen'])->find(strtoupper(trim($id)))
            ?? throw ReglaNegocioException::noEncontrado('No encontramos un producto con ese código.');

        $lote = $producto->lote;
        $bloqueado = $producto->estado === Estado::Bloqueado || $lote->estado === Estado::Bloqueado;
        $disponible = ! $bloqueado && $producto->estado === Estado::Liberado && $producto->cantidadDisponible() > 0;

        $estadoPublico = $bloqueado ? Estado::Bloqueado : $producto->estado;

        $etapas = $lote->transformaciones()
            ->orderBy('fecha')->orderBy('id')
            ->get(['etapa', 'fecha', 'producto_id'])
            ->map(fn ($t) => ['etapa' => $t->etapa, 'fecha' => $t->fecha?->format('Y-m-d')])
            ->all();

        return [

            'codigo' => $producto->id,
            'nombre' => $producto->nombre,
            'estado' => $estadoPublico->value,
            'estado_texto' => $estadoPublico->etiqueta(),
            'disponible_para_venta' => $disponible,
            'mensaje' => match (true) {
                $bloqueado => 'Este producto no está disponible para la venta.',
                $producto->estado === Estado::Pendiente => 'Este producto está en revisión de calidad y aún no está a la venta.',
                ! $disponible => 'Este producto está agotado.',
                default => 'Producto disponible.',
            },
            'presentacion' => [
                'cantidad_disponible' => $disponible ? $producto->cantidadDisponible() : 0,
                'unidad' => $producto->unidad,
            ],
            'origen' => [
                'lote' => $lote->id,
                'municipio' => $lote->origen,
                'departamento' => 'Huila',
                'fecha_recepcion' => $lote->fecha_recepcion?->format('Y-m-d'),
                'descripcion' => $lote->descripcion,
            ],
            'recorrido' => $etapas,
            'aviso' => 'Datos simulados con fines de demostración.',
        ];
    }
}
