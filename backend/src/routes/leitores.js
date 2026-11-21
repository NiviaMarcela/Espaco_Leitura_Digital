import { validarLeitor } from '../validacao/leitores.js';

export function registrar(app, ctx) {
    const { autenticacao, guardas } = ctx;
    const { exigirGestao } = guardas;

    app.get('/api/leitores', exigirGestao, async (req, res) => res.json(await req.repos.leitores.listar()));
    app.get('/api/leitores/:id', exigirGestao, async (req, res) => {
        const leitor = await req.repos.leitores.buscar(Number(req.params.id));
        if (!leitor) return res.status(404).json({ erro: 'Leitor não encontrado.' });
        res.json(leitor);
    });
    app.post('/api/leitores', exigirGestao, async (req, res) => {
        const leitor = await req.repos.leitores.salvar(validarLeitor(req.body), null, req.body?.senhaInicial);
        res.status(201).location(`/api/leitores/${leitor.id}`).json(leitor);
    });
    app.put('/api/leitores/:id', exigirGestao, async (req, res) => {
        res.json(await req.repos.leitores.salvar(validarLeitor(req.body), Number(req.params.id)));
    });
    app.post('/api/leitores/:id/acesso', exigirGestao, async (req, res) => {
        const senhaInicial = req.body?.senhaInicial;
        await autenticacao.definirAcessoLeitor(Number(req.params.id), senhaInicial, req.usuario.perfil === 'admin' ? null : req.usuario.centroId);
        res.status(204).end();
    });
}
