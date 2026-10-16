<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Una operación capturada sin conexión que ya se aplicó en el servidor. */
class Sincronizacion extends Model
{
    protected $table = 'sincronizaciones';

    protected $fillable = ['id_temporal', 'usuario_id', 'entidad', 'accion', 'id_real', 'resultado'];

    protected function casts(): array
    {
        return ['resultado' => 'array'];
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'usuario_id');
    }
}
