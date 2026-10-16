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

        // Comprador de demostración (en la app real los compradores se registran solos).
        $comprador = User::firstOrNew(['usuario' => 'comprador']);
        $comprador->forceFill([
            'nombre' => 'Comprador Demo',

            'rol' => Rol::Cliente,
            'password' => 'Comprador2026*',
            'activo' => true,
            'correo' => 'comprador@kakawa.demo',
            'telefono' => '3000000000',
            'ciudad' => 'Neiva',
            'documento' => 'DEMO-0001',
        ])->save();
    }
}
