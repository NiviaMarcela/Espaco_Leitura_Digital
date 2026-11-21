export function erroHttp(status, mensagem) {
    return Object.assign(new Error(mensagem), { status });
}

export function texto(valor, nome, obrigatorio = false, limite = 500) {
    if (valor == null && !obrigatorio) return null;
    if (typeof valor !== "string" || valor.trim().length > limite || (obrigatorio && !valor.trim())) {
        throw erroHttp(400, `${nome}: informe um texto válido de até ${limite} caracteres.`);
    }
    return valor.trim() || null;
}
