import { readFileSync, existsSync } from 'node:fs';

// Durante a reorganização do frontend, cada página vive em frontend/pages/<nome>/;
// enquanto a movimentação não termina, páginas antigas ainda ficam na raiz do projeto.
export function lerPagina(nome) {
    const movida = new URL(`../../frontend/pages/${nome}/${nome}.html`, import.meta.url);
    const naRaiz = new URL(`../../${nome}.html`, import.meta.url);
    return readFileSync(existsSync(movida) ? movida : naRaiz, 'utf8');
}
