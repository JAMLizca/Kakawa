<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** El administrador crea una cuenta de operador. No recibe "rol": el servidor siempre crea un operador. */
class CrearOperadorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta exige rol administrador
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'usuario' => mb_strtolower(trim((string) $this->usuario)),
            'correo' => filled($this->correo) ? mb_strtolower(trim((string) $this->correo)) : null,
            'documento' => filled($this->documento) ? strtoupper(trim((string) $this->documento)) : null,
            'telefono' => filled($this->telefono) ? trim((string) $this->telefono) : null,
        ]);
    }

    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'min:3', 'max:120'],
            'usuario' => ['required', 'string', 'regex:/^[a-z0-9._\-]{4,30}$/', 'unique:users,usuario'],
            'documento' => ['nullable', 'string', 'regex:/^[0-9A-Z.\-]{5,20}$/', 'unique:users,documento'],
            'correo' => ['nullable', 'email:rfc', 'max:120', 'unique:users,correo'],
            'telefono' => ['nullable', 'string', 'regex:/^[0-9+ ()\-]{7,20}$/'],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Escriba el nombre completo del operador.',
            'nombre.min' => 'El nombre es muy corto.',
            'usuario.required' => 'Elija un nombre de usuario.',
            'usuario.regex' => 'El usuario debe tener de 4 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.',
            'usuario.unique' => 'Ese usuario ya está en uso.',
            'documento.regex' => 'El documento solo admite números, letras, puntos y guiones (5 a 20).',
            'documento.unique' => 'Ya existe una cuenta con ese documento.',
            'correo.email' => 'El correo no es válido.',
            'correo.unique' => 'Ya existe una cuenta con ese correo.',
            'telefono.regex' => 'El teléfono no es válido.',
            'password.required' => 'Escriba una contraseña inicial.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'password.regex' => 'La contraseña debe tener letras y números.',
        ];
    }
}
