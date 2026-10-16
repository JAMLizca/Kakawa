<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Lote de operaciones pendientes enviado por la cola del navegador.
 * Aquí solo se valida la forma del sobre; los datos de cada operación se validan
 * con el mismo FormRequest que usa su ruta normal (StoreLoteRequest, StoreTransformacionRequest…).
 */
class SincronizarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // El rol se valida por operación dentro de SincronizacionService.
    }

    public function rules(): array
    {
        return [
            'operaciones' => ['required', 'array', 'min:1', 'max:100'],
            'operaciones.*.id_temporal' => ['required', 'string', 'regex:/^TMP-[A-Z0-9]{8,40}$/', 'distinct'],
            'operaciones.*.entidad' => ['required', 'in:lote,transformacion,producto,solicitud'],
            'operaciones.*.accion' => ['required', 'in:CREATE,UPDATE,DELETE'],
            'operaciones.*.datos' => ['present', 'array'],
            'operaciones.*.creado_en' => ['nullable', 'date'],
        ];
    }

    public function messages(): array
    {
        return [
            'operaciones.required' => 'No hay operaciones para sincronizar.',
            'operaciones.max' => 'Envíe máximo 100 operaciones por lote.',
            'operaciones.*.id_temporal.required' => 'Cada operación necesita su identificador temporal.',
            'operaciones.*.id_temporal.regex' => 'El identificador temporal debe tener la forma TMP-XXXXXXXX.',
            'operaciones.*.id_temporal.distinct' => 'Hay operaciones repetidas en el mismo envío.',
            'operaciones.*.entidad.in' => 'Entidad no válida: lote, transformacion, producto o solicitud.',
            'operaciones.*.accion.in' => 'Acción no válida: CREATE, UPDATE o DELETE.',
            'operaciones.*.datos.present' => 'Cada operación necesita sus datos.',
        ];
    }
}
