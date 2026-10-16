<?php

namespace App\Http\Requests;

use App\Models\Lote;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** RF02 */
class StoreTransformacionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'lote_id' => filled($this->lote_id) ? strtoupper(trim($this->lote_id)) : null,
            'entrada_producto_id' => filled($this->entrada_producto_id) ? strtoupper(trim($this->entrada_producto_id)) : null,
        ]);
    }

    public function rules(): array
    {
        return [
            'operacion_id' => ['required', 'string', 'max:64'],
            'lote_id' => ['required', 'string', 'exists:lotes,id'],
            'entrada_producto_id' => ['nullable', 'string', 'exists:productos,id'],
            'etapa' => ['required', 'string', 'max:80'],

            'responsable' => ['required', 'string', 'max:120'],
            'fecha' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'cantidad_entrada' => ['required', 'numeric', 'gt:0', 'max:99999999'],
            'cantidad_salida' => ['required', 'numeric', 'gte:0', 'max:99999999'],
            'insumos_agregados' => ['nullable', 'string', 'max:500'],
            'incidencias' => ['nullable', 'string', 'max:1000'],
            'costo_etapa' => ['nullable', 'numeric', 'gte:0', 'max:999999999999'],
            'costos_incluidos' => ['nullable', 'string', 'max:500'],
            'precio_venta' => ['nullable', 'numeric', 'gt:0', 'max:999999999999'],
            'producto_nombre' => ['nullable', 'string', 'max:120'],
        ];
    }

    
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            $recepcion = Lote::whereKey($this->lote_id)->value('fecha_recepcion');
            if ($recepcion && $this->fecha < substr((string) $recepcion, 0, 10)) {
                $v->errors()->add('fecha', 'La fecha de la transformación no puede ser anterior a la recepción del lote ('
                    .substr((string) $recepcion, 0, 10).').');
            }
        });
    }

    public function messages(): array
    {
        return [

            'operacion_id.required' => 'Falta el identificador de la operación.',
            'lote_id.required' => 'Seleccione el lote.',
            'lote_id.exists' => 'El lote indicado no existe.',
            'entrada_producto_id.exists' => 'El producto de entrada no existe.',
            'etapa.required' => 'Indique la etapa (ej. fermentación, secado).',
            'responsable.required' => 'Indique el responsable.',
            'fecha.required' => 'Indique la fecha.',
            'fecha.date_format' => 'La fecha debe tener el formato AAAA-MM-DD.',
            'fecha.before_or_equal' => 'La fecha no puede ser futura.',
            'cantidad_entrada.required' => 'Indique la cantidad de entrada.',
            'cantidad_entrada.numeric' => 'La cantidad de entrada debe ser un número.',
            'cantidad_entrada.gt' => 'La cantidad de entrada debe ser mayor que cero.',
            'cantidad_salida.required' => 'Indique la cantidad de salida.',
            'cantidad_salida.numeric' => 'La cantidad de salida debe ser un número.',
            'cantidad_salida.gte' => 'La cantidad de salida no puede ser negativa.',
            'costo_etapa.numeric' => 'El costo debe ser un número.',
            'costo_etapa.gte' => 'El costo no puede ser negativo.',
            'precio_venta.numeric' => 'El precio debe ser un número.',
            'precio_venta.gt' => 'El precio debe ser mayor que cero.',
            '*.max' => 'El valor es demasiado largo o grande.',
        ];
    }
}
