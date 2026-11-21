import { criarRepositorioAcervo } from '../repositories/acervo.js';
import { validarSenha } from '../repositories/autenticacao.js';
import { validarLeitor } from '../validacao/leitores.js';
import { erroHttp } from '../validacao/erros.js';

export function registrar(app, ctx) {
    const { banco, acervo, autenticacao, guardas, limitadores } = ctx;
    const { carregarSessao } = guardas;

    app.get("/api/health", (req, res) => {
        res.json({ status: "ok", servico: "espaco-leitura-api" });
    });
    app.get("/api/health/db", async (req, res) => {
        await banco.query("SELECT 1");
        res.json({ status: "ok", banco: "PostgreSQL" });
    });
    app.get("/api/centros", async (req, res) => {
        const usuario = await carregarSessao(req);
        if (usuario && usuario.perfil !== 'admin' && !Number.isInteger(usuario.centroId)) throw erroHttp(403, 'Conta sem Centro válido.');
        res.json(await criarRepositorioAcervo(banco, usuario && usuario.perfil !== 'admin' ? usuario.centroId : null).listarCentros());
    });
    app.get("/api/destaques", async (req, res) => {
        res.json(await acervo.listarDestaques());
    });
    app.get("/api/catalogo-publico", async (req, res) => {
        res.json(await acervo.listarCatalogoPublico());
    });
    app.post('/api/cadastro-leitor', async (req, res) => {
        const chave = req.ip;
        const agora = Date.now();
        const tentativasCadastro = limitadores.tentativasCadastro;
        const recentes = (tentativasCadastro.get(chave) || []).filter(t => agora - t < 15 * 60 * 1000);
        if (recentes.length >= 5) {
            return res.status(429).json({ erro: 'Muitos cadastros enviados. Aguarde 15 minutos e tente novamente.' });
        }
        recentes.push(agora);
        tentativasCadastro.set(chave, recentes);
        if (!['Aluno', 'Comunidade'].includes(req.body?.tipo)) throw erroHttp(400, 'No cadastro inicial, selecione Aluno ou Comunidade.');
        const dados = validarLeitor({ ...req.body, status: 'Ativo' });
        const senha = validarSenha(req.body?.senha);
        await autenticacao.cadastrarLeitor(dados, senha);
        res.status(201).json({ mensagem: 'Cadastro concluído. Você já pode entrar com seu e-mail e senha.' });
    });
}
