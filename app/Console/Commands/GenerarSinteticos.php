<?php

namespace App\Console\Commands;

use App\Models\Lote;
use App\Models\User;
use App\Services\LoteService;
use App\Services\TransformacionService;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

class GenerarSinteticos extends Command
{
    protected $signature = 'kakawa:sinteticos
                            {--lotes=25 : Cantidad de lotes a crear}
                            {--etapas=4 : Etapas encadenadas por lote}
                            {--semilla=2026 : Semilla aleatoria para obtener siempre los mismos datos}';

    protected $description = 'Genera lotes y transformaciones sintéticos (prefijo SIN) para medir el rendimiento';

    private const MUNICIPIOS = ['Rivera', 'Campoalegre', 'Algeciras', 'Garzón', 'Pitalito', 'Gigante', 'La Plata'];

    private const ETAPAS = ['Fermentación', 'Secado', 'Selección', 'Tostado', 'Descascarillado', 'Molienda'];

    public function handle(LoteService $lotes, TransformacionService $transformaciones): int

    {
        if (app()->isProduction()) {
            $this->error('No se generan datos sintéticos en producción.');

            return self::FAILURE;
        }

        $usuario = User::where('usuario', 'operador')->first() ?? User::first();
        if (! $usuario) {
            $this->error('No hay usuarios. Ejecute primero: php artisan db:seed');

            return self::FAILURE;
        }

        $cantidadLotes = max(1, (int) $this->option('lotes'));
        $cantidadEtapas = max(1, min(count(self::ETAPAS), (int) $this->option('etapas')));
        mt_srand((int) $this->option('semilla'));

        $siguiente = (int) substr((string) Lote::where('id', 'like', 'SIN%')->orderByDesc('id')->value('id'), 3) + 1;
        $fechaRecepcion = now()->subDays(10)->toDateString();
        $fechaEtapa = now()->subDays(5)->toDateString();

        $this->info("Generando {$cantidadLotes} lotes × {$cantidadEtapas} etapas (datos sintéticos)...");
        $barra = $this->output->createProgressBar($cantidadLotes);

        for ($i = 0; $i < $cantidadLotes; $i++) {
            $id = sprintf('SIN%03d', $siguiente + $i);

            $lotes->registrar([
                'id' => $id,
                'productor' => 'Productor sintético '.($siguiente + $i),
                'origen' => self::MUNICIPIOS[mt_rand(0, count(self::MUNICIPIOS) - 1)],

                'fecha_recepcion' => $fechaRecepcion,
                'cantidad_recibida' => mt_rand(80, 250),
                'unidad' => 'kg',
                'descripcion' => 'Dato sintético para prueba de rendimiento',
            ], $usuario);

            $entradaDesde = null;
            $disponible = (float) Lote::find($id)->cantidad_recibida;

            for ($e = 0; $e < $cantidadEtapas; $e++) {
                $salida = round($disponible * mt_rand(78, 96) / 100, 1);
                $ultima = $e === $cantidadEtapas - 1;

                $resultado = $transformaciones->registrar([
                    'operacion_id' => (string) Str::uuid(),
                    'lote_id' => $id,
                    'entrada_producto_id' => $entradaDesde,
                    'etapa' => self::ETAPAS[$e],
                    'responsable' => 'Operador sintético',
                    'fecha' => $fechaEtapa,
                    'cantidad_entrada' => $disponible,
                    'cantidad_salida' => $salida,
                    'costo_etapa' => mt_rand(20, 160) * 10000,
                    'costos_incluidos' => 'mano de obra y energía (sintético)',
                    'precio_venta' => $ultima ? mt_rand(22, 32) * 1000 : null,
                    'producto_nombre' => self::ETAPAS[$e]." de {$id}",
                ], $usuario);

                $entradaDesde = $resultado['transformacion']->producto_id;
                $disponible = $salida;

                if ($disponible <= 0) {

                    break;
                }
            }

            $barra->advance();
        }

        $barra->finish();
        $this->newLine(2);

        $total = Lote::where('id', 'like', 'SIN%')->count();
        $this->info("Listo. Lotes sintéticos en la base: {$total}.");
        $this->line('Mida el rendimiento con: php artisan kakawa:medir');

        return self::SUCCESS;
    }
}
