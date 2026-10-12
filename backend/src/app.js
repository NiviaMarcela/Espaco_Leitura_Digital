import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { protegerApi } from "./middlewares/api.js";
import { criarRepositorioAcervo } from "./repositories/acervo.js";
import { criarRepositorioEmprestimos } from "./repositories/emprestimos.js";
import { criarRepositorioLeitores } from "./repositories/leitores.js";
import { criarRotasAcervo, criarRotasEmprestimos, criarRotasLeitores, criarRotasSaude } from "./routes/index.js";

// Receber o banco como argumento permite testar as rotas sem um PostgreSQL instalado.
export function criarApp(banco, registrarErro = console.error) {
    const app = express();
    app.disable("x-powered-by");
    app.use("/api", protegerApi);
    app.use(express.json({ limit: "32kb" }));

    app.use("/api", criarRotasSaude(banco));
    app.use("/api", criarRotasAcervo(criarRepositorioAcervo(banco)));
    app.use("/api", criarRotasLeitores(criarRepositorioLeitores(banco)));
    app.use("/api", criarRotasEmprestimos(criarRepositorioEmprestimos(banco)));

    // Servimos apenas os arquivos públicos. Nunca expor a raiz ou backend/.env.
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    app.get("/", (req, res) => res.redirect("/acervo.html"));
    for (const pagina of ["index", "acervo", "dashboard", "leitores", "emprestimos", "devolucoes"]) {
        app.get(`/${pagina}.html`, (req, res) => res.sendFile(path.join(raiz, `${pagina}.html`)));
    }
    for (const pasta of ["css", "js", "assets"]) {
        app.use(`/${pasta}`, express.static(path.join(raiz, pasta), { dotfiles: "deny" }));
    }

    app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
    app.use((erro, req, res, next) => {
        if (erro.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido." });
        if (erro.type === "entity.too.large") return res.status(413).json({ erro: "Dados enviados excedem o tamanho permitido." });
        if ([400, 404, 409].includes(erro.status)) return res.status(erro.status).json({ erro: erro.message });
        if (erro.code === "23503") return res.status(400).json({ erro: "Livro ou Centro não encontrado." });
        // Não envia senha, URL de conexão ou detalhes do SQL para o navegador.
        registrarErro("Falha ao consultar o banco:", erro.code || "SEM_CODIGO");
        // Falta de configuração é diferente de banco fora do ar: a mensagem precisa dizer o que fazer.
        if (erro.code === "BANCO_NAO_CONFIGURADO") {
            return res.status(503).json({
                erro: "Banco de dados não configurado. Copie backend/.env.example para backend/.env e informe as credenciais."
            });
        }
        const indisponivel = ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(erro.code)
            || erro.code?.startsWith("08")
            // O pg também pode sinalizar timeout de conexão sem um código.
            || ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(erro.message);
        res.status(indisponivel ? 503 : 500).json({
            erro: indisponivel ? "Banco de dados indisponível." : "Não foi possível concluir a consulta."
        });
    });
    return app;
}
