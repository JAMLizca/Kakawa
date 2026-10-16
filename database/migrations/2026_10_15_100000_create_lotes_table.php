<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // RF01: lote recibido. RF09/RF11: estado y filtros por origen o estado.
    public function up(): void
    {
        Schema::create('lotes', function (Blueprint $table) {
            $table->string('id', 20)->primary();              // CAC001
            $table->string('productor', 120);
            $table->string('origen', 120);
            $table->date('fecha_recepcion');
            $table->decimal('cantidad_recibida', 12, 3);
            $table->string('unidad', 10);                      // kg
            $table->text('descripcion')->nullable();           // p. ej. "cacao seco"
            $table->enum('estado', ['pendiente', 'liberado', 'bloqueado'])->default('pendiente');
            $table->string('motivo_estado', 255)->nullable();
            $table->foreignId('registrado_por')->constrained('users');
            $table->timestamps();

            $table->index('origen');
            $table->index('estado');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lotes');

    }
};