import { Router } from "express";
import { validarId } from "../middlewares/validarId.js";
import { validarObra, validarExemplares, validarBaixa } from "../services/validation/index.js";

export function criarRotasAcervo(acervo) {
    const rotas = Router();
    rotas.param("id", validarId);

    rotas.get("/centros", async (req, res) => {
        res.json(await acervo.listarCentros());
    });
    rotas.get("/livros", async (req, res) => {
        res.json(await acervo.listarLivros());
    });
    rotas.get("/livros/:id", async (req, res) => {
        const livro = await acervo.buscarLivro(req.params.id);
        if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
        res.json(livro);
    });
    rotas.post("/livros", async (req, res) => {
        const livro = await acervo.criarLivro(validarObra(req.body), validarExemplares(req.body));
        res.status(201).location(`/api/livros/${livro.id}`).json(livro);
    });
    rotas.put("/livros/:id", async (req, res) => {
        res.json(await acervo.editarLivro(req.params.id, validarObra(req.body)));
    });
    rotas.post("/livros/:id/exemplares", async (req, res) => {
        res.status(201).json(await acervo.adicionarExemplares(req.params.id, validarExemplares(req.body)));
    });
    rotas.post("/exemplares/:id/baixa", async (req, res) => {
        res.json(await acervo.baixarExemplar(req.params.id, validarBaixa(req.body)));
    });
    return rotas;
}
