import { validarCredenciais, validarTrocaSenha } from '../validacao/acesso.js';
import { erroHttp } from '../validacao/erros.js';
import { cookieSessao, tokenDaRequisicao } from '../middlewares/sessao.js';

export function registrar(app, ctx) {
    const { autenticacao, guardas, limitadores } = ctx;
    const { carregarSessao, exigirConta } = guardas;

    app.post('/api/auth/login', async (req, res) => {
        const chave = req.ip;
        const agora = Date.now();
        const tentativasLogin = limitadores.tentativasLogin;
        const recentes = (tentativasLogin.get(chave) || []).filter(t => agora - t < 15 * 60 * 1000);
        if (recentes.length >= 10) return res.status(429).json({ erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' });
        recentes.push(agora);
        tentativasLogin.set(chave, recentes);
        const credenciais = validarCredenciais(req.body);
        try {
            const sessao = await autenticacao.entrar(credenciais.email, credenciais.senha);
            tentativasLogin.delete(chave);
            res.set('Set-Cookie', cookieSessao(sessao.token));
            res.json(sessao.usuario);
        } catch (erro) {
            if (erro.status === 401) return res.status(401).json({ erro: erro.message });
            throw erro;
        }
    });
    app.post('/api/auth/logout', async (req, res) => {
        await autenticacao.encerrar(tokenDaRequisicao(req));
        res.set('Set-Cookie', cookieSessao('', 0));
        res.status(204).end();
    });
    app.get('/api/auth/me', async (req, res) => {
        const usuario = await carregarSessao(req);
        if (!usuario) return res.status(401).json({ erro: 'Sessão não encontrada.' });
        res.json(usuario);
    });
    app.post('/api/auth/change-password', exigirConta, async (req, res) => {
        if (req.body?.usuarioId !== undefined && req.body.usuarioId !== req.usuario.id) throw erroHttp(409, 'A conta conectada mudou. Saia e entre novamente com a conta desejada.');
        const { senhaAtual, novaSenha } = validarTrocaSenha(req.body);
        await autenticacao.alterarSenha(req.usuario.id, req.tokenSessao, senhaAtual, novaSenha);
        res.json({ ok: true });
    });
}
