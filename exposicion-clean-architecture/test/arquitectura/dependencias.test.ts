
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

const dominio = resolve('src/domain');
const aplicacion = resolve('src/application');

// Busca todos los archivos TypeScript de una carpeta.
function buscarArchivos(carpeta: string): string[] {
if (!existsSync(carpeta)) return [];

return readdirSync(carpeta, { withFileTypes: true }).flatMap(
    (elemento) => {
    const ruta = join(carpeta, elemento.name);

    if (elemento.isDirectory()) {
        return buscarArchivos(ruta);
    }

    return elemento.name.endsWith('.ts') ? [ruta] : [];
    }
);
}

// Obtiene los módulos que importa cada archivo.
function obtenerImports(archivo: string): string[] {
const codigo = readFileSync(archivo, 'utf8');

const fuente = ts.createSourceFile(
    archivo,
    codigo,
    ts.ScriptTarget.Latest,
    true
);

const imports: string[] = [];

function revisar(nodo: ts.Node): void {
    if (
    (ts.isImportDeclaration(nodo) ||
    ts.isExportDeclaration(nodo)) &&
    nodo.moduleSpecifier &&
    ts.isStringLiteral(nodo.moduleSpecifier)
    ) {
    imports.push(nodo.moduleSpecifier.text);
    }

    // También revisa import() y require().
    if (ts.isCallExpression(nodo)) {
    const esImport =
        nodo.expression.kind === ts.SyntaxKind.ImportKeyword;

    const esRequire =
        ts.isIdentifier(nodo.expression) &&
        nodo.expression.text === 'require';

    const argumento = nodo.arguments[0];

    if (
        (esImport || esRequire) &&
        argumento &&
        ts.isStringLiteral(argumento)
    ) {
        imports.push(argumento.text);
    }
    }

    ts.forEachChild(nodo, revisar);
}

revisar(fuente);
return imports;
}

// Comprueba si un archivo pertenece a una carpeta.
function estaDentro(ruta: string, carpeta: string): boolean {
const diferencia = relative(carpeta, ruta);

return (
    diferencia !== '..' &&
    !diferencia.startsWith('..' + sep) &&
    !isAbsolute(diferencia)
);
}

// PRUEBA 1: Domain solo importa archivos de Domain.
test('Domain no depende de capas externas ni de Node', () => {
for (const archivo of buscarArchivos(dominio)) {
    for (const modulo of obtenerImports(archivo)) {
    const permitido =
        modulo.startsWith('.') &&
        estaDentro(resolve(dirname(archivo), modulo), dominio);

    assert.ok(
        permitido,
        `Import prohibido en ${archivo}: ${modulo}`
    );
    }
}
});

// PRUEBA 2: Application solo depende de sí misma y Domain.
test('Application solo depende de Application y Domain', () => {
for (const archivo of buscarArchivos(aplicacion)) {
    for (const modulo of obtenerImports(archivo)) {
    const destino = resolve(dirname(archivo), modulo);

    const permitido =
        modulo.startsWith('.') &&
        (estaDentro(destino, aplicacion) ||
        estaDentro(destino, dominio));

    assert.ok(
        permitido,
        `Import prohibido en ${archivo}: ${modulo}`
    );
    }
}
});
