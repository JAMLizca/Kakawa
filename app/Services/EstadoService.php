<?php

namespace App\Services;

use App\Enums\Estado;
use App\Exceptions\ReglaNegocioException;
use App\Models\Lote;
use App\Models\Producto;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * RF09
 */
class EstadoService
{
    public function __construct(private AuditoriaService $auditoria) {}

    /**
     * @param  'lote'|'producto'  $tipo
     * @return array{entidad: Lote|Producto, productos_afectados: list<string>}
     */
    public function cambiar(string $tipo, string $id, string $nuevoEstado, ?string $motivo, User $usuario): array
    {
       
        if (! $usuario->esAdministrador()) {
            throw ReglaNegocioException::prohibido('Solo el administrador puede liberar o bloquear.');
        }

        $estado = Estado::tryFrom($nuevoEstado);
        if (! in_array($estado, [Estado::Liberado, Estado::Bloqueado], true)) {

            throw ReglaNegocioException::invalido('El estado debe ser "liberado" o "bloqueado".');
        }

        $motivo = trim((string) $motivo);
        if ($motivo === '') {
            throw ReglaNegocioException::invalido('El motivo es obligatorio para liberar o bloquear.');
        }

        if (! in_array($tipo, ['lote', 'producto'], true)) {
            throw ReglaNegocioException::invalido('Tipo de entidad no válido.');
        }

        return DB::transaction(function () use ($tipo, $id, $estado, $motivo, $usuario) {
            $modelo = ($tipo === 'lote' ? Lote::query() : Producto::query())
                ->whereKey($id)->lockForUpdate()->first()
                ?? throw ReglaNegocioException::noEncontrado(ucfirst($tipo)." {$id} no existe.");

            if ($modelo->estado === $estado) {
                throw ReglaNegocioException::conflicto(
                    ucfirst($tipo)." {$id} ya está en estado {$estado->etiqueta()}.", 'sin_cambio');
            }

            if ($modelo instanceof Producto && $estado === Estado::Liberado
                && $modelo->lote->estado === Estado::Bloqueado) {
                throw ReglaNegocioException::conflicto(
                    "No se puede liberar {$id}: su lote {$modelo->lote_id} está bloqueado.", 'lote_bloqueado');
            }

            $this->aplicar($modelo, $tipo, $estado, $motivo, $usuario);

            $afectados = [];
            if ($modelo instanceof Lote && $estado === Estado::Bloqueado) {

                $productos = Producto::where('lote_id', $modelo->id)
                    ->where('estado', '!=', Estado::Bloqueado->value)
                    ->lockForUpdate()->get();

                foreach ($productos as $producto) {
                    $this->aplicar($producto, 'producto', Estado::Bloqueado,
                        "Bloqueo del lote {$modelo->id}: {$motivo}", $usuario);
                    $afectados[] = $producto->id;
                }
            }

            return ['entidad' => $modelo->refresh(), 'productos_afectados' => $afectados];
        });
    }

    private function aplicar(Lote|Producto $modelo, string $tipo, Estado $estado, string $motivo, User $usuario): void
    {
        $anterior = $modelo->estado;

        $modelo->update(['estado' => $estado, 'motivo_estado' => $motivo]);

        $this->auditoria->registrar($usuario, 'cambiar_estado', $tipo, $modelo->id,
            'estado', $anterior, $estado, $motivo);
    }
}