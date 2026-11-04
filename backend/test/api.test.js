import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { criarApp } from "../src/app.js";

async function iniciar(t, query, usuario = { id: 1, nome: 'Admin teste', perfil: 'admin', centroId: null }, connect) {
    const banco = { query: (sql, valores) => sql.includes('FROM sessoes s')
        ? Promise.resolve({ rows: [{ ...usuario, centro_id: usuario.centroId ?? 1, leitor_id: usuario.leitorId ?? 7 }] }) : query(sql,valores) };
    if (connect) banco.connect = connect;
    const servidor = criarApp(banco, () => {}).listen(0, "127.0.0.1");
    await once(servidor, "listening");
    t.after(() => new Promise(resolve => {
        servidor.close(resolve);
        servidor.closeAllConnections();
    }));
    return (caminho, opcoes) => fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`,
        { redirect: 'manual', ...opcoes });
}

test("login é público; Biblioteca e páginas de gestão exigem sessão", async t => {
    const get = await iniciar(t, () => { throw new Error("Página não deve consultar o banco"); });
    const login = await get("/login.html");
    assert.equal(login.status, 200);
    assert.match(await login.text(), /href="\/\?cadastro=1">Cadastre-se como leitor/);
    for (const pagina of ["/", "/index.html"]) {
        const resposta = await get(pagina);
        assert.equal(resposta.status, 200);
        const html = await resposta.text();
        assert.match(html, /Espaço de Leitura Digital \| Instituto Janela para o Mundo/);
        assert.match(html, /id="modalCadastroLeitor"/);
        assert.match(html, /js\/home\.js/);
    }
    for (const pagina of ["biblioteca", "acervo", "dashboard", "leitores", "emprestimos", "devolucoes", "meusEmprestimos"]) {
        const resposta = await get(`/${pagina}.html`);
        assert.equal(resposta.status, 302);
        assert.match(resposta.headers.get('location'), /^\/login\.html\?next=/);
    }
    const cadastro = await get("/leitores.html?novoLeitor=1");
    assert.equal(cadastro.status, 302);
    assert.match(cadastro.headers.get('location'), /leitores\.html%3FnovoLeitor%3D1/);
    assert.equal((await get('/api/biblioteca')).status, 401);
});

test("destaques públicos exibem apenas dados básicos dos livros sem exigir sessão", async t => {
    let consultaDestaques;
    const livros = [{
        id: 8,
        titulo: "Livro em destaque",
        autor: "Autora de teste",
        categoria: "Aventura",
        capaUrl: "https://example.org/capa.jpg",
        sinopse: "Uma aventura de teste."
    }];
    const get = await iniciar(t, async sql => {
        consultaDestaques = sql;
        return { rows: livros };
    });
    const resposta = await get("/api/destaques");
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), livros);
    assert.match(consultaDestaques, /FROM livros ORDER BY id DESC LIMIT 12/);
    assert.doesNotMatch(consultaDestaques, /exemplares|leitores|usuarios/i);
});

test("catálogo público lista os dados cadastrados sem exemplares ou sessão", async t => {
    let consultaCatalogo;
    const livros = [{
        id: 8,
        titulo: "Livro público",
        autor: "Autora de teste",
        isbn: "9780000000000",
        editora: "Editora de teste",
        ano: 2026,
        categoria: "Conhecimento e descobertas",
        faixaEtaria: "Livre",
        capaUrl: "https://example.org/capa.jpg",
        sinopse: "Uma leitura de teste."
    }];
    const get = await iniciar(t, async sql => {
        consultaCatalogo = sql;
        return { rows: livros };
    });
    const resposta = await get("/api/catalogo-publico");
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), livros);
    assert.match(consultaCatalogo, /FROM livros ORDER BY id DESC/);
    assert.match(consultaCatalogo, /isbn.*editora.*ano.*categoria/s);
    assert.doesNotMatch(consultaCatalogo, /exemplares|leitores|usuarios/i);
});

test("cadastro público cria leitor ativo sem abrir a área administrativa", async t => {
    let dadosLeitor;
    let dadosUsuario;
    let transacao = [];
    const senha = 'senha-bem-segura-123';
    const get = await iniciar(t, async sql => {
        if (sql.includes('FROM usuarios u LEFT JOIN leitores l')) {
            return { rows: [{ id: 25, email: dadosUsuario[0], senha_hash: dadosUsuario[1],
                perfil: 'leitor', leitor_id: dadosUsuario[2], trocar_senha: false, nome: 'Pessoa de teste' }] };
        }
        if (sql.includes('INSERT INTO sessoes')) return { rows: [], rowCount: 1 };
        throw new Error(`Consulta inesperada: ${sql}`);
    }, undefined, async () => ({
        async query(sql, valores = []) {
            transacao.push(sql);
            if (sql.includes('INSERT INTO leitores')) {
                dadosLeitor = valores;
                return { rowCount: 1, rows: [{ id: 15 }] };
            }
            if (sql.includes('INSERT INTO usuarios')) {
                dadosUsuario = valores;
                return { rowCount: 1, rows: [{ id: 25 }] };
            }
            return { rowCount: 0, rows: [] };
        },
        release() {}
    }));
    const resposta = await get('/api/cadastro-leitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Pessoa de teste', tipo: 'Comunidade', dataNascimento: '2000-01-01',
            centroId: 1, status: 'Inativo', email: '  LEITOR@example.org  ', senha })
    });
    assert.equal(resposta.status, 201);
    assert.deepEqual(await resposta.json(), { mensagem: 'Cadastro concluído. Você já pode entrar com seu e-mail e senha.' });
    assert.equal(dadosLeitor[7], 1);
    assert.match(transacao[1], /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,'Ativo'\)/);
    assert.equal(dadosUsuario[0], 'leitor@example.org');
    assert.equal(dadosUsuario[2], 15);
    assert.match(dadosUsuario[1], /^scrypt\$16384\$8\$1\$/);
    assert.notEqual(dadosUsuario[1], senha);
    assert.match(transacao[transacao.length - 1], /COMMIT/);

    const login = await get('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'LEITOR@example.org', senha })
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie'), /HttpOnly/);
    assert.equal((await login.json()).perfil, 'leitor');
});

test("cadastro público valida os dados antes de gravar", async t => {
    const get = await iniciar(t, () => { throw new Error("Cadastro inválido não deve consultar o banco"); });
    const resposta = await get('/api/cadastro-leitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Pessoa de teste', tipo: 'Comunidade', dataNascimento: '2999-01-01',
            centroId: 1, email: 'leitor@example.org', senha: 'senha-bem-segura-123' })
    });
    assert.equal(resposta.status, 400);
    assert.match((await resposta.json()).erro, /data de nascimento válida/);
});

test("cadastro público exige e-mail e senha forte", async t => {
    const get = await iniciar(t, () => { throw new Error("Cadastro incompleto não deve consultar o banco"); });
    const dados = { nome: 'Pessoa de teste', tipo: 'Comunidade', dataNascimento: '2000-01-01', centroId: 1 };
    for (const [adicional, mensagem] of [
        [{ senha: 'senha-bem-segura-123' }, /e-mail para criar seu acesso/],
        [{ email: 'leitor@example.org', senha: 'curta' }, /8 a 128 caracteres/]
    ]) {
        const resposta = await get('/api/cadastro-leitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...dados, ...adicional })
        });
        assert.equal(resposta.status, 400);
        assert.match((await resposta.json()).erro, mensagem);
    }
});

test("cadastro público desfaz o leitor se o e-mail já pertence a uma conta", async t => {
    let comandos = [];
    const get = await iniciar(t, () => { throw new Error("Não deveria consultar fora da transação"); }, undefined, async () => ({
        async query(sql) {
            comandos.push(sql);
            if (sql.includes('INSERT INTO leitores')) return { rowCount: 1, rows: [{ id: 15 }] };
            if (sql.includes('INSERT INTO usuarios')) {
                throw Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'usuarios_email_unico' });
            }
            return { rowCount: 0, rows: [] };
        },
        release() {}
    }));
    const resposta = await get('/api/cadastro-leitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: 'Pessoa de teste', tipo: 'Comunidade', dataNascimento: '2000-01-01',
            centroId: 1, email: 'leitor@example.org', senha: 'senha-bem-segura-123' })
    });
    assert.equal(resposta.status, 409);
    assert.match((await resposta.json()).erro, /já possui uma conta/);
    assert.match(comandos[0], /BEGIN/);
    assert.match(comandos[comandos.length - 1], /ROLLBACK/);
});

test("cadastro público limita envios inválidos por endereço IP", async t => {
    const get = await iniciar(t, () => { throw new Error("Cadastro inválido não deve consultar o banco"); });
    const opcoes = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
    };
    for (let tentativa = 0; tentativa < 5; tentativa++) {
        assert.equal((await get('/api/cadastro-leitor', opcoes)).status, 400);
    }
    const bloqueada = await get('/api/cadastro-leitor', opcoes);
    assert.equal(bloqueada.status, 429);
});

test("administradores e leitores consultam a Biblioteca; reservas continuam exclusivas dos leitores", async t => {
    const cookie = `espaco_sessao=${'a'.repeat(43)}`;
    const admin = await iniciar(t, async () => ({ rows: [] }));
    const negada = { headers: { Cookie: cookie }, redirect: 'manual' };
    assert.equal((await admin('/biblioteca.html', negada)).status, 200);
    const catalogoAdmin = await admin('/api/biblioteca', negada);
    assert.equal(catalogoAdmin.status, 200);
    assert.deepEqual(await catalogoAdmin.json(), []);
    assert.equal((await admin('/api/reservas', {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ exemplarId: 1 })
    })).status, 403);

    const leitor = await iniciar(t, async () => ({ rows: [] }), {
        id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1
    });
    assert.equal((await leitor('/biblioteca.html', negada)).status, 200);
    const catalogo = await leitor('/api/biblioteca', negada);
    assert.equal(catalogo.status, 200);
    assert.deepEqual(await catalogo.json(), []);
});

test("links das sidebars administrativas abrem a Biblioteca e seus links de retorno", async t => {
    const get = await iniciar(t, async () => ({ rows: [] }));
    const opcoes = { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } };
    for (const pagina of ['dashboard', 'acervo', 'leitores', 'emprestimos', 'devolucoes', 'usuarios']) {
        const resposta = await get(`/${pagina}.html`, opcoes);
        assert.equal(resposta.status, 200, pagina);
        const html = await resposta.text();
        const topo = html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1];
        assert.ok(topo, `${pagina}: cabeçalho presente`);
        assert.doesNotMatch(topo, /href="\/?biblioteca\.html"/, `${pagina}: sem Biblioteca no topo`);
        const menus = [...html.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/g)];
        assert.equal(menus.length, 2, `${pagina}: menu desktop e celular`);
        const destino = '/biblioteca.html';
        for (const menu of menus) {
            assert.equal((menu[1].match(/href="\/biblioteca\.html"/g) || []).length, 1, `${pagina}: Biblioteca uma vez em cada sidebar`);
        }
        const biblioteca = await get(destino, opcoes);
        assert.equal(biblioteca.status, 200, `${pagina}: Biblioteca sem redirecionamento`);
        const conteudo = await biblioteca.text();
        assert.match(conteudo, /data-auth-role="admin,coordenador,leitor"/);
        for (const link of conteudo.matchAll(/<a[^>]+href="([^"]+\.html)"[^>]*data-admin-only/g)) {
            assert.equal((await get(`/${link[1]}`, opcoes)).status, 200, `retorno: ${link[1]}`);
        }
        assert.match(conteudo, /href="index.html"/);
        assert.equal((await get('/index.html', opcoes)).status, 200);
    }
});

test("saúde da API não depende de uma conexão com o banco", async t => {
    const get = await iniciar(t, () => { throw new Error("Não deveria consultar"); });
    const resposta = await get("/api/health");
    assert.equal(resposta.status, 200);
    assert.equal((await resposta.json()).status, "ok");
});

test("saúde do banco consulta PostgreSQL e não simula sucesso", async t => {
    let sql;
    const get = await iniciar(t, async consulta => { sql = consulta; return { rows: [] }; });
    const resposta = await get("/api/health/db");
    assert.equal(resposta.status, 200);
    assert.equal(sql, "SELECT 1");
});

test("consulta de livro usa parâmetro e mantém os exemplares na resposta", async t => {
    let parametros;
    const livro = { id: 7, titulo: "Obra", exemplares: [{ id: 9, status: "Emprestado" }] };
    const get = await iniciar(t, async (sql, valores) => {
        assert.match(sql, /WHERE l.id = \$2/);
        parametros = valores;
        return { rows: [livro] };
    });
    const resposta = await get("/api/livros/7", { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } });
    assert.equal(resposta.status, 200);
    assert.deepEqual(parametros, [null, 7]);
    assert.deepEqual(await resposta.json(), livro);
});

test("catálogo público não expõe observações internas de baixa", async t => {
    const livro = {
        id: 7,
        titulo: "Obra",
        exemplares: [{ id: 9, codigo: "EX-0009", centroId: 1, centro: "Centro", status: "Baixado",
            baixaMotivo: "Perda", baixaObservacao: "Anotação privada", baixaEm: "2026-10-01" }]
    };
    const get = await iniciar(t, async () => ({ rows: [livro] }), {
        id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1
    });
    const resposta = await get("/api/biblioteca", { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } });
    assert.equal(resposta.status, 200);
    assert.deepEqual((await resposta.json())[0].exemplares[0], {
        id: 9, codigo: "EX-0009", centroId: 1, centro: "Centro", status: "Baixado"
    });
});

test("IDs inválidos são rejeitados antes de consultar o banco", async t => {
    const get = await iniciar(t, () => { throw new Error("Não deveria consultar"); });
    for (const id of ["0", "-1", "1.5", "abc", "2147483648", "1%20OR%201=1"]) {
        assert.equal((await get(`/api/livros/${id}`)).status, 400);
    }
});

test("livro inexistente retorna 404; listagens vazias retornam arrays", async t => {
    const get = await iniciar(t, async () => ({ rows: [] }));
    const leitor = await iniciar(t, async () => ({ rows: [] }), {
        id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1
    });
    const autenticadoAdmin = { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } };
    const autenticadoLeitor = { headers: { Cookie: `espaco_sessao=${'b'.repeat(43)}` } };
    assert.equal((await get("/api/livros/1", autenticadoAdmin)).status, 404);
    const privado = await get("/api/livros", autenticadoAdmin);
    assert.equal(privado.status, 200);
    assert.deepEqual(await privado.json(), []);
    for (const [solicitar, caminho, opcoes] of [[leitor, "/api/biblioteca", autenticadoLeitor], [get, "/api/centros", {}]]) {
        const resposta = await solicitar(caminho, opcoes);
        assert.equal(resposta.status, 200);
        assert.deepEqual(await resposta.json(), []);
    }
    assert.equal((await get("/rota-inexistente")).status, 404);
});

test("falhas de conexão não expõem dados internos", async t => {
    const get = await iniciar(t, () => {
        throw Object.assign(new Error("senha-de-teste-e-SQL-interno"), { code: "ECONNREFUSED" });
    }, { id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1 });
    for (const [caminho, opcoes] of [["/api/health/db", {}], ["/api/biblioteca", { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } }]]) {
        const resposta = await get(caminho, opcoes);
        assert.equal(resposta.status, 503);
        assert.deepEqual(await resposta.json(), { erro: "Banco de dados indisponível." });
    }
});

test('APIs administrativas rejeitam requisições sem sessão', async t => {
    const get = await iniciar(t, () => { throw new Error("A API não deve consultar o banco sem sessão"); });
    for (const caminho of ['/api/dashboard', '/api/leitores', '/api/emprestimos', '/api/livros']) {
        const resposta = await get(caminho);
        assert.equal(resposta.status, 401);
        assert.equal(resposta.headers.get('cache-control'), 'no-store');
    }
});

test("timeout de conexão do pg sem código retorna indisponibilidade", async t => {
    for (const mensagem of ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"]) {
        const get = await iniciar(t, () => { throw new Error(mensagem); }, {
            id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1
        });
        const resposta = await get("/api/biblioteca", { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } });
        assert.equal(resposta.status, 503);
        assert.deepEqual(await resposta.json(), { erro: "Banco de dados indisponível." });
    }
});

test("erro inesperado de SQL retorna 500 com mensagem genérica", async t => {
    const get = await iniciar(t, () => { throw Object.assign(new Error("SQL"), { code: "42P01" }); }, {
        id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1
    });
    const resposta = await get("/api/biblioteca", { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } });
    assert.equal(resposta.status, 500);
    assert.deepEqual(await resposta.json(), { erro: "Não foi possível concluir a consulta." });
});
