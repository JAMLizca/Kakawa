<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** La ficha pública muestra el recorrido con cantidades, sin datos privados. */
class FichaRecorridoPublicoTest extends TestCase
{
    use RefreshDatabase;

    public function test_el_recorrido_publico_trae_cantidades_y_merma_sin_datos_privados(): void
    {
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
        $this->transformacionBaseConPrecio();

        $respuesta = $this->getJson('/api/publico/productos/CAC001-P01')
            ->assertOk()
            ->assertJsonPath('origen.cantidad_recibida', 100)
            ->assertJsonPath('recorrido.0.etapa', 'Secado')
            ->assertJsonPath('recorrido.0.desde', 'CAC001')
            ->assertJsonPath('recorrido.0.producto', 'CAC001-P01')

            ->assertJsonPath('recorrido.0.cantidad_entrada', 100)
            ->assertJsonPath('recorrido.0.cantidad_salida', 80)
            ->assertJsonPath('recorrido.0.merma', 20);

        $contenido = mb_strtolower($respuesta->getContent());
        foreach (['costo', 'precio', 'margen', 'responsable', 'incidencia', 'productor', 'operador'] as $prohibido) {
            $this->assertStringNotContainsString($prohibido, $contenido, "La ficha pública no debe contener «{$prohibido}»");
        }
    }
}
