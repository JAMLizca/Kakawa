<?php

namespace Database\Seeders;

use App\Models\Lote;
use App\Models\User;
use App\Services\LoteService;
use Illuminate\Database\Seeder;


class LotesDemoSeeder extends Seeder
{
    public function run(LoteService $lotes): void
    {
        $operador = User::where('usuario', 'operador')->firstOrFail();
        $fecha = now()->subDays(3)->toDateString();

        $base = [
            ['id' => 'CAC001', 'productor' => 'Productor A', 'origen' => 'Rivera', 'cantidad_recibida' => 100],
            ['id' => 'CAC002', 'productor' => 'Productor B', 'origen' => 'Campoalegre', 'cantidad_recibida' => 150],
            ['id' => 'CAC003', 'productor' => 'Productor C', 'origen' => 'Algeciras', 'cantidad_recibida' => 80],
        ];

        foreach ($base as $lote) {
            if (Lote::whereKey($lote['id'])->exists()) {
                continue; 

            }

            $lotes->registrar($lote + [
                'fecha_recepcion' => $fecha,
                'unidad' => 'kg',
                'descripcion' => 'cacao seco',
            ], $operador);
        }
    }
}
