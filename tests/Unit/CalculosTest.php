<?php

namespace Tests\Unit;

use App\Services\Calculos;
use PHPUnit\Framework\TestCase;

class CalculosTest extends TestCase
{
    public function test_merma_del_ejemplo_base_es_20_por_ciento(): void
    {
        $merma = Calculos::merma(100, 80);

        $this->assertTrue($merma['aplica']);
        $this->assertEquals(20, $merma['valor']);
        $this->assertSame('(100 − 80) ÷ 100 × 100 = 20 %', $merma['explicacion']);
    }

    public function test_alerta_solo_cuando_la_merma_supera_el_umbral(): void
    {
        $this->assertTrue(Calculos::superaUmbral(Calculos::merma(100, 80)['valor'], 15));
        $this->assertFalse(Calculos::superaUmbral(Calculos::merma(100, 85)['valor'], 15), '15 % exacto no debe alertar');
        $this->assertTrue(Calculos::superaUmbral(Calculos::merma(100, 84.9)['valor'], 15));
        $this->assertFalse(Calculos::superaUmbral(null, 15));
    }

    public function test_costo_unitario_y_margen_del_ejemplo_base(): void
    {
        $costo = Calculos::costoUnitario(1600000, 80);

        $this->assertEquals(20000, $costo);
        $this->assertEquals(20, Calculos::margenVenta(25000, $costo), 'El margen es sobre el precio de venta, no sobre el costo');
    }

    public function test_calcula_con_valores_distintos_al_ejemplo(): void
    {
        $this->assertEquals(25, Calculos::merma(200, 150)['valor']);
        $this->assertEquals(6000, Calculos::costoUnitario(900000, 150));
        $this->assertEquals(25, Calculos::margenVenta(8000, 6000));
        $this->assertEquals(-25, Calculos::margenVenta(8000, 10000));
    }

    public function test_no_divide_entre_cero(): void
    {
        $this->assertNull(Calculos::costoUnitario(1600000, 0));
        $this->assertNull(Calculos::margenVenta(25000, null));
        $this->assertNull(Calculos::margenVenta(0, 20000));
        $this->assertNull(Calculos::merma(0, 0)['valor']);
    }

    public function test_merma_no_aplica_si_se_agregaron_insumos(): void
    {
        $merma = Calculos::merma(100, 120, 'azúcar');

        $this->assertFalse($merma['aplica']);
        $this->assertNull($merma['valor']);
    }
}