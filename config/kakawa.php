<?php

return [
    
    'umbral_merma' => (float) env('KAKAWA_UMBRAL_MERMA', 15),

   
    'horas_token' => (int) env('KAKAWA_HORAS_TOKEN', 12),

   
    'ruta_respaldos' => env('KAKAWA_RESPALDOS', storage_path('app/respaldos')),

   
    'epsilon' => 0.0005,
];