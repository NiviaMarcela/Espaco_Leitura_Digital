import { criarRepositorioReservas } from '../repositories/reservas.js';
import { completarCadastroPessoal } from '../repositories/cadastro-pessoal.js';
import { validarEmprestimo, validarRenovacao, validarDevolucao } from '../validacao/emprestimos.js';
import { validarLeitor } from '../validacao/leitores.js';
import { erroHttp } from '../validacao/erros.js';

export function registrar(app, ctx) {
    const { banco, autenticacao, guardas, expirarReservas } = ctx;
    const { exigirGestao, exigirConta, exigirPerfil } = guardas;

    app.get('/api/relatorios/emprestimos', exigirPerfil('admin', 'coordenador', 'professor', 'funcionario'), async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.emprestimos.listar());
    });
    app.get('/api/emprestimos/opcoes', exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.emprestimos.opcoes());
    });
    app.get('/api/emprestimos', exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.emprestimos.listar());
    });
    app.get('/api/emprestimos/:id', exigirGestao, async (req, res) => {
        const emprestimo = await req.repos.emprestimos.buscar(Number(req.params.id));
        if (!emprestimo) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
        res.json(emprestimo);
    });
    app.post('/api/emprestimos', exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        const emprestimo = await req.repos.emprestimos.criar(validarEmprestimo(req.body), req.usuario.id);
        res.status(201).location(`/api/emprestimos/${emprestimo.id}`).json(emprestimo);
    });
    app.post('/api/emprestimos/:id/renovacoes', exigirGestao, async (req, res) => {
        res.json(await req.repos.emprestimos.renovar(Number(req.params.id), validarRenovacao(req.body)));
    });
    app.post('/api/emprestimos/:id/devolucao', exigirGestao, async (req, res) => {
        res.json(await req.repos.emprestimos.devolver(Number(req.params.id), validarDevolucao(req.body)));
    });
    app.post('/api/meu-cadastro-emprestimos', exigirGestao, async (req, res) => {
        const dados = validarLeitor({ ...req.body, email: req.usuario.email, status: 'Ativo' });
        await completarCadastroPessoal(banco, req.usuario, dados);
        res.status(201).json(await autenticacao.autenticar(req.tokenSessao));
    });
    app.get('/api/meus-emprestimos', exigirConta, async (req, res) => {
        res.json(req.usuario.leitorId ? await req.repos.emprestimos.listarDoLeitor(req.usuario.leitorId) : []);
    });
}
