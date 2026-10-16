<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Auditoria;
use App\Models\Transformacion;
use App\Services\AnalisisService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vistas del administrador: alertas vigentes (RF04) y auditoría general (RF10). */
class PanelController extends Controller
{
    public function alertas(Request $request, AnalisisService $analisis): JsonResponse
    {
        $request->validate(['lote' => ['nullable', 'string', 'max:20']]);

        $resultado = Transformacion::with('producto')
            ->when($request->query('lote'), fn ($q, $lote) => $q->where('lote_id', strtoupper($lote)))
            ->orderByDesc('fecha')->orderByDesc('id')
            ->get()
            ->map(fn (Transformacion $t) => [
                'lote_id' => $t->lote_id,
                'producto_id' => $t->producto_id,
                'etapa' => $t->etapa,
                'fecha' => $t->fecha?->format('Y-m-d'),
                'alertas' => $analisis->analizar($t)['alertas'],
            ])
            ->filter(fn ($fila) => count($fila['alertas']) > 0)
            ->values();


        return response()->json([
            'total' => $resultado->sum(fn ($fila) => count($fila['alertas'])),
            'transformaciones_con_alerta' => $resultado,
        ]);
    }

    public function auditoria(Request $request): JsonResponse
    {
        $request->validate([
            'entidad_id' => ['nullable', 'string', 'max:40'],
            'limite' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $registros = Auditoria::query()
            ->when($request->query('entidad_id'), fn ($q, $id) => $q->where('entidad_id', strtoupper($id)))
            ->orderByDesc('id')
            ->limit((int) $request->query('limite', 200))
            ->get(['id', 'created_at', 'usuario', 'accion', 'entidad', 'entidad_id', 'campo',
                'valor_anterior', 'valor_nuevo', 'motivo']);

        return response()->json(['total' => $registros->count(), 'auditoria' => $registros]);
    }
}
