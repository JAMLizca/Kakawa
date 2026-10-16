<?php

namespace App\Models;

use App\Enums\Estado;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

// Salida de uma transformación. RF06: ficha pública. RF09: estado.
class Producto extends Model
{
    protected $table = 'productos';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $attributes = [
        'estado' => 'pendiente',
    ];

    protected $fillable = [
        'id',
        'nombre',
        'lote_id',
        'cantidad',
        'unidad',
        'precio_venta',
        'estado',
        'motivo_estado',
    ];

    protected function casts(): array
    {

        return [
            'cantidad' => 'float',
            'precio_venta' => 'float',
            'estado' => Estado::class,
        ];
    }

    // Relaciones

    public function lote(): BelongsTo
    {
        return $this->belongsTo(Lote::class, 'lote_id');
    }

   
    public function transformacionOrigen(): HasOne
    {
        return $this->hasOne(Transformacion::class, 'producto_id');
    }


    public function consumos(): HasMany
    {
        return $this->hasMany(Transformacion::class, 'entrada_producto_id');
    }

    //Inventario

    public function cantidadConsumida(): float
    {
        return round((float) $this->consumos()->sum('cantidad_entrada'), 3);
    }


    public function cantidadDisponible(): float
    {
        return round($this->cantidad - $this->cantidadConsumida(), 3);
    }

    /** RF09: un producto bloqueado o pendiente no se ofrece como disponible. */
    public function disponibleParaVenta(): bool
    {
        return $this->estado === Estado::Liberado && $this->cantidadDisponible() > 0;
    }
}