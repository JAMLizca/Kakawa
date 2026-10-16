<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/** Inicio y cierre de sesión con tokens de Sanctum. */
class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $datos = $request->validate([
            'usuario' => ['required', 'string', 'max:50'],
            'password' => ['required', 'string', 'max:255'],
        ], [
            'usuario.required' => 'Escriba su usuario.',
            'password.required' => 'Escriba su contraseña.',
        ]);

        $usuario = User::where('usuario', trim($datos['usuario']))->first();

        // Mismo mensaje si el usuario no existe o la clave es incorrecta: no revela qué usuarios existen.
        if (! $usuario || ! $usuario->activo || ! Hash::check($datos['password'], $usuario->password)) {
            return response()->json([
                'error' => 'credenciales_invalidas',
                'mensaje' => 'Usuario o contraseña incorrectos.',
            ], 401);

        }

        $expira = now()->addHours(config('kakawa.horas_token', 12));
        $token = $usuario->createToken('kakawa', [$usuario->rol->value], $expira);

        return response()->json([
            'token' => $token->plainTextToken,
            'tipo' => 'Bearer',
            'expira' => $expira->toIso8601String(),
            'usuario' => $this->perfil($usuario),
        ]);
    }

    public function yo(Request $request): JsonResponse
    {
        return response()->json(['usuario' => $this->perfil($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['mensaje' => 'Sesión cerrada.']);
    }

    private function perfil(User $usuario): array
    {
        return [
            'id' => $usuario->id,
            'usuario' => $usuario->usuario,
            'nombre' => $usuario->nombre,
            'rol' => $usuario->rol->value,

        ];
    }
}
