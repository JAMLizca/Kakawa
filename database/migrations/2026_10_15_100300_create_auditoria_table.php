<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // RF10: quién, cuándo y qué cambió, con valor anterior y nuevo.
    public function up(): void
    {
        Schema::create('auditoria', function (Blueprint $table) {
            $table->id();
            $table->foreignId('usuario_id')->nullable()->constrained('users');
            $table->string('usuario', 50);                      // copia del nombre de usuario en ese momento
            $table->string('accion', 40);                       // crear, transformar, cambiar_estado, restaurar...
            $table->string('entidad', 30);                      // lote, producto, transformacion
            $table->string('entidad_id', 40);
            $table->string('campo', 60)->nullable();
            $table->text('valor_anterior')->nullable();
            $table->text('valor_nuevo')->nullable();
            $table->string('motivo', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['entidad', 'entidad_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('auditoria');
    }

};