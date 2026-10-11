import { Router } from "express";

export function criarRotasSaude(banco) {
    const rotas = Router();
    // Saúde do processo e disponibilidade do banco são verificações diferentes.
    rotas.get("/health", (req, res) => {
        res.json({ status: "ok", servico: "espaco-leitura-api" });
    });
    rotas.get("/health/db", async (req, res) => {
        await banco.query("SELECT 1");
        res.json({ status: "ok", banco: "PostgreSQL" });
    });
    return rotas;
}
