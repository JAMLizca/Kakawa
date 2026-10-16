<?php

namespace Tests\Feature;

use App\Models\Lote;
use App\Models\Producto;
use App\Models\Sincronizacion;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Captura sin conexión: POST /api/sincronizar aplica en MySQL la cola del navegador. */
class SincronizacionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
    }

    private function op(string $id, string $entidad, string $accion, array $datos): array
    {
        return ['id_temporal' => $id, 'entidad' => $entidad, 'accion' => $accion, 'datos' => $datos];
    }

    private function loteNuevo(string $id = 'TMP-LOTE0001'): array
    {
        return $this->op($id, 'lote', 'CREATE', [
            'productor' => 'Finca La Esperanza', 'origen' => 'Gigante',
            'fecha_recepcion' => now()->toDateString(), 'cantidad_recibida' => 50, 'unidad' => 'kg',
        ]);
    }

    private function transformacion(string $id, string $lote, ?string $entrada, float $e, float $s): array
    {
        return $this->op($id, 'transformacion', 'CREATE', array_filter([
            'operacion_id' => "op-{$id}", 'lote_id' => $lote, 'entrada_producto_id' => $entrada,
            'etapa' => 'Fermentación', 'responsable' => 'Operador Prueba', 'fecha' => now()->toDateString(),
            'cantidad_entrada' => $e, 'cantidad_salida' => $s,
        ], fn ($v) => $v !== null));
    }

    private function sincronizar(array $operaciones)
    {
        return $this->postJson('/api/sincronizar', ['operaciones' => $operaciones])->assertOk();
    }

    public function test_lote_y_transformaciones_creados_sin_conexion_reciben_ids_reales(): void
    {
        $this->comoOperador()->sincronizar([
            $this->loteNuevo('TMP-LOTE0001'),
            $this->transformacion('TMP-TRAN0001', 'TMP-LOTE0001', null, 50, 40),        // usa el lote nuevo
            $this->transformacion('TMP-TRAN0002', 'TMP-LOTE0001', 'TMP-TRAN0001', 30, 25), // usa el producto nuevo
        ])
            ->assertJsonPath('resumen.aplicadas', 3)
            ->assertJsonPath('resultados.0.id_real', 'CAC002')
            ->assertJsonPath('resultados.1.id_real', 'CAC002-P01')
            ->assertJsonPath('resultados.2.id_real', 'CAC002-P02')
            ->assertJsonPath('resultados.2.datos.entrada_desde', 'CAC002-P01');

        $this->assertSame(50.0, (float) Lote::find('CAC002')->cantidad_recibida);
        $this->assertSame(10.0, (float) Producto::find('CAC002-P01')->cantidadDisponible());
    }

    public function test_reenviar_la_misma_cola_no_duplica_nada(): void
    {
        $cola = [$this->loteNuevo(), $this->transformacion('TMP-TRAN0001', 'TMP-LOTE0001', null, 50, 40)];

        $this->comoOperador()->sincronizar($cola);
        $this->comoOperador()->sincronizar($cola)
            ->assertJsonPath('resultados.0.repetida', true)
            ->assertJsonPath('resultados.0.id_real', 'CAC002')
            ->assertJsonPath('resultados.1.repetida', true);

        $this->assertSame(2, Lote::count());
        $this->assertSame(1, Producto::where('lote_id', 'CAC002')->count());
    }

    public function test_respeta_inventario_validacion_y_dependencias(): void
    {
        $this->comoOperador()->sincronizar([
            $this->transformacion('TMP-TRAN0001', 'CAC001', null, 500, 400),              // más de lo disponible
            $this->transformacion('TMP-TRAN0002', 'CAC001', 'TMP-TRAN0001', 10, 8),       // depende de la rechazada
            $this->op('TMP-LOTE0001', 'lote', 'CREATE', ['origen' => 'Gigante']),         // faltan datos
        ])
            ->assertJsonPath('resumen.rechazadas', 3)
            ->assertJsonPath('resultados.0.codigo', 'existencia_insuficiente')
            ->assertJsonPath('resultados.1.codigo', 'dependencia_pendiente')
            ->assertJsonPath('resultados.2.codigo', 'dato_invalido')
            ->assertJsonPath('resultados.2.errores.productor.0', 'Indique el productor.');

        $this->assertSame(0, Producto::count());
        $this->assertSame(0, Sincronizacion::count());
    }

    public function test_permisos_por_rol_y_sin_borrados(): void
    {
        $this->comoOperador()->sincronizar([
            $this->op('TMP-ESTA0001', 'lote', 'UPDATE', ['id' => 'CAC001', 'estado' => 'bloqueado', 'motivo' => 'Humedad alta']),
            $this->op('TMP-BORR0001', 'lote', 'DELETE', ['id' => 'CAC001']),
        ])
            ->assertJsonPath('resultados.0.codigo', 'permiso_denegado')
            ->assertJsonPath('resultados.1.codigo', 'no_permitido');

        $this->assertSame('pendiente', Lote::find('CAC001')->estado->value);
    }

    public function test_el_administrador_bloquea_y_cambia_precio_sin_conexion(): void
    {
        $this->comoOperador()->sincronizar([$this->transformacion('TMP-TRAN0001', 'CAC001', null, 100, 80)]);

        $this->comoAdmin()->sincronizar([
            $this->op('TMP-PREC0001', 'producto', 'UPDATE', ['id' => 'CAC001-P01', 'precio_venta' => 30000, 'motivo' => 'Precio de feria']),
            $this->op('TMP-ESTA0001', 'lote', 'UPDATE', ['id' => 'CAC001', 'estado' => 'bloqueado', 'motivo' => 'Contaminación detectada']),
        ])
            ->assertJsonPath('resumen.aplicadas', 2)
            ->assertJsonPath('resultados.1.datos.productos_afectados.0', 'CAC001-P01');

        $this->assertSame('bloqueado', Producto::find('CAC001-P01')->estado->value);
        $this->assertSame(30000.0, (float) Producto::find('CAC001-P01')->precio_venta);
    }

    public function test_un_id_temporal_de_otro_usuario_no_se_reutiliza_y_sin_sesion_es_401(): void
    {
        $this->comoOperador()->sincronizar([$this->loteNuevo()]);

        $this->comoAdmin()->sincronizar([$this->loteNuevo()])
            ->assertJsonPath('resultados.0.estado', 'rechazada')
            ->assertJsonPath('resultados.0.codigo', 'id_temporal_en_uso');

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/sincronizar', ['operaciones' => [$this->loteNuevo('TMP-LOTE0009')]])->assertUnauthorized();
    }

    public function test_el_sobre_se_valida(): void
    {
        $this->comoOperador()->postJson('/api/sincronizar', ['operaciones' => [
            ['id_temporal' => 'cualquiera', 'entidad' => 'usuario', 'accion' => 'CREATE', 'datos' => []],
        ]])->assertStatus(422)->assertJsonValidationErrors(['operaciones.0.id_temporal', 'operaciones.0.entidad'], 'errores');
    }
}
