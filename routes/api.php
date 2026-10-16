<?php

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;


// Pública. Máximo 10 intentos por minuto para frenar ataques de fuerza bruta.
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/yo', [AuthController::class, 'yo']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

   
    Route::get('/prueba/operador', fn () => ['mensaje' => 'Acceso de operador concedido.'])->middleware('rol:operador,administrador');
    Route::get('/prueba/administrador', fn () => ['mensaje' => 'Acceso de administrador concedido.'])->middleware('rol:administrador');
});
