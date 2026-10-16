<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CambiarEstadoRequest;
use App\Http\Requests\StoreLoteRequest;
use App\Models\Lote;
use App\Services\EstadoService;
use App\Services\LoteService;
use App\Services\TrazabilidadService;
use App\Services\VistaPorRol;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoteController extends Controller
{
    /** RF11  */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'origen' => ['nullable', 'string', 'max:120'],
            'estado' => ['nullable', 'in:pendiente,liberado,bloqueado'],
        ], ['estado.in' => 'El estado debe ser pendiente, liberado o bloqueado.']);

        $lotes = Lote::conInventario()
            ->filtrar($request->query('origen'), $request->query('estado'))
            ->orderBy('id')
            ->get()
            ->map(fn (Lote $l) => self::resumen($l));


        return response()->json([
            'filtros' => ['origen' => $request->query('origen'), 'estado' => $request->query('estado')],
            'total' => $lotes->count(),
            'lotes' => $lotes,
            'origenes' => Lote::query()->distinct()->orderBy('origen')->pluck('origen'),
        ]);
    }

    /** RF01: recepción de un lote. */
    public function store(StoreLoteRequest $request, LoteService $servicio): JsonResponse
    {
        $lote = $servicio->registrar($request->validated(), $request->user());

        return response()->json([
            'mensaje' => "Lote {$lote->id} registrado.",
            'lote' => self::resumen($lote),
        ], 201);
    }

    /** RF03: trazabilidad completa del lote. */
    public function show(Request $request, string $lote, TrazabilidadService $trazabilidad): JsonResponse
    {
        $recorrido = $trazabilidad->porLote(strtoupper($lote));

        return response()->json(VistaPorRol::trazabilidad($recorrido, $request->user()));
    }

    /** RF10: historial del lote y de sus productos. */
    public function historial(string $lote, TrazabilidadService $trazabilidad): JsonResponse
    {
        $id = strtoupper($lote);
        $trazabilidad->porLote($id); // 404 claro si el lote no existe


        return response()->json(['lote' => $id, 'historial' => $trazabilidad->historial($id)]);
    }

    /** RF09: liberar o bloquear el lote y tambem sus productos */
    public function estado(CambiarEstadoRequest $request, string $lote, EstadoService $estados): JsonResponse
    {
        $resultado = $estados->cambiar('lote', strtoupper($lote), $request->estado, $request->motivo, $request->user());

        $afectados = $resultado['productos_afectados'];

        return response()->json([
            'mensaje' => "Lote {$resultado['entidad']->id}: {$resultado['entidad']->estado->etiqueta()}."
                .($afectados ? ' Productos bloqueados: '.implode(', ', $afectados).'.' : ''),
            'lote' => self::resumen($resultado['entidad']),
            'productos_afectados' => $afectados,
        ]);
    }

    public static function resumen(Lote $lote): array
    {
        return [
            'id' => $lote->id,
            'productor' => $lote->productor,
            'origen' => $lote->origen,
            'fecha_recepcion' => $lote->fecha_recepcion?->format('Y-m-d'),
            'descripcion' => $lote->descripcion,
            'recibido' => $lote->cantidad_recibida,
            'consumido' => $lote->cantidadConsumida(),
            'disponible' => $lote->cantidadDisponible(),
            'unidad' => $lote->unidad,
            'estado' => $lote->estado->value,

            'motivo_estado' => $lote->motivo_estado,
        ];
    }
}