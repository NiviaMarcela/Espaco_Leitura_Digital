import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { criarRepositorioAcervo } from "./repositories/acervo.js";
import { validarObra, validarExemplares, validarLeitor, validarBaixa } from "./validation.js";
import { criarRepositorioLeitores } from './repositories/leitores.js';
import { criarRepositorioEmprestimos } from './repositories/emprestimos.js';
import { criarRepositorioDashboard } from './repositories/dashboard.js';
import { validarEmprestimo, validarRenovacao, validarDevolucao } from './validation.js';

// Receber o banco como argumento permite testar as rotas sem um PostgreSQL instalado.
export function criarApp(banco, registrarErro = console.error) {
    const app = express();
    const acervo = criarRepositorioAcervo(banco);
    const leitores = criarRepositorioLeitores(banco);
    const emprestimos = criarRepositorioEmprestimos(banco);
    const dashboard = criarRepositorioDashboard(banco);
    app.disable("x-powered-by");
    app.use("/api", (req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (["POST", "PUT"].includes(req.method)) {
            if (req.get("origin") && req.get("origin") !== `${req.protocol}://${req.get("host")}`) {
                return res.status(403).json({ erro: "Use o acervo no mesmo endereço da API." });
            }
            if (!req.is("application/json")) return res.status(415).json({ erro: "Envie os dados em JSON." });
        }
        next();
    });
    app.use(express.json({ limit: "32kb" }));
    app.param("id", (req, res, next, id) => {
        if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) {
            return res.status(400).json({ erro: "O ID deve ser um inteiro positivo válido." });
        }
        next();
    });

    // Saúde do processo e disponibilidade do banco são verificações diferentes.
    app.get("/api/health", (req, res) => {
        res.json({ status: "ok", servico: "espaco-leitura-api" });
    });
    app.get("/api/health/db", async (req, res) => {
        await banco.query("SELECT 1");
        res.json({ status: "ok", banco: "PostgreSQL" });
    });
    app.get("/api/centros", async (req, res) => {
        res.json(await acervo.listarCentros());
    });
    app.get("/api/livros", async (req, res) => {
        res.json(await acervo.listarLivros());
    });
    app.get("/api/livros/:id", async (req, res) => {
        const livro = await acervo.buscarLivro(Number(req.params.id));
        if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
        res.json(livro);
    });

    app.post("/api/livros", async (req, res) => {
        const livro = await acervo.criarLivro(validarObra(req.body), validarExemplares(req.body));
        res.status(201).location(`/api/livros/${livro.id}`).json(livro);
    });
    app.put("/api/livros/:id", async (req, res) => {
        res.json(await acervo.editarLivro(Number(req.params.id), validarObra(req.body)));
    });
    app.post("/api/livros/:id/exemplares", async (req, res) => {
        res.status(201).json(await acervo.adicionarExemplares(Number(req.params.id), validarExemplares(req.body)));
    });

    app.get('/api/leitores', async (req, res) => res.json(await leitores.listar()));
    app.post('/api/exemplares/:id/baixa', async (req, res) => {
        res.json(await acervo.baixarExemplar(Number(req.params.id), validarBaixa(req.body)));
    });
    app.get('/api/leitores/:id', async (req, res) => {
        const leitor = await leitores.buscar(Number(req.params.id));
        if (!leitor) return res.status(404).json({ erro: 'Leitor não encontrado.' });
        res.json(leitor);
    });
    app.post('/api/leitores', async (req, res) => {
        const leitor = await leitores.salvar(validarLeitor(req.body));
        res.status(201).location(`/api/leitores/${leitor.id}`).json(leitor);
    });
    app.put('/api/leitores/:id', async (req, res) => {
        res.json(await leitores.salvar(validarLeitor(req.body), Number(req.params.id)));
    });

    app.get('/api/emprestimos/opcoes', async (req, res) => res.json(await emprestimos.opcoes()));
    app.get('/api/dashboard', async (req, res) => res.json(await dashboard.consultar()));
    app.get('/api/emprestimos', async (req, res) => res.json(await emprestimos.listar()));
    app.get('/api/emprestimos/:id', async (req, res) => {
        const emprestimo = await emprestimos.buscar(Number(req.params.id));
        if (!emprestimo) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
        res.json(emprestimo);
    });
    app.post('/api/emprestimos', async (req, res) => {
        const emprestimo = await emprestimos.criar(validarEmprestimo(req.body));
        res.status(201).location(`/api/emprestimos/${emprestimo.id}`).json(emprestimo);
    });
    app.post('/api/emprestimos/:id/renovacoes', async (req, res) => {
        res.json(await emprestimos.renovar(Number(req.params.id), validarRenovacao(req.body)));
    });
    app.post('/api/emprestimos/:id/devolucao', async (req, res) => {
        res.json(await emprestimos.devolver(Number(req.params.id), validarDevolucao(req.body)));
    });

    // Servimos apenas os arquivos públicos. Nunca expor a raiz ou backend/.env.
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    app.get("/", (req, res) => res.redirect("/acervo.html"));
    for (const pagina of ["acervo", "biblioteca", "dashboard", "leitores", "emprestimos", "devolucoes"]) {
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
        const indisponivel = ["BANCO_NAO_CONFIGURADO", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(erro.code)
            || erro.code?.startsWith("08")
            // O pg também pode sinalizar timeout de conexão sem um código.
            || ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(erro.message);
        res.status(indisponivel ? 503 : 500).json({
            erro: indisponivel ? "Banco de dados indisponível." : "Não foi possível concluir a consulta."
        });
    });
    return app;
}
