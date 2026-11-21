import { erroHttp, texto } from './erros.js';

export function validarEmprestimo(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw erroHttp(400, 'Dados do empréstimo inválidos.');
    for (const campo of ['leitorId', 'exemplarId']) {
        if (!Number.isInteger(body[campo]) || body[campo] < 1 || body[campo] > 2147483647) {
            throw erroHttp(400, 'Selecione um leitor e um exemplar válidos.');
        }
    }
    return { leitorId: body.leitorId, exemplarId: body.exemplarId, observacao: texto(body.observacao, 'Observação', false, 2000) };
}

export function validarRenovacao(body) {
    if (!body || !Number.isInteger(body.versao) || body.versao < 0 || body.versao > 2147483647) {
        throw erroHttp(400, 'Atualize o empréstimo antes de renovar.');
    }
    return { versao: body.versao };
}

export function validarDevolucao(body) {
    const { versao } = validarRenovacao(body);
    if (!['Disponível', 'Danificado'].includes(body.condicao)) throw erroHttp(400, 'Informe a condição do exemplar devolvido.');
    return { versao, condicao: body.condicao,
        observacao: texto(body.observacao, 'Observação', body.condicao === 'Danificado', 2000) };
}
