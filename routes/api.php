<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ExportacionController;
use App\Http\Controllers\Api\FichaPublicaController;
use App\Http\Controllers\Api\LoteController;
use App\Http\Controllers\Api\PanelController;
use App\Http\Controllers\Api\ProductoController;
use App\Http\Controllers\Api\RespaldoController;
use App\Http\Controllers\Api\TransformacionController;
use Illuminate\Support\Facades\Route;

//  Públicas 
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

// RF06: ficha comercial para el comprador (por código o QR).
Route::get('/publico/productos/{codigo}', [FichaPublicaController::class, 'show'])->middleware('throttle:60,1');

// Con sesión 
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/yo', [AuthController::class, 'yo']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Operador y administrador
    Route::middleware('rol:operador,administrador')->group(function () {
        Route::get('/lotes', [LoteController::class, 'index']);                       // RF11

        Route::post('/lotes', [LoteController::class, 'store']);                      // RF01
        Route::get('/lotes/{lote}', [LoteController::class, 'show']);                 // RF03
        Route::get('/productos/{producto}', [ProductoController::class, 'show']);     // RF03
        Route::post('/transformaciones', [TransformacionController::class, 'store']); // RF02, RF08
    });

    // Solo administrador
    Route::middleware('rol:administrador')->group(function () {
        Route::post('/lotes/{lote}/estado', [LoteController::class, 'estado']);              // RF09
        Route::get('/lotes/{lote}/historial', [LoteController::class, 'historial']);         // RF10
        Route::post('/productos/{producto}/estado', [ProductoController::class, 'estado']);  // RF09
        Route::patch('/productos/{producto}/precio', [ProductoController::class, 'precio']); // RF12
        Route::get('/alertas', [PanelController::class, 'alertas']);                        // RF04
        Route::get('/auditoria', [PanelController::class, 'auditoria']);                    // RF10
        Route::get('/exportar/lotes.csv', [ExportacionController::class, 'lotes']);         // RF11
        Route::get('/respaldos', [RespaldoController::class, 'index']);                     // RF07
        Route::post('/respaldos', [RespaldoController::class, 'store']);                    // RF07
        Route::post('/respaldos/restaurar', [RespaldoController::class, 'restaurar']);      // RF07
    });
});
