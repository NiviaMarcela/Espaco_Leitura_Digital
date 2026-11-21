import { setTimeout as aguardar } from 'node:timers/promises';
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { criarRepositorioAcervo } from "./repositories/acervo.js";
import { criarRepositorioAutenticacao } from "./repositories/autenticacao.js";
import { criarRepositorioUsuarios } from "./repositories/usuarios.js";
import { criarRepositorioRecuperacao } from "./repositories/recuperacao.js";
import { criarRepositorioReservas } from "./repositories/reservas.js";
import { criarGuardas } from "./middlewares/sessao.js";
import * as rotasRecuperacao from "./routes/recuperacao.js";
import * as rotasAuth from "./routes/auth.js";
import * as rotasPublico from "./routes/publico.js";
import * as rotasAcervo from "./routes/acervo.js";
import * as rotasLeitores from "./routes/leitores.js";
import * as rotasLivroVivo from "./routes/livro-vivo.js";
import * as rotasDashboard from "./routes/dashboard.js";
import * as rotasEmprestimos from "./routes/emprestimos.js";
import * as rotasReservas from "./routes/reservas.js";
import * as rotasUsuarios from "./routes/usuarios.js";

// Receber o banco como argumento permite testar as rotas sem um PostgreSQL instalado.
export function criarApp(banco, registrarErro = console.error) {
    const app = express();
    const acervo = criarRepositorioAcervo(banco);
    const autenticacao = criarRepositorioAutenticacao(banco);
    const usuarios = criarRepositorioUsuarios(banco);
    const recuperacao = criarRepositorioRecuperacao(banco);
    const guardas = criarGuardas({ banco, autenticacao });
    const expirarReservas = usuario => criarRepositorioReservas(banco, usuario).expirarVencidas();
    const contexto = {
        banco, acervo, autenticacao, usuarios, recuperacao, guardas, expirarReservas, aguardar,
        limitadores: { pedidosRecuperacao: new Map(), tentativasLogin: new Map(), tentativasCadastro: new Map() }
    };

    app.disable("x-powered-by");
    app.use("/api", (req, res, next) => {
        res.set("Cache-Control", "no-store");
        if (["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) {
            if (req.get("origin") && req.get("origin") !== `${req.protocol}://${req.get("host")}`) {
                return res.status(403).json({ erro: "Use o sistema no mesmo endereço da API." });
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

    // A ordem de registro segue a original do projeto; os conjuntos de caminhos não se sobrepõem.
    rotasRecuperacao.registrar(app, contexto);
    rotasAuth.registrar(app, contexto);
    rotasPublico.registrar(app, contexto);
    rotasAcervo.registrar(app, contexto);
    rotasLeitores.registrar(app, contexto);
    rotasLivroVivo.registrar(app, contexto);
    rotasDashboard.registrar(app, contexto);
    rotasEmprestimos.registrar(app, contexto);
    rotasReservas.registrar(app, contexto);
    rotasUsuarios.registrar(app, contexto);

    // Public pages are open; protected pages are authorized on the server as well as in the UI.
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    const frontend = path.join(raiz, "frontend");
    const arquivoPagina = pagina => (req, res) => res.sendFile(path.join(frontend, "pages", pagina, `${pagina}.html`));
    const paginaProtegida = perfil => async (req, res, next) => {
        try {
            const usuario = await guardas.carregarSessao(req);
            if (!usuario) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
            if (usuario.trocarSenha && req.path !== '/alterarSenha.html') return res.redirect('/alterarSenha.html');
            if (usuario.trocarSenha && req.path === '/alterarSenha.html') return next();
            if (perfil && ![perfil].flat().includes(usuario.perfil)) return res.redirect(['admin','coordenador'].includes(usuario.perfil) ? '/dashboard.html' : '/biblioteca.html');
            next();
        } catch (erro) { next(erro); }
    };
    app.get("/", arquivoPagina("index"));
    app.get("/index.html", arquivoPagina("index"));
    app.get("/login.html", arquivoPagina("login"));
    app.get("/recuperarSenha.html", arquivoPagina("recuperarSenha"));
    app.get("/biblioteca.html", paginaProtegida(['admin', 'coordenador', 'professor','funcionario', 'leitor']), arquivoPagina("biblioteca"));
    app.get("/alterarSenha.html", paginaProtegida(null), arquivoPagina("alterarSenha"));
    app.get("/dashboard.html", paginaProtegida(['admin', 'coordenador']), arquivoPagina("dashboard"));
    for (const pagina of ["leitores", "acervo", "categorias", "reservas", "emprestimos", "devolucoes"]) {
        app.get(`/${pagina}.html`, paginaProtegida(['admin', 'coordenador', 'professor','funcionario']), arquivoPagina(pagina));
    }
    app.get('/Relatorios.html', paginaProtegida(['admin', 'coordenador', 'professor', 'funcionario']), arquivoPagina('Relatorios'));
    app.get('/livroVivo.html', paginaProtegida(['admin','coordenador']), arquivoPagina('livroVivo'));
    app.get('/usuarios.html', paginaProtegida(['admin','coordenador']), arquivoPagina('usuarios'));
    app.get('/meusEmprestimos.html', paginaProtegida(['admin','coordenador','professor','funcionario','leitor']), arquivoPagina('meusEmprestimos'));
    app.use("/css", express.static(path.join(frontend, "shared", "css"), { dotfiles: "deny" }));
    app.use("/js", express.static(path.join(frontend, "shared", "js"), { dotfiles: "deny" }));
    app.use("/assets", express.static(path.join(frontend, "assets"), { dotfiles: "deny" }));
    app.use("/pages", express.static(path.join(frontend, "pages"), { dotfiles: "deny" }));

    app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
    app.use((erro, req, res, next) => {
        if (erro.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido." });
        if (erro.type === "entity.too.large") return res.status(413).json({ erro: "Dados enviados excedem o tamanho permitido." });
        if ([400, 401, 403, 404, 409].includes(erro.status)) return res.status(erro.status).json({ erro: erro.message });
        if (erro.status === 429) return res.status(429).json({ erro: erro.message });
        if (erro.code === "23503") return res.status(400).json({ erro: "Livro ou Centro não encontrado." });
        const timeoutConexao = ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(erro.message);
        registrarErro("Falha ao consultar o banco:", timeoutConexao
            ? "BANCO_TIMEOUT: tempo de conexão esgotado; verifique o serviço PostgreSQL e a conexão configurada."
            : erro.code || "SEM_CODIGO");
        const indisponivel = ["BANCO_NAO_CONFIGURADO", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(erro.code)
            || erro.code?.startsWith("08")
            || timeoutConexao;
        res.status(indisponivel ? 503 : 500).json({
            erro: indisponivel ? "Banco de dados indisponível." : "Não foi possível concluir a consulta."
        });
    });
    return app;
}
