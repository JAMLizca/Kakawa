<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use LogicException;

// RF02: etapa de transformación. Inmutable: una corrección es una nueva operación.
class Transformacion extends Model
{
  
    protected $table = 'transformaciones';

    protected $fillable = [
        'operacion_id',
        'huella',
        'lote_id',
        'entrada_producto_id',
        'producto_id',
        'etapa',
        'responsable',
        'fecha',
        'cantidad_entrada',
        'cantidad_salida',
        'unidad',
        'insumos_agregados',
        'incidencias',
        'costo_etapa',
        'costos_incluidos',
        'registrado_por',
    ];

    protected $hidden = [
        'huella',
    ];

    protected function casts(): array
    {
        return [
            'fecha' => 'date:Y-m-d',
            'cantidad_entrada' => 'float',
            'cantidad_salida' => 'float',
            'costo_etapa' => 'float',
        ];
    }

    protected static function booted(): void
    {
    
        static::updating(fn () => throw new LogicException('Una transformación no se modifica; registre una nueva operación.'));
        static::deleting(fn () => throw new LogicException('Las transformaciones no se borran.'));
    }

    //Relaciones

    public function lote(): BelongsTo
    {
        return $this->belongsTo(Lote::class, 'lote_id');
    }

    public function productoEntrada(): BelongsTo
    {
        return $this->belongsTo(Producto::class, 'entrada_producto_id');
    }

    public function producto(): BelongsTo
    {
        return $this->belongsTo(Producto::class, 'producto_id');
    }

    public function registradoPor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registrado_por');
    }
}