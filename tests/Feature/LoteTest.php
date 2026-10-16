<?php

namespace Tests\Feature;

use App\Models\Auditoria;
use App\Models\Lote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;


class LoteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
    }

    private function lote(array $cambios = []): array
    {
        return array_merge([
            'id' => 'CAC010',
            'productor' => 'Productor X',
            'origen' => 'Rivera',
            'fecha_recepcion' => now()->toDateString(),
            'cantidad_recibida' => 100,
        ], $cambios);
    }


    public function test_crea_lote_valido_con_identificador_unico_y_lo_guarda(): void
    {
        $this->comoOperador()->postJson('/api/lotes', $this->lote())
            ->assertCreated()
            ->assertJsonPath('lote.id', 'CAC010')
            ->assertJsonPath('lote.estado', 'pendiente');

        $this->assertDatabaseHas('lotes', ['id' => 'CAC010', 'origen' => 'Rivera', 'estado' => 'pendiente']);
        $this->assertEquals(100, Lote::find('CAC010')->cantidadDisponible());
        $this->assertDatabaseHas('auditoria', ['accion' => 'crear', 'entidad' => 'lote', 'entidad_id' => 'CAC010']);
    }

    public function test_rechaza_cantidad_negativa_y_no_guarda(): void
    {
        $this->comoOperador()->postJson('/api/lotes', $this->lote(['cantidad_recibida' => -5]))
            ->assertStatus(422)
            ->assertJsonPath('error', 'dato_invalido')
            ->assertJsonValidationErrors(['cantidad_recibida'], 'errores');

        $this->assertDatabaseCount('lotes', 0);
    }

    public function test_rechaza_cantidad_cero(): void
    {
        $this->comoOperador()->postJson('/api/lotes', $this->lote(['cantidad_recibida' => 0]))
            ->assertStatus(422);

        $this->assertDatabaseCount('lotes', 0);
    }

    public function test_rechaza_campo_obligatorio_vacio(): void
    {

        $this->comoOperador()->postJson('/api/lotes', $this->lote(['productor' => '']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['productor'], 'errores');

        $this->assertDatabaseCount('lotes', 0);
    }

    public function test_rechaza_lote_duplicado_sin_modificar_el_original(): void
    {
        $this->crearLote('CAC001', 100);

        $this->comoOperador()->postJson('/api/lotes', $this->lote(['id' => 'CAC001', 'cantidad_recibida' => 999]))
            ->assertStatus(409)
            ->assertJsonPath('error', 'lote_duplicado');

        $this->assertDatabaseCount('lotes', 1);
        $this->assertEquals(100, Lote::find('CAC001')->cantidad_recibida);
        $this->assertSame(1, Auditoria::where('entidad_id', 'CAC001')->count());
    }

    public function test_filtra_lotes_por_origen_y_por_estado(): void
    {
        $this->crearLote('CAC001', 100, 'Rivera');
        $this->crearLote('CAC002', 150, 'Campoalegre');

        $this->comoOperador()->getJson('/api/lotes?origen=Rivera')
            ->assertOk()->assertJsonPath('total', 1)->assertJsonPath('lotes.0.id', 'CAC001');

        $this->comoOperador()->getJson('/api/lotes?estado=bloqueado')
            ->assertOk()->assertJsonPath('total', 0);
    }
}

