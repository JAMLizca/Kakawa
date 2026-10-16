<?php

use App\Http\Middleware\RequiereRol;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'rol' => RequiereRol::class,
        ]);

        // La API usa tokens: un invitado nunca se redirige a una página de login.
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $esApi = fn (Request $request) => $request->is('api/*') || $request->expectsJson();


        $exceptions->shouldRenderJsonWhen($esApi);

        // 401: falta el token, venció o es inválido.
        $exceptions->render(function (AuthenticationException $e, Request $request) use ($esApi) {
            if ($esApi($request)) {
                return response()->json([
                    'error' => 'no_autenticado',
                    'mensaje' => 'Inicie sesión para continuar.',
                ], 401);
            }
        });

        // 422: validación de formularios con mensajes por campo.
        $exceptions->render(function (ValidationException $e, Request $request) use ($esApi) {
            if ($esApi($request)) {
                return response()->json([
                    'error' => 'dato_invalido',
                    'mensaje' => collect($e->errors())->flatten()->first() ?? 'Hay datos inválidos.',
                    'errores' => $e->errors(),
                ], 422);
            }
        });

        $exceptions->render(function (NotFoundHttpException $e, Request $request) use ($esApi) {
            if ($esApi($request)) {
                return response()->json(['error' => 'no_encontrado', 'mensaje' => 'El recurso solicitado no existe.'], 404);
            }
        });

        $exceptions->render(function (MethodNotAllowedHttpException $e, Request $request) use ($esApi) {
            if ($esApi($request)) {

                return response()->json(['error' => 'metodo_no_permitido', 'mensaje' => 'Método HTTP no permitido en esta ruta.'], 405);
            }
        });

        // Última defensa: si una regla llega a la base de datos, se responde con su mensaje y sin datos internos.
        $exceptions->render(function (QueryException $e, Request $request) use ($esApi) {
            if (! $esApi($request)) {
                return null;
            }

            $codigoMysql = (int) ($e->errorInfo[1] ?? 0);

            return match ($codigoMysql) {
                1644 => response()->json(['error' => 'regla_integridad', 'mensaje' => $e->errorInfo[2] ?? 'Operación rechazada.'], 409),
                3819 => response()->json(['error' => 'dato_invalido', 'mensaje' => 'Un valor está fuera del rango permitido.'], 422),
                1062 => response()->json(['error' => 'duplicado', 'mensaje' => 'Ya existe un registro con ese identificador.'], 409),
                1451, 1452 => response()->json(['error' => 'referencia_invalida', 'mensaje' => 'El registro relacionado no existe o está en uso.'], 409),
                default => null,
            };
        });

        // Las guardas de los modelos (transformación o auditoría inmutables) lanzan LogicException exacta;
        // sus subclases (p. ej. InvalidArgumentException) son errores de programación y siguen como 500.
        $exceptions->render(function (LogicException $e, Request $request) use ($esApi) {
            if ($e::class === LogicException::class && $esApi($request)) {
                return response()->json(['error' => 'operacion_no_permitida', 'mensaje' => $e->getMessage()], 409);
            }
        });
    })->create();
