<?php

namespace App\Models;

use App\Enums\Estado;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

// RF01: lote recibido. RF08: inventario. RF09: estado. RF11: filtros.
class Lote extends Model
{
    protected $table = 'lotes';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $attributes = [
        'estado' => 'pendiente',
    ];

    protected $fillable = [
        'id',
        'productor',
        'origen',
        'fecha_recepcion',
        'cantidad_recibida',
        'unidad',
        'descripcion',
        'estado',
        'motivo_estado',
        'registrado_por',
    ];


    protected function casts(): array
    {
        return [
            'fecha_recepcion' => 'date:Y-m-d',
            'cantidad_recibida' => 'float',
            'estado' => Estado::class,
        ];
    }

    //Relaciones

    public function registradoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registrado_por');
    }

    public function productos(): HasMany
    {
        return $this->hasMany(Producto::class, 'lote_id');
    }

    /** Todas las transformaciones del lote, directas o sobre productos derivados. */
    public function transformaciones(): HasMany
    {
        return $this->hasMany(Transformacion::class, 'lote_id');
    }

    /** Solo las que consumen directamente del lote recibido (RF08). */
    public function consumosDirectos(): HasMany
    {
        return $this->hasMany(Transformacion::class, 'lote_id')->whereNull('entrada_producto_id');
    }


    //Inventario

    public function cantidadConsumida(): float
    {
        if (array_key_exists('cantidad_consumida', $this->attributes)) {
            return round((float) $this->attributes['cantidad_consumida'], 3);
        }

        return round((float) $this->consumosDirectos()->sum('cantidad_entrada'), 3);
    }

    public function cantidadDisponible(): float
    {
        return round($this->cantidad_recibida - $this->cantidadConsumida(), 3);
    }

    //Cosultas
    public function scopeConInventario(Builder $query): Builder
    {
        return $query->withSum('consumosDirectos as cantidad_consumida', 'cantidad_entrada');
    }

    /** RF11: filtrar por origen y/o estado. */
    public function scopeFiltrar(Builder $query, ?string $origen, ?string $estado): Builder
    {
        return $query
            ->when($origen, fn (Builder $q) => $q->where('origen', $origen))
            ->when($estado, fn (Builder $q) => $q->where('estado', $estado));
    }

}