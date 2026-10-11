import test from 'node:test';
import assert from 'node:assert/strict';
import { somarDias, hojeCivil } from '../../js/datas.mjs';
import { validarEmprestimo, validarRenovacao, validarDevolucao } from '../src/services/validation/index.js';
import { criarRepositorioEmprestimos } from '../src/repositories/emprestimos.js';
import { criarApp } from '../src/app.js';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import pg from 'pg';

test('prazo de 15 dias corridos atravessa mês, ano e fevereiro bissexto', () => {
    assert.equal(somarDias('2026-10-09', 15), '2026-10-24');
    assert.equal(somarDias('2026-12-25', 15), '2027-01-09');
    assert.equal(somarDias('2024-02-20', 15), '2024-03-06');
    assert.equal(somarDias('2025-02-20', 15), '2025-03-07');
});

test('empréstimo aceita apenas IDs inteiros e não aceita prazo imposto pelo cliente', () => {
    const base = { leitorId: 1, exemplarId: 2 };
    assert.deepEqual(validarEmprestimo({ ...base, dataPrevistaDevolucao: '2099-01-01' }), { ...base, observacao: null });
    for (const alteracao of [{ leitorId: 0 }, { exemplarId: '2' }, { leitorId: 1.5 }, { exemplarId: 2147483648 }, { observacao: 'x'.repeat(2001) }]) {
        assert.throws(() => validarEmprestimo({ ...base, ...alteracao }), { status: 400 });
    }
    for (const versao of [-1, 1.5, '0', undefined]) assert.throws(() => validarRenovacao({ versao }), { status: 400 });
    assert.deepEqual(validarRenovacao({ versao: 0 }), { versao: 0 });
});

test('devolução exige condição válida, versão e descrição dos danos', () => {
    assert.deepEqual(validarDevolucao({ versao: 0, condicao: 'Disponível' }), { versao: 0, condicao: 'Disponível', observacao: null });
    for (const body of [{ versao: 0, condicao: 'Perdido' }, { versao: 0, condicao: 'Danificado', observacao: ' ' },
        { condicao: 'Disponível' }, { versao: 0, condicao: 'Disponível', observacao: 'x'.repeat(2001) }]) {
        assert.throws(() => validarDevolucao(body), { status: 400 });
    }
});

