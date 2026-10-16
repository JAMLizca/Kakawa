<?php

namespace App\Services;

use App\Exceptions\ReglaNegocioException;
use App\Models\Auditoria;
use App\Models\Lote;
use App\Models\Producto;

/**
 * RF03
 */
class TrazabilidadService
{
    public function __construct(private AnalisisService $analisis) {}

    public function porLote(string $loteId): array
    {
        $lote = Lote::with(['transformaciones.producto', 'productos', 'registradoPor:id,usuario,nombre'])
            ->find($loteId)
            ?? throw ReglaNegocioException::noEncontrado("El lote {$loteId} no existe.");

        $transformaciones = $lote->transformaciones->sortBy([['fecha', 'asc'], ['id', 'asc']])->values();

        $consumoDirecto = round($transformaciones->whereNull('entrada_producto_id')->sum('cantidad_entrada'), 3);
        $disponibleLote = round($lote->cantidad_recibida - $consumoDirecto, 3);

        $productos = $lote->productos->sortBy('id')->values()->map(function (Producto $p) use ($transformaciones) {
            $consumido = round($transformaciones->where('entrada_producto_id', $p->id)->sum('cantidad_entrada'), 3);

            return [
                'id' => $p->id,
                'nombre' => $p->nombre,
                'cantidad' => $p->cantidad,
                'consumido' => $consumido,
                'disponible' => round($p->cantidad - $consumido, 3),
                'unidad' => $p->unidad,
                'precio_venta' => $p->precio_venta,
                'estado' => $p->estado->value,
                'motivo_estado' => $p->motivo_estado,
            ];
        });

        return [
            'lote' => [
                'id' => $lote->id,
                'productor' => $lote->productor,
                'origen' => $lote->origen,
                'fecha_recepcion' => $lote->fecha_recepcion?->format('Y-m-d'),
                'cantidad_recibida' => $lote->cantidad_recibida,
                'unidad' => $lote->unidad,
                'descripcion' => $lote->descripcion,
                'estado' => $lote->estado->value,
                'motivo_estado' => $lote->motivo_estado,
                'registrado_por' => $lote->registradoPor?->usuario,
            ],
            'inventario' => [
                'recibido' => $lote->cantidad_recibida,
                'consumido' => $consumoDirecto,
                'disponible' => $disponibleLote,
                'unidad' => $lote->unidad,
            ],
            'etapas' => $transformaciones->map(fn ($t) => [
                'operacion_id' => $t->operacion_id,
                'etapa' => $t->etapa,
                'responsable' => $t->responsable,
                'fecha' => $t->fecha?->format('Y-m-d'),
                'entrada_desde' => $t->entrada_producto_id ?? $lote->id,
                'cantidad_entrada' => $t->cantidad_entrada,
                'producto_salida' => $t->producto_id,
                'cantidad_salida' => $t->cantidad_salida,
                'unidad' => $t->unidad,
                'insumos_agregados' => $t->insumos_agregados,
                'incidencias' => $t->incidencias,
            ] + $this->analisis->analizar($t))->all(),
            'productos' => $productos->all(),
            // Hora 12: qué cantidades quedan comprometidas si se bloquea el lote.
            'afectacion' => [
                'disponible_en_lote' => $disponibleLote,
                'productos_total' => round($productos->sum('cantidad'), 3),
                'productos_disponible' => round($productos->sum('disponible'), 3),
                'productos_bloqueados' => $productos->where('estado', 'bloqueado')->pluck('id')->all(),
                'unidad' => $lote->unidad,
            ],
        ];
    }

   
    public function porProducto(string $productoId): array
    {
        $producto = Producto::find($productoId)
            ?? throw ReglaNegocioException::noEncontrado("El producto {$productoId} no existe.");

        $recorrido = $this->porLote($producto->lote_id);
        $etapasPorSalida = collect($recorrido['etapas'])->keyBy('producto_salida');

        $camino = [];
        $actual = $producto->id;
        while ($actual !== null && isset($etapasPorSalida[$actual])) {
            $etapa = $etapasPorSalida[$actual];
            array_unshift($camino, $etapa);
            $actual = $etapa['entrada_desde'] !== $producto->lote_id ? $etapa['entrada_desde'] : null;
        }

        return $recorrido + ['producto_consultado' => $producto->id, 'camino' => $camino];
    }

    /** RF10 */
    public function historial(string $loteId): array
    {
        $productos = Producto::where('lote_id', $loteId)->pluck('id');

        return Auditoria::query()
            ->where(fn ($q) => $q->where('entidad', 'lote')->where('entidad_id', $loteId))
            ->orWhere(fn ($q) => $q->where('entidad', 'producto')->whereIn('entidad_id', $productos))
            ->orderBy('id')
            ->get(['id', 'created_at', 'usuario', 'accion', 'entidad', 'entidad_id', 'campo',
                'valor_anterior', 'valor_nuevo', 'motivo'])
            ->toArray();
    }
}