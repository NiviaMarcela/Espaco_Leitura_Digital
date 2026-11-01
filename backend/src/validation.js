import { dataCivilValida, hojeCivil } from '../../js/datas.mjs';

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

export function validarBaixa(body) {
    if (!body || !['Perda', 'Dano/rasuras', 'Doação', 'Outro'].includes(body.motivo)) {
        throw erroHttp(400, 'Selecione um motivo válido para a baixa.');
    }
    return { motivo: body.motivo, observacao: texto(body.observacao, 'Observação', body.motivo === 'Outro', 2000) };
}

export function erroHttp(status, mensagem) {
    return Object.assign(new Error(mensagem), { status });
}

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
    const email = texto(body.email, 'E-mail', false, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erroHttp(400, 'Informe um e-mail válido.');
    return { nome, tipo: body.tipo, dataNascimento: body.dataNascimento, centroId: body.centroId, status,
        matriculaCodigo: texto(body.matriculaCodigo, 'Matrícula/código', false, 80),
        turma: texto(body.turma, 'Turma', false, 100), telefone: texto(body.telefone, 'Telefone', false, 30), email };
}

export function validarCredenciais(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw erroHttp(400, 'Credenciais inválidas.');
    const email = texto(body.email, 'E-mail', true, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erroHttp(400, 'Informe um e-mail válido.');
    if (typeof body.senha !== 'string' || body.senha.length < 1 || body.senha.length > 128) {
        throw erroHttp(400, 'Informe a senha.');
    }
    return { email, senha: body.senha };
}

export function validarTrocaSenha(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || typeof body.senhaAtual !== 'string' || body.senhaAtual.length > 128) {
        throw erroHttp(400, 'Informe a senha temporária ou atual.');
    }
    if (typeof body.novaSenha !== 'string' || body.novaSenha.length < 12 || body.novaSenha.length > 128) {
        throw erroHttp(400, 'A nova senha deve ter de 12 a 128 caracteres.');
    }
    return { senhaAtual: body.senhaAtual, novaSenha: body.novaSenha };
}

function texto(valor, nome, obrigatorio = false, limite = 500) {
    if (valor == null && !obrigatorio) return null;
    if (typeof valor !== "string" || valor.trim().length > limite || (obrigatorio && !valor.trim())) {
        throw erroHttp(400, `${nome}: informe um texto válido de até ${limite} caracteres.`);
    }
    return valor.trim() || null;
}

export function validarObra(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw erroHttp(400, "Dados da obra inválidos.");
    const ano = body.ano == null || body.ano === "" ? null : Number(body.ano);
    if (ano !== null && (!['string', 'number'].includes(typeof body.ano) || !Number.isInteger(ano) || ano < 1 || ano > 9999)) {
        throw erroHttp(400, "Ano deve ser um inteiro entre 1 e 9999.");
    }
    const capaUrl = texto(body.capaUrl, "Capa", false, 2048);
    if (capaUrl) {
        let url;
        try { url = new URL(capaUrl); } catch { throw erroHttp(400, "Informe um link válido para a capa."); }
        if (!['http:', 'https:'].includes(url.protocol) || /\s/.test(capaUrl)) throw erroHttp(400, "A capa deve usar http:// ou https://.");
    }
    return {
        titulo: texto(body.titulo, "Título", true),
        autor: texto(body.autor, "Autor", true),
        categoria: texto(body.categoria, "Categoria", true, 100),
        isbn: texto(body.isbn, "ISBN", false, 30),
        editora: texto(body.editora, "Editora"),
        faixaEtaria: texto(body.faixaEtaria, "Faixa etária", false, 100),
        sinopse: texto(body.sinopse, "Sinopse", false, 10000),
        capaUrl, ano
    };
}

export function validarExemplares(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw erroHttp(400, "Dados dos exemplares inválidos.");
    // Limite por envio, não por obra. Evita criar lotes enormes por engano.
    if (!Number.isInteger(body.quantidade) || body.quantidade < 1 || body.quantidade > 1000) {
        throw erroHttp(400, "Informe de 1 a 1000 exemplares por cadastro.");
    }
    if (!Number.isInteger(body.centroId) || body.centroId < 1 || body.centroId > 2147483647) {
        throw erroHttp(400, "Selecione um Centro válido.");
    }
    return { quantidade: body.quantidade, centroId: body.centroId, localizacao: texto(body.localizacao, "Localização") };
}
