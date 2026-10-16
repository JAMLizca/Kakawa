<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** El administrador crea operadores, los activa o desactiva y les asigna contraseña. */
class PersonalTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->crearUsuarios();
    }

    private function nuevo(array $cambios = []): array
    {
        return array_merge([
            'nombre' => 'Pedro Operario',
            'usuario' => 'pedro.op',
            'documento' => '1075000111',
            'telefono' => '3001112233',
            'password' => 'Cacao2026x',
            'password_confirmation' => 'Cacao2026x',
            'rol' => 'administrador', // se ignora: siempre se crea un operador
        ], $cambios);
    }

    public function test_el_administrador_crea_un_operador_que_puede_iniciar_sesion(): void
    {
        $this->comoAdmin()->postJson('/api/usuarios', $this->nuevo())
            ->assertCreated()
            ->assertJsonPath('usuario.rol', 'operador')
            ->assertJsonPath('usuario.activo', true);

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/login', ['usuario' => 'pedro.op', 'password' => 'Cacao2026x'])
            ->assertOk()->assertJsonPath('usuario.rol', 'operador');

        $this->comoAdmin()->getJson('/api/usuarios')->assertOk()->assertJsonFragment(['usuario' => 'pedro.op']);
    }

    public function test_solo_el_administrador_puede_administrar_personal(): void
    {
        $this->comoOperador()->postJson('/api/usuarios', $this->nuevo())->assertForbidden();
        $this->comoOperador()->getJson('/api/usuarios')->assertForbidden();
        $this->assertNull(User::where('usuario', 'pedro.op')->first());
    }

    public function test_valida_datos_y_no_repite_usuario(): void
    {
        $this->comoAdmin()->postJson('/api/usuarios', $this->nuevo())->assertCreated();
        $this->comoAdmin()->postJson('/api/usuarios', $this->nuevo(['password_confirmation' => 'otra', 'documento' => 'x']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['usuario', 'password', 'documento'], 'errores');
    }

    public function test_desactivar_cierra_sesiones_e_impide_entrar(): void
    {
        $id = $this->comoAdmin()->postJson('/api/usuarios', $this->nuevo())->json('usuario.id');
        $pedro = User::find($id);
        $pedro->createToken('kakawa');

        $this->comoAdmin()->postJson("/api/usuarios/{$id}/estado", ['activo' => false, 'motivo' => 'Terminó su contrato'])
            ->assertOk()->assertJsonPath('usuario.activo', false);
        $this->assertSame(0, $pedro->tokens()->count());

        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/login', ['usuario' => 'pedro.op', 'password' => 'Cacao2026x'])->assertUnauthorized();

        $this->comoAdmin()->postJson("/api/usuarios/{$id}/estado", ['activo' => false, 'motivo' => 'Otra vez'])
            ->assertStatus(409);
    }

    public function test_cambiar_contrasena_y_no_tocar_administradores(): void
    {
        $id = $this->comoAdmin()->postJson('/api/usuarios', $this->nuevo())->json('usuario.id');

        $this->comoAdmin()->postJson("/api/usuarios/{$id}/clave", ['password' => 'Nueva2026y', 'password_confirmation' => 'Nueva2026y'])
            ->assertOk();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/login', ['usuario' => 'pedro.op', 'password' => 'Nueva2026y'])->assertOk();

        $this->comoAdmin()->postJson("/api/usuarios/{$this->admin->id}/estado", ['activo' => false, 'motivo' => 'Prueba de seguridad'])
            ->assertForbidden();
        Sanctum::actingAs($this->admin);
        $this->postJson("/api/usuarios/{$this->admin->id}/clave", ['password' => 'Nueva2026y', 'password_confirmation' => 'Nueva2026y'])
            ->assertForbidden();
    }
}
