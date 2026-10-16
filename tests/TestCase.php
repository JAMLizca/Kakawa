<?php

namespace Tests;

use App\Models\User;
use App\Services\LoteService;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Laravel\Sanctum\Sanctum;

abstract class TestCase extends BaseTestCase
{
    protected User $admin;

    protected User $operador;

    protected function crearUsuarios(): void
    {
        $this->admin = User::factory()->administrador()->create(['usuario' => 'admin_t', 'nombre' => 'Admin Prueba']);
        $this->operador = User::factory()->operador()->create(['usuario' => 'operador_t', 'nombre' => 'Operador Prueba']);
    }

    protected function crearLote(string $id = 'CAC001', float $kg = 100, string $origen = 'Rivera'): void
    {
        app(LoteService::class)->registrar([
            'id' => $id,
            'productor' => 'Productor '.$id,
            'origen' => $origen,
            'fecha_recepcion' => now()->toDateString(),
            'cantidad_recibida' => $kg,
            'unidad' => 'kg',
            'descripcion' => 'cacao seco',

        ], $this->operador);
    }

    /** Datos del ejemplo base de la guía: CAC001, 100 → 80 kg, $1.600.000. */
    protected function datosTransformacion(array $cambios = []): array
    {
        return array_merge([
            'operacion_id' => 'op-test-001',
            'lote_id' => 'CAC001',
            'etapa' => 'Secado',
            'responsable' => 'Operador Prueba',
            'fecha' => now()->toDateString(),
            'cantidad_entrada' => 100,
            'cantidad_salida' => 80,
            'costo_etapa' => 1600000,
            'costos_incluidos' => 'mano de obra, energía y transporte',
        ], $cambios);
    }

    protected function comoOperador(): static
    {
        Sanctum::actingAs($this->operador);

        return $this;
    }

    protected function comoAdmin(): static
    {
        Sanctum::actingAs($this->admin);

        return $this;
    }


    /** Registra la transformación base como operador y fija el precio de $25.000 como administrador. */
    protected function transformacionBaseConPrecio(): void
    {
        $this->comoOperador()->postJson('/api/transformaciones', $this->datosTransformacion())->assertCreated();
        $this->comoAdmin()->patchJson('/api/productos/CAC001-P01/precio', ['precio_venta' => 25000])->assertOk();
    }
}
