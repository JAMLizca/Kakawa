<?php

namespace Tests\Feature;

use App\Models\Auditoria;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;


class AuditoriaTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
        $this->transformacionBaseConPrecio();
    }

    public function test_cambio_de_estado_queda_auditado_con_valor_anterior_y_nuevo(): void
    {
        $this->comoAdmin()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado', 'motivo' => 'Calidad aprobada'])
            ->assertOk();

        $this->assertDatabaseHas('auditoria', [
            'usuario' => 'admin_t',
            'accion' => 'cambiar_estado',
            'entidad' => 'producto',
            'entidad_id' => 'CAC001-P01',
            'campo' => 'estado',
            'valor_anterior' => 'pendiente',
            'valor_nuevo' => 'liberado',
            'motivo' => 'Calidad aprobada',
        ]);
    }

    public function test_consumo_y_precio_quedan_auditados(): void
    {
        $this->assertDatabaseHas('auditoria', [
            'accion' => 'transformar', 'entidad_id' => 'CAC001',
            'valor_anterior' => '100 kg', 'valor_nuevo' => '0 kg', 'usuario' => 'operador_t',
        ]);
        $this->assertDatabaseHas('auditoria', [
            'accion' => 'cambiar_precio', 'entidad_id' => 'CAC001-P01',
            'valor_anterior' => null, 'valor_nuevo' => '25.000 COP', 'usuario' => 'admin_t',
        ]);
    }

    public function test_la_base_de_datos_impide_borrar_la_auditoria(): void
    {
        $this->expectException(QueryException::class);
        DB::table('auditoria')->where('id', Auditoria::min('id'))->delete();
    }

    public function test_la_base_de_datos_impide_modificar_la_auditoria(): void
    {
        $this->expectException(QueryException::class);
        DB::table('auditoria')->update(['valor_nuevo' => 'alterado']);
    }

    public function test_la_base_de_datos_impide_borrar_lotes_y_alterar_transformaciones(): void
    {
        try {
            DB::table('lotes')->where('id', 'CAC001')->delete();
            $this->fail('Se pudo borrar un lote');
        } catch (QueryException $e) {
            $this->assertStringContainsString('no se borran', $e->getMessage());
        }

        try {
            DB::table('transformaciones')->update(['cantidad_salida' => 90]);
            $this->fail('Se pudo modificar una transformación');
        } catch (QueryException $e) {
            $this->assertStringContainsString('no se modifica', $e->getMessage());
        }

        $this->assertDatabaseHas('lotes', ['id' => 'CAC001']);
        $this->assertDatabaseHas('transformaciones', ['producto_id' => 'CAC001-P01', 'cantidad_salida' => 80]);
    }
}