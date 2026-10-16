<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            throw new RuntimeException('Las reglas de integridad de Kakawa están escritas para MySQL/MariaDB.');
        }

        foreach ($this->checks() as [$tabla, $nombre, $condicion]) {
            DB::statement("ALTER TABLE {$tabla} ADD CONSTRAINT {$nombre} CHECK ({$condicion})");
        }

        foreach ($this->triggers() as $nombre => $sql) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$nombre}");
            DB::unprepared($sql);
        }
    }

    public function down(): void
    {
        foreach (array_keys($this->triggers()) as $nombre) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$nombre}");
        }

        foreach ($this->checks() as [$tabla, $nombre]) {
            DB::statement("ALTER TABLE {$tabla} DROP CONSTRAINT {$nombre}");
        }

    }

    /** Reglas de una sola fila (RF01, RF02, RF12). */
    private function checks(): array
    {
        return [
            ['lotes', 'chk_lotes_cantidad_positiva', 'cantidad_recibida > 0'],
            ['productos', 'chk_productos_cantidad', 'cantidad >= 0'],
            ['productos', 'chk_productos_precio', 'precio_venta IS NULL OR precio_venta > 0'],
            ['transformaciones', 'chk_transf_entrada_positiva', 'cantidad_entrada > 0'],
            ['transformaciones', 'chk_transf_salida_no_negativa', 'cantidad_salida >= 0'],
            ['transformaciones', 'chk_transf_costo_no_negativo', 'costo_etapa >= 0'],
            // Salida mayor que entrada solo con insumos registrados.
            ['transformaciones', 'chk_transf_balance',
                "cantidad_salida <= cantidad_entrada OR (insumos_agregados IS NOT NULL AND TRIM(insumos_agregados) <> '')"],
        ];
    }

    /** Reglas que consultan otras tablas (RF08, RF09, RF10). */
    private function triggers(): array
    {
        $error = fn (string $mensaje) => "SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '{$mensaje}'";

        return [
            // Lotes
            'trg_lotes_antes_actualizar' => "
                CREATE TRIGGER trg_lotes_antes_actualizar BEFORE UPDATE ON lotes FOR EACH ROW
                BEGIN
                    IF NEW.id <> OLD.id THEN
                        {$error('El identificador del lote no se puede cambiar')};
                    END IF;
                    IF NEW.cantidad_recibida < (

                        SELECT COALESCE(SUM(t.cantidad_entrada), 0) FROM transformaciones t
                        WHERE t.lote_id = OLD.id AND t.entrada_producto_id IS NULL
                    ) THEN
                        {$error('La cantidad recibida no puede quedar por debajo de lo ya consumido')};
                    END IF;
                END",

            'trg_lotes_antes_borrar' => "
                CREATE TRIGGER trg_lotes_antes_borrar BEFORE DELETE ON lotes FOR EACH ROW
                BEGIN
                    {$error('Los lotes no se borran; use el estado bloqueado')};
                END",

            //Productos
            'trg_productos_antes_actualizar' => "
                CREATE TRIGGER trg_productos_antes_actualizar BEFORE UPDATE ON productos FOR EACH ROW
                BEGIN
                    IF NEW.id <> OLD.id OR NEW.lote_id <> OLD.lote_id
                       OR NEW.cantidad <> OLD.cantidad OR NEW.unidad <> OLD.unidad THEN
                        {$error('El código, lote, cantidad y unidad de un producto no se modifican')};
                    END IF;
                END",

            'trg_productos_antes_borrar' => "
                CREATE TRIGGER trg_productos_antes_borrar BEFORE DELETE ON productos FOR EACH ROW
                BEGIN
                    {$error('Los productos no se borran; use el estado bloqueado')};
                END",

            //Transformaciones 
            'trg_transf_antes_insertar' => "
                CREATE TRIGGER trg_transf_antes_insertar BEFORE INSERT ON transformaciones FOR EACH ROW

                BEGIN
                    DECLARE v_unidad VARCHAR(10);
                    DECLARE v_lote_entrada VARCHAR(20);
                    DECLARE v_disponible DECIMAL(14,3);
                    DECLARE v_mensaje VARCHAR(255);

                    SELECT unidad INTO v_unidad FROM lotes WHERE id = NEW.lote_id;
                    IF v_unidad IS NULL THEN
                        {$error('El lote indicado no existe')};
                    END IF;
                    IF NEW.unidad <> v_unidad THEN
                        {$error('La unidad de la transformación no coincide con la del lote')};
                    END IF;

                    IF NEW.entrada_producto_id IS NULL THEN
                        SELECT l.cantidad_recibida - COALESCE((
                            SELECT SUM(t.cantidad_entrada) FROM transformaciones t
                            WHERE t.lote_id = NEW.lote_id AND t.entrada_producto_id IS NULL
                        ), 0) INTO v_disponible
                        FROM lotes l WHERE l.id = NEW.lote_id;
                    ELSE
                        SELECT lote_id INTO v_lote_entrada FROM productos WHERE id = NEW.entrada_producto_id;
                        IF v_lote_entrada IS NULL THEN
                            {$error('El producto de entrada no existe')};
                        END IF;
                        IF v_lote_entrada <> NEW.lote_id THEN
                            {$error('La entrada debe provenir del mismo lote (un solo lote por operación)')};
                        END IF;
                        SELECT p.cantidad - COALESCE((
                            SELECT SUM(t.cantidad_entrada) FROM transformaciones t
                            WHERE t.entrada_producto_id = NEW.entrada_producto_id
                        ), 0) INTO v_disponible

                        FROM productos p WHERE p.id = NEW.entrada_producto_id;
                    END IF;

                    IF NEW.cantidad_entrada > v_disponible THEN
                        SET v_mensaje = CONCAT('Existencia insuficiente. Disponible: ', v_disponible,
                                               ' ', v_unidad, '; solicitado: ', NEW.cantidad_entrada);
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = v_mensaje;
                    END IF;
                END",

            'trg_transf_antes_actualizar' => "
                CREATE TRIGGER trg_transf_antes_actualizar BEFORE UPDATE ON transformaciones FOR EACH ROW
                BEGIN
                    {$error('Una transformación no se modifica; registre una nueva operación')};
                END",

            'trg_transf_antes_borrar' => "
                CREATE TRIGGER trg_transf_antes_borrar BEFORE DELETE ON transformaciones FOR EACH ROW
                BEGIN
                    {$error('Las transformaciones no se borran')};
                END",

            //Auditoría
            'trg_auditoria_antes_actualizar' => "
                CREATE TRIGGER trg_auditoria_antes_actualizar BEFORE UPDATE ON auditoria FOR EACH ROW
                BEGIN
                    {$error('La auditoría no se puede modificar')};
                END",

            'trg_auditoria_antes_borrar' => "
                CREATE TRIGGER trg_auditoria_antes_borrar BEFORE DELETE ON auditoria FOR EACH ROW
                BEGIN

                    {$error('La auditoría no se puede borrar')};
                END",
        ];
    }
};