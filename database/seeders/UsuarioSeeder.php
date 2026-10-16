<?php

namespace Database\Seeders;

use App\Enums\Rol;
use App\Models\User;
use Illuminate\Database\Seeder;

/** Usuarios de demostración. Las contraseñas son solo para la demo y se documentan en el README. */
class UsuarioSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(['usuario' => 'admin'], [
            'nombre' => 'Administradora Demo',
            'rol' => Rol::Administrador,
            'password' => 'Admin2026*',
            'activo' => true,
        ]);

        User::updateOrCreate(['usuario' => 'operador'], [
            'nombre' => 'Operador Demo',
            'rol' => Rol::Operador,
            'password' => 'Operador2026*',
            'activo' => true,
        ]);
    }
}
