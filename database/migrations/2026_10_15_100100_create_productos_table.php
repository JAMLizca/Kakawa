<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Cada transformación produce un producto (su salida). RF06: ficha pública. RF09: estado.
    public function up(): void
    {
        Schema::create('productos', function (Blueprint $table) {
            $table->string('id', 30)->primary();               // código público: CAC001-P01
            $table->string('nombre', 120);
            $table->string('lote_id', 20);
            $table->decimal('cantidad', 12, 3);                 // salida vendible
            $table->string('unidad', 10);
            $table->decimal('precio_venta', 14, 2)->nullable(); // COP por unidad
            $table->enum('estado', ['pendiente', 'liberado', 'bloqueado'])->default('pendiente');
            $table->string('motivo_estado', 255)->nullable();
            $table->timestamps();

            $table->foreign('lote_id')->references('id')->on('lotes');
            $table->index('lote_id');
            $table->index('estado');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('productos');
    }
};