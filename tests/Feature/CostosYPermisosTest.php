<?php

namespace Tests\Feature;

use App\Exceptions\ReglaNegocioException;
use App\Models\Auditoria;
use App\Models\Producto;
use App\Services\EstadoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CostosYPermisosTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
    }

    public function test_admin_ve_costo_unitario_y_margen_con_formulas_y_supuestos(): void
    {
        $this->transformacionBaseConPrecio();

        $respuesta = $this->comoAdmin()->getJson('/api/lotes/CAC001')->assertOk();

        $this->assertEquals(20000, $respuesta->json('etapas.0.economico.costo_unitario'));
        $this->assertEquals(20, $respuesta->json('etapas.0.economico.margen_venta'));

        $this->assertNotEmpty($respuesta->json('etapas.0.economico.formulas.costo_unitario'));
        $this->assertNotEmpty($respuesta->json('etapas.0.economico.supuestos'));
        $this->assertStringContainsString('mano de obra', $respuesta->json('etapas.0.economico.costos_incluidos'));
    }

    public function test_el_operador_no_recibe_costos_ni_precios(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())
            ->assertCreated()
            ->assertJsonMissingPath('analisis.economico');

        $this->comoOperador()->getJson('/api/lotes/CAC001')
            ->assertOk()
            ->assertJsonMissingPath('etapas.0.economico')
            ->assertJsonMissingPath('productos.0.precio_venta');
    }

    public function test_salida_cero_no_divide_entre_cero_y_alerta(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion(['cantidad_salida' => 0]))
            ->assertCreated();

        $respuesta = $this->comoAdmin()->getJson('/api/lotes/CAC001')->assertOk();

        $this->assertNull($respuesta->json('etapas.0.economico.costo_unitario'));
        $this->assertStringContainsString('No calculable', $respuesta->json('etapas.0.economico.explicacion.costo_unitario'));
        $this->assertContains('costo', array_column($respuesta->json('etapas.0.alertas'), 'tipo'));
    }

    public function test_operador_no_puede_liberar_y_no_queda_cambio(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())->assertCreated();


        $this->comoOperador()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado', 'motivo' => 'Intento indebido'])
            ->assertStatus(403)
            ->assertJsonPath('error', 'permiso_denegado');

        $this->assertSame('pendiente', Producto::find('CAC001-P01')->estado->value);
        $this->assertSame(0, Auditoria::where('accion', 'cambiar_estado')->count());
    }

    public function test_el_servicio_rechaza_al_operador_aunque_se_salte_la_ruta(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())->assertCreated();

        $this->expectException(ReglaNegocioException::class);
        app(EstadoService::class)->cambiar('producto', 'CAC001-P01', 'liberado', 'Llamada directa', $this->operador);
    }

    public function test_operador_no_exporta_ni_fija_precios_ni_ve_historial(): void
    {
        $this->comoOperador()->get('/api/exportar/lotes.csv', ['Accept' => 'application/json'])->assertStatus(403);
        $this->comoOperador()->patchJson('/api/productos/CAC001-P01/precio', ['precio_venta' => 1])->assertStatus(403);
        $this->comoOperador()->getJson('/api/lotes/CAC001/historial')->assertStatus(403);
    }

    public function test_sin_sesion_se_responde_401(): void
    {
        $this->getJson('/api/lotes')->assertStatus(401)->assertJsonPath('error', 'no_autenticado');
    }

    public function test_liberar_o_bloquear_exige_motivo(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())->assertCreated();


        $this->comoAdmin()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['motivo'], 'errores');
    }
}
