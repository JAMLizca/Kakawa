<?php

namespace App\Console\Commands;

use App\Models\Auditoria;
use App\Models\Lote;
use App\Models\Producto;
use App\Models\Transformacion;
use App\Services\TrazabilidadService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;


class MedirTrazabilidad extends Command
{
    protected $signature = 'kakawa:medir {--repeticiones=50 : Consultas a medir}';

    protected $description = 'Mide el tiempo de la consulta de trazabilidad y guarda la evidencia';

    private const OBJETIVO_MS = 3000;

    public function handle(TrazabilidadService $trazabilidad): int
    {
        $registros = [
            'lotes' => Lote::count(),
            'transformaciones' => Transformacion::count(),
            'productos' => Producto::count(),
            'auditoria' => Auditoria::count(),
        ];

        if ($registros['transformaciones'] < 100) {
            $this->warn("Solo hay {$registros['transformaciones']} transformaciones. Para la prueba del reto ejecute antes: php artisan kakawa:sinteticos");
        }

       
        $finales = Producto::whereDoesntHave('consumos')->pluck('id')->all();
        if (! $finales) {
            $this->error('No hay productos para consultar.');

            return self::FAILURE;
        }

        $repeticiones = max(1, (int) $this->option('repeticiones'));

        
        $trazabilidad->porProducto($finales[0]);

        $tiempos = [];
        for ($i = 0; $i < $repeticiones; $i++) {
            $codigo = $finales[$i % count($finales)];
            $inicio = hrtime(true);
            $resultado = $trazabilidad->porProducto($codigo);
            $tiempos[] = (hrtime(true) - $inicio) / 1e6;

            if (empty($resultado['camino'])) {
                $this->error("La consulta de {$codigo} no devolvió recorrido.");

                return self::FAILURE;
            }
        }

        sort($tiempos);
        $p95 = $tiempos[(int) ceil(0.95 * count($tiempos)) - 1];
        $estadisticas = [
            'minimo_ms' => round($tiempos[0], 2),
            'promedio_ms' => round(array_sum($tiempos) / count($tiempos), 2),
            'p95_ms' => round($p95, 2),
            'maximo_ms' => round(end($tiempos), 2),
        ];
        $cumple = $estadisticas['maximo_ms'] <= self::OBJETIVO_MS;

        $evidencia = [
            'fecha' => now()->toDateTimeString(),
            'metodo' => "Consulta de trazabilidad completa por producto final (lote → etapas → producto, con merma, costos y alertas), "
                ."ejecutada {$repeticiones} veces sobre ".count($finales).' productos distintos, tras una consulta de calentamiento. '
                .'Tiempo medido con hrtime() dentro de la aplicación, sin incluir la red.',
            'registros' => $registros + ['total' => array_sum($registros)],
            'equipo' => $this->equipo(),
            'resultado' => $estadisticas + ['objetivo_ms' => self::OBJETIVO_MS, 'cumple' => $cumple],
        ];

        $this->table(['Medida', 'Valor'], collect($estadisticas)->map(fn ($v, $k) => [$k, $v])->values()->all());
        $this->line('Registros: '.json_encode($evidencia['registros']));
        $this->line('Equipo: '.json_encode($evidencia['equipo'], JSON_UNESCAPED_UNICODE));
        $cumple
            ? $this->info('CUMPLE: el tiempo máximo está por debajo de 3 s.')
            : $this->error('NO CUMPLE: alguna consulta superó 3 s.');

        $carpeta = storage_path('app/evidencias');
        if (! is_dir($carpeta)) {
            mkdir($carpeta, 0775, true);
        }
        $archivo = $carpeta.'/rendimiento_'.now()->format('Ymd_His').'.json';
        file_put_contents($archivo, json_encode($evidencia, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        $this->line("Evidencia guardada en: {$archivo}");

        return $cumple ? self::SUCCESS : self::FAILURE;
    }

    private function equipo(): array
    {
        $cpu = null;
        $ram = null;
        if (is_readable('/proc/cpuinfo') && preg_match('/model name\s*:\s*(.+)/', (string) file_get_contents('/proc/cpuinfo'), $m)) {
            $cpu = trim($m[1]);
        }
        if (is_readable('/proc/meminfo') && preg_match('/MemTotal:\s*(\d+)/', (string) file_get_contents('/proc/meminfo'), $m)) {
            $ram = round($m[1] / 1024 / 1024, 1).' GB';
        }

        return [
            'sistema' => php_uname('s').' '.php_uname('r'),
            'cpu' => $cpu ?? 'no disponible',
            'ram' => $ram ?? 'no disponible',
            'php' => PHP_VERSION,
            'base_de_datos' => DB::getDriverName().' '.(DB::selectOne('SELECT VERSION() AS v')->v ?? ''),
            'laravel' => app()->version(),
        ];
    }
}