<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Registro de comprador. No acepta "rol": el servidor siempre crea un cliente. */
class RegistroClienteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'usuario' => mb_strtolower(trim((string) $this->usuario)),
            'correo' => mb_strtolower(trim((string) $this->correo)),
            'documento' => strtoupper(trim((string) $this->documento)),
        ]);
    }

    public function rules(): array
    {
        return [
            'nombre' => ['required', 'string', 'min:3', 'max:120'],
            'documento' => ['required', 'string', 'regex:/^[0-9A-Z.\-]{5,20}$/', 'unique:users,documento'],
            'correo' => ['required', 'email:rfc', 'max:120', 'unique:users,correo'],
            'telefono' => ['required', 'string', 'regex:/^[0-9+ ()\-]{7,20}$/'],
            'ciudad' => ['required', 'string', 'min:2', 'max:80'],

            'usuario' => ['required', 'string', 'regex:/^[a-z0-9._\-]{4,30}$/', 'unique:users,usuario'],
            'password' => ['required', 'string', 'min:8', 'max:255', 'confirmed', 'regex:/[A-Za-z]/', 'regex:/[0-9]/'],
        ];
    }

    public function messages(): array
    {
        return [
            'nombre.required' => 'Escriba su nombre completo.',
            'nombre.min' => 'El nombre es muy corto.',
            'documento.required' => 'Escriba su cédula o NIT.',
            'documento.regex' => 'El documento solo admite números, letras, puntos y guiones (5 a 20).',
            'documento.unique' => 'Ya existe una cuenta con ese documento.',
            'correo.required' => 'Escriba su correo.',
            'correo.email' => 'El correo no es válido.',
            'correo.unique' => 'Ya existe una cuenta con ese correo.',
            'telefono.required' => 'Escriba un teléfono de contacto.',
            'telefono.regex' => 'El teléfono no es válido.',
            'ciudad.required' => 'Escriba su ciudad o municipio.',
            'usuario.required' => 'Elija un nombre de usuario.',
            'usuario.regex' => 'El usuario debe tener de 4 a 30 caracteres: letras minúsculas, números, punto, guion o guion bajo.',
            'usuario.unique' => 'Ese usuario ya está en uso.',
            'password.required' => 'Elija una contraseña.',
            'password.confirmed' => 'Las contraseñas no coinciden.',
            'password.min' => 'La contraseña debe tener al menos 8 caracteres.',
            'password.regex' => 'La contraseña debe tener letras y números.',
        ];
    }
}
