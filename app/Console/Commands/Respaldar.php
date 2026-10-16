<?php

namespace App\Console\Commands;

use App\Services\RespaldoService;
use Illuminate\Console\Command;

class Respaldar extends Command
{
    protected $signature = 'kakawa:respaldar {--destino= : Ruta del archivo (por defecto storage/app/respaldos)}';

    protected $description = 'Crea un respaldo verificable (JSON con conteos, totales y huellas)';

    public function handle(RespaldoService $respaldos): int
    {
        $resultado = $respaldos->crear(null, 'respaldo', $this->option('destino'));

        $this->info('Respaldo creado: '.$resultado['archivo']);
        $this->table(['Tabla', 'Filas'], collect($resultado['conteos'])->map(fn ($n, $t) => [$t, $n])->values()->all());
        $t = $resultado['totales'];
        $this->line("Totales: {$t['kg_recibidos']} kg recibidos · {$t['kg_consumidos']} kg consumidos · {$t['kg_producidos']} kg producidos");
        $this->line('Lotes: '.implode(', ', $t['ids_lotes']));

        return self::SUCCESS;
    }
}
