import { criarRepositorioUsuarios } from '../repositories/usuarios.js';

export function registrar(app, ctx) {
    const { banco, usuarios, guardas } = ctx;
    const { exigirPerfil } = guardas;

    app.put('/api/usuarios/:id', exigirPerfil('admin','coordenador'), async (req, res) => res.json(await criarRepositorioUsuarios(banco, req.usuario).editar(Number(req.params.id), req.body)));
    app.patch('/api/usuarios/:id/status', exigirPerfil('admin','coordenador'), async (req, res) => res.json(await criarRepositorioUsuarios(banco, req.usuario).definirAtivo(Number(req.params.id), req.body?.ativo, req.usuario.id)));
    app.post('/api/usuarios/:id/senha', exigirPerfil('admin','coordenador'), async (req, res) => res.json(await criarRepositorioUsuarios(banco, req.usuario).redefinirSenha(Number(req.params.id), req.body?.senha)));
    app.get('/api/usuarios', exigirPerfil('admin','coordenador'), async (req, res) => res.json(await usuarios.listar(req.usuario)));
    app.post('/api/usuarios', exigirPerfil('admin','coordenador'), async (req, res) => res.status(201).json(await usuarios.criar(req.body, req.usuario)));
}
