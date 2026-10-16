<?php

namespace App\Enums;

enum Rol: string
{
    case Operador = 'operador';
    case Administrador = 'administrador';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Operador => 'Operador',
            self::Administrador => 'Administrador',
        };
    }
}