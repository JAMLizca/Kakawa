<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** RF01: validación de la recepción de un lote. */
class StoreLoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // El rol controla en la ruta con el middleware "rol".
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'id' => filled($this->id) ? strtoupper(trim($this->id)) : null,
            'unidad' => $this->unidad ?: 'kg',
        ]);
    }

    public function rules(): array
    {
        return [
            'id' => ['nullable', 'string', 'max:20', 'regex:/^[A-Z0-9-]+$/'],
            'productor' => ['required', 'string', 'max:120'],
            'origen' => ['required', 'string', 'max:120'],
            'fecha_recepcion' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'cantidad_recibida' => ['required', 'numeric', 'gt:0', 'max:99999999'],
            'unidad' => ['required', 'in:kg'],

            'descripcion' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'id.regex' => 'El identificador solo puede tener letras, números y guiones (ej. CAC004).',
            'id.max' => 'El identificador admite máximo 20 caracteres.',
            'productor.required' => 'Indique el productor.',
            'origen.required' => 'Indique el origen (municipio o finca).',
            'fecha_recepcion.required' => 'Indique la fecha de recepción.',
            'fecha_recepcion.date_format' => 'La fecha debe tener el formato AAAA-MM-DD.',
            'fecha_recepcion.before_or_equal' => 'La fecha de recepción no puede ser futura.',
            'cantidad_recibida.required' => 'Indique la cantidad recibida.',
            'cantidad_recibida.numeric' => 'La cantidad debe ser un número.',
            'cantidad_recibida.gt' => 'La cantidad recibida debe ser mayor que cero.',
            'cantidad_recibida.max' => 'La cantidad es demasiado grande.',
            'unidad.in' => 'La unidad debe ser kg.',
            '*.max' => 'El texto es demasiado largo.',
        ];
    }
}
