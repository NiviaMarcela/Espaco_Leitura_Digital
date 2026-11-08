import { criarRepositorioRecuperacao, MENSAGEM_RECUPERACAO } from './repositories/recuperacao.js';
import { setTimeout as aguardar } from 'node:timers/promises';
import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { criarRepositorioAcervo } from "./repositories/acervo.js";
import { criarRepositorioAutenticacao, validarSenha } from "./repositories/autenticacao.js";
import { validarObra, validarExemplares, validarLeitor, validarBaixa,
    validarCredenciais, validarTrocaSenha, validarEmprestimo,
    validarRenovacao, validarDevolucao, erroHttp } from "./validation.js";
import { criarRepositorioLeitores } from './repositories/leitores.js';
import { criarRepositorioEmprestimos } from './repositories/emprestimos.js';
import { criarRepositorioDashboard } from './repositories/dashboard.js';

import { criarRepositorioReservas } from './repositories/reservas.js';
import { completarCadastroPessoal } from './repositories/cadastro-pessoal.js';
import { criarRepositorioUsuarios } from './repositories/usuarios.js';

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
    const usuarios = criarRepositorioUsuarios(banco);
    const recuperacao = criarRepositorioRecuperacao(banco);
    const pedidosRecuperacao = new Map();
    const tentativasLogin = new Map();
    const tentativasCadastro = new Map();
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
                if (usuario.perfil !== 'admin' && !Number.isInteger(usuario.centroId)) {
                    return res.status(403).json({ erro: 'Conta sem Centro válido. Procure o administrador.' });
                }
                const centroId = usuario.perfil === 'admin' ? null : usuario.centroId;
                // Escopo por requisição: nunca compartilhar repositórios de um Centro com outro.
                req.repos = {
                    acervo: criarRepositorioAcervo(banco, centroId),
                    leitores: criarRepositorioLeitores(banco, centroId),
                    emprestimos: criarRepositorioEmprestimos(banco, undefined, centroId),
                    dashboard: criarRepositorioDashboard(banco, undefined, centroId)
                };
                next();
            } catch (erro) { next(erro); }
        };
    }

    const exigirAdmin = exigirPerfil('admin');
    const exigirGestao = exigirPerfil('admin', 'coordenador', 'professor');
    const exigirConta = exigirPerfil('admin', 'coordenador', 'professor', 'leitor');
    const expirarReservas = usuario => criarRepositorioReservas(banco, usuario).expirarVencidas();

    app.post('/api/auth/recuperacao', async (req, res) => {
        const inicio=Date.now();
        for (const [ip, entrada] of pedidosRecuperacao) if(entrada.ate<=inicio) pedidosRecuperacao.delete(ip);
        const entrada=pedidosRecuperacao.get(req.ip) || {total:0,ate:inicio+15*60*1000};
        if(entrada.total>=5 || (!pedidosRecuperacao.has(req.ip) && pedidosRecuperacao.size>=10000)) {
            res.set('Retry-After','900');
            return res.status(429).json({erro:'Muitas solicitações. Aguarde 15 minutos e tente novamente.'});
        }
        entrada.total++;pedidosRecuperacao.set(req.ip,entrada);
        try { await recuperacao.solicitar(req.body); }
        finally { await aguardar(Math.max(0,300-(Date.now()-inicio))); }
        res.status(202).json({mensagem:MENSAGEM_RECUPERACAO});
    });
    app.get('/api/recuperacoes', exigirAdmin, async (req,res)=>res.json(await recuperacao.listar()));
    app.post('/api/recuperacoes/:id/concluir', exigirAdmin, async (req,res)=>res.json(await recuperacao.concluir(Number(req.params.id),req.body,req.usuario.id)));

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
    app.post('/api/auth/change-password', exigirPerfil('admin', 'coordenador', 'professor', 'leitor'), async (req, res) => {
        if (req.body?.usuarioId !== undefined && req.body.usuarioId !== req.usuario.id) throw erroHttp(409, 'A conta conectada mudou. Saia e entre novamente com a conta desejada.');
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
        const usuario = await carregarSessao(req);
        if (usuario && usuario.perfil !== 'admin' && !Number.isInteger(usuario.centroId)) throw erroHttp(403, 'Conta sem Centro válido.');
        res.json(await criarRepositorioAcervo(banco, usuario && usuario.perfil !== 'admin' ? usuario.centroId : null).listarCentros());
    });
    app.get("/api/destaques", async (req, res) => {
        res.json(await acervo.listarDestaques());
    });
    app.get("/api/catalogo-publico", async (req, res) => {
        res.json(await acervo.listarCatalogoPublico());
    });
    app.post('/api/cadastro-leitor', async (req, res) => {
        const chave = req.ip;
        const agora = Date.now();
        const recentes = (tentativasCadastro.get(chave) || []).filter(t => agora - t < 15 * 60 * 1000);
        if (recentes.length >= 5) {
            return res.status(429).json({ erro: 'Muitos cadastros enviados. Aguarde 15 minutos e tente novamente.' });
        }
        recentes.push(agora);
        tentativasCadastro.set(chave, recentes);
        if (!['Aluno', 'Comunidade'].includes(req.body?.tipo)) throw erroHttp(400, 'No cadastro inicial, selecione Aluno ou Comunidade.');
        const dados = validarLeitor({ ...req.body, status: 'Ativo' });
        const senha = validarSenha(req.body?.senha);
        await autenticacao.cadastrarLeitor(dados, senha);
        res.status(201).json({ mensagem: 'Cadastro concluído. Você já pode entrar com seu e-mail e senha.' });
    });
    app.get("/api/biblioteca", exigirPerfil('admin', 'coordenador', 'professor', 'leitor'), async (req, res) => {
        await expirarReservas(req.usuario);
        res.json((await req.repos.acervo.listarLivros()).map(catalogoPublico));
    });
    app.get("/api/livros", exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.acervo.listarLivros());
    });
    app.get("/api/livros/:id", exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        const livro = await req.repos.acervo.buscarLivro(Number(req.params.id));
        if (!livro) return res.status(404).json({ erro: "Livro não encontrado." });
        res.json(livro);
    });

    app.post("/api/livros", exigirGestao, async (req, res) => {
        const livro = await req.repos.acervo.criarLivro(validarObra(req.body), validarExemplares(req.body));
        res.status(201).location(`/api/livros/${livro.id}`).json(livro);
    });
    app.put("/api/livros/:id", exigirGestao, async (req, res) => {
        res.json(await req.repos.acervo.editarLivro(Number(req.params.id), validarObra(req.body)));
    });
    app.post("/api/livros/:id/exemplares", exigirGestao, async (req, res) => {
        res.status(201).json(await req.repos.acervo.adicionarExemplares(Number(req.params.id), validarExemplares(req.body)));
    });

    app.get('/api/leitores', exigirGestao, async (req, res) => res.json(await req.repos.leitores.listar()));
    app.post('/api/exemplares/:id/baixa', exigirGestao, async (req, res) => {
        res.json(await req.repos.acervo.baixarExemplar(Number(req.params.id), validarBaixa(req.body)));
    });
    app.get('/api/leitores/:id', exigirGestao, async (req, res) => {
        const leitor = await req.repos.leitores.buscar(Number(req.params.id));
        if (!leitor) return res.status(404).json({ erro: 'Leitor não encontrado.' });
        res.json(leitor);
    });
    app.post('/api/leitores', exigirGestao, async (req, res) => {
        const leitor = await req.repos.leitores.salvar(validarLeitor(req.body), null, req.body?.senhaInicial);
        res.status(201).location(`/api/leitores/${leitor.id}`).json(leitor);
    });
    app.put('/api/leitores/:id', exigirGestao, async (req, res) => {
        res.json(await req.repos.leitores.salvar(validarLeitor(req.body), Number(req.params.id)));
    });
    app.post('/api/leitores/:id/acesso', exigirGestao, async (req, res) => {
        const senhaInicial = req.body?.senhaInicial;
        await autenticacao.definirAcessoLeitor(Number(req.params.id), senhaInicial, req.usuario.perfil === 'admin' ? null : req.usuario.centroId);
        res.status(204).end();
    });

    app.get('/api/dashboard', exigirPerfil('admin', 'coordenador'), async (req, res) => res.json(await req.repos.dashboard.consultar()));
    app.get('/api/emprestimos/opcoes', exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.emprestimos.opcoes());
    });
    app.get('/api/emprestimos', exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        res.json(await req.repos.emprestimos.listar());
    });
    app.get('/api/emprestimos/:id', exigirGestao, async (req, res) => {
        const emprestimo = await req.repos.emprestimos.buscar(Number(req.params.id));
        if (!emprestimo) return res.status(404).json({ erro: 'Empréstimo não encontrado.' });
        res.json(emprestimo);
    });
    app.post('/api/emprestimos', exigirGestao, async (req, res) => {
        await expirarReservas(req.usuario);
        const emprestimo = await req.repos.emprestimos.criar(validarEmprestimo(req.body));
        res.status(201).location(`/api/emprestimos/${emprestimo.id}`).json(emprestimo);
    });
    app.post('/api/emprestimos/:id/renovacoes', exigirGestao, async (req, res) => {
        res.json(await req.repos.emprestimos.renovar(Number(req.params.id), validarRenovacao(req.body)));
    });
    app.post('/api/emprestimos/:id/devolucao', exigirGestao, async (req, res) => {
        res.json(await req.repos.emprestimos.devolver(Number(req.params.id), validarDevolucao(req.body)));
    });
    app.post('/api/meu-cadastro-emprestimos', exigirGestao, async (req, res) => {
        const dados = validarLeitor({ ...req.body, email: req.usuario.email, status: 'Ativo' });
        await completarCadastroPessoal(banco, req.usuario, dados);
        res.status(201).json(await autenticacao.autenticar(req.tokenSessao));
    });
    app.get('/api/meus-emprestimos', exigirConta, async (req, res) => {
        res.json(req.usuario.leitorId ? await req.repos.emprestimos.listarDoLeitor(req.usuario.leitorId) : []);
    });
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
    app.post('/api/reservas/:id/cancelar', exigirPerfil('admin','coordenador','professor','leitor'), async (req, res) => {
        res.json(await criarRepositorioReservas(banco, req.usuario).cancelar(Number(req.params.id)));
    });
    app.post('/api/reservas/:id/retirar', exigirGestao, async (req, res) => {
        res.json(await criarRepositorioReservas(banco, req.usuario).retirar(Number(req.params.id)));
    });
    app.put('/api/usuarios/:id', exigirAdmin, async (req, res) => res.json(await usuarios.editar(Number(req.params.id), req.body)));
    app.patch('/api/usuarios/:id/status', exigirAdmin, async (req, res) => res.json(await usuarios.definirAtivo(Number(req.params.id), req.body?.ativo, req.usuario.id)));
    app.post('/api/usuarios/:id/senha', exigirAdmin, async (req, res) => res.json(await usuarios.redefinirSenha(Number(req.params.id), req.body?.senha)));
    app.get('/api/usuarios', exigirAdmin, async (req, res) => res.json(await usuarios.listar()));
    app.post('/api/usuarios', exigirAdmin, async (req, res) => res.status(201).json(await usuarios.criar(req.body)));

    // Public pages are open; protected pages are authorized on the server as well as in the UI.
    const raiz = fileURLToPath(new URL("../../", import.meta.url));
    const arquivoPagina = pagina => (req, res) => res.sendFile(path.join(raiz, `${pagina}.html`));
    const paginaProtegida = perfil => async (req, res, next) => {
        try {
            const usuario = await carregarSessao(req);
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
    app.get("/biblioteca.html", paginaProtegida(['admin', 'coordenador', 'professor', 'leitor']), arquivoPagina("biblioteca"));
    app.get("/alterarSenha.html", paginaProtegida(null), arquivoPagina("alterarSenha"));
    app.get("/dashboard.html", paginaProtegida(['admin', 'coordenador']), arquivoPagina("dashboard"));
    for (const pagina of ["leitores", "acervo", "emprestimos", "devolucoes"]) {
        app.get(`/${pagina}.html`, paginaProtegida(['admin', 'coordenador', 'professor']), arquivoPagina(pagina));
    }
    app.get('/usuarios.html', paginaProtegida('admin'), arquivoPagina('usuarios'));
    app.get('/meusEmprestimos.html', paginaProtegida(['admin','coordenador','professor','leitor']), arquivoPagina('meusEmprestimos'));
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
