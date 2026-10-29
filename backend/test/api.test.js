import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { criarApp } from "../src/app.js";

async function iniciar(t, query) {
    const servidor = criarApp({ query }, () => {}).listen(0, "127.0.0.1");
    await once(servidor, "listening");
    t.after(() => new Promise(resolve => {
        servidor.close(resolve);
        servidor.closeAllConnections();
    }));
    return caminho => fetch(`http://127.0.0.1:${servidor.address().port}${caminho}`);
}

test("biblioteca é servida e está nos menus de todas as páginas", async t => {
    const get = await iniciar(t, () => { throw new Error("Página não deve consultar o banco"); });
    for (const pagina of ["biblioteca", "acervo", "dashboard", "leitores", "emprestimos", "devolucoes"]) {
        const resposta = await get(`/${pagina}.html`);
        assert.equal(resposta.status, 200);
        const html = await resposta.text();
        assert.equal((html.match(/href="biblioteca.html"/g) || []).length, 2);
        assert.match(html, /css\/style.css/);
    }
    const script = await get('/js/biblioteca.js');
    assert.equal(script.status, 200);
    assert.match(await script.text(), /\/api\/livros/);
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
        assert.match(sql, /WHERE l.id = \$1/);
        parametros = valores;
        return { rows: [livro] };
    });
    const resposta = await get("/api/livros/7");
    assert.equal(resposta.status, 200);
    assert.deepEqual(parametros, [7]);
    assert.deepEqual(await resposta.json(), livro);
});

test("IDs inválidos são rejeitados antes de consultar o banco", async t => {
    const get = await iniciar(t, () => { throw new Error("Não deveria consultar"); });
    for (const id of ["0", "-1", "1.5", "abc", "2147483648", "1%20OR%201=1"]) {
        assert.equal((await get(`/api/livros/${id}`)).status, 400);
    }
});

test("livro inexistente retorna 404; listagens vazias retornam arrays", async t => {
    const get = await iniciar(t, async () => ({ rows: [] }));
    assert.equal((await get("/api/livros/1")).status, 404);
    for (const caminho of ["/api/livros", "/api/centros"]) {
        const resposta = await get(caminho);
        assert.equal(resposta.status, 200);
        assert.deepEqual(await resposta.json(), []);
    }
    assert.equal((await get("/rota-inexistente")).status, 404);
});

test("falhas de conexão não expõem dados internos", async t => {
    const get = await iniciar(t, () => {
        throw Object.assign(new Error("senha-de-teste-e-SQL-interno"), { code: "ECONNREFUSED" });
    });
    for (const caminho of ["/api/health/db", "/api/livros", "/api/dashboard"]) {
        const resposta = await get(caminho);
        assert.equal(resposta.status, 503);
        assert.deepEqual(await resposta.json(), { erro: "Banco de dados indisponível." });
    }
});

test('Dashboard devolve os indicadores e impede cache de dados antigos', async t => {
    const dados = { totalLivros: 2, exemplaresDisponiveis: 3, leitoresAtivos: 1,
        emprestimosAbertos: 1, emprestimosAtrasados: 0, recentes: [] };
    const get = await iniciar(t, async (sql, parametros) => {
        assert.match(parametros[0], /^\d{4}-\d{2}-\d{2}$/);
        return { rows: [dados] };
    });
    const resposta = await get('/api/dashboard');
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await resposta.json(), dados);
});

test("timeout de conexão do pg sem código retorna indisponibilidade", async t => {
    for (const mensagem of ["Connection terminated due to connection timeout", "timeout exceeded when trying to connect"]) {
        const get = await iniciar(t, () => { throw new Error(mensagem); });
        const resposta = await get("/api/livros");
        assert.equal(resposta.status, 503);
        assert.deepEqual(await resposta.json(), { erro: "Banco de dados indisponível." });
    }
});

test("erro inesperado de SQL retorna 500 com mensagem genérica", async t => {
    const get = await iniciar(t, () => { throw Object.assign(new Error("SQL"), { code: "42P01" }); });
    const resposta = await get("/api/livros");
    assert.equal(resposta.status, 500);
    assert.deepEqual(await resposta.json(), { erro: "Não foi possível concluir a consulta." });
});
