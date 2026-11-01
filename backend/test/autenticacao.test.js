import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { criarApp } from '../src/app.js';
import { criarRepositorioAutenticacao } from '../src/repositories/autenticacao.js';

const scrypt = promisify(scryptCallback);

test('criação inicial do administrador valida credenciais e não sobrescreve conta existente', async () => {
    const consultas = [];
    const banco = {
        async query(sql, valores = []) {
            consultas.push({ sql, valores });
            if (sql.includes("perfil='admin'")) return { rows: [], rowCount: 0 };
            if (sql.includes('INSERT INTO usuarios')) return { rows: [{ id: 1 }], rowCount: 1 };
            throw new Error(`Consulta inesperada no teste: ${sql}`);
        }
    };
    const autenticacao = criarRepositorioAutenticacao(banco);
    assert.equal(await autenticacao.inicializarAdministrador('  ADMIN@example.org ', 'senha-forte-para-admin'), true);
    assert.match(consultas[1].sql, /ON CONFLICT DO NOTHING RETURNING id/);
    assert.equal(consultas[1].valores[0], 'admin@example.org');
    assert.equal(consultas[1].valores[1].startsWith('scrypt$16384$8$1$'), true);

    const existente = criarRepositorioAutenticacao({
        async query() { return { rows: [{ id: 1 }], rowCount: 1 }; }
    });
    assert.equal(await existente.inicializarAdministrador('admin@example.org', 'senha-forte-para-admin'), false);
    await assert.rejects(autenticacao.inicializarAdministrador('email-invalido', 'senha-forte-para-admin'), { status: 400 });
});

async function hashSenha(senha) {
    const salt = randomBytes(16);
    const derivada = await scrypt(senha, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return `scrypt$16384$8$1$${salt.toString('hex')}$${derivada.toString('hex')}`;
}

async function iniciar(t, perfil, trocarSenha = false) {
    const senha = 'senha-temporaria-segura';
    const usuario = {
        id: 8, email: 'leitor@example.org', senha_hash: await hashSenha(senha),
        perfil, leitor_id: perfil === 'leitor' ? 42 : null,
        trocar_senha: trocarSenha, nome: perfil === 'leitor' ? 'Leitora Teste' : null
    };
    let tokenHash = null;
    const banco = {
        async query(sql, valores = []) {
            if (sql.includes('FROM usuarios u LEFT JOIN leitores l')) return { rows: [usuario], rowCount: 1 };
            if (sql.includes('INSERT INTO sessoes')) {
                tokenHash = valores[1];
                return { rows: [], rowCount: 1 };
            }
            if (sql.includes('FROM sessoes s JOIN usuarios u')) {
                const rows = valores[0] === tokenHash ? [usuario] : [];
                return { rows, rowCount: rows.length };
            }
            if (sql.includes('SELECT senha_hash FROM usuarios')) {
                return { rows: [{ senha_hash: usuario.senha_hash }], rowCount: 1 };
            }
            if (sql.includes('UPDATE usuarios SET senha_hash')) {
                usuario.senha_hash = valores[1];
                usuario.trocar_senha = false;
                return { rows: [{ id: usuario.id }], rowCount: 1 };
            }
            if (sql.includes('DELETE FROM sessoes WHERE usuario_id=$1')) return { rows: [], rowCount: 1 };
            if (sql.includes('FROM livros')) {
                return { rows: [{
                    totalLivros: 1, leitoresAtivos: 1, exemplaresDisponiveis: 1,
                    emprestimosAbertos: 0, emprestimosAtrasados: 0, recentes: []
                }], rowCount: 1 };
            }
            if (sql.includes('WHERE p.leitor_id=$1')) return { rows: [], rowCount: 0 };
            if (sql.includes('FROM leitores l JOIN centros c')) return { rows: [], rowCount: 0 };
            throw new Error(`Consulta inesperada no teste: ${sql}`);
        }
    };
    const servidor = criarApp(banco, () => {}).listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    t.after(() => new Promise(resolve => {
        servidor.close(resolve);
        servidor.closeAllConnections();
    }));
    return {
        senha,
        requisitar: (path, opcoes = {}) => fetch(`http://127.0.0.1:${servidor.address().port}${path}`, opcoes)
    };
}

test('login cria cookie HttpOnly e libera apenas APIs compatíveis com o perfil', async t => {
    const app = await iniciar(t, 'admin');
    assert.equal((await app.requisitar('/api/dashboard')).status, 401);
    const login = await app.requisitar('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'leitor@example.org', senha: app.senha })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const token = cookie.split(';')[0];
    const dashboard = await app.requisitar('/api/dashboard', { headers: { Cookie: token } });
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.json()).totalLivros, 1);
    assert.equal((await app.requisitar('/api/leitores', { headers: { Cookie: token } })).status, 200);
});

test('conta de leitor consulta somente seu histórico e não acessa administração', async t => {
    const app = await iniciar(t, 'leitor');
    const login = await app.requisitar('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'leitor@example.org', senha: app.senha })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const proprio = await app.requisitar('/api/minhas-reservas', { headers: { Cookie: cookie } });
    assert.equal(proprio.status, 200);
    assert.deepEqual(await proprio.json(), []);
    assert.equal((await app.requisitar('/api/dashboard', { headers: { Cookie: cookie } })).status, 403);
    assert.equal((await app.requisitar('/api/emprestimos', { headers: { Cookie: cookie } })).status, 403);
});

test('senha inicial bloqueia empréstimos até ser trocada', async t => {
    const app = await iniciar(t, 'leitor', true);
    const login = await app.requisitar('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'leitor@example.org', senha: app.senha })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await app.requisitar('/api/minhas-reservas', { headers: { Cookie: cookie } })).status, 403);
    const troca = await app.requisitar('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ senhaAtual: app.senha, novaSenha: 'outra-senha-bem-segura-123' })
    });
    assert.equal(troca.status, 200);
    assert.equal((await app.requisitar('/api/minhas-reservas', { headers: { Cookie: cookie } })).status, 200);
});
