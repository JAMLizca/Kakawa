<?php

namespace App\Console\Commands;

use App\Enums\Rol;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * Crea (o actualiza) la cuenta de administrador con datos tomados de variables de entorno.
 * La contraseña nunca queda en el repositorio: se configura en Railway (o en .env).
 *   ADMIN_USUARIO, ADMIN_PASSWORD y, opcional, ADMIN_NOMBRE.
 * Si las variables no existen, no hace nada. Se puede ejecutar en cada despliegue.
 */
class CrearAdministrador extends Command
{
    protected $signature = 'kakawa:crear-admin';

    protected $description = 'Crea o actualiza el administrador con ADMIN_USUARIO y ADMIN_PASSWORD del entorno';

    public function handle(): int
    {
        $usuario = mb_strtolower(trim((string) getenv('ADMIN_USUARIO')));
        $clave = (string) getenv('ADMIN_PASSWORD');
        $nombre = trim((string) getenv('ADMIN_NOMBRE')) ?: 'Administrador Kakawa';

        if ($usuario === '' || $clave === '') {
            $this->warn('ADMIN_USUARIO o ADMIN_PASSWORD no están definidas: no se creó ningún administrador.');

            return self::SUCCESS;
        }
        if (! preg_match('/^[a-z0-9._\-]{4,30}$/', $usuario)) {
            $this->error('ADMIN_USUARIO debe tener de 4 a 30 caracteres: minúsculas, números, punto o guion.');

            return self::FAILURE;
        }
        if (mb_strlen($clave) < 10 || ! preg_match('/[A-Za-z]/', $clave) || ! preg_match('/[0-9]/', $clave)) {
            $this->error('ADMIN_PASSWORD debe tener al menos 10 caracteres, con letras y números.');

            return self::FAILURE;
        }

        $admin = User::where('usuario', $usuario)->first() ?? new User;
        $nuevo = ! $admin->exists;
        $admin->forceFill([
            'usuario' => $usuario,
            'nombre' => $nombre,
            'password' => $clave,                 // el modelo la guarda cifrada (cast "hashed")
            'rol' => Rol::from('administrador'),
            'activo' => true,
        ])->save();

        $this->info($nuevo ? "Administrador {$usuario} creado." : "Administrador {$usuario} actualizado.");

        return self::SUCCESS;
    }
}
