<?php

namespace App\Services;

use App\Enums\Estado;
use App\Exceptions\ReglaNegocioException;
use App\Models\Lote;
use App\Models\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/** RF01: recepción de lotes. */
class LoteService
{
    public function __construct(private AuditoriaService $auditoria) {}

    public function registrar(array $datos, User $usuario): Lote
    {
        $cantidad = round((float) ($datos['cantidad_recibida'] ?? 0), 3);
        if ($cantidad <= 0) {
            throw ReglaNegocioException::invalido('La cantidad recibida debe ser mayor que cero.');
        }

        try {
            return DB::transaction(function () use ($datos, $usuario, $cantidad) {
                $id = strtoupper(trim((string) ($datos['id'] ?? '')));
                $id = $id !== '' ? $id : $this->siguienteId();

                if (Lote::whereKey($id)->exists()) {
                    throw $this->duplicado($id);
                }


                $lote = Lote::create([
                    'id' => $id,
                    'productor' => trim($datos['productor']),
                    'origen' => trim($datos['origen']),
                    'fecha_recepcion' => $datos['fecha_recepcion'],
                    'cantidad_recibida' => $cantidad,
                    'unidad' => $datos['unidad'] ?? 'kg',
                    'descripcion' => $datos['descripcion'] ?? null,
                    'estado' => Estado::Pendiente,
                    'registrado_por' => $usuario->id,
                ]);

                $this->auditoria->registrar($usuario, 'crear', 'lote', $lote->id,
                    'cantidad_recibida', null, Calculos::num($cantidad).' '.$lote->unidad, 'Recepción del lote');

                return $lote;
            });
        } catch (UniqueConstraintViolationException) {
            
            throw $this->duplicado(strtoupper(trim((string) ($datos['id'] ?? ''))));
        }
    }

  
    private function siguienteId(): string
    {
        $ultimo = Lote::where('id', 'like', 'CAC%')->orderByDesc('id')->lockForUpdate()->value('id');
        $numero = $ultimo ? ((int) substr($ultimo, 3)) + 1 : 1;

        return sprintf('CAC%03d', $numero);
    }


    private function duplicado(string $id): ReglaNegocioException
    {
        return ReglaNegocioException::conflicto(
            "Ya existe un lote con el identificador {$id}.", 'lote_duplicado', ['id' => $id]);
    }
}