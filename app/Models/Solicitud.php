<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Solicitud de compra de un comprador sobre un producto liberado. */
class Solicitud extends Model
{
    protected $table = 'solicitudes';

    protected $fillable = [
        'cliente_id', 'producto_id', 'cantidad', 'unidad', 'mensaje', 'estado', 'respuesta',
        'cliente_nombre', 'cliente_correo', 'cliente_telefono', 'atendida_por', 'atendida_en',
    ];

    protected $attributes = [
        'estado' => 'pendiente',
        'unidad' => 'kg',
    ];

    protected function casts(): array
    {
        return [
            'cantidad' => 'float',
            'atendida_en' => 'datetime',
        ];
    }

    public function cliente(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cliente_id');
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class, 'producto_id');
    }
}
