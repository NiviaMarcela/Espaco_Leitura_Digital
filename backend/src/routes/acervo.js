import { validarObra, validarExemplares, validarBaixa } from '../validacao/acervo.js';

function catalogoPublico(livro) {
    return {
        ...livro,
        exemplares: livro.exemplares.map(({ id, codigo, centroId, centro, localizacao, status }) => ({
            id, codigo, centroId, centro, localizacao, status
        }))
    };
}

export function registrar(app, ctx) {
    const { guardas, expirarReservas } = ctx;
    const { exigirConta, exigirGestao } = guardas;

    app.get("/api/biblioteca", exigirConta, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json((await req.repos.acervo.listarLivros()).map(catalogoPublico));
    });
    app.get('/api/categorias', exigirGestao, async(req,res)=>res.json(await req.repos.categorias.listar()));
    app.post('/api/categorias', exigirGestao, async(req,res)=>res.status(201).json(await req.repos.categorias.criar(req.body)));
    app.put('/api/categorias/:id', exigirGestao, async(req,res)=>res.json(await req.repos.categorias.editar(Number(req.params.id),req.body)));
    app.delete('/api/categorias/:id', exigirGestao, async(req,res)=>res.json(await req.repos.categorias.excluir(Number(req.params.id))));
    app.get("/api/livros", exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.acervo.listarLivros());
    });
    app.get("/api/livros/:id", exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        const livro = await req.repos.acervo.buscarLivro(Number(req.params.id));
        if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
        res.json(livro);
    });
    app.post("/api/livros", exigirGestao, async (req, res) => {
        const livro = await req.repos.acervo.criarLivro(validarObra(req.body), validarExemplares(req.body));
        res.status(201).location(`/api/livros/${livro.id}`).json(livro);
    });
    app.put("/api/livros/:id", exigirGestao, async (req, res) => {
        res.json(await req.repos.acervo.editarLivro(Number(req.params.id), validarObra(req.body)));
    });
    app.post("/api/livros/:id/exemplares", exigirGestao, async (req, res) => {
        res.status(201).json(await req.repos.acervo.adicionarExemplares(Number(req.params.id), validarExemplares(req.body)));
    });
    app.post('/api/exemplares/:id/baixa', exigirGestao, async (req, res) => {
        res.json(await req.repos.acervo.baixarExemplar(Number(req.params.id), validarBaixa(req.body)));
    });
}
