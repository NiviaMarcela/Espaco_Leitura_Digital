import { criarRepositorioReservas } from '../repositories/reservas.js';
import { validarEmprestimo } from '../validacao/emprestimos.js';
import { erroHttp } from '../validacao/erros.js';

export function registrar(app, ctx) {
    const { banco, guardas } = ctx;
    const { exigirGestao, exigirConta, exigirPerfil } = guardas;

    app.get('/api/minhas-reservas', exigirConta, async (req, res) => {
        res.json(await criarRepositorioReservas(banco, req.usuario, undefined, { pessoal: true }).listar());
    });
    app.get('/api/reservas', exigirGestao, async (req, res) => {
        res.json(await criarRepositorioReservas(banco, req.usuario).listar());
    });
    app.post('/api/reservas', exigirConta, async (req, res) => {
        if (!req.usuario.leitorId) throw erroHttp(409, 'Complete seu cadastro pessoal na Biblioteca antes de reservar.');
        const dados = validarEmprestimo({ leitorId: req.usuario.leitorId, exemplarId: req.body?.exemplarId });
        res.status(201).location('/api/minhas-reservas').json(await criarRepositorioReservas(banco, req.usuario).criar(dados.exemplarId));
    });
    app.post('/api/reservas/:id/cancelar', exigirPerfil('admin','coordenador','professor','funcionario','leitor'), async (req, res) => {
        res.json(await criarRepositorioReservas(banco, req.usuario).cancelar(Number(req.params.id)));
    });
    app.post('/api/reservas/:id/retirar', exigirGestao, async (req, res) => {
        res.json(await criarRepositorioReservas(banco, req.usuario).retirar(Number(req.params.id)));
    });
}
