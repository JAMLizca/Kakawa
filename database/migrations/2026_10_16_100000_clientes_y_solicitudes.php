<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Compradores (rol "cliente") y solicitudes de compra.
 * El rol nunca lo elige quien se registra: el servidor lo asigna (ver ClienteService).
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. Agrega "cliente" al ENUM de roles conservando los valores y el valor por defecto actuales.
        $columna = DB::selectOne("SHOW COLUMNS FROM users WHERE Field = 'rol'");
        preg_match_all("/'([^']+)'/", $columna->Type, $m);
        $valores = $m[1];
        if (! in_array('cliente', $valores, true)) {
            $valores[] = 'cliente';
            $lista = implode(',', array_map(fn ($v) => "'".$v."'", $valores));
            $nulo = $columna->Null === 'YES' ? 'NULL' : 'NOT NULL';
            $defecto = $columna->Default !== null ? " DEFAULT '".$columna->Default."'" : '';
            DB::statement("ALTER TABLE users MODIFY rol ENUM({$lista}) {$nulo}{$defecto}");
        }

        // 2. Datos de contacto del comprador (el personal puede dejarlos vacíos).
        Schema::table('users', function (Blueprint $t) {
            if (! Schema::hasColumn('users', 'correo')) {
                $t->string('correo', 120)->nullable()->unique();

            }
            if (! Schema::hasColumn('users', 'telefono')) {
                $t->string('telefono', 30)->nullable();
            }
            if (! Schema::hasColumn('users', 'ciudad')) {
                $t->string('ciudad', 80)->nullable();
            }
            if (! Schema::hasColumn('users', 'documento')) {
                $t->string('documento', 30)->nullable()->unique();
            }
        });

        // 3. Solicitudes de compra. Guardan una copia de los datos de contacto del comprador
        //    para que la solicitud siga siendo legible aunque el usuario cambie.
        Schema::create('solicitudes', function (Blueprint $t) {
            $t->id();
            $t->foreignId('cliente_id')->constrained('users');
            $t->string('producto_id', 40);
            $t->foreign('producto_id')->references('id')->on('productos');
            $t->decimal('cantidad', 12, 3);
            $t->string('unidad', 10)->default('kg');
            $t->text('mensaje')->nullable();
            $t->enum('estado', ['pendiente', 'aceptada', 'rechazada'])->default('pendiente');
            $t->text('respuesta')->nullable();
            $t->string('cliente_nombre', 120);
            $t->string('cliente_correo', 120)->nullable();
            $t->string('cliente_telefono', 30)->nullable();
            $t->foreignId('atendida_por')->nullable()->constrained('users');
            $t->timestamp('atendida_en')->nullable();
            $t->timestamps();
            $t->index(['estado', 'created_at']);
        });


        DB::statement('ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_cantidad_positiva CHECK (cantidad > 0)');
    }

    public function down(): void
    {
        Schema::dropIfExists('solicitudes');
        Schema::table('users', function (Blueprint $t) {
            foreach (['correo', 'documento'] as $unica) {
                if (Schema::hasColumn('users', $unica)) {
                    $t->dropUnique("users_{$unica}_unique");
                }
            }
        });
        Schema::table('users', function (Blueprint $t) {
            $t->dropColumn(array_values(array_filter(['correo', 'telefono', 'ciudad', 'documento'],
                fn ($c) => Schema::hasColumn('users', $c))));
        });
        DB::table('users')->where('rol', 'cliente')->delete();
        $columna = DB::selectOne("SHOW COLUMNS FROM users WHERE Field = 'rol'");
        preg_match_all("/'([^']+)'/", $columna->Type, $m);
        $valores = array_values(array_diff($m[1], ['cliente']));
        $lista = implode(',', array_map(fn ($v) => "'".$v."'", $valores));
        $nulo = $columna->Null === 'YES' ? 'NULL' : 'NOT NULL';
        $defecto = $columna->Default !== null && $columna->Default !== 'cliente' ? " DEFAULT '".$columna->Default."'" : '';
        DB::statement("ALTER TABLE users MODIFY rol ENUM({$lista}) {$nulo}{$defecto}");
    }
};
