import { erroHttp, texto } from './erros.js';

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
    if (typeof body.novaSenha !== 'string' || body.novaSenha.length < 8 || body.novaSenha.length > 128) {
        throw erroHttp(400, 'A nova senha deve ter de 8 a 128 caracteres.');
    }
    return { senhaAtual: body.senhaAtual, novaSenha: body.novaSenha };
}
