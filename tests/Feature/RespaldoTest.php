<?php

namespace Tests\Feature;

use App\Exceptions\ReglaNegocioException;
use App\Models\Lote;
use App\Models\Producto;
use App\Models\Transformacion;
use App\Services\RespaldoService;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\File;
use Tests\TestCase;


class RespaldoTest extends TestCase
{
    use DatabaseMigrations;

    private string $carpeta;

    protected function setUp(): void
    {
        parent::setUp();
        $this->carpeta = storage_path('framework/testing/respaldos');
        config(['kakawa.ruta_respaldos' => $this->carpeta]);

        $this->crearUsuarios();

        $this->crearLote('CAC001', 100);
        $this->crearLote('CAC002', 150, 'Campoalegre');
        $this->transformacionBaseConPrecio();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->carpeta);
        parent::tearDown();
    }

    public function test_restaurar_recupera_el_estado_sin_perdida_ni_duplicacion(): void
    {
        $servicio = app(RespaldoService::class);
        $respaldo = $servicio->crear($this->admin);

        // Cambios posteriores al respaldo.
        $this->crearLote('CAC004', 60, 'Garzón');
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion([
            'operacion_id' => 'op-posterior', 'lote_id' => 'CAC002', 'cantidad_entrada' => 150, 'cantidad_salida' => 130,
        ]))->assertCreated();

        $resultado = $servicio->restaurar($respaldo['archivo'], $this->admin);

        $this->assertTrue($resultado['verificacion']['integro']);
        $this->assertNull(Lote::find('CAC004'));
        $this->assertEquals(150, Lote::find('CAC002')->cantidadDisponible());
        $this->assertEquals(0, Lote::find('CAC001')->cantidadDisponible());
        $this->assertSame(2, Lote::count());
        $this->assertSame(1, Transformacion::count());

        // Restaurar otra vez no duplica.

        $this->assertTrue($servicio->restaurar($respaldo['archivo'])['verificacion']['integro']);
        $this->assertSame(2, Lote::count());
        $this->assertSame(1, Transformacion::count());
        $this->assertSame(1, Producto::count());
    }

    public function test_un_respaldo_alterado_se_rechaza_sin_tocar_la_base(): void
    {
        $servicio = app(RespaldoService::class);
        $respaldo = $servicio->crear();

        $alterado = $this->carpeta.'/alterado.json';
        File::put($alterado, str_replace('"100.000"', '"999.000"', File::get($respaldo['archivo'])));

        try {
            $servicio->restaurar($alterado);
            $this->fail('Se aceptó un respaldo alterado');
        } catch (ReglaNegocioException $e) {
            $this->assertStringContainsString('huella', $e->getMessage());
        }

        $this->assertEquals(100, Lote::find('CAC001')->cantidad_recibida);
        $this->assertSame(2, Lote::count());
    }
}
