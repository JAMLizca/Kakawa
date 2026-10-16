<?php

namespace App\Services;

use App\Enums\Rol;
use App\Exceptions\ReglaNegocioException;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Cuentas del personal. El administrador crea operadores, los activa o desactiva y les asigna
 * una contraseña nueva. Reglas:
 *  - Desde aquí solo se crean y modifican operadores: nunca administradores ni compradores.
 *  - Desactivar o cambiar la contraseña cierra las sesiones abiertas del operador (revoca sus tokens).
 *  - Cada acción queda en la auditoría (RF10). Las contraseñas nunca se registran.
 */
class PersonalService
{
    public function __construct(private AuditoriaService $auditoria) {}

    /** Personal de la asociación (administradores y operadores), sin compradores. */
    public function listar(): Collection
    {
        return User::whereIn('rol', ['administrador', 'operador'])
            ->orderByRaw("rol = 'administrador' desc")
            ->orderBy('nombre')
            ->get();
    }

    public function crearOperador(array $datos, User $admin): User
    {
        $this->exigirAdministrador($admin);

        return DB::transaction(function () use ($datos, $admin) {
            $operador = new User;
            $operador->forceFill([
                'usuario' => $datos['usuario'],
                'nombre' => trim($datos['nombre']),
                'documento' => $datos['documento'] ?? null,
                'correo' => $datos['correo'] ?? null,
                'telefono' => $datos['telefono'] ?? null,
                'password' => $datos['password'],   // el modelo la guarda cifrada (cast "hashed")
                'rol' => Rol::from('operador'),     // asignado por el servidor, nunca por el formulario
                'activo' => true,
            ])->save();

            $this->auditoria->registrar($admin, 'crear', 'sistema', $operador->usuario,
                'rol', null, 'operador', "Cuenta de operador para {$operador->nombre}");

            return $operador->refresh();
        });
    }

    public function cambiarEstado(int $id, bool $activo, string $motivo, User $admin): User
    {
        $this->exigirAdministrador($admin);

        return DB::transaction(function () use ($id, $activo, $motivo, $admin) {
            $operador = $this->operador($id);
            if ((bool) $operador->activo === $activo) {
                throw ReglaNegocioException::conflicto(
                    "La cuenta de {$operador->usuario} ya está ".($activo ? 'activa' : 'inactiva').'.', 'sin_cambio');
            }

            $operador->forceFill(['activo' => $activo])->save();
            if (! $activo) {
                $operador->tokens()->delete(); // sale de inmediato de todos sus equipos
            }

            $this->auditoria->registrar($admin, 'cambiar_estado', 'sistema', $operador->usuario,
                'activo', ! $activo, $activo, trim($motivo));

            return $operador->refresh();
        });
    }

    public function cambiarClave(int $id, string $password, User $admin): User
    {
        $this->exigirAdministrador($admin);

        return DB::transaction(function () use ($id, $password, $admin) {
            $operador = $this->operador($id);
            $operador->forceFill(['password' => $password])->save();
            $operador->tokens()->delete(); // la contraseña anterior deja de servir en todos sus equipos

            $this->auditoria->registrar($admin, 'cambiar_estado', 'sistema', $operador->usuario,
                'contrasena', null, 'restablecida', 'Contraseña asignada por el administrador');

            return $operador->refresh();
        });
    }

    public static function aArreglo(User $u): array
    {
        return [
            'id' => $u->id,
            'usuario' => $u->usuario,
            'nombre' => $u->nombre,
            'rol' => $u->rol->value,
            'activo' => (bool) $u->activo,
            'documento' => $u->documento,
            'correo' => $u->correo,
            'telefono' => $u->telefono,
            'creado' => $u->created_at?->toIso8601String(),
        ];
    }

    private function operador(int $id): User
    {
        $usuario = User::whereKey($id)->lockForUpdate()->first()
            ?? throw ReglaNegocioException::noEncontrado("El usuario {$id} no existe.");

        if ($usuario->rol->value !== 'operador') {
            throw ReglaNegocioException::prohibido('Desde aquí solo se administran cuentas de operador.');
        }

        return $usuario;
    }

    private function exigirAdministrador(User $usuario): void
    {
        if (! $usuario->esAdministrador()) {
            throw ReglaNegocioException::prohibido('Solo el administrador puede administrar el personal.');
        }
    }
}
