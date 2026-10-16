<?php


namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SolicitudCompraRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'producto_id' => ['required', 'string', 'max:40'],
            'cantidad' => ['required', 'numeric', 'gt:0', 'max:1000000'],
            'mensaje' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'producto_id.required' => 'Indique el producto.',
            'cantidad.required' => 'Indique la cantidad.',
            'cantidad.numeric' => 'La cantidad debe ser un número.',
            'cantidad.gt' => 'La cantidad debe ser mayor que cero.',
            'mensaje.max' => 'El mensaje admite hasta 500 caracteres.',
        ];
    }
}