test('PostgreSQL: empréstimos, renovações e devoluções atômicas', {
    skip: process.env.RUN_POSTGRES_TESTS !== '1'
}, async () => {
    const schema = `teste_emprestimos_${randomUUID().replaceAll('-', '')}`;
    const config = { ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}), connectionTimeoutMillis: 5000 };
    const admin = new pg.Pool(config);
    let banco, servidor;
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        banco = new pg.Pool({ ...config, options: `-c search_path=${schema}` });
        for (const arquivo of ['001_acervo.sql', '002_leitores.sql', '003_baixa_exemplares.sql', '004_emprestimos.sql', '005_devolucoes.sql']) {
            await banco.query(await readFile(new URL(`../database/${arquivo}`, import.meta.url), 'utf8'));
        }
        servidor = criarApp(banco, () => {}).listen(0, '127.0.0.1');
        await once(servidor, 'listening');
        const base = `http://127.0.0.1:${servidor.address().port}`;
        const enviar = async (path, dados) => {
            const r = await fetch(base + '/api' + path, { method: dados ? 'POST' : 'GET', headers: {'Content-Type':'application/json'}, body: dados ? JSON.stringify(dados) : undefined });
            return { status: r.status, body: await r.json() };
        };
        const leitores = [];
        for (const nome of ['Leitor A', 'Leitor B', 'Leitor C', 'Leitor D']) {
            const r = await enviar('/leitores', { nome, tipo: 'Comunidade', dataNascimento: '2000-01-01', centroId: 1 });
            assert.equal(r.status, 201); leitores.push(r.body.id);
        }
        const obra = await enviar('/livros', { titulo: 'Livro de teste', autor: 'Autora', categoria: 'Literatura', quantidade: 15, centroId: 1 });
        const exemplares = obra.body.exemplares.map(e => e.id);
        const criar = (leitorId, exemplarId) => enviar('/emprestimos', { leitorId, exemplarId });
        assert.equal((await enviar('/emprestimos', { leitorId: '1', exemplarId: 1 })).status, 400);
        assert.equal((await criar(99999, exemplares[0])).status, 404);
        assert.equal((await criar(leitores[0], 99999)).status, 404);
        await banco.query("UPDATE leitores SET status='Inativo' WHERE id=$1", [leitores[3]]);
        assert.equal((await criar(leitores[3], exemplares[0])).status, 409);
        for (const [indice, status] of [[10, 'Reservado'], [11, 'Danificado'], [12, 'Perdido']]) {
            await banco.query('UPDATE exemplares SET status=$2 WHERE id=$1', [exemplares[indice], status]);
            assert.equal((await criar(leitores[0], exemplares[indice])).status, 409);
        }
        assert.equal((await enviar(`/exemplares/${exemplares[13]}/baixa`, { motivo: 'Perda' })).status, 200);
        assert.equal((await criar(leitores[0], exemplares[13])).status, 409);

        // Seis cliques em cópias diferentes não podem ultrapassar cinco retiradas.
        const seis = await Promise.all(exemplares.slice(0, 6).map(id => criar(leitores[0], id)));
        assert.equal(seis.filter(r => r.status === 201).length, 5);
        assert.equal(seis.filter(r => r.status === 409).length, 1);
        const primeiro = seis.find(r => r.status === 201).body;
        assert.equal(primeiro.dataEmprestimo, hojeCivil());
        assert.equal(primeiro.dataPrevistaDevolucao, somarDias(hojeCivil(), 15));
        assert.equal((await enviar(`/exemplares/${primeiro.exemplarId}/baixa`, { motivo: 'Perda' })).status, 409);
        assert.equal((await enviar('/emprestimos/opcoes')).body.leitores.find(l => l.id === leitores[0]).abertos, 5);
        assert.equal((await enviar('/emprestimos/opcoes')).body.exemplares.some(e => e.id === primeiro.exemplarId), false);
        const disponiveis = (await enviar(`/livros/${obra.body.id}`)).body.exemplares.filter(e => e.status === 'Emprestado');
        assert.equal(disponiveis.length, 5);

        // Dois leitores disputam a mesma cópia: só um registro pode ser criado.
        const disputa = await Promise.all([criar(leitores[1], exemplares[6]), criar(leitores[2], exemplares[6])]);
        assert.deepEqual(disputa.map(r => r.status).sort(), [201, 409]);
        const mesmoDia = await enviar(`/emprestimos/${primeiro.id}/renovacoes`, { versao: 0 });
        assert.equal(mesmoDia.status, 409);
        assert.equal((await enviar('/emprestimos/99999')).status, 404);
        assert.equal((await enviar('/emprestimos/99999/renovacoes', { versao: 0 })).status, 404);

        // Relógio controlado para testar prazo exato, atraso e renovação sem mudar o Windows.
        let data = '2026-02-20';
        const repo = criarRepositorioEmprestimos(banco, () => data);
        const historico = await repo.criar({ leitorId: leitores[1], exemplarId: exemplares[7], observacao: 'Teste de relógio' });
        assert.equal(historico.dataPrevistaDevolucao, '2026-03-07');
        data = '2026-03-07';
        assert.equal((await repo.buscar(historico.id)).status, 'Emprestado');
        data = '2026-03-08';
        assert.equal((await repo.buscar(historico.id)).status, 'Atrasado');
        const renovadas = await Promise.allSettled([repo.renovar(historico.id, { versao: 0 }), repo.renovar(historico.id, { versao: 0 })]);
        assert.equal(renovadas.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(renovadas.find(r => r.status === 'rejected').reason.status, 409);
        const renovado = await repo.buscar(historico.id);
        assert.equal(renovado.dataPrevistaDevolucao, '2026-03-23');
        assert.equal(renovado.dataEmprestimo, '2026-02-20');
        assert.equal(renovado.status, 'Emprestado');
        assert.equal(renovado.renovacoes.length, 1);
        assert.equal(renovado.renovacoes[0].dataAnterior, '2026-03-07');
        assert.equal(renovado.renovacoes[0].novaData, '2026-03-23');
        assert.equal(renovado.exemplarId, historico.exemplarId);

        // A rota HTTP também renova e devolve o novo histórico completo.
        const httpRenovado = await enviar(`/emprestimos/${historico.id}/renovacoes`, { versao: 1 });
        assert.equal(httpRenovado.status, 200);
        assert.equal(httpRenovado.body.dataPrevistaDevolucao, somarDias(hojeCivil(), 15));
        assert.equal(httpRenovado.body.renovacoes.length, 2);
        await banco.query("UPDATE leitores SET status='Inativo' WHERE id=$1", [leitores[1]]);
        data = '2027-01-01';
        await assert.rejects(repo.renovar(historico.id, { versao: 2 }), { status: 409 });
        await banco.query("UPDATE leitores SET status='Ativo' WHERE id=$1", [leitores[1]]);
        const devolvidoHistorico = await repo.devolver(historico.id, { versao: 2, condicao: 'Disponível', observacao: null });
        assert.equal(devolvidoHistorico.status, 'Devolvido');
        assert.equal(devolvidoHistorico.devolucao.condicao, 'Disponível');
        assert.equal(devolvidoHistorico.renovacoes.length, 2);
        await assert.rejects(repo.renovar(historico.id, { versao: 2 }), { status: 409 });

        // Registro encerrado deixa de ocupar vaga (prepara a integração com devoluções).
        const primeiraDevolucao = await enviar(`/emprestimos/${primeiro.id}/devolucao`, { versao: 0, condicao: 'Disponível' });
        assert.equal(primeiraDevolucao.status, 200);
        assert.equal(primeiraDevolucao.body.dataDevolucao, hojeCivil());
        assert.equal(primeiraDevolucao.body.devolucao.diasAtraso, 0);
        assert.equal((await enviar('/emprestimos/opcoes')).body.leitores.find(l => l.id === leitores[0]).abertos, 4);
        assert.equal((await criar(leitores[0], primeiro.exemplarId)).status, 201);
        assert.equal((await enviar('/emprestimos/opcoes')).body.leitores.find(l => l.id === leitores[0]).abertos, 5);
        assert.equal((await enviar(`/emprestimos/${primeiro.id}/devolucao`, { versao: 1, condicao: 'Disponível' })).status, 409);
        // O reenvio do empréstimo antigo não pode liberar a cópia agora emprestada de novo.
        assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=$1', [primeiro.exemplarId])).rows[0].status, 'Emprestado');
        assert.equal((await enviar('/emprestimos/99999/devolucao', { versao: 0, condicao: 'Disponível' })).status, 404);

        data = '2026-10-01';
        const atrasoTeste = await repo.criar({ leitorId: leitores[2], exemplarId: exemplares[9], observacao: null });
        data = '2026-10-20';
        await assert.rejects(repo.devolver(atrasoTeste.id, { versao: 99, condicao: 'Disponível' }), { status: 409 });
        await banco.query("UPDATE leitores SET status='Inativo' WHERE id=$1", [leitores[2]]);
        const devolucoesSimultaneas = await Promise.allSettled([repo.devolver(atrasoTeste.id, { versao: 0, condicao: 'Danificado', observacao: 'Páginas rasgadas' }), repo.devolver(atrasoTeste.id, { versao: 0, condicao: 'Disponível', observacao: null })]);
        assert.equal(devolucoesSimultaneas.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(devolucoesSimultaneas.find(r => r.status === 'rejected').reason.status, 409);
        const resultadoDevolucao = await repo.buscar(atrasoTeste.id);
        assert.equal(resultadoDevolucao.devolucao.diasAtraso, 4);
        assert.equal(resultadoDevolucao.dataDevolucao, '2026-10-20');
        assert.equal((await banco.query('SELECT count(*)::int AS total FROM devolucoes WHERE emprestimo_id=$1', [atrasoTeste.id])).rows[0].total, 1);
        data = '2026-11-01';
        assert.equal((await repo.buscar(atrasoTeste.id)).devolucao.diasAtraso, 4);
        await banco.query("UPDATE leitores SET status='Ativo' WHERE id=$1", [leitores[2]]);

        // Renovação e devolução da mesma versão não podem ser confirmadas juntas.
        data = '2026-10-01';
        const disputaOperacoes = await repo.criar({ leitorId: leitores[2], exemplarId: exemplares[14], observacao: null });
        data = '2026-10-05';
        const corrida = await Promise.allSettled([repo.renovar(disputaOperacoes.id, { versao: 0 }), repo.devolver(disputaOperacoes.id, { versao: 0, condicao: 'Disponível', observacao: null })]);
        assert.equal(corrida.filter(r => r.status === 'fulfilled').length, 1);
        assert.equal(corrida.find(r => r.status === 'rejected').reason.status, 409);
        let atual = await repo.buscar(disputaOperacoes.id);
        if (atual.dataDevolucao) {
            atual = await repo.criar({ leitorId: leitores[2], exemplarId: exemplares[14], observacao: null });
        }
        await banco.query(`ALTER TABLE exemplares ADD CONSTRAINT falha_devolucao_teste CHECK (id <> ${exemplares[14]} OR status <> 'Danificado')`);
        await assert.rejects(repo.devolver(atual.id, { versao: atual.versao, condicao: 'Danificado', observacao: 'Dano teste' }));
        assert.equal((await repo.buscar(atual.id)).dataDevolucao, null);
        assert.equal((await banco.query('SELECT count(*)::int AS total FROM devolucoes WHERE emprestimo_id=$1', [atual.id])).rows[0].total, 0);
        assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=$1', [exemplares[14]])).rows[0].status, 'Emprestado');
        await banco.query('ALTER TABLE exemplares DROP CONSTRAINT falha_devolucao_teste');
        const danificado = await repo.devolver(atual.id, { versao: atual.versao, condicao: 'Danificado', observacao: 'Capa rasgada' });
        assert.equal(danificado.devolucao.condicao, 'Danificado');
        assert.equal(danificado.devolucao.observacao, 'Capa rasgada');
        assert.equal((await enviar('/emprestimos/opcoes')).body.exemplares.some(e => e.id === exemplares[14]), false);
        await assert.rejects(repo.criar({ leitorId: leitores[2], exemplarId: exemplares[14], observacao: null }), { status: 409 });

        // Falha depois do INSERT deve reverter também o empréstimo inteiro.
        await banco.query("ALTER TABLE exemplares ADD CONSTRAINT falha_teste CHECK (id <> " + exemplares[8] + " OR status <> 'Emprestado')");
        const antes = (await banco.query('SELECT count(*)::integer AS total FROM emprestimos')).rows[0].total;
        assert.equal((await criar(leitores[2], exemplares[8])).status, 500);
        assert.equal((await banco.query('SELECT count(*)::integer AS total FROM emprestimos')).rows[0].total, antes);
        assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=$1', [exemplares[8]])).rows[0].status, 'Disponível');
    } finally {
        if (servidor) await new Promise(resolve => { servidor.close(resolve); servidor.closeAllConnections(); });
        if (banco) await banco.end();
        if (/^teste_emprestimos_[a-f0-9]{32}$/.test(schema)) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.end();
    }
});
