import { erroValidacao } from "../../errors/index.js";
import { idValido, texto } from "./comum.js";

export function validarObra(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw erroValidacao("Dados da obra inválidos.");
    const ano = body.ano == null || body.ano === "" ? null : Number(body.ano);
    if (ano !== null && (!['string', 'number'].includes(typeof body.ano) || !Number.isInteger(ano) || ano < 1 || ano > 9999)) {
        throw erroValidacao("Ano deve ser um inteiro entre 1 e 9999.");
    }
    const capaUrl = texto(body.capaUrl, "Capa", false, 2048);
    if (capaUrl) {
        let url;
        try { url = new URL(capaUrl); } catch { throw erroValidacao("Informe um link válido para a capa."); }
        if (!['http:', 'https:'].includes(url.protocol) || /\s/.test(capaUrl)) throw erroValidacao("A capa deve usar http:// ou https://.");
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
    if (!body || typeof body !== "object" || Array.isArray(body)) throw erroValidacao("Dados dos exemplares inválidos.");
    // Limite por envio, não por obra. Evita criar lotes enormes por engano.
    if (!Number.isInteger(body.quantidade) || body.quantidade < 1 || body.quantidade > 1000) {
        throw erroValidacao("Informe de 1 a 1000 exemplares por cadastro.");
    }
    if (!idValido(body.centroId)) {
        throw erroValidacao("Selecione um Centro válido.");
    }
    return { quantidade: body.quantidade, centroId: body.centroId, localizacao: texto(body.localizacao, "Localização") };
}

export function validarBaixa(body) {
    if (!body || !['Perda', 'Dano/rasuras', 'Doação', 'Outro'].includes(body.motivo)) {
        throw erroValidacao('Selecione um motivo válido para a baixa.');
    }
    return { motivo: body.motivo, observacao: texto(body.observacao, 'Observação', body.motivo === 'Outro', 2000) };
}
