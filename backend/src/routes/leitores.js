import { Router } from "express";
import { validarId } from "../middlewares/validarId.js";
import { validarLeitor } from "../services/validation/index.js";

export function criarRotasLeitores(leitores) {
    const rotas = Router();
    rotas.param("id", validarId);

    rotas.get("/leitores", async (req, res) => res.json(await leitores.listar()));
    rotas.get("/leitores/:id", async (req, res) => {
        const leitor = await leitores.buscar(req.params.id);
        if (!leitor) return res.status(404).json({ erro: 'Leitor não encontrado.' });
        res.json(leitor);
    });
    rotas.post("/leitores", async (req, res) => {
        const leitor = await leitores.salvar(validarLeitor(req.body));
        res.status(201).location(`/api/leitores/${leitor.id}`).json(leitor);
    });
    rotas.put("/leitores/:id", async (req, res) => {
        res.json(await leitores.salvar(validarLeitor(req.body), req.params.id));
    });
    return rotas;
}
