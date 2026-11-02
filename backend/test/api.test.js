import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { criarApp } from "../src/app.js";

async function iniciar(t, query, usuario = { id: 1, nome: 'Admin teste', perfil: 'admin', centroId: null }) {
    const servidor = criarApp({ query: (sql, valores) => sql.includes('FROM sessoes s')
        ? Promise.resolve({ rows: [usuario] }) : query(sql,valores) }, () => {}).listen(0, "127.0.0.1");
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
    assert.equal((await get("/login.html")).status, 200);
    for (const pagina of ["biblioteca", "acervo", "dashboard", "leitores", "emprestimos", "devolucoes", "meusEmprestimos"]) {
        const resposta = await get(`/${pagina}.html`);
        assert.equal(resposta.status, 302);
        assert.match(resposta.headers.get('location'), /^\/login\.html\?next=/);
    }
    assert.equal((await get('/api/biblioteca')).status, 401);
});

test("somente leitores acessam a Biblioteca e seu catálogo", async t => {
    const cookie = `espaco_sessao=${'a'.repeat(43)}`;
    const admin = await iniciar(t, () => { throw new Error("Admin não deve consultar o catálogo"); });
    const negada = { headers: { Cookie: cookie }, redirect: 'manual' };
    assert.equal((await admin('/biblioteca.html', negada)).headers.get('location'), '/dashboard.html');
    assert.equal((await admin('/api/biblioteca', negada)).status, 403);

    const leitor = await iniciar(t, async () => ({ rows: [] }), {
        id: 2, nome: 'Leitor teste', perfil: 'leitor', leitorId: 7, centroId: 1
    });
    assert.equal((await leitor('/biblioteca.html', negada)).status, 200);
    const catalogo = await leitor('/api/biblioteca', negada);
    assert.equal(catalogo.status, 200);
    assert.deepEqual(await catalogo.json(), []);
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
