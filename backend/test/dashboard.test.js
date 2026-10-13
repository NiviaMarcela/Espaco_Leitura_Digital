import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { criarRepositorioDashboard } from '../src/repositories/dashboard.js';

test('PostgreSQL: Dashboard conta obras, cópias, leitores e atrasos e limita recentes', {
    skip: process.env.RUN_POSTGRES_TESTS !== '1'
}, async () => {
    const schema = `teste_dashboard_${randomUUID().replaceAll('-', '')}`;
    const config = { ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}), connectionTimeoutMillis: 5000 };
    const admin = new pg.Pool(config);
    let banco, criado = false;
    try {
        await admin.query(`CREATE SCHEMA "${schema}"`);
        criado = true;
        banco = new pg.Pool({ ...config, options: `-c search_path=${schema}` });
        for (const nome of ['001_acervo.sql', '002_leitores.sql', '003_baixa_exemplares.sql', '004_emprestimos.sql']) {
            await banco.query(await readFile(new URL(`../database/${nome}`, import.meta.url), 'utf8'));
        }
        const repo = criarRepositorioDashboard(banco, () => '2026-10-12');
        assert.deepEqual(await repo.consultar(), { totalLivros: 0, leitoresAtivos: 0, exemplaresDisponiveis: 0,
            emprestimosAbertos: 0, emprestimosAtrasados: 0, recentes: [] });
        await banco.query(`INSERT INTO livros(titulo, autor, categoria) VALUES ('Obra A','Autora','Literatura'), ('Obra B','Autor','Literatura');
            INSERT INTO leitores(nome, tipo, data_nascimento, centro_id, status) VALUES
                ('Ativo','Comunidade','2000-01-01',1,'Ativo'), ('Inativo','Comunidade','2000-01-01',2,'Inativo');
            INSERT INTO exemplares(livro_id, centro_id) SELECT 1, CASE WHEN n % 2=0 THEN 2 ELSE 1 END FROM generate_series(1,11) n;
            UPDATE exemplares SET status='Emprestado' WHERE id IN (5,6);
            UPDATE exemplares SET status='Danificado' WHERE id=8;
            UPDATE exemplares SET status='Reservado' WHERE id=9;
            UPDATE exemplares SET status='Perdido' WHERE id=10;
            UPDATE exemplares SET status='Baixado', baixa_motivo='Doação', baixa_em=now() WHERE id=11;
            INSERT INTO emprestimos(leitor_id, exemplar_id, data_emprestimo, data_prevista_devolucao, data_devolucao)
                SELECT 1, n, '2026-10-01'::date, '2026-10-05'::date, '2026-10-06'::date FROM generate_series(1,4) n;
            INSERT INTO emprestimos(leitor_id, exemplar_id, data_emprestimo, data_prevista_devolucao) VALUES
                (1,5,'2026-10-02','2026-10-11'), (2,6,'2026-10-03','2026-10-12'), (1,7,'2026-10-03','2026-11-02');`);
        // A cópia 7 tem status inconsistente de propósito: a retirada aberta impede disponibilidade.
        const resultado = await repo.consultar();
        assert.equal(resultado.totalLivros, 2);
        assert.equal(resultado.exemplaresDisponiveis, 4);
        assert.equal(resultado.leitoresAtivos, 1);
        assert.equal(resultado.emprestimosAbertos, 3);
        assert.equal(resultado.emprestimosAtrasados, 1);
        assert.deepEqual(resultado.recentes.map(p => p.id), [7,6,5,4,3]);
        assert.deepEqual(resultado.recentes.map(p => p.status), ['Emprestado','Emprestado','Atrasado','Devolvido','Devolvido']);
        assert.equal(resultado.recentes[1].centro, 'CE Piauí');
        assert.equal(resultado.recentes[1].leitor, 'Inativo');
        assert.equal(resultado.recentes[1].dataPrevistaDevolucao, '2026-10-12');
        // Renovar tira do atraso; devolver tira de abertos sem depender do status do leitor.
        await banco.query("UPDATE emprestimos SET data_prevista_devolucao='2026-11-11' WHERE id=5");
        assert.equal((await repo.consultar()).emprestimosAtrasados, 0);
        await banco.query("UPDATE emprestimos SET data_devolucao='2026-10-12' WHERE id=6; UPDATE exemplares SET status='Disponível' WHERE id=6");
        const depois = await repo.consultar();
        assert.equal(depois.emprestimosAbertos, 2);
        assert.equal(depois.exemplaresDisponiveis, 5);
        assert.equal(depois.recentes.find(p => p.id === 6).status, 'Devolvido');
    } finally {
        if (banco) await banco.end();
        if (criado && /^teste_dashboard_[a-f0-9]{32}$/.test(schema)) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
    }
});
