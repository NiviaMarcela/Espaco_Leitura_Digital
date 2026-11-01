import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { criarApp } from "../src/app.js";

async function iniciar(t, query) {
    const servidor = criarApp({ query: (sql, valores) => sql.includes('FROM sessoes s')
        ? Promise.resolve({rows:[{id:1,nome:'Admin teste',perfil:'admin',centroId:null}]}) : query(sql,valores) }, () => {}).listen(0, "127.0.0.1");
    await once(servidor, "listening");
    t.after(() => new Promise(resolve => {
        servidor.close(resolve);
        servidor.closeAllConnections();
    }));
    return (caminho, opcoes) => fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`,
        { redirect: 'manual', ...opcoes });
}

test("catálogo e login são públicos; páginas de gestão exigem sessão", async t => {
    const get = await iniciar(t, () => { throw new Error("Página não deve consultar o banco"); });
    for (const pagina of ["biblioteca", "login"]) assert.equal((await get(`/${pagina}.html`)).status, 200);
    for (const pagina of ["acervo", "dashboard", "leitores", "emprestimos", "devolucoes", "meusEmprestimos"]) {
        const resposta = await get(`/${pagina}.html`);
        assert.equal(resposta.status, 302);
        assert.match(resposta.headers.get('location'), /^\/login\.html\?next=/);
    }
    const script = await get('/js/biblioteca.js');
    assert.equal(script.status, 200);
    assert.match(await script.text(), /\/api\/biblioteca/);
    const historico = await get('/js/meusEmprestimos.js');
    assert.equal(historico.status, 200);
    assert.match(await historico.text(), /\/api\/minhas-reservas/);
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
    const get = await iniciar(t, async () => ({ rows: [livro] }));
    const resposta = await get("/api/biblioteca");
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
    const autenticado = { headers: { Cookie: `espaco_sessao=${'a'.repeat(43)}` } };
    assert.equal((await get("/api/livros/1", autenticado)).status, 404);
    for (const [caminho, opcoes] of [["/api/livros", autenticado], ["/api/biblioteca"], ["/api/centros"]]) {
        const resposta = await get(caminho, opcoes);
        assert.equal(resposta.status, 200);
        assert.deepEqual(await resposta.json(), []);
    }
    assert.equal((await get("/rota-inexistente")).status, 404);
});

test("falhas de conexão não expõem dados internos", async t => {
    const get = await iniciar(t, () => {
        throw Object.assign(new Error("senha-de-teste-e-SQL-interno"), { code: "ECONNREFUSED" });
    });
    for (const caminho of ["/api/health/db", "/api/biblioteca"]) {
        const resposta = await get(caminho);
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
        const get = await iniciar(t, () => { throw new Error(mensagem); });
        const resposta = await get("/api/biblioteca");
        assert.equal(resposta.status, 503);
        assert.deepEqual(await resposta.json(), { erro: "Banco de dados indisponível." });
    }
});

test("erro inesperado de SQL retorna 500 com mensagem genérica", async t => {
    const get = await iniciar(t, () => { throw Object.assign(new Error("SQL"), { code: "42P01" }); });
    const resposta = await get("/api/biblioteca");
    assert.equal(resposta.status, 500);
    assert.deepEqual(await resposta.json(), { erro: "Não foi possível concluir a consulta." });
});
