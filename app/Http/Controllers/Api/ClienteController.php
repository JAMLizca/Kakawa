<?php

namespace App\Http\Controllers\Api;

use App\Enums\Rol;
use App\Http\Controllers\Controller;
use App\Http\Requests\RegistroClienteRequest;
use App\Http\Requests\ResponderSolicitudRequest;
use App\Http\Requests\SolicitudCompraRequest;
use App\Services\ClienteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Registro de compradores, catálogo y solicitudes de compra. */
class ClienteController extends Controller
{
    /** Público: crea la cuenta de comprador y deja la sesión iniciada. */
    public function registro(RegistroClienteRequest $request, ClienteService $clientes): JsonResponse
    {
        $usuario = $clientes->registrar($request->validated());

        $expira = now()->addHours(config('kakawa.horas_token', 12));
        $token = $usuario->createToken('kakawa', [$usuario->rol->value], $expira);

        return response()->json([
            'mensaje' => 'Cuenta creada. ¡Bienvenido a Kakawa!',
            'token' => $token->plainTextToken,
            'tipo' => 'Bearer',
            'expira' => $expira->toIso8601String(),
            'usuario' => [
                'id' => $usuario->id,

                'usuario' => $usuario->usuario,
                'nombre' => $usuario->nombre,
                'rol' => $usuario->rol->value,
            ],
        ], 201);
    }

    /** Público: productos disponibles, sin precio. */
    public function catalogoPublico(ClienteService $clientes): JsonResponse
    {
        return response()->json(['productos' => $clientes->catalogo(false)]);
    }

    /** Comprador con sesión: productos disponibles con precio de venta. */
    public function catalogo(ClienteService $clientes): JsonResponse
    {
        return response()->json(['productos' => $clientes->catalogo(true)]);
    }

    public function solicitar(SolicitudCompraRequest $request, ClienteService $clientes): JsonResponse
    {
        $s = $clientes->solicitar($request->user(), $request->producto_id, (float) $request->cantidad, $request->mensaje);

        return response()->json([
            'mensaje' => "Solicitud enviada: {$s->producto_id}. El administrador le responderá pronto.",
            'solicitud' => ClienteService::aArreglo($s->load('producto'), false),
        ], 201);
    }

    public function misSolicitudes(Request $request, ClienteService $clientes): JsonResponse
    {
        return response()->json([

            'solicitudes' => $clientes->deCliente($request->user())->map(fn ($s) => ClienteService::aArreglo($s, false))->all(),
        ]);
    }

    /** Administrador: todas las solicitudes, con datos de contacto. */
    public function index(Request $request, ClienteService $clientes): JsonResponse
    {
        $estado = in_array($request->query('estado'), ['pendiente', 'aceptada', 'rechazada'], true) ? $request->query('estado') : null;

        return response()->json([
            'solicitudes' => $clientes->todas($estado)->map(fn ($s) => ClienteService::aArreglo($s, true))->all(),
        ]);
    }

    public function responder(ResponderSolicitudRequest $request, int $solicitud, ClienteService $clientes): JsonResponse
    {
        $s = $clientes->responder($solicitud, $request->estado, $request->respuesta, $request->user());

        return response()->json([
            'mensaje' => "Solicitud {$s->id} {$s->estado}.",
            'solicitud' => ClienteService::aArreglo($s->load('producto'), true),
        ]);
    }
}
