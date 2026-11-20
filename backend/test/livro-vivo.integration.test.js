import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile,readdir } from 'node:fs/promises';
import { once } from 'node:events';
import pg from 'pg';
import { criarApp } from '../src/app.js';
import { criarRepositorioAutenticacao } from '../src/repositories/autenticacao.js';

test('Livro Vivo: transferência, isolamento, concorrência e retorno auditado', {skip:process.env.RUN_POSTGRES_TESTS!=='1'},async t=>{
    const schema='teste_livro_vivo_'+randomUUID().replaceAll('-','');
    const config={...(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{}),connectionTimeoutMillis:5000};
    const conexao=new pg.Pool(config);let banco,servidor,criado=false;const erros=[];
    try{
        await conexao.query(`CREATE SCHEMA "${schema}"`);criado=true;
        banco=new pg.Pool({...config,options:`-c search_path=${schema}`});
        for(const nome of (await readdir(new URL('../database/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())await banco.query(await readFile(new URL('../database/'+nome,import.meta.url),'utf8'));
        await criarRepositorioAutenticacao(banco).inicializarAdministrador('admin@teste.invalid','Senha123');
        for(const [perfil,centro] of [['coordenador',1],['coordenador',2],['coordenador',3],['professor',1],['funcionario',1]]){
            await banco.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,centro_id) SELECT $1,$2,senha_hash,$3,$4 FROM usuarios WHERE perfil='admin'`,[perfil+' '+centro,perfil+centro+'@teste.invalid',perfil,centro]);
        }
        await banco.query("UPDATE usuarios SET trocar_senha=false");
        await banco.query("INSERT INTO categorias(nome,centro_id) SELECT 'Literatura',id FROM centros");
        await banco.query("INSERT INTO livros(titulo,autor,categoria,centro_id) SELECT 'Livro teste','Autora','Literatura',id FROM centros ORDER BY id");
        await banco.query('INSERT INTO exemplares(livro_id,centro_id) SELECT 1,1 FROM generate_series(1,12)');
        await banco.query('INSERT INTO exemplares(livro_id,centro_id) VALUES(2,2),(3,3)');
        servidor=criarApp(banco,(...args)=>erros.push(args)).listen(0,'127.0.0.1');await once(servidor,'listening');
        const base='http://127.0.0.1:'+servidor.address().port;
        async function api(path,cookie,dados){const r=await fetch(base+path,{redirect:'manual',method:dados?'POST':'GET',headers:{...(cookie?{Cookie:cookie}:{}),...(dados?{'Content-Type':'application/json'}:{})},body:dados?JSON.stringify(dados):undefined});return {status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
        async function login(email){const r=await api('/api/auth/login',null,{email,senha:'Senha123'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
        const admin=await login('admin@teste.invalid'),coord=await login('coordenador1@teste.invalid'),outroCentro=await login('coordenador2@teste.invalid');
        const transferencia=(ids,modalidade='doacao')=>({exemplarIds:ids,modalidade,localidade:'Escola Comunidade'});
        let primeira;
        await t.test('rotas e menus permitidos somente a administrador/coordenador',async()=>{
            assert.equal((await api('/api/livro-vivo')).status,401);
            for(const perfil of ['professor','funcionario']){
                const cookie=await login(perfil+'1@teste.invalid');
                assert.equal((await api('/livroVivo.html',cookie)).status,302);
                for(const path of ['/api/livro-vivo','/api/livro-vivo/disponiveis'])assert.equal((await api(path,cookie)).status,403);
                assert.equal((await api('/api/livro-vivo',cookie,transferencia([1]))).status,403);
                assert.equal((await api('/api/livro-vivo/1/retorno',cookie,{exemplarIds:[1]})).status,403);
            }
            assert.equal((await api('/livroVivo.html',coord)).status,200);
            assert.equal((await api('/api/livro-vivo/disponiveis',admin)).body.length,14);
            assert.ok((await api('/api/livro-vivo/disponiveis',coord)).body.every(e=>e.centroId===1));
        });
        await t.test('validação, Centro e disponibilidade impedem baixas parciais',async()=>{
            for(const dados of [transferencia([]),transferencia([1,1]),transferencia([1],'invalida'),{...transferencia([1]),localidade:' '}])assert.equal((await api('/api/livro-vivo',coord,dados)).status,400);
            assert.equal((await api('/api/livro-vivo',coord,transferencia([13]))).status,404);
            assert.equal((await api('/api/livro-vivo',admin,transferencia([1,13]))).status,400);
            for(const status of ['Reservado','Emprestado','Danificado','Perdido']){
                await banco.query('UPDATE exemplares SET status=$1 WHERE id=2',[status]);
                assert.equal((await api('/api/livro-vivo',coord,transferencia([1,2]))).status,409);
                assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=1')).rows[0].status,'Disponível');
            }
            await banco.query("UPDATE exemplares SET status='Disponível' WHERE id=2");
            assert.equal((await banco.query('SELECT count(*)::integer AS n FROM livro_vivo_transferencias')).rows[0].n,0);
        });
        await t.test('quantidade é derivada dos exemplares e autorizador da sessão; baixa é atômica',async()=>{
            const r=await api('/api/livro-vivo',coord,{...transferencia([1,2]),quantidade:999,autorizadoPor:1,autorizadorNome:'Forjado'});
            assert.equal(r.status,201,JSON.stringify(r.body));primeira=r.body.id;assert.equal(r.body.quantidade,2);
            const lista=(await api('/api/livro-vivo',coord)).body;assert.equal(lista.length,1);assert.equal(lista[0].autorizadorNome,'coordenador 1');assert.equal(lista[0].quantidade,2);
            const copias=(await banco.query('SELECT status,baixa_motivo FROM exemplares WHERE id IN(1,2)')).rows;
            assert.ok(copias.every(e=>e.status==='Baixado'&&e.baixa_motivo==='doação livro vivo'));
            assert.ok(!(await api('/api/livro-vivo/disponiveis',coord)).body.some(e=>[1,2].includes(e.id)));
            assert.deepEqual((await api('/api/livro-vivo',outroCentro)).body,[]);
            assert.equal((await api('/api/livro-vivo/'+primeira+'/retorno',outroCentro,{exemplarIds:[1]})).status,404);
        });
        await t.test('retorno parcial preserva saída, registra responsável e libera somente a cópia recebida',async()=>{
            assert.equal((await api('/api/livro-vivo/'+primeira+'/retorno',coord,{exemplarIds:[1,3]})).status,404);
            assert.equal((await api('/api/livro-vivo/'+primeira+'/retorno',coord,{exemplarIds:[1]})).status,200);
            const h=(await api('/api/livro-vivo',coord)).body[0];assert.equal(h.quantidade,2);assert.equal(h.retornados,1);assert.equal(h.itens[0].recebedorNome,'coordenador 1');
            const e=(await banco.query('SELECT status,baixa_motivo,baixa_em FROM exemplares WHERE id=1')).rows[0];assert.deepEqual(e,{status:'Disponível',baixa_motivo:null,baixa_em:null});
            assert.equal((await api('/api/livro-vivo/'+primeira+'/retorno',coord,{exemplarIds:[1]})).status,409);
            assert.equal((await api('/api/livro-vivo',coord,transferencia([1],'doacao'))).status,201);
        });
        await t.test('doação permite retorno; concorrência não duplica transferência',async()=>{
            const respostas=await Promise.all([1,2].map(()=>api('/api/livro-vivo',coord,transferencia([3],'doacao'))));
            assert.deepEqual(respostas.map(r=>r.status).sort(),[201,409]);
            const id=respostas.find(r=>r.status===201).body.id;
            assert.equal((await api('/api/livro-vivo/'+id+'/retorno',admin,{exemplarIds:[3]})).status,200);
            assert.equal((await api('/api/livro-vivo',admin,transferencia([13],'doacao'))).status,201);
            assert.equal((await api('/api/livro-vivo',outroCentro)).body.length,1);
        });
        await t.test('histórico preserva nome e título após edições e retorno concorrente só ocorre uma vez',async()=>{
            await banco.query("UPDATE livros SET titulo='Título alterado' WHERE id=1");
            await banco.query("UPDATE usuarios SET nome='Nome alterado' WHERE perfil='coordenador' AND centro_id=1");
            const h=(await api('/api/livro-vivo',admin)).body.find(t=>t.id===primeira);
            assert.equal(h.autorizadorNome,'coordenador 1');assert.equal(h.itens[0].titulo,'Livro teste');
            const respostas=await Promise.all([1,2].map(()=>api('/api/livro-vivo/'+primeira+'/retorno',admin,{exemplarIds:[2]})));
            assert.deepEqual(respostas.map(r=>r.status).sort(),[200,409]);
        });
        assert.deepEqual(erros,[]);
    }finally{
        if(servidor)await new Promise(resolve=>{servidor.close(resolve);servidor.closeAllConnections();});
        if(banco)await banco.end();if(criado)await conexao.query(`DROP SCHEMA "${schema}" CASCADE`);await conexao.end();
    }
});

 test('migração converte modalidades antigas e permite retorno sem apagar histórico', {skip:process.env.RUN_POSTGRES_TESTS!=='1'},async()=>{
    const schema='teste_doacao_'+randomUUID().replaceAll('-','');
    const config={...(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{}),connectionTimeoutMillis:5000};
    const conexao=new pg.Pool(config);let banco,criado=false;
    try{
        await conexao.query(`CREATE SCHEMA "${schema}"`);criado=true;
        banco=new pg.Pool({...config,options:`-c search_path=${schema}`});
        for(const nome of (await readdir(new URL('../database/',import.meta.url))).filter(n=>n.endsWith('.sql')&&!n.startsWith('016')).sort())await banco.query(await readFile(new URL('../database/'+nome,import.meta.url),'utf8'));
        await criarRepositorioAutenticacao(banco).inicializarAdministrador('admin@teste.invalid','Senha123');
        await banco.query("INSERT INTO categorias(nome,centro_id) VALUES('Literatura',1)");
        await banco.query("INSERT INTO livros(titulo,autor,categoria,centro_id) VALUES('Obra','Autora','Literatura',1)");
        await banco.query("INSERT INTO exemplares(livro_id,centro_id,status,baixa_motivo,baixa_em) VALUES(1,1,'Baixado','doação livro vivo',now()),(1,1,'Baixado','doação livro vivo',now())");
        await banco.query("INSERT INTO livro_vivo_transferencias(centro_id,localidade,modalidade,autorizado_por,autorizador_nome) VALUES(1,'Escola A','definitiva',1,'Admin'),(1,'Escola B','possivel_devolucao',1,'Admin')");
        await banco.query("INSERT INTO livro_vivo_itens(transferencia_id,exemplar_id,titulo,codigo) SELECT id,id,'Obra',codigo FROM exemplares");
        await banco.query(await readFile(new URL('../database/016_livro_vivo_doacao.sql',import.meta.url),'utf8'));
        const registros=(await banco.query('SELECT modalidade,modalidade_anterior FROM livro_vivo_transferencias ORDER BY id')).rows;
        assert.deepEqual(registros,[{modalidade:'doacao',modalidade_anterior:'definitiva'},{modalidade:'doacao',modalidade_anterior:'possivel_devolucao'}]);
        assert.ok((await banco.query('SELECT status FROM exemplares')).rows.every(e=>e.status==='Baixado'));
        const {criarRepositorioLivroVivo}=await import('../src/repositories/livro-vivo.js');
        await criarRepositorioLivroVivo(banco,{id:1,perfil:'admin'}).retornar(1,{exemplarIds:[1]});
        assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=1')).rows[0].status,'Disponível');
        assert.equal((await banco.query('SELECT count(*)::integer AS n FROM livro_vivo_itens')).rows[0].n,2);
    }finally{if(banco)await banco.end();if(criado)await conexao.query(`DROP SCHEMA "${schema}" CASCADE`);await conexao.end();}
 });
