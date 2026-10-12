import { dataCivilValida, hojeCivil } from '../../utils/datas.js';
import { erroValidacao } from "../../errors/index.js";
import { idValido, texto } from "./comum.js";

export function validarLeitor(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw erroValidacao('Dados do leitor inválidos.');
    const nome = texto(body.nome, 'Nome', true, 200);
    if (!['Aluno', 'Professor', 'Funcionário', 'Voluntário', 'Comunidade'].includes(body.tipo)) {
        throw erroValidacao('Selecione um tipo de leitor válido.');
    }
    if (!dataCivilValida(body.dataNascimento) || body.dataNascimento > hojeCivil()) {
        throw erroValidacao('Informe uma data de nascimento válida, que não esteja no futuro.');
    }
    if (!idValido(body.centroId)) {
        throw erroValidacao('Selecione um Centro válido.');
    }
    const status = body.status ?? 'Ativo';
    if (!['Ativo', 'Inativo'].includes(status)) throw erroValidacao('Status do leitor inválido.');
    const email = texto(body.email, 'E-mail', false, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erroValidacao('Informe um e-mail válido.');
    return { nome, tipo: body.tipo, dataNascimento: body.dataNascimento, centroId: body.centroId, status,
        matriculaCodigo: texto(body.matriculaCodigo, 'Matrícula/código', false, 80),
        turma: texto(body.turma, 'Turma', false, 100), telefone: texto(body.telefone, 'Telefone', false, 30), email };
}
