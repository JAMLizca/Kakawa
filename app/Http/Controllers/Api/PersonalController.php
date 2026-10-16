<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClaveOperadorRequest;
use App\Http\Requests\CrearOperadorRequest;
use App\Http\Requests\EstadoOperadorRequest;
use App\Services\PersonalService;
use Illuminate\Http\JsonResponse;

/** Personal de la asociación: el administrador crea y administra cuentas de operador. */
class PersonalController extends Controller
{
    public function index(PersonalService $personal): JsonResponse
    {
        return response()->json([
            'usuarios' => $personal->listar()->map(fn ($u) => PersonalService::aArreglo($u))->all(),
        ]);
    }

    public function store(CrearOperadorRequest $request, PersonalService $personal): JsonResponse
    {
        $u = $personal->crearOperador($request->validated(), $request->user());

        return response()->json([
            'mensaje' => "Operador {$u->usuario} creado. Ya puede iniciar sesión.",
            'usuario' => PersonalService::aArreglo($u),
        ], 201);
    }

    public function estado(EstadoOperadorRequest $request, int $usuario, PersonalService $personal): JsonResponse
    {
        $u = $personal->cambiarEstado($usuario, $request->boolean('activo'), $request->motivo, $request->user());

        return response()->json([
            'mensaje' => $u->activo ? "Cuenta de {$u->usuario} activada." : "Cuenta de {$u->usuario} desactivada; se cerraron sus sesiones.",
            'usuario' => PersonalService::aArreglo($u),
        ]);
    }

    public function clave(ClaveOperadorRequest $request, int $usuario, PersonalService $personal): JsonResponse
    {
        $u = $personal->cambiarClave($usuario, $request->password, $request->user());

        return response()->json([
            'mensaje' => "Contraseña de {$u->usuario} actualizada; debe iniciar sesión de nuevo.",
            'usuario' => PersonalService::aArreglo($u),
        ]);
    }
}
