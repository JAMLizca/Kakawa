<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\SincronizarRequest;
use App\Services\SincronizacionService;
use Illuminate\Http\JsonResponse;

/**
 * POST /api/sincronizar: recibe en lote (bulk) lo que se capturó sin conexión.
 * Responde 200 con un resultado por operación: aplicada (con su id real), rechazada (con el motivo)
 * o reintentar (falla temporal del servidor).
 */
class SincronizacionController extends Controller
{
    public function __invoke(SincronizarRequest $request, SincronizacionService $servicio): JsonResponse
    {
        $resultados = $servicio->procesar($request->validated('operaciones'), $request->user());
        $conteo = collect($resultados)->countBy('estado');

        $aplicadas = $conteo->get('aplicada', 0);
        $rechazadas = $conteo->get('rechazada', 0);
        $reintentar = $conteo->get('reintentar', 0);

        return response()->json([
            'mensaje' => $rechazadas || $reintentar
                ? "Sincronización parcial: {$aplicadas} aplicadas, {$rechazadas} rechazadas, {$reintentar} por reintentar."
                : "Sincronización completa: {$aplicadas} ".($aplicadas === 1 ? 'registro aplicado.' : 'registros aplicados.'),
            'resumen' => ['aplicadas' => $aplicadas, 'rechazadas' => $rechazadas, 'reintentar' => $reintentar],
            'resultados' => $resultados,
        ]);
    }
}
