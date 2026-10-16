<?php

namespace App\Services;

use App\Models\Auditoria;
use App\Models\User;
use BackedEnum;

/** RF10: registra quién, cuándo y qué cambió, con valor anterior y nuevo. */
class AuditoriaService
{
    public function registrar(
        ?User $usuario,
        string $accion,
        string $entidad,
        string $entidadId,
        ?string $campo = null,
        mixed $anterior = null,
        mixed $nuevo = null,
        ?string $motivo = null,
    ): Auditoria {
        return Auditoria::create([
            'usuario_id' => $usuario?->id,
            'usuario' => $usuario?->usuario ?? 'sistema',
            'accion' => $accion,
            'entidad' => $entidad,
            'entidad_id' => $entidadId,
            'campo' => $campo,
            'valor_anterior' => $this->texto($anterior),
            'valor_nuevo' => $this->texto($nuevo),
            'motivo' => $motivo,
        ]);
    }

    private function texto(mixed $valor): ?string
    {
        return match (true) {
            $valor === null => null,
            $valor instanceof BackedEnum => (string) $valor->value,
            is_bool($valor) => $valor ? 'sí' : 'no',
            is_float($valor) => Calculos::num($valor),
            is_array($valor) => json_encode($valor, JSON_UNESCAPED_UNICODE),
            default => (string) $valor,
        };
    }
}