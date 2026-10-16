<?php

namespace Tests\Feature;

use App\Models\Auditoria;
use App\Models\Lote;
use App\Models\Producto;
use App\Models\Transformacion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;


class TransformacionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
    }

    public function test_transformacion_100_a_80_calcula_merma_alerta_y_trazabilidad(): void
    {
        $respuesta = $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())
            ->assertCreated()
            ->assertJsonPath('repetida', false)
            ->assertJsonPath('transformacion.producto_id', 'CAC001-P01');

        $this->assertEquals(20, $respuesta->json('analisis.merma.valor'));
        $this->assertContains('merma', array_column($respuesta->json('analisis.alertas'), 'tipo'));
        $this->assertEquals(0, $respuesta->json('disponible_restante'));

        // RF03: el producto se vincula con su lote de origen.
        $this->comoOperador()->getJson('/api/productos/CAC001-P01')
            ->assertOk()
            ->assertJsonPath('lote.id', 'CAC001')
            ->assertJsonPath('lote.origen', 'Rivera')
            ->assertJsonPath('camino.0.entrada_desde', 'CAC001')
            ->assertJsonPath('camino.0.producto_salida', 'CAC001-P01');
    }

    public function test_merma_de_exactamente_15_por_ciento_no_genera_alerta(): void
    {
        $respuesta = $this->comoOperador()
            ->postJson('/api/transformaciones', $this->datosTransformacion(['cantidad_salida' => 85]))
            ->assertCreated();

        $this->assertEquals(15, $respuesta->json('analisis.merma.valor'));
        $this->assertNotContains('merma', array_column($respuesta->json('analisis.alertas'), 'tipo'));
    }

    public function test_calcula_con_valores_distintos_a_los_del_ejemplo(): void
    {
        $this->crearLote('CAC002', 200, 'Campoalegre');

        $respuesta = $this->comoAdmin()->postJson('/api/transformaciones', $this->datosTransformacion([
            'operacion_id' => 'op-test-200', 'lote_id' => 'CAC002',
            'cantidad_entrada' => 200, 'cantidad_salida' => 150, 'costo_etapa' => 900000, 'precio_venta' => 8000,
        ]))->assertCreated();

        $this->assertEquals(25, $respuesta->json('analisis.merma.valor'));
        $this->assertEquals(6000, $respuesta->json('analisis.economico.costo_unitario'));
        $this->assertEquals(25, $respuesta->json('analisis.economico.margen_venta'));
    }

    public function test_rechaza_consumir_mas_de_la_existencia_sin_dejar_registros_parciales(): void
    {
        $auditoriaAntes = Auditoria::count();

        $this->comoOperador()
            ->postJson('/api/transformaciones', $this->datosTransformacion(['cantidad_entrada' => 120, 'cantidad_salida' => 100]))
            ->assertStatus(409)
            ->assertJsonPath('error', 'existencia_insuficiente');

        $this->assertEquals(100, Lote::find('CAC001')->cantidadDisponible());
        $this->assertSame(0, Producto::count());
        $this->assertSame(0, Transformacion::count());
        $this->assertSame($auditoriaAntes, Auditoria::count());
    }

    public function test_reenviar_la_misma_operacion_no_consume_dos_veces(): void
    {
        $datos = $this->datosTransformacion(['cantidad_entrada' => 60, 'cantidad_salida' => 50]);

        $this->comoOperador()->postJson('/api/transformaciones', $datos)->assertCreated();
        $this->comoOperador()->postJson('/api/transformaciones', $datos)
            ->assertOk()
            ->assertJsonPath('repetida', true);

        $this->assertSame(1, Transformacion::count());
        $this->assertSame(1, Producto::count());
        $this->assertEquals(40, Lote::find('CAC001')->cantidadDisponible());
    }

    public function test_mismo_identificador_de_operacion_con_otros_datos_se_rechaza(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion(['cantidad_entrada' => 50, 'cantidad_salida' => 40]))
            ->assertCreated();

        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion(['cantidad_entrada' => 50, 'cantidad_salida' => 30]))
            ->assertStatus(409)
            ->assertJsonPath('error', 'operacion_en_conflicto');

        $this->assertEquals(50, Lote::find('CAC001')->cantidadDisponible());
    }

    public function test_salida_mayor_que_entrada_requiere_insumos_registrados(): void
    {
        $this->comoOperador()
            ->postJson('/api/transformaciones', $this->datosTransformacion(['cantidad_salida' => 110]))
            ->assertStatus(422);

        $this->comoOperador()
            ->postJson('/api/transformaciones', $this->datosTransformacion([
                'operacion_id' => 'op-test-insumos', 'cantidad_salida' => 110, 'insumos_agregados' => 'azúcar 10 kg',
            ]))
            ->assertCreated()
            ->assertJsonPath('analisis.merma.aplica', false);
    }

    public function test_un_lote_bloqueado_no_se_puede_transformar(): void
    {
        $this->comoAdmin()->postJson('/api/lotes/CAC001/estado', ['estado' => 'bloqueado', 'motivo' => 'Prueba de bloqueo'])
            ->assertOk();

        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())
            ->assertStatus(409)
            ->assertJsonPath('error', 'lote_bloqueado');

        $this->assertSame(0, Transformacion::count());
    }
}
