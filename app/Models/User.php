<?php

namespace App\Models;

use App\Enums\Rol;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory;

    protected $attributes = [
        'activo' => true,
    ];

    protected $fillable = [
        'usuario',
        'nombre',
        'rol',
        'password',
        'activo',
    ];

    protected $hidden = [
        'password',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'rol' => Rol::class,
            'activo' => 'boolean',
        ];
    }

    public function esAdministrador(): bool
    {
        return $this->rol === Rol::Administrador;
    }

    public function esOperador(): bool
    {
        return $this->rol === Rol::Operador;
    }
}