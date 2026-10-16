<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ResponderSolicitudRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'estado' => ['required', 'in:aceptada,rechazada'],
            'respuesta' => ['nullable', 'required_if:estado,rechazada', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'estado.required' => 'Indique si acepta o rechaza.',
            'estado.in' => 'La respuesta debe ser aceptada o rechazada.',
            'respuesta.required_if' => 'Explique al comprador por qué se rechaza.',
            'respuesta.max' => 'La respuesta admite hasta 500 caracteres.',
        ];
    }

}
