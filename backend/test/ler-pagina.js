import { readFileSync } from 'node:fs';

// Cada página vive em frontend/pages/<nome>/ com o html de mesmo nome.
export function lerPagina(nome) {
    return readFileSync(new URL(`../../frontend/pages/${nome}/${nome}.html`, import.meta.url), 'utf8');
}
