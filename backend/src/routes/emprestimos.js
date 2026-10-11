import { Router } from "express";
import { validarId } from "../middlewares/validarId.js";
import { validarEmprestimo, validarRenovacao, validarDevolucao } from "../services/validation/index.js";

export function criarRotasEmprestimos(emprestimos) {
    const rotas = Router();
    rotas.param("id", validarId);

    // "opcoes" vem antes de ":id" para não ser lido como um ID.
    rotas.get('/emprestimos/opcoes', async (req, res) => res.json(await emprestimos.opcoes()));
    rotas.get('/emprestimos', async (req, res) => res.json(await emprestimos.listar()));
    rotas.get('/emprestimos/:id', async (req, res) => {
        const emprestimo = await emprestimos.buscar(req.params.id);
        if (!emprestimo) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
        res.json(emprestimo);
    });
    rotas.post('/emprestimos', async (req, res) => {
        const emprestimo = await emprestimos.criar(validarEmprestimo(req.body));
        res.status(201).location(`/api/emprestimos/${emprestimo.id}`).json(emprestimo);
    });
    rotas.post('/emprestimos/:id/renovacoes', async (req, res) => {
        res.json(await emprestimos.renovar(req.params.id, validarRenovacao(req.body)));
    });
    rotas.post('/emprestimos/:id/devolucao', async (req, res) => {
        res.json(await emprestimos.devolver(req.params.id, validarDevolucao(req.body)));
    });
    return rotas;
}
