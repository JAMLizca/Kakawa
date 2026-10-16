<?php

namespace Tests\Feature;

use App\Models\Lote;
use App\Models\Producto;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FichaPublicaYBloqueoTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
        $this->transformacionBaseConPrecio();
    }

    public function test_la_ficha_publica_no_expone_costos_ni_datos_privados(): void
    {
        $respuesta = $this->getJson('/api/publico/productos/CAC001-P01')
            ->assertOk()
            ->assertJsonPath('codigo', 'CAC001-P01')
            ->assertJsonPath('origen.municipio', 'Rivera')
            ->assertJsonPath('estado', 'pendiente')
            ->assertJsonPath('disponible_para_venta', false);


        $contenido = mb_strtolower($respuesta->getContent());
        foreach (['costo', 'precio', 'margen', 'responsable', 'incidencia', 'productor', 'operador'] as $prohibido) {
            $this->assertStringNotContainsString($prohibido, $contenido, "La ficha pública no debe contener «{$prohibido}»");
        }
    }

    public function test_producto_liberado_aparece_disponible(): void
    {
        $this->comoAdmin()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado', 'motivo' => 'Calidad aprobada'])
            ->assertOk();

        $this->getJson('/api/publico/productos/CAC001-P01')
            ->assertJsonPath('estado', 'liberado')
            ->assertJsonPath('disponible_para_venta', true);
    }

    public function test_hora_12_bloquear_cac001_bloquea_productos_identifica_origen_y_conserva_historial(): void
    {
        $this->comoAdmin()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado', 'motivo' => 'Calidad aprobada'])
            ->assertOk();

        $this->comoAdmin()->postJson('/api/lotes/CAC001/estado', ['estado' => 'bloqueado', 'motivo' => 'Reclamo del comprador'])
            ->assertOk()
            ->assertJsonPath('productos_afectados', ['CAC001-P01']);

      
        $this->getJson('/api/publico/productos/CAC001-P01')
            ->assertJsonPath('estado', 'bloqueado')
            ->assertJsonPath('disponible_para_venta', false)
            ->assertJsonPath('origen.lote', 'CAC001');


        $traza = $this->comoAdmin()->getJson('/api/lotes/CAC001')->assertOk();
        $this->assertEquals(80, $traza->json('afectacion.productos_total'));
        $this->assertSame(['CAC001-P01'], $traza->json('afectacion.productos_bloqueados'));

        // Nada se borró y el historial conserva todo el recorrido.
        $this->assertNotNull(Lote::find('CAC001'));
        $this->assertNotNull(Producto::find('CAC001-P01'));
        $acciones = array_column($this->comoAdmin()->getJson('/api/lotes/CAC001/historial')->json('historial'), 'accion');
        foreach (['crear', 'transformar', 'cambiar_precio', 'cambiar_estado'] as $accion) {
            $this->assertContains($accion, $acciones);
        }

    
        $this->comoAdmin()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado', 'motivo' => 'Intento de liberar'])
            ->assertStatus(409)
            ->assertJsonPath('error', 'lote_bloqueado');
    }

    public function test_codigo_inexistente_responde_404(): void
    {
        $this->getJson('/api/publico/productos/NO-EXISTE')->assertStatus(404);
    }
}
