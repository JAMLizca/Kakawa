<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Lote;
use App\Services\AnalisisService;
use App\Services\Calculos;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** RF11 */
class ExportacionController extends Controller
{
    private const COLUMNAS = [
        'lote', 'productor', 'origen', 'fecha_recepcion', 'unidad',
        'recibido', 'consumido', 'disponible_lote', 'estado', 'motivo_estado',
        'productos', 'salida_final', 'costo_total_cop', 'costo_unitario_cop', 'precio_venta_cop',
        'margen_venta_pct', 'alertas',
    ];

    public function lotes(Request $request, AnalisisService $analisis): StreamedResponse
    {
        $request->validate([
            'origen' => ['nullable', 'string', 'max:120'],
            'estado' => ['nullable', 'in:pendiente,liberado,bloqueado'],
        ], ['estado.in' => 'El estado debe ser pendiente, liberado o bloqueado.']);

        $lotes = Lote::conInventario()
            ->filtrar($request->query('origen'), $request->query('estado'))
            ->with(['productos', 'transformaciones.producto'])

            ->orderBy('id')
            ->get();

        $nombre = 'kakawa_lotes_'.now()->format('Ymd_His').'.csv';

        return response()->streamDownload(function () use ($lotes, $analisis) {
            $salida = fopen('php://output', 'w');
            fwrite($salida, "\xEF\xBB\xBF"); // BOM: Excel reconoce las tildes
            fputcsv($salida, self::COLUMNAS, ',', '"', '');

            foreach ($lotes as $lote) {
                fputcsv($salida, array_map($this->celda(...), $this->fila($lote, $analisis)), ',', '"', '');
            }

            fclose($salida);
        }, $nombre, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    private function fila(Lote $lote, AnalisisService $analisis): array
    {
        $transformaciones = $lote->transformaciones;
        $consumidos = $transformaciones->pluck('entrada_producto_id')->filter()->unique();

    
        $finales = $lote->productos->reject(fn ($p) => $consumidos->contains($p->id));
        $salidaFinal = round($finales->sum('cantidad'), 3);
        $costoTotal = round($transformaciones->sum('costo_etapa'), 2);
        $costoUnitario = Calculos::costoUnitario($costoTotal, $salidaFinal);

       
        $precio = $finales->isNotEmpty() && $finales->every(fn ($p) => $p->precio_venta !== null) && $salidaFinal > 0
            ? round($finales->sum(fn ($p) => $p->precio_venta * $p->cantidad) / $salidaFinal, 2)

            : null;

        $alertas = $transformaciones->sum(fn ($t) => count($analisis->analizar($t)['alertas']));

        return [
            $lote->id,
            $lote->productor,
            $lote->origen,
            $lote->fecha_recepcion?->format('Y-m-d'),
            $lote->unidad,
            $lote->cantidad_recibida,
            $lote->cantidadConsumida(),
            $lote->cantidadDisponible(),
            $lote->estado->value,
            $lote->motivo_estado,
            $lote->productos->count(),
            $salidaFinal,
            $costoTotal,
            $costoUnitario,
            $precio,
            Calculos::margenVenta($precio, $costoUnitario),
            $alertas,
        ];
    }

    
    private function celda(mixed $valor): string
    {
        if ($valor === null) {
            return '';
        }
        $texto = is_float($valor) ? rtrim(rtrim(number_format($valor, 3, '.', ''), '0'), '.') : (string) $valor;


        return is_string($valor) && preg_match('/^[=+\-@\t\r]/', $texto) ? "'".$texto : $texto;
    }
}