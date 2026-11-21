import { criarRepositorioLivroVivo } from '../repositories/livro-vivo.js';

export function registrar(app, ctx) {
    const { banco, guardas } = ctx;
    const { exigirResponsavel } = guardas;

    app.get('/api/livro-vivo/disponiveis', exigirResponsavel, async(req,res)=>res.json(await criarRepositorioLivroVivo(banco,req.usuario).disponiveis()));
    app.get('/api/livro-vivo', exigirResponsavel, async(req,res)=>res.json(await criarRepositorioLivroVivo(banco,req.usuario).listar()));
    app.post('/api/livro-vivo', exigirResponsavel, async(req,res)=>res.status(201).json(await criarRepositorioLivroVivo(banco,req.usuario).transferir(req.body)));
    app.post('/api/livro-vivo/:id/retorno', exigirResponsavel, async(req,res)=>res.json(await criarRepositorioLivroVivo(banco,req.usuario).retornar(Number(req.params.id),req.body)));
}
