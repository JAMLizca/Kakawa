<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // RF02: etapa de transformación. RF08: consumo de inventario e idempotencia.
    // Consume de UN solo lote: directamente del lote (entrada_producto_id NULL)
    // o de un producto anterior del mismo lote.
    public function up(): void
    {
        Schema::create('transformaciones', function (Blueprint $table) {
            $table->id();
            $table->string('operacion_id', 64)->unique();      // clave de idempotencia enviada por el cliente
            $table->string('huella', 64);                       // hash del contenido, para detectar reenvíos distintos
            $table->string('lote_id', 20);
            $table->string('entrada_producto_id', 30)->nullable();
            $table->string('producto_id', 30)->unique();
            $table->string('etapa', 80);                        // fermentación, secado, molienda...
            $table->string('responsable', 120);
            $table->date('fecha');
            $table->decimal('cantidad_entrada', 12, 3);
            $table->decimal('cantidad_salida', 12, 3);
            $table->string('unidad', 10);
            $table->text('insumos_agregados')->nullable();      // justifica salida > entrada
            $table->text('incidencias')->nullable();
            $table->decimal('costo_etapa', 14, 2)->default(0);  // COP
            $table->text('costos_incluidos')->nullable();       // qué incluye el costo total
            $table->foreignId('registrado_por')->constrained('users');
            $table->timestamps();


            $table->foreign('lote_id')->references('id')->on('lotes');
            $table->foreign('entrada_producto_id')->references('id')->on('productos');
            $table->foreign('producto_id')->references('id')->on('productos');
            $table->index('lote_id');
            $table->index('entrada_producto_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transformaciones');
    }
};