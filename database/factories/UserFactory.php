<?php

namespace Database\Factories;

use App\Enums\Rol;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'usuario' => fake()->unique()->userName(),
            'nombre' => fake()->name(),
            'rol' => Rol::Operador,
            'password' => static::$password ??= Hash::make('password'),
            'activo' => true,
        ];
    }

    public function administrador(): static
    {
        return $this->state(fn () => ['rol' => Rol::Administrador]);
    }

    public function operador(): static
    {
        return $this->state(fn () => ['rol' => Rol::Operador]);
    }
}