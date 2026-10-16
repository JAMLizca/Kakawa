<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CambiarPrecioRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'precio_venta' => ['required', 'numeric', 'gt:0', 'max:999999999999'],
            'motivo' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'precio_venta.required' => 'Indique el precio de venta.',
            'precio_venta.numeric' => 'El precio debe ser un número.',
            'precio_venta.gt' => 'El precio debe ser mayor que cero.',
            'precio_venta.max' => 'El precio es demasiado grande.',
        ];
    }
}

