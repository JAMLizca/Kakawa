<?php

namespace App\Services;

use App\Models\Transformacion;

/**
 * RF04, RF05, RF12
 */
class AnalisisService
{
    public function analizar(Transformacion $t): array
    {
        $t->loadMissing('producto');

        $umbral = (float) config('kakawa.umbral_merma', 15);
        $merma = Calculos::merma($t->cantidad_entrada, $t->cantidad_salida, $t->insumos_agregados);
        $economico = $this->balance($t);

        return [
            'merma' => $merma + ['umbral' => $umbral],
            'economico' => $economico,
            'alertas' => $this->alertas($t, $merma, $economico, $umbral),
        ];
    }

    /** RF05/RF12 **/
    public function balance(Transformacion $t): array
    {
        $unidad = $t->unidad;
        $costoTotal = $t->costo_etapa;

        $salida = $t->cantidad_salida;
        $precio = $t->producto?->precio_venta;

        $costoUnitario = Calculos::costoUnitario($costoTotal, $salida);
        $margen = Calculos::margenVenta($precio, $costoUnitario);

        $explicacionCosto = $costoUnitario === null
            ? "No calculable: la salida vendible es 0 {$unidad} (no se divide entre cero)."
            : sprintf('%s ÷ %s %s = %s/%s',
                Calculos::cop($costoTotal), Calculos::num($salida), $unidad, Calculos::cop($costoUnitario), $unidad);

        $explicacionMargen = match (true) {
            $precio === null => 'No calculable: falta registrar el precio de venta.',
            $costoUnitario === null => 'No calculable: no hay costo unitario.',
            default => sprintf('(%s − %s) ÷ %s × 100 = %s %%',
                Calculos::num($precio), Calculos::num($costoUnitario), Calculos::num($precio), Calculos::num($margen)),
        };

        return [
            'costo_total' => $costoTotal,
            'costos_incluidos' => $t->costos_incluidos,
            'salida_vendible' => $salida,
            'unidad' => $unidad,
            'moneda' => 'COP',
            'costo_unitario' => $costoUnitario,
            'precio_venta' => $precio,
            'margen_venta' => $margen,
            'formulas' => [
                'costo_unitario' => Calculos::FORMULA_COSTO_UNITARIO,
                'margen_venta' => Calculos::FORMULA_MARGEN,
            ],
            'explicacion' => [

                'costo_unitario' => $explicacionCosto,
                'margen_venta' => $explicacionMargen,
            ],
            'supuestos' => [
                'El costo total es el registrado para esta etapa; incluye: '
                    .($t->costos_incluidos ?: 'no especificado').'.',
                'El costo se reparte solo sobre la salida vendible de la etapa.',
                'El precio de venta es hipotético mientras no exista una venta real.',
            ],
        ];
    }

    /** RF04 */
    private function alertas(Transformacion $t, array $merma, array $economico, float $umbral): array
    {
        $alertas = [];

        if ($merma['aplica'] && Calculos::superaUmbral($merma['valor'], $umbral)) {
            $alertas[] = [
                'tipo' => 'merma',
                'regla' => 'Se alerta cuando la merma de una etapa supera el '.Calculos::num($umbral).' %.',
                'causa' => sprintf('La etapa "%s" tuvo una merma de %s %% (entrada %s %s, salida %s %s).',
                    $t->etapa, Calculos::num($merma['valor']),
                    Calculos::num($t->cantidad_entrada), $t->unidad, Calculos::num($t->cantidad_salida), $t->unidad),
            ];
        }

        $faltantes = [];
        if ($t->costo_etapa <= 0) {
            $faltantes[] = 'costo de la etapa';
        }
        if (blank($t->costos_incluidos)) {

            $faltantes[] = 'detalle de costos incluidos';
        }
        if ($economico['precio_venta'] === null) {
            $faltantes[] = 'precio de venta';
        }
        if ($faltantes) {
            $alertas[] = [
                'tipo' => 'registro_incompleto',
                'regla' => 'Para calcular el balance económico se necesitan costo, costos incluidos y precio de venta.',
                'causa' => 'Falta: '.implode(', ', $faltantes).'.',
            ];
        }

        if ($economico['costo_unitario'] === null) {
            $alertas[] = [
                'tipo' => 'costo',
                'regla' => 'El costo unitario solo se calcula con salida vendible mayor que cero.',
                'causa' => "La etapa \"{$t->etapa}\" registró salida vendible de 0 {$t->unidad}.",
            ];
        } elseif ($economico['margen_venta'] !== null && $economico['margen_venta'] < 0) {
            $alertas[] = [
                'tipo' => 'costo',
                'regla' => 'Se alerta cuando el precio de venta es menor que el costo unitario.',
                'causa' => sprintf('Costo unitario %s frente a precio %s: margen de %s %%.',
                    Calculos::cop($economico['costo_unitario']), Calculos::cop($economico['precio_venta']),
                    Calculos::num($economico['margen_venta'])),
            ];
        }

        return $alertas;
    }
}