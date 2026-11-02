import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { criarRepositorioAcervo } from "./repositories/acervo.js";
import { criarRepositorioAutenticacao } from "./repositories/autenticacao.js";
import { validarObra, validarExemplares, validarLeitor, validarBaixa,
    validarCredenciais, validarTrocaSenha, validarEmprestimo,
    validarRenovacao, validarDevolucao } from "./validation.js";
import { criarRepositorioLeitores } from './repositories/leitores.js';
import { criarRepositorioEmprestimos } from './repositories/emprestimos.js';
import { criarRepositorioDashboard } from './repositories/dashboard.js';

const COOKIE_SESSAO = 'espaco_sessao';
const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60;

function catalogoPublico(livro) {
    return {
        ...livro,
        exemplares: livro.exemplares.map(({ id, codigo, centroId, centro, localizacao, status }) => ({
            id, codigo, centroId, centro, localizacao, status
        }))
    };
}

function tokenDaRequisicao(req) {
    const cookie = req.headers.cookie?.split(';').map(parte => parte.trim())
        .find(parte => parte.startsWith(`${COOKIE_SESSAO}=`));
    return cookie?.slice(COOKIE_SESSAO.length + 1);
}

function cookieSessao(token, maxAge = DURACAO_SESSAO_SEGUNDOS) {
    return `${COOKIE_SESSAO}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

// Receber o banco como argumento permite testar as rotas sem um PostgreSQL instalado.
export function criarApp(banco, registrarErro = console.error) {
    const app = express();
    const acervo = criarRepositorioAcervo(banco);
    const autenticacao = criarRepositorioAutenticacao(banco);
    const leitores = criarRepositorioLeitores(banco);
    const emprestimos = criarRepositorioEmprestimos(banco);
    const dashboard = criarRepositorioDashboard(banco);
    const tentativasLogin = new Map();
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

    async function carregarSessao(req) {
        if (!Object.hasOwn(req, 'usuario')) {
            req.tokenSessao = tokenDaRequisicao(req);
            req.usuario = await autenticacao.autenticar(req.tokenSessao);
        }
        return req.usuario;
    }

    function exigirPerfil(...perfis) {
        return async (req, res, next) => {
            try {
                const usuario = await carregarSessao(req);
                if (!usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
                if (usuario.trocarSenha && req.path !== '/api/auth/change-password') {
                    return res.status(403).json({ erro: 'Altere sua senha temporária antes de continuar.', trocarSenha: true });
                }
                if (!perfis.includes(usuario.perfil)) {
                    return res.status(403).json({ erro: 'Você não tem permissão para esta operação.' });
                }
                next();
            } catch (erro) { next(erro); }
        };
    }

    const exigirAdmin = exigirPerfil('admin');
    const exigirLeitor = exigirPerfil('leitor');

    app.post('/api/auth/login', async (req, res) => {
        const chave = req.ip;
        const agora = Date.now();
        const recentes = (tentativasLogin.get(chave) || []).filter(t => agora - t < 15 * 60 * 1000);
        if (recentes.length >= 10) return res.status(429).json({ erro: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.' });
        recentes.push(agora);
        tentativasLogin.set(chave, recentes);
        const credenciais = validarCredenciais(req.body);
        try {
            const sessao = await autenticacao.entrar(credenciais.email, credenciais.senha);
            tentativasLogin.delete(chave);
            res.set('Set-Cookie', cookieSessao(sessao.token));
            res.json(sessao.usuario);
        } catch (erro) {
            if (erro.status === 401) return res.status(401).json({ erro: erro.message });
            throw erro;
        }
    });
    app.post('/api/auth/logout', async (req, res) => {
        await autenticacao.encerrar(tokenDaRequisicao(req));
        res.set('Set-Cookie', cookieSessao('', 0));
        res.status(204).end();
    });
    app.get('/api/auth/me', async (req, res) => {
        const usuario = await carregarSessao(req);
        if (!usuario) return res.status(401).json({ erro: 'Sessão não encontrada.' });
        res.json(usuario);
    });
    app.post('/api/auth/change-password', exigirPerfil('admin', 'leitor'), async (req, res) => {
        const { senhaAtual, novaSenha } = validarTrocaSenha(req.body);
        await autenticacao.alterarSenha(req.usuario.id, req.tokenSessao, senhaAtual, novaSenha);
        res.json({ ok: true });
    });

    // Health stays public; the reader catalogue requires a reader session.
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
    app.get("/api/biblioteca", exigirLeitor, async (req, res) => {
        res.json((await acervo.listarLivros()).map(catalogoPublico));
    });
    app.get("/api/livros", exigirAdmin, async (req, res) => {
        res.json(await acervo.listarLivros());
    });
    app.get("/api/livros/:id", exigirAdmin, async (req, res) => {
        const livro = await acervo.buscarLivro(Number(req.params.id));
        if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
        res.json(livro);
    });

    app.post("/api/livros", exigirAdmin, async (req, res) => {
        const livro = await acervo.criarLivro(validarObra(req.body), validarExemplares(req.body));
        res.status(201).location(`/api/livros/${livro.id}`).json(livro);
    });
    app.put("/api/livros/:id", exigirAdmin, async (req, res) => {
        res.json(await acervo.editarLivro(Number(req.params.id), validarObra(req.body)));
    });
    app.post("/api/livros/:id/exemplares", exigirAdmin, async (req, res) => {
        res.status(201).json(await acervo.adicionarExemplares(Number(req.params.id), validarExemplares(req.body)));
    });

    app.get('/api/leitores', exigirAdmin, async (req, res) => res.json(await leitores.listar()));
    app.post('/api/exemplares/:id/baixa', exigirAdmin, async (req, res) => {
        res.json(await acervo.baixarExemplar(Number(req.params.id), validarBaixa(req.body)));
    });
    app.get('/api/leitores/:id', exigirAdmin, async (req, res) => {
        const leitor = await leitores.buscar(Number(req.params.id));
        if (!leitor) return res.status(404).json({ erro: 'Leitor não encontrado.' });
        res.json(leitor);
    });
    app.post('/api/leitores', exigirAdmin, async (req, res) => {
        const leitor = await leitores.salvar(validarLeitor(req.body));
        res.status(201).location(`/api/leitores/${leitor.id}`).json(leitor);
    });
    app.put('/api/leitores/:id', exigirAdmin, async (req, res) => {
        res.json(await leitores.salvar(validarLeitor(req.body), Number(req.params.id)));
    });
    app.post('/api/leitores/:id/acesso', exigirAdmin, async (req, res) => {
        const senhaInicial = req.body?.senhaInicial;
        await autenticacao.definirAcessoLeitor(Number(req.params.id), senhaInicial);
        res.status(204).end();
    });

    app.get('/api/dashboard', exigirAdmin, async (req, res) => res.json(await dashboard.consultar()));
    app.get('/api/emprestimos/opcoes', exigirAdmin, async (req, res) => res.json(await emprestimos.opcoes()));
    app.get('/api/emprestimos', exigirAdmin, async (req, res) => res.json(await emprestimos.listar()));
    app.get('/api/emprestimos/:id', exigirAdmin, async (req, res) => {
        const emprestimo = await emprestimos.buscar(Number(req.params.id));
        if (!emprestimo) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
        res.json(emprestimo);
    });
    app.post('/api/emprestimos', exigirAdmin, async (req, res) => {
        const emprestimo = await emprestimos.criar(validarEmprestimo(req.body));
        res.status(201).location(`/api/emprestimos/${emprestimo.id}`).json(emprestimo);
    });
    app.post('/api/emprestimos/:id/renovacoes', exigirAdmin, async (req, res) => {
        res.json(await emprestimos.renovar(Number(req.params.id), validarRenovacao(req.body)));
    });
    app.post('/api/emprestimos/:id/devolucao', exigirAdmin, async (req, res) => {
        res.json(await emprestimos.devolver(Number(req.params.id), validarDevolucao(req.body)));
    });
    app.get('/api/minhas-reservas', exigirLeitor, async (req, res) => {
        res.json(await emprestimos.listarDoLeitor(req.usuario.leitorId));
    });
    app.post('/api/reservas', exigirLeitor, async (req, res) => {
        const dados = validarEmprestimo({ leitorId: req.usuario.leitorId, exemplarId: req.body?.exemplarId });
        const emprestimo = await emprestimos.criar(dados);
        res.status(201).location(`/api/minhas-reservas`).json(emprestimo);
    });

    // Public pages are open; protected pages are authorized on the server as well as in the UI.
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    const arquivoPagina = pagina => (req, res) => res.sendFile(path.join(raiz, `${pagina}.html`));
    const paginaProtegida = perfil => async (req, res, next) => {
        try {
            const usuario = await carregarSessao(req);
            if (!usuario) return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
            if (usuario.trocarSenha && req.path !== '/alterarSenha.html') return res.redirect('/alterarSenha.html');
            if (usuario.trocarSenha && req.path === '/alterarSenha.html') return next();
            if (perfil && usuario.perfil !== perfil) return res.redirect(usuario.perfil === 'admin' ? '/dashboard.html' : '/biblioteca.html');
            next();
        } catch (erro) { next(erro); }
    };
    app.get("/", (req, res) => res.redirect("/biblioteca.html"));
    app.get("/login.html", arquivoPagina("login"));
    app.get("/biblioteca.html", paginaProtegida('leitor'), arquivoPagina("biblioteca"));
    app.get("/alterarSenha.html", paginaProtegida(null), arquivoPagina("alterarSenha"));
    for (const pagina of ["dashboard", "leitores", "acervo", "emprestimos", "devolucoes"]) {
        app.get(`/${pagina}.html`, paginaProtegida('admin'), arquivoPagina(pagina));
    }
    app.get('/meusEmprestimos.html', paginaProtegida('leitor'), arquivoPagina('meusEmprestimos'));
    for (const pasta of ["css", "js", "assets"]) {
        app.use(`/${pasta}`, express.static(path.join(raiz, pasta), { dotfiles: "deny" }));
    }

    app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));
    app.use((erro, req, res, next) => {
        if (erro.type === "entity.parse.failed") return res.status(400).json({ erro: "JSON inválido." });
        if (erro.type === "entity.too.large") return res.status(413).json({ erro: "Dados enviados excedem o tamanho permitido." });
        if ([400, 401, 403, 404, 409].includes(erro.status)) return res.status(erro.status).json({ erro: erro.message });
        if (erro.status === 429) return res.status(429).json({ erro: erro.message });
        if (erro.code === "23503") return res.status(400).json({ erro: "Livro ou Centro não encontrado." });
        registrarErro("Falha ao consultar o banco:", erro.code || "SEM_CODIGO");
        const indisponivel = ["BANCO_NAO_CONFIGURADO", "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(erro.code)
            || erro.code?.startsWith("08")
            || ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"].includes(erro.message);
        res.status(indisponivel ? 503 : 500).json({
            erro: indisponivel ? "Banco de dados indisponível." : "Não foi possível concluir a consulta."
        });
    });
    return app;
}
