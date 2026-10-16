<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ProductoService;
use Illuminate\Http\JsonResponse;

/** RF06: ficha comercial para el comprador. Pública, sin token, sin costos ni datos privados. */
class FichaPublicaController extends Controller
{
    public function show(string $codigo, ProductoService $productos): JsonResponse
    {
        return response()->json($productos->fichaPublica($codigo));
    }
}
