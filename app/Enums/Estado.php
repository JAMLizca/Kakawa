<?php

namespace App\Enums;

// RF09: estados de lotes y productos.
enum Estado: string
{
    case Pendiente = 'pendiente';
    case Liberado = 'liberado';
    case Bloqueado = 'bloqueado';

    public function etiqueta(): string
    {
        return match ($this) {
            self::Pendiente => 'Pendiente',
            self::Liberado => 'Liberado',
            self::Bloqueado => 'Bloqueado',
        };
    }
}