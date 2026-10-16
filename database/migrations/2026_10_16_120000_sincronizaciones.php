<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Captura sin conexión: registro de cada operación que llegó desde la cola del navegador.
 * Sirve para dos cosas:
 *  - Idempotencia: si el navegador reenvía la misma operación (id_temporal), no se aplica dos veces.
 *  - Traducción de identificadores: TMP-… (creado sin conexión) → id real (CAC004, CAC004-P01, 12…).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sincronizaciones', function (Blueprint $tabla) {
            $tabla->id();
            $tabla->string('id_temporal', 64)->unique();
            $tabla->foreignId('usuario_id')->constrained('users');
            $tabla->string('entidad', 20);          // lote, transformacion, producto, solicitud
            $tabla->string('accion', 10);           // CREATE, UPDATE
            $tabla->string('id_real', 40)->nullable();
            $tabla->json('resultado')->nullable();  // lo que se devolvió al navegador la primera vez
            $tabla->timestamps();

            $tabla->index(['usuario_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sincronizaciones');
    }
};
