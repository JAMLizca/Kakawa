<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Activar o desactivar la cuenta de un operador, con motivo (queda en la auditoría). */
class EstadoOperadorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'activo' => ['required', 'boolean'],
            'motivo' => ['required', 'string', 'min:5', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'activo.required' => 'Indique si la cuenta queda activa o inactiva.',
            'activo.boolean' => 'El estado debe ser activo o inactivo.',
            'motivo.required' => 'Explique el motivo del cambio.',
            'motivo.min' => 'Explique el motivo con al menos 5 caracteres.',
        ];
    }
}
