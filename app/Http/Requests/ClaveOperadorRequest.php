<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** El administrador asigna una contraseña nueva a un operador (por ejemplo, si la olvidó). */
class ClaveOperadorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
        ];
    }

    public function messages(): array
    {
        return [
            'password.required' => 'Escriba la contraseña nueva.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'password.regex' => 'La contraseña debe tener letras y números.',
        ];
    }
}
