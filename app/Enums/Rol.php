<?php

namespace App\Enums;

enum Rol: string
{
    case Operador = 'operador';
    case Administrador = 'administrador';
    case Cliente = 'cliente';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Operador => 'Operador',
            self::Administrador => 'Administrador',
            self::Cliente => 'Comprador',
        };
    }
}