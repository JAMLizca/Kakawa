<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\RespaldoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Respaldo y restauración desde la aplicación (solo administrador). */
class RespaldoController extends Controller
{
    public function index(RespaldoService $respaldos): JsonResponse
    {
        return response()->json(['respaldos' => $respaldos->listar()]);
    }

    public function store(Request $request, RespaldoService $respaldos): JsonResponse
    {
        $resultado = $respaldos->crear($request->user());

        return response()->json([
            'mensaje' => "Respaldo creado: {$resultado['nombre']}.",
            'nombre' => $resultado['nombre'],
            'conteos' => $resultado['conteos'],
            'totales' => $resultado['totales'],
        ], 201);
    }

    public function restaurar(Request $request, RespaldoService $respaldos): JsonResponse
    {
        $datos = $request->validate([
           
            'archivo' => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9_.-]+\.json$/'],
        ], [
            'archivo.required' => 'Indique el nombre del respaldo.',
            'archivo.regex' => 'Nombre de respaldo no válido.',
        ]);

        $resultado = $respaldos->restaurar($datos['archivo'], $request->user());

        return response()->json([
            'mensaje' => $resultado['verificacion']['integro']
                ? 'Respaldo restaurado y verificado: conteos, cantidades y huellas coinciden.'
                : 'Respaldo restaurado con diferencias; revise la verificación.',
        ] + $resultado);
    }
}
