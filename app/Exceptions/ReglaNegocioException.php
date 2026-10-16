<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;


class ReglaNegocioException extends RuntimeException
{
    public function __construct(
        string $mensaje,
        public readonly int $estadoHttp = 422,
        public readonly string $codigo = 'regla_negocio',
        public readonly array $datos = [],
    ) {
        parent::__construct($mensaje);
    }

    public static function invalido(string $mensaje, array $datos = []): self
    {
        return new self($mensaje, 422, 'dato_invalido', $datos);
    }

    public static function conflicto(string $mensaje, string $codigo = 'conflicto', array $datos = []): self
    {
        return new self($mensaje, 409, $codigo, $datos);
    }


    public static function prohibido(string $mensaje): self
    {
        return new self($mensaje, 403, 'permiso_denegado');
    }

    public static function noEncontrado(string $mensaje): self
    {
        return new self($mensaje, 404, 'no_encontrado');
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'error' => $this->codigo,
            'mensaje' => $this->getMessage(),
            'datos' => $this->datos ?: null,
        ], $this->estadoHttp);
    }
}