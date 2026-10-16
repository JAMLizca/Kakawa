<?php

namespace App\Http\Middleware;

use App\Exceptions\ReglaNegocioException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Restringe una ruta a uno o varios roles.
 */
class RequiereRol
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $usuario = $request->user();

        if (! $usuario || ! in_array($usuario->rol->value, $roles, true)) {
            throw ReglaNegocioException::prohibido(
                'No tiene permiso para esta acción. Requiere rol: '.implode(' o ', $roles).'.');
        }

        return $next($request);
    }
}
