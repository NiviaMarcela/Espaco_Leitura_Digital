import { erroValidacao } from "../../errors/index.js";

// Aceita apenas inteiros dentro do intervalo do INTEGER do PostgreSQL.
export function idValido(valor) {
    return Number.isInteger(valor) && valor >= 1 && valor <= 2147483647;
}

// Normaliza textos opcionais ou obrigatórios, aplicando o limite de cada campo.
export function texto(valor, nome, obrigatorio = false, limite = 500) {
    if (valor == null && !obrigatorio) return null;
    if (typeof valor !== "string" || valor.trim().length > limite || (obrigatorio && !valor.trim())) {
        throw erroValidacao(`${nome}: informe um texto válido de até ${limite} caracteres.`);
    }
    return valor.trim() || null;
}
