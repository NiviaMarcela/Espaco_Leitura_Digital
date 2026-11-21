import { dataCivilValida, hojeCivil } from '../../../frontend/shared/js/datas.mjs';
import { erroHttp, texto } from './erros.js';

export function validarLeitor(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw erroHttp(400, 'Dados do leitor inválidos.');
    const nome = texto(body.nome, 'Nome', true, 200);
    if (!['Aluno', 'Professor', 'Funcionário', 'Voluntário', 'Comunidade'].includes(body.tipo)) {
        throw erroHttp(400, 'Selecione um tipo de leitor válido.');
    }
    if (!dataCivilValida(body.dataNascimento) || body.dataNascimento > hojeCivil()) {
        throw erroHttp(400, 'Informe uma data de nascimento válida, que não esteja no futuro.');
    }
    if (!Number.isInteger(body.centroId) || body.centroId < 1 || body.centroId > 2147483647) {
        throw erroHttp(400, 'Selecione um Centro válido.');
    }
    const status = body.status ?? 'Ativo';
    if (!['Ativo', 'Inativo'].includes(status)) throw erroHttp(400, 'Status do leitor inválido.');
    const telefone = texto(body.telefone, 'Telefone', true, 30);
    const email = texto(body.email, 'E-mail', true, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erroHttp(400, 'Informe um e-mail válido.');
    return { nome, tipo: body.tipo, dataNascimento: body.dataNascimento, centroId: body.centroId, status,
        matriculaCodigo: texto(body.matriculaCodigo, 'Matrícula/código', false, 80),
        turma: texto(body.turma, 'Turma', false, 100), telefone, email };
}
