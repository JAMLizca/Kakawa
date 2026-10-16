<?php

namespace Tests\Feature;

use App\Models\Producto;
use App\Models\Transformacion;
use App\Services\TrazabilidadService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;


class RendimientoTest extends TestCase
{
    use RefreshDatabase;

    public function test_trazabilidad_sobre_100_registros_sinteticos_en_menos_de_3_segundos(): void
    {
        $this->crearUsuarios();
        Artisan::call('kakawa:sinteticos', ['--lotes' => 25, '--etapas' => 4]);
        $this->assertGreaterThanOrEqual(100, Transformacion::count());

        $servicio = app(TrazabilidadService::class);
        $finales = Producto::whereDoesntHave('consumos')->pluck('id');
        $servicio->porProducto($finales->first()); // calentamiento

        $maximo = 0;
        foreach ($finales as $codigo) {
            $inicio = hrtime(true);
            $recorrido = $servicio->porProducto($codigo);
            $maximo = max($maximo, (hrtime(true) - $inicio) / 1e6);


            $this->assertCount(4, $recorrido['camino'], "El recorrido de {$codigo} debe tener 4 etapas");
        }

        $this->assertLessThan(3000, $maximo, "La consulta más lenta tardó {$maximo} ms");
    }
}
