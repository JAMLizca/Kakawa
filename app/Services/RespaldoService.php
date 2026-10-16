<?php

namespace App\Services;

use App\Exceptions\ReglaNegocioException;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Throwable;


class RespaldoService
{
    public const FORMATO = 'kakawa-respaldo';

    public const VERSION = 1;

   
    public const TABLAS = ['users', 'lotes', 'productos', 'transformaciones', 'auditoria'];

    public function __construct(private AuditoriaService $auditoria) {}

    public function carpeta(): string
    {

        $carpeta = config('kakawa.ruta_respaldos');
        if (! is_dir($carpeta)) {
            mkdir($carpeta, 0775, true);
        }

        return $carpeta;
    }

    /** @return array{archivo: string, nombre: string, conteos: array, totales: array} */
    public function crear(?User $usuario = null, string $prefijo = 'respaldo', ?string $destino = null): array
    {
        $tablas = $this->leerBase();

        $contenido = [
            'formato' => self::FORMATO,
            'version' => self::VERSION,
            'creado' => now()->toIso8601String(),
            'aplicacion' => config('app.name'),
            'conteos' => array_map('count', $tablas),
            'totales' => $this->totales($tablas),
            'huellas' => array_map(fn (array $filas) => $this->huella($filas), $tablas),
            'tablas' => $tablas,
        ];

        $archivo = $destino ?: $this->carpeta().'/'.$prefijo.'_'.now()->format('Ymd_His').'.json';
        if (! is_dir(dirname($archivo))) {
            mkdir(dirname($archivo), 0775, true);
        }
        if (file_put_contents($archivo, json_encode($contenido, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            throw ReglaNegocioException::conflicto("No se pudo escribir el respaldo en {$archivo}.", 'respaldo_fallido');
        }


        if ($usuario) {
            $this->auditoria->registrar($usuario, 'respaldar', 'sistema', basename($archivo),
                'conteos', null, $contenido['conteos'], 'Respaldo creado');
        }

        return [
            'archivo' => $archivo,
            'nombre' => basename($archivo),
            'conteos' => $contenido['conteos'],
            'totales' => $contenido['totales'],
        ];
    }

    /** Lee y valida un respaldo sin tocar la base (formato, conteos y huellas). */
    public function leer(string $ruta): array
    {
        $archivo = $this->resolver($ruta);
        $respaldo = json_decode((string) file_get_contents($archivo), true);

        if (! is_array($respaldo) || ($respaldo['formato'] ?? null) !== self::FORMATO) {
            throw ReglaNegocioException::invalido('El archivo no es un respaldo de Kakawa.');
        }
        if (($respaldo['version'] ?? null) !== self::VERSION) {
            throw ReglaNegocioException::invalido('Versión de respaldo no compatible.');
        }

        foreach (self::TABLAS as $tabla) {
            $filas = $respaldo['tablas'][$tabla] ?? null;
            if (! is_array($filas)) {
                throw ReglaNegocioException::invalido("El respaldo no contiene la tabla {$tabla}.");
            }
            if (count($filas) !== ($respaldo['conteos'][$tabla] ?? -1)) {

                throw ReglaNegocioException::invalido("El respaldo está dañado: el número de filas de {$tabla} no coincide.");
            }
            if (! hash_equals((string) ($respaldo['huellas'][$tabla] ?? ''), $this->huella($filas))) {
                throw ReglaNegocioException::invalido("El respaldo está dañado o fue modificado: la huella de {$tabla} no coincide.");
            }
        }

        $respaldo['archivo'] = $archivo;

        return $respaldo;
    }

    public function restaurar(string $ruta, ?User $usuario = null, bool $conRespaldoPrevio = true): array
    {
        $respaldo = $this->leer($ruta); // Si el archivo no es válido, la base no se toca.
        $inicio = hrtime(true);

        $seguridad = $conRespaldoPrevio ? $this->crear(null, 'antes_de_restaurar') : null;

        try {
            $this->reemplazarDatos($respaldo['tablas']);
        } catch (Throwable $e) {
            if ($seguridad) {
                $this->reemplazarDatos($this->leer($seguridad['archivo'])['tablas']);
            }
            throw ReglaNegocioException::conflicto(
                'No se pudo restaurar el respaldo; se recuperó el estado anterior. Detalle: '.$e->getMessage(),
                'restauracion_fallida');
        }

        $verificacion = $this->compararConBase($respaldo);


        $autor = $usuario ? User::find($usuario->id) : null; // podría no existir en el respaldo restaurado
        $this->auditoria->registrar($autor, 'restaurar', 'sistema', basename($respaldo['archivo']),
            'conteos', null, $respaldo['conteos'],
            ($verificacion['integro'] ? 'Restauración verificada' : 'Restauración con diferencias').
            ($usuario && ! $autor ? " (solicitada por {$usuario->usuario})" : ''));

        return [
            'archivo' => basename($respaldo['archivo']),
            'creado' => $respaldo['creado'],
            'respaldo_previo' => $seguridad['nombre'] ?? null,
            'duracion_ms' => round((hrtime(true) - $inicio) / 1e6, 1),
            'verificacion' => $verificacion,
        ];
    }

    public function compararConBase(array $respaldo): array
    {
        $actual = $this->leerBase();
        $tablas = [];
        foreach (self::TABLAS as $tabla) {
            $tablas[$tabla] = [
                'en_respaldo' => $respaldo['conteos'][$tabla],
                'en_base' => count($actual[$tabla]),
                'huella_coincide' => hash_equals($respaldo['huellas'][$tabla], $this->huella($actual[$tabla])),
            ];
        }

        $totalesBase = $this->totales($actual);
        $integro = collect($tablas)->every(fn ($t) => $t['huella_coincide'] && $t['en_respaldo'] === $t['en_base'])

            && $this->mismosTotales($totalesBase, $respaldo['totales']);

        return [
            'integro' => $integro,
            'tablas' => $tablas,
            'totales_respaldo' => $respaldo['totales'],
            'totales_base' => $totalesBase,
        ];
    }

    public function listar(): array
    {
        $archivos = glob($this->carpeta().'/*.json') ?: [];
        rsort($archivos);

        return array_map(fn (string $a) => [
            'nombre' => basename($a),
            'tamano_kb' => round(filesize($a) / 1024, 1),
            'modificado' => date('Y-m-d H:i:s', filemtime($a)),
        ], $archivos);
    }


    private function leerBase(): array
    {
        $tablas = [];
        foreach (self::TABLAS as $tabla) {
            $tablas[$tabla] = DB::table($tabla)->orderBy('id')->get()->map(fn ($fila) => (array) $fila)->all();
        }

        return $tablas;

    }

    private function reemplazarDatos(array $tablas): void
    {
        // TRUNCATE no dispara los triggers que prohíben borrar: solo la restauración vacía tablas.
        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach (array_reverse(self::TABLAS) as $tabla) {
                DB::table($tabla)->truncate();
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        DB::transaction(function () use ($tablas) {
            foreach (self::TABLAS as $tabla) {
                foreach (array_chunk($tablas[$tabla] ?? [], 200) as $bloque) {
                    DB::table($tabla)->insert($bloque);
                }
            }
        });
    }

    private function huella(array $filas): string
    {
        $contexto = hash_init('sha256');
        foreach ($filas as $fila) {
            ksort($fila);
            $normalizada = array_map(fn ($v) => $v === null ? null : (string) $v, $fila);
            hash_update($contexto, json_encode($normalizada, JSON_UNESCAPED_UNICODE)."\n");

        }

        return hash_final($contexto);
    }

    
    private function totales(array $tablas): array
    {
        $suma = fn (string $tabla, string $columna) => round(array_sum(array_map(
            fn ($f) => (float) $f[$columna], $tablas[$tabla])), 3);

        return [
            'kg_recibidos' => $suma('lotes', 'cantidad_recibida'),
            'kg_consumidos' => $suma('transformaciones', 'cantidad_entrada'),
            'kg_producidos' => $suma('productos', 'cantidad'),
            'ids_lotes' => array_column($tablas['lotes'], 'id'),
        ];
    }

   
    private function mismosTotales(array $a, array $b): bool
    {
        foreach (['kg_recibidos', 'kg_consumidos', 'kg_producidos'] as $clave) {
            if (abs((float) ($a[$clave] ?? 0) - (float) ($b[$clave] ?? 0)) > 0.0005) {
                return false;
            }
        }

        return ($a['ids_lotes'] ?? []) === ($b['ids_lotes'] ?? []);
    }


    private function resolver(string $ruta): string
    {
        foreach ([$ruta, $this->carpeta().'/'.basename($ruta)] as $candidato) {
            if (is_file($candidato) && is_readable($candidato)) {
                return realpath($candidato);
            }
        }

        throw ReglaNegocioException::noEncontrado("No se encontró el respaldo {$ruta}.");
    }
}
