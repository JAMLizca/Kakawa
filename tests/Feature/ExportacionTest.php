<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;


class ExportacionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100, 'Rivera');
        $this->crearLote('CAC002', 150, 'Campoalegre');
        $this->transformacionBaseConPrecio();
    }

    public function test_exporta_csv_con_cantidades_estado_y_costos(): void
    {
        $respuesta = $this->comoAdmin()->get('/api/exportar/lotes.csv')->assertOk();

        $this->assertStringContainsString('text/csv', $respuesta->headers->get('Content-Type'));
        $lineas = array_values(array_filter(explode("\n", ltrim($respuesta->streamedContent(), "\xEF\xBB\xBF"))));

        $this->assertStringStartsWith('lote,productor,origen', $lineas[0]);
        $this->assertCount(3, $lineas);
        $this->assertStringStartsWith('CAC001,', $lineas[1]);

        $this->assertStringContainsString(',100,100,0,pendiente,', $lineas[1]);
        $this->assertStringContainsString(',80,1600000,20000,25000,20,', $lineas[1]);
    }

    public function test_el_filtro_por_origen_se_aplica_al_csv(): void
    {
        $csv = $this->comoAdmin()->get('/api/exportar/lotes.csv?origen=Campoalegre')->assertOk()->streamedContent();

        $this->assertStringContainsString('CAC002', $csv);
        $this->assertStringNotContainsString('CAC001', $csv);
    }
}
