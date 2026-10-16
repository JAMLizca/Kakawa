<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** RF09 */
class CambiarEstadoRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'estado' => ['required', 'in:liberado,bloqueado'],
            'motivo' => ['required', 'string', 'min:5', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'estado.required' => 'Indique el nuevo estado.',
            'estado.in' => 'El estado debe ser "liberado" o "bloqueado".',
            'motivo.required' => 'El motivo es obligatorio para liberar o bloquear.',
            'motivo.min' => 'Explique el motivo con al menos 5 caracteres.',
            'motivo.max' => 'El motivo admite máximo 255 caracteres.',
        ];

    }
}