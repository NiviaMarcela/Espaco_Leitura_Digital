import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import pg from 'pg';
import { criarRepositorioCategorias } from '../src/repositories/categorias.js';
import { criarRepositorioAcervo } from '../src/repositories/acervo.js';

test('Categorias: migração de obra compartilhada, CRUD, isolamento e integridade', {skip:process.env.RUN_POSTGRES_TESTS!=='1'},async()=>{
    const schema='teste_categorias_'+randomUUID().replaceAll('-','');
    const config={...(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{}),connectionTimeoutMillis:5000};
    const conexao=new pg.Pool(config);let banco,criado=false;
    try{
        await conexao.query(`CREATE SCHEMA "${schema}"`);criado=true;
        banco=new pg.Pool({...config,options:`-c search_path=${schema}`});
        for(const nome of (await readdir(new URL('../database/',import.meta.url))).filter(n=>n.endsWith('.sql')&&!n.startsWith('015')).sort())await banco.query(await readFile(new URL('../database/'+nome,import.meta.url),'utf8'));
        await banco.query("INSERT INTO livros(titulo,autor,categoria) VALUES('Compartilhado','Autora',' Literatura ')");
        await banco.query('INSERT INTO exemplares(livro_id,centro_id) VALUES(1,1),(1,2)');
        const antes=(await banco.query('SELECT id,codigo FROM exemplares ORDER BY id')).rows;
        await banco.query(await readFile(new URL('../database/015_categorias_por_centro.sql',import.meta.url),'utf8'));
        assert.deepEqual((await banco.query('SELECT id,codigo FROM exemplares ORDER BY id')).rows,antes);
        const ma=criarRepositorioCategorias(banco,1),pi=criarRepositorioCategorias(banco,2),admin=criarRepositorioCategorias(banco);
        const cma=(await ma.listar())[0],cpi=(await pi.listar())[0];assert.notEqual(cma.id,cpi.id);assert.equal(cma.nome,'Literatura');
        await ma.editar(cma.id,{nome:'Literatura infantil'});
        assert.equal((await criarRepositorioAcervo(banco,1).listarLivros())[0].categoria,'Literatura infantil');
        assert.equal((await criarRepositorioAcervo(banco,2).listarLivros())[0].categoria,'Literatura');
        await assert.rejects(ma.editar(cpi.id,{nome:'Invadida'}),{status:404});
        await assert.rejects(ma.excluir(cpi.id),{status:404});
        await assert.rejects(ma.criar({nome:'Fora',centroId:2}),{status:403});
        await assert.rejects(ma.excluir(cma.id),{status:409});
        await assert.rejects(ma.criar({nome:' LITERATURA INFANTIL ',centroId:1}),{status:409});
        await assert.rejects(ma.criar({nome:' ',centroId:1}),{status:400});
        const nova=await ma.criar({nome:'Ciências',centroId:1});
        await admin.editar(nova.id,{nome:'Ciências naturais'});
        assert.ok((await ma.listar()).some(c=>c.nome==='Ciências naturais'));
        await ma.excluir(nova.id);assert.ok(!(await ma.listar()).some(c=>c.id===nova.id));
        const simultaneas=await Promise.allSettled([1,2].map(()=>ma.criar({nome:'Concorrente',centroId:1})));
        assert.equal(simultaneas.filter(r=>r.status==='fulfilled').length,1);
        assert.equal(simultaneas.find(r=>r.status==='rejected').reason.status,409);
        await assert.rejects(banco.query("UPDATE livros SET categoria='Sem cadastro' WHERE id=1"),{code:'23503'});
        await assert.rejects(banco.query('INSERT INTO exemplares(livro_id,centro_id) VALUES(1,3)'),{code:'23503'});
    }finally{if(banco)await banco.end();if(criado)await conexao.query(`DROP SCHEMA "${schema}" CASCADE`);await conexao.end();}
});
