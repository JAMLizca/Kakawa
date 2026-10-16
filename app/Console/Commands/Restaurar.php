<?php

namespace App\Console\Commands;

use App\Exceptions\ReglaNegocioException;
use App\Services\RespaldoService;
use Illuminate\Console\Command;

class Restaurar extends Command
{
    protected $signature = 'kakawa:restaurar
                            {archivo : Ruta del respaldo o nombre dentro de storage/app/respaldos}
                            {--forzar : No pedir confirmación}';

    protected $description = 'Restaura un respaldo y verifica su integridad (reemplaza los datos actuales)';

    public function handle(RespaldoService $respaldos): int
    {
        try {
            $respaldo = $respaldos->leer($this->argument('archivo'));
        } catch (ReglaNegocioException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->line("Respaldo válido del {$respaldo['creado']} con ".array_sum($respaldo['conteos']).' filas.');

        if (! $this->option('forzar')
            && ! $this->confirm('Se reemplazarán los datos actuales (antes se guarda un respaldo de seguridad). ¿Continuar?')) {
            $this->warn('Cancelado.');


            return self::FAILURE;
        }

        try {
            $resultado = $respaldos->restaurar($respaldo['archivo']);
        } catch (ReglaNegocioException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $v = $resultado['verificacion'];
        $this->table(['Tabla', 'En respaldo', 'En base', 'Huella'], collect($v['tablas'])->map(fn ($t, $nombre) => [
            $nombre, $t['en_respaldo'], $t['en_base'], $t['huella_coincide'] ? 'coincide' : 'NO coincide',
        ])->values()->all());

        $tb = $v['totales_base'];
        $this->line("Totales en base: {$tb['kg_recibidos']} kg recibidos · {$tb['kg_consumidos']} kg consumidos · {$tb['kg_producidos']} kg producidos");
        $this->line('Respaldo de seguridad previo: '.($resultado['respaldo_previo'] ?? 'ninguno'));
        $this->line("Duración: {$resultado['duracion_ms']} ms");

        if (! $v['integro']) {
            $this->error('La restauración terminó con diferencias.');

            return self::FAILURE;
        }

        $this->info('Restauración verificada: conteos, cantidades e identificadores coinciden con el respaldo.');

        return self::SUCCESS;
    }

}
