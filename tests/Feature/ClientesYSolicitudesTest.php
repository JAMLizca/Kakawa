<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Registro de compradores, permisos por rol y solicitudes de compra (incluye el bloqueo de la hora 12). */
class ClientesYSolicitudesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
        $this->crearLote('CAC001', 100);
        $this->transformacionBaseConPrecio();
    }

    private function registro(array $cambios = []): array
    {
        return array_merge([
            'nombre' => 'Laura Compradora',
            'documento' => '1075123456',
            'correo' => 'laura@ejemplo.co',
            'telefono' => '3001234567',
            'ciudad' => 'Neiva',
            'usuario' => 'laura',

            'password' => 'Cacao2026x',
            'password_confirmation' => 'Cacao2026x',
        ], $cambios);
    }

    private function comoCliente(): static
    {
        Sanctum::actingAs(User::where('usuario', 'laura')->firstOrFail());

        return $this;
    }

    private function liberar(): void
    {
        $this->comoAdmin()->postJson('/api/productos/CAC001-P01/estado', ['estado' => 'liberado', 'motivo' => 'Calidad aprobada'])->assertOk();
    }

    public function test_el_registro_siempre_crea_un_cliente_aunque_pidan_otro_rol(): void
    {
        $this->postJson('/api/auth/registro', $this->registro(['rol' => 'administrador']))
            ->assertCreated()
            ->assertJsonPath('usuario.rol', 'cliente')
            ->assertJsonStructure(['token']);

        $this->assertSame('cliente', User::where('usuario', 'laura')->first()->rol->value);
    }

    public function test_el_registro_valida_datos_y_no_repite_usuario_correo_ni_documento(): void
    {
        $this->postJson('/api/auth/registro', $this->registro())->assertCreated();

        $this->postJson('/api/auth/registro', $this->registro(['password_confirmation' => 'otra']))

            ->assertStatus(422)
            ->assertJsonValidationErrors(['usuario', 'correo', 'documento', 'password'], 'errores');
    }

    public function test_el_cliente_inicia_sesion_y_no_entra_a_las_secciones_del_personal(): void
    {
        $this->postJson('/api/auth/registro', $this->registro())->assertCreated();

        $this->postJson('/api/auth/login', ['usuario' => 'laura', 'password' => 'Cacao2026x'])
            ->assertOk()->assertJsonPath('usuario.rol', 'cliente');

        $this->comoCliente()->getJson('/api/lotes')->assertStatus(403);
        $this->comoCliente()->getJson('/api/alertas')->assertStatus(403);
        $this->comoOperador()->getJson('/api/mis-solicitudes')->assertStatus(403);
    }

    public function test_el_catalogo_publico_no_muestra_precio_y_el_del_cliente_si(): void
    {
        $this->getJson('/api/publico/catalogo')->assertOk()->assertJsonCount(0, 'productos');   // aún pendiente
        $this->liberar();

        $publico = $this->getJson('/api/publico/catalogo')->assertOk()->assertJsonPath('productos.0.codigo', 'CAC001-P01');
        $this->assertArrayNotHasKey('precio_venta', $publico->json('productos.0'));

        $this->postJson('/api/auth/registro', $this->registro())->assertCreated();
        $this->comoCliente()->getJson('/api/tienda/catalogo')->assertOk()->assertJsonPath('productos.0.precio_venta', 25000);
    }

    public function test_solo_se_solicita_lo_liberado_y_con_existencia(): void
    {
        $this->postJson('/api/auth/registro', $this->registro())->assertCreated();


        $this->comoCliente()->postJson('/api/solicitudes', ['producto_id' => 'CAC001-P01', 'cantidad' => 10])
            ->assertStatus(409)->assertJsonPath('error', 'producto_no_liberado');

        $this->liberar();
        $this->comoCliente()->postJson('/api/solicitudes', ['producto_id' => 'CAC001-P01', 'cantidad' => 500])
            ->assertStatus(409)->assertJsonPath('error', 'existencia_insuficiente');

        $this->comoCliente()->postJson('/api/solicitudes', ['producto_id' => 'cac001-p01', 'cantidad' => 10, 'mensaje' => 'Para tienda en Neiva'])
            ->assertCreated()->assertJsonPath('solicitud.estado', 'pendiente');

        $this->comoCliente()->getJson('/api/mis-solicitudes')->assertOk()->assertJsonCount(1, 'solicitudes');
    }

    public function test_hora_12_no_se_acepta_una_solicitud_si_el_lote_se_bloqueo(): void
    {
        $this->liberar();
        $this->postJson('/api/auth/registro', $this->registro())->assertCreated();
        $id = $this->comoCliente()->postJson('/api/solicitudes', ['producto_id' => 'CAC001-P01', 'cantidad' => 10])
            ->assertCreated()->json('solicitud.id');

        $this->comoAdmin()->postJson('/api/lotes/CAC001/estado', ['estado' => 'bloqueado', 'motivo' => 'Reclamo del comprador'])->assertOk();

        $this->comoAdmin()->postJson("/api/solicitudes/{$id}/respuesta", ['estado' => 'aceptada'])
            ->assertStatus(409)->assertJsonPath('error', 'producto_bloqueado');

        $this->comoAdmin()->postJson("/api/solicitudes/{$id}/respuesta", ['estado' => 'rechazada', 'respuesta' => 'Lote en revisión de calidad'])
            ->assertOk()->assertJsonPath('solicitud.estado', 'rechazada');

        $this->comoCliente()->postJson('/api/solicitudes', ['producto_id' => 'CAC001-P01', 'cantidad' => 5])
            ->assertStatus(409)->assertJsonPath('error', 'producto_bloqueado');
    }


    public function test_el_administrador_acepta_y_no_puede_responder_dos_veces(): void
    {
        $this->liberar();
        $this->postJson('/api/auth/registro', $this->registro())->assertCreated();
        $id = $this->comoCliente()->postJson('/api/solicitudes', ['producto_id' => 'CAC001-P01', 'cantidad' => 10])->json('solicitud.id');

        $this->comoAdmin()->getJson('/api/solicitudes?estado=pendiente')->assertOk()
            ->assertJsonPath('solicitudes.0.cliente.correo', 'laura@ejemplo.co');
        $this->comoAdmin()->postJson("/api/solicitudes/{$id}/respuesta", ['estado' => 'aceptada', 'respuesta' => 'Le escribimos al correo'])
            ->assertOk()->assertJsonPath('solicitud.estado', 'aceptada');
        $this->comoAdmin()->postJson("/api/solicitudes/{$id}/respuesta", ['estado' => 'rechazada', 'respuesta' => 'x'])
            ->assertStatus(409);

        // Aceptar no descuenta inventario: el balance de masa no cambia.
        $this->assertEquals(80, \App\Models\Producto::find('CAC001-P01')->cantidadDisponible());
    }
}
