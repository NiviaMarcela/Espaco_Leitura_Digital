import { erroValidacao } from "../../errors/index.js";
import { idValido, texto } from "./comum.js";

export function validarEmprestimo(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw erroValidacao('Dados do empréstimo inválidos.');
    for (const campo of ['leitorId', 'exemplarId']) {
        if (!idValido(body[campo])) {
            throw erroValidacao('Selecione um leitor e um exemplar válidos.');
        }
    }
    return { leitorId: body.leitorId, exemplarId: body.exemplarId, observacao: texto(body.observacao, 'Observação', false, 2000) };
}

export function validarRenovacao(body) {
    if (!body || !Number.isInteger(body.versao) || body.versao < 0 || body.versao > 2147483647) {
        throw erroValidacao('Atualize o empréstimo antes de renovar.');
    }
    return { versao: body.versao };
}

export function validarDevolucao(body) {
    const { versao } = validarRenovacao(body);
    if (!['Disponível', 'Danificado'].includes(body.condicao)) throw erroValidacao('Informe a condição do exemplar devolvido.');
    return { versao, condicao: body.condicao,
        observacao: texto(body.observacao, 'Observação', body.condicao === 'Danificado', 2000) };
}
