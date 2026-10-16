<?php

namespace App\Console\Commands;

use App\Exceptions\ReglaNegocioException;
use App\Services\RespaldoService;
use Illuminate\Console\Command;

class VerificarRespaldo extends Command
{
    protected $signature = 'kakawa:verificar-respaldo {archivo : Ruta del respaldo o nombre dentro de storage/app/respaldos}';

    protected $description = 'Comprueba que un respaldo no esté dañado y lo compara con la base actual, sin modificar nada';

    public function handle(RespaldoService $respaldos): int
    {
        try {
            $respaldo = $respaldos->leer($this->argument('archivo'));
        } catch (ReglaNegocioException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $this->info("Archivo íntegro: formato, conteos y huellas válidos ({$respaldo['creado']}).");

        $v = $respaldos->compararConBase($respaldo);
        $this->line($v['integro']
            ? 'La base actual es idéntica al respaldo.'
            : 'La base actual tiene diferencias con el respaldo (normal si hubo cambios después de crearlo).');


        return self::SUCCESS;
    }
}
