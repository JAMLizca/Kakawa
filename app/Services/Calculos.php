<?php

namespace App\Services;

/**
 * Fórmulas (RF04, RF05, RF12). Funciones puras: no tocan la base de datos
 * y por eso se prueban fácilmente.
 */
final class Calculos
{
    public const FORMULA_MERMA = 'Merma (%) = (entrada − salida) ÷ entrada × 100';

    public const FORMULA_COSTO_UNITARIO = 'Costo unitario (COP por unidad) = costo total de la etapa ÷ salida vendible';

    public const FORMULA_MARGEN = 'Margen sobre venta (%) = (precio − costo unitario) ÷ precio × 100';

    /** RF04 **/
    public static function merma(float $entrada, float $salida, ?string $insumosAgregados = null): array
    {
        if ($entrada <= 0) {
            return [
                'valor' => null,
                'aplica' => false,
                'formula' => self::FORMULA_MERMA,
                'explicacion' => 'No calculable: la entrada debe ser mayor que cero.',
            ];
        }

        if (filled($insumosAgregados)) {

            return [
                'valor' => null,
                'aplica' => false,
                'formula' => self::FORMULA_MERMA,
                'explicacion' => "No se calcula como pérdida: la etapa agregó insumos ({$insumosAgregados}), "
                    .'así que entrada y salida no son el mismo material.',
            ];
        }

        $valor = round(($entrada - $salida) * 100 / $entrada, 2);

        return [
            'valor' => $valor,
            'aplica' => true,
            'formula' => self::FORMULA_MERMA,
            'explicacion' => sprintf('(%s − %s) ÷ %s × 100 = %s %%',
                self::num($entrada), self::num($salida), self::num($entrada), self::num($valor)),
        ];
    }

    /** La alerta cuando la merma SUPERA el umbral: 15 % exacto no alerta. */
    public static function superaUmbral(?float $merma, float $umbral): bool
    {
        return $merma !== null && round($merma, 2) > $umbral;
    }

    /** RF05/RF12: costo por unidad de salida vendible. Null si la salida es cero (evita dividirr entre cero). */
    public static function costoUnitario(float $costoTotal, float $salidaVendible): ?float
    {
        if ($salidaVendible <= 0) {
            return null;
        }


        return round($costoTotal / $salidaVendible, 2);
    }

    /** RF12: margen sobre el precio de venta (no sobre el coso). */
    public static function margenVenta(?float $precio, ?float $costoUnitario): ?float
    {
        if ($precio === null || $precio <= 0 || $costoUnitario === null) {
            return null;
        }

        return round(($precio - $costoUnitario) * 100 / $precio, 2);
    }

    
    public static function num(float $valor): string
    {
        $texto = number_format($valor, 3, ',', '.');

        return rtrim(rtrim($texto, '0'), ',');
    }

    public static function cop(float $valor): string
    {
        return '$'.self::num(round($valor, 2)).' COP';
    }
}