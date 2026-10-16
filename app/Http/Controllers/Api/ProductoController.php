<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CambiarEstadoRequest;
use App\Http\Requests\CambiarPrecioRequest;
use App\Services\EstadoService;
use App\Services\ProductoService;
use App\Services\TrazabilidadService;
use App\Services\VistaPorRol;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductoController extends Controller
{
    /** RF03  */
    public function show(Request $request, string $producto, TrazabilidadService $trazabilidad): JsonResponse
    {
        $recorrido = $trazabilidad->porProducto(strtoupper($producto));

        return response()->json(VistaPorRol::trazabilidad($recorrido, $request->user()));
    }

    /** RF09: liberar o bloquear un producto (aministrador). */
    public function estado(CambiarEstadoRequest $request, string $producto, EstadoService $estados): JsonResponse
    {
        $resultado = $estados->cambiar('producto', strtoupper($producto), $request->estado, $request->motivo, $request->user());
        $p = $resultado['entidad'];

        return response()->json([

            'mensaje' => "Producto {$p->id}: {$p->estado->etiqueta()}.",
            'producto' => [
                'id' => $p->id,
                'estado' => $p->estado->value,
                'motivo_estado' => $p->motivo_estado,
            ],
        ]);
    }

    /** RF12: fijar el precio de venta. */
    public function precio(CambiarPrecioRequest $request, string $producto, ProductoService $productos): JsonResponse
    {
        $p = $productos->cambiarPrecio(strtoupper($producto), (float) $request->precio_venta, $request->motivo, $request->user());

        return response()->json([
            'mensaje' => "Precio de {$p->id} actualizado.",
            'producto' => ['id' => $p->id, 'precio_venta' => $p->precio_venta],
        ]);
    }
}
