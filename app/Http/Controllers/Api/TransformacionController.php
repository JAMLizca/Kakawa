<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransformacionRequest;
use App\Services\TransformacionService;
use App\Services\VistaPorRol;
use Illuminate\Http\JsonResponse;

class TransformacionController extends Controller
{
    /**
     * RF02 y RF08
     */
    public function store(StoreTransformacionRequest $request, TransformacionService $servicio): JsonResponse
    {
        $resultado = $servicio->registrar($request->validated(), $request->user());
        $t = $resultado['transformacion'];
        $origen = $t->entrada_producto_id ? $t->productoEntrada : $t->lote;

        return response()->json([
            'mensaje' => $resultado['repetida']
                ? 'Esta operación ya estaba registrada; no se consumió inventario de nuevo.'
                : "Transformación registrada. Producto generado: {$t->producto_id}.",
            'repetida' => $resultado['repetida'],
            'transformacion' => [
                'operacion_id' => $t->operacion_id,
                'lote_id' => $t->lote_id,
                'entrada_desde' => $t->entrada_producto_id ?? $t->lote_id,

                'producto_id' => $t->producto_id,
                'etapa' => $t->etapa,
                'responsable' => $t->responsable,
                'fecha' => $t->fecha?->format('Y-m-d'),
                'cantidad_entrada' => $t->cantidad_entrada,
                'cantidad_salida' => $t->cantidad_salida,
                'unidad' => $t->unidad,
                'insumos_agregados' => $t->insumos_agregados,
                'incidencias' => $t->incidencias,
            ],
            'disponible_restante' => $origen->cantidadDisponible(),
            'analisis' => VistaPorRol::analisis($resultado['analisis'], $request->user()),
        ], $resultado['repetida'] ? 200 : 201);
    }
}
