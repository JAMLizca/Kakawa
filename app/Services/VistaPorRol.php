<?php

namespace App\Services;

use App\Models\User;

/**
 * Los costos son información del admin. Al operador se le entregan las cantidades, merma y alertas de merma, pero no costos, precios ni márgenes.
*/
final class VistaPorRol
{
    private const ALERTAS_ECONOMICAS = ['costo', 'registro_incompleto'];

    public static function trazabilidad(array $recorrido, User $usuario): array
    {
        if ($usuario->esAdministrador()) {
            return $recorrido;
        }

        foreach (['etapas', 'camino'] as $lista) {
            if (isset($recorrido[$lista])) {
                $recorrido[$lista] = array_map(fn (array $etapa) => self::analisis($etapa, $usuario), $recorrido[$lista]);
            }
        }

        if (isset($recorrido['productos'])) {
            $recorrido['productos'] = array_map(function (array $p) {
                unset($p['precio_venta']);


                return $p;
            }, $recorrido['productos']);
        }

        return $recorrido;
    }

   
    public static function analisis(array $analisis, User $usuario): array
    {
        if ($usuario->esAdministrador()) {
            return $analisis;
        }

        unset($analisis['economico']);

        if (isset($analisis['alertas'])) {
            $analisis['alertas'] = array_values(array_filter(
                $analisis['alertas'],
                fn (array $a) => ! in_array($a['tipo'], self::ALERTAS_ECONOMICAS, true),
            ));
        }

        return $analisis;
    }
}