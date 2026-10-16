<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

// RF10: historial de cambios. Solo se insertan registros; nunca se modifican ni sse borran.
class Auditoria extends Model
{
    protected $table = 'auditoria';

    // La tabla solo tiene created_at.
    const UPDATED_AT = null;

    protected $fillable = [
        'usuario_id',
        'usuario',
        'accion',
        'entidad',
        'entidad_id',
        'campo',
        'valor_anterior',
        'valor_nuevo',
        'motivo',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime:Y-m-d H:i:s',

        ];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('La auditoría no se puede modificar.'));
        static::deleting(fn () => throw new LogicException('La auditoría no se puede borrar.'));
    }

    public function autor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}