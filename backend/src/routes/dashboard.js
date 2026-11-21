export function registrar(app, ctx) {
    const { guardas } = ctx;

    app.get('/api/dashboard', guardas.exigirPerfil('admin', 'coordenador'), async (req, res) => res.json(await req.repos.dashboard.consultar()));
}
