import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { once } from 'node:events';
import pg from 'pg';
import { criarApp } from '../src/app.js';
import { criarRepositorioAutenticacao } from '../src/repositories/autenticacao.js';
import { hojeCivil, somarDias } from '../../js/datas.mjs';

test('PostgreSQL: perfis, isolamento dos três Centros e ciclo completo de reservas', {
    skip: process.env.RUN_POSTGRES_TESTS !== '1'
}, async t => {
    const schema = `teste_perfis_${randomUUID().replaceAll('-', '')}`;
    const config = { ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}), connectionTimeoutMillis: 5000 };
    const conexao = new pg.Pool(config);
    let banco, servidor, criado = false;
    const erros = [];
    try {
        await conexao.query(`CREATE SCHEMA "${schema}"`);
        criado = true;
        banco = new pg.Pool({ ...config, options: `-c search_path=${schema}`, max: 15 });
        for (const nome of (await readdir(new URL('../database/', import.meta.url))).filter(n => n.endsWith('.sql')).sort()) {
            await banco.query(await readFile(new URL(`../database/${nome}`, import.meta.url), 'utf8'));
        }
        const auth = criarRepositorioAutenticacao(banco);
        await auth.inicializarAdministrador('admin@teste.invalid', 'Senha123');
        servidor = criarApp(banco, (...args) => erros.push(args)).listen(0, '127.0.0.1');
        await once(servidor, 'listening');
        const base = `http://127.0.0.1:${servidor.address().port}`;
        async function api(path, cookie, dados, method = dados ? 'POST' : 'GET') {
            const r = await fetch(base + path, { method, redirect: 'manual',
                headers: { ...(cookie ? { Cookie: cookie } : {}), ...(dados ? { 'Content-Type': 'application/json' } : {}) },
                body: dados ? JSON.stringify(dados) : undefined });
            const body = r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.text();
            return { status: r.status, body, headers: r.headers };
        }
        async function login(email, senha = 'Senha123') {
            const r = await api('/api/auth/login', null, { email, senha });
            assert.equal(r.status, 200, JSON.stringify(r.body));
            return r.headers.get('set-cookie').split(';')[0];
        }
        const admin = await login('admin@teste.invalid');
        const coords = [], leitores = [], obras = [];
        await t.test('cadastro público aceita 8 caracteres, exige nascimento e Centro, e cria somente leitor', async () => {
            const dados = { nome:'Leitor teste',tipo:'Comunidade',dataNascimento:'2000-01-01',centroId:1,email:'invalido@teste.invalid',senha:'1234567' };
            assert.equal((await api('/api/cadastro-leitor',null,dados)).status,400);
            assert.equal((await api('/api/cadastro-leitor',null,{...dados,senha:'Senha123',dataNascimento:undefined})).status,400);
            for (let centroId=1;centroId<=3;centroId++) {
                const email=`leitor${centroId}@teste.invalid`;
                const r=await api('/api/cadastro-leitor',null,{...dados,centroId,email,senha:'Senha123',perfil:'admin'});
                assert.equal(r.status,201,JSON.stringify(r.body));
                const cookie=await login(email);
                const me=await api('/api/auth/me',cookie);
                assert.equal(me.body.perfil,'leitor'); assert.equal(me.body.centroId,centroId);
                leitores.push({cookie,id:me.body.leitorId});
            }
        });
        await t.test('administrador cadastra coordenadores de cada Centro; coordenador não cadastra administradores', async () => {
            for(let centroId=1;centroId<=3;centroId++) {
                const email=`coord${centroId}@teste.invalid`;
                const r=await api('/api/usuarios',admin,{nome:'Coordenador teste',email,senha:'Senha123',perfil:'coordenador',centroId});
                assert.equal(r.status,201,JSON.stringify(r.body));
                const cookie=await login(email);
                assert.equal((await api('/api/livros',cookie)).status,403); // senha temporária
                assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:'Senha123',novaSenha:'Nova1234'})).status,200);
                coords.push(cookie);
                assert.equal((await api('/api/usuarios',cookie)).status,403);
                assert.equal((await api('/api/usuarios',cookie,{nome:'Teste',email:'intruso@teste.invalid',senha:'Senha123',perfil:'admin'})).status,403);
            }
            // Mais de quatro coordenadores é permitido.
            for(let n=4;n<=6;n++) assert.equal((await api('/api/usuarios',admin,{nome:'Outro coordenador',email:`coord${n}@teste.invalid`,senha:'Senha123',perfil:'coordenador',centroId:1})).status,201);
        });
        await t.test('limite de quatro administradores permanece válido com cadastros simultâneos', async () => {
            const resultados=await Promise.all(Array.from({length:5},(_,i)=>api('/api/usuarios',admin,{nome:'Admin teste',email:`admin${i}@teste.invalid`,senha:'Senha123',perfil:'admin'})));
            assert.equal(resultados.filter(r=>r.status===201).length,3);
            assert.equal(resultados.filter(r=>r.status===409).length,2);
            assert.equal(Number((await banco.query("SELECT count(*) FROM usuarios WHERE perfil='admin'")).rows[0].count),4);
        });
        await t.test('acervo, leitores, Centros, Dashboard e páginas respeitam o perfil e o Centro', async () => {
            for(let i=0;i<3;i++) {
                const r=await api('/api/livros',coords[i],{titulo:`Obra do Centro ${i+1}`,autor:'Autora',categoria:'Literatura',centroId:i+1,quantidade:40});
                assert.equal(r.status,201,JSON.stringify(r.body));obras.push(r.body);
            }
            for(let i=0;i<3;i++) {
                const outro=(i+1)%3;
                assert.equal((await api('/dashboard.html',coords[i])).status,200);
                assert.equal((await api('/usuarios.html',coords[i])).status,302);
                assert.equal((await api('/api/centros',coords[i])).body.length,1);
                assert.deepEqual((await api('/api/leitores',coords[i])).body.map(l=>l.id),[leitores[i].id]);
                assert.equal((await api('/api/dashboard',coords[i])).body.totalLivros,1);
                const lista=await api('/api/livros',coords[i]);assert.equal(lista.body.length,1);
                assert.ok(lista.body[0].exemplares.every(e=>e.centroId===i+1));
                assert.equal((await api(`/api/livros/${obras[outro].id}`,coords[i])).status,404);
                assert.equal((await api(`/api/leitores/${leitores[outro].id}`,coords[i])).status,404);
                assert.equal((await api(`/api/leitores/${leitores[outro].id}/acesso`,coords[i],{senhaInicial:'Senha123'})).status,404);
                assert.equal((await api(`/api/exemplares/${obras[outro].exemplares[0].id}/baixa`,coords[i],{motivo:'Perda'})).status,404);
                assert.equal((await api(`/api/livros/${obras[outro].id}/exemplares`,coords[i],{centroId:i+1,quantidade:1})).status,404);
                const dados={nome:'Invasão',tipo:'Comunidade',centroId:i+1,dataNascimento:'2000-01-01'};
                assert.equal((await api(`/api/leitores/${leitores[outro].id}`,coords[i],dados,'PUT')).status,404);
                const catalogo=await api('/api/biblioteca',leitores[i].cookie);
                assert.equal(catalogo.body.length,1);assert.ok(catalogo.body[0].exemplares.every(e=>e.centroId===i+1));
                for(const path of ['/api/livros','/api/leitores','/api/dashboard','/api/usuarios','/api/reservas']) assert.equal((await api(path,leitores[i].cookie)).status,403);
            }
            assert.equal((await api('/api/centros',admin)).body.length,3);
            assert.equal((await api('/api/livros',admin)).body.length,3);
            assert.equal((await api('/api/usuarios',admin)).status,200);
        });
        let reserva;
        await t.test('reserva bloqueia uma cópia, ignora leitorId forjado e não inicia empréstimo', async () => {
            assert.equal((await api('/api/reservas',leitores[0].cookie,{exemplarId:obras[1].exemplares[0].id})).status,404);
            const r=await api('/api/reservas',leitores[0].cookie,{exemplarId:obras[0].exemplares[0].id,leitorId:leitores[1].id});
            assert.equal(r.status,201,JSON.stringify(r.body));reserva=r.body;
            assert.equal(reserva.leitorId,leitores[0].id);assert.equal(reserva.status,'Pendente');
            assert.equal(reserva.emprestimoId,null);
            assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=$1',[reserva.exemplarId])).rows[0].status,'Reservado');
            assert.equal((await api('/api/meus-emprestimos',leitores[0].cookie)).body.length,0);
            assert.equal((await api('/api/minhas-reservas',leitores[1].cookie)).body.length,0);
            assert.equal((await api('/api/reservas',coords[1])).body.length,0);
            assert.equal((await api(`/api/reservas/${reserva.id}/cancelar`,leitores[1].cookie,{})).status,404);
            assert.equal((await api(`/api/reservas/${reserva.id}/retirar`,coords[1],{})).status,404);
            assert.equal((await api(`/api/reservas/${reserva.id}/retirar`,leitores[0].cookie,{})).status,403);
            assert.equal((await api('/api/reservas',leitores[0].cookie,{exemplarId:reserva.exemplarId})).status,409);
        });
        await t.test('retirada confirmada no Centro cria apenas um empréstimo e inicia 30 dias na entrega', async () => {
            await banco.query("UPDATE reservas SET criada_em=now()-interval '7 days' WHERE id=$1",[reserva.id]);
            const r=await api(`/api/reservas/${reserva.id}/retirar`,coords[0],{});
            assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'Retirada');
            assert.equal(r.body.dataEmprestimo,hojeCivil());assert.equal(r.body.dataPrevistaDevolucao,somarDias(hojeCivil(),30));
            assert.equal((await api(`/api/reservas/${reserva.id}/retirar`,coords[0],{})).status,409);
            assert.equal((await api(`/api/reservas/${reserva.id}/cancelar`,leitores[0].cookie,{})).status,409);
            const historico=await api('/api/meus-emprestimos',leitores[0].cookie);assert.equal(historico.body.length,1);
            const id=historico.body[0].id;
            assert.equal((await api(`/api/emprestimos/${id}`,coords[1])).status,404);
            assert.equal((await api(`/api/emprestimos/${id}/devolucao`,coords[1],{versao:0,condicao:'Disponível'})).status,404);
            assert.equal((await api(`/api/emprestimos/${id}/renovacoes`,coords[1],{versao:0})).status,404);
        });
        await t.test('9 reservas + 1 empréstimo atingem 10; cancelar libera cópia e vaga', async () => {
            const resultados=await Promise.all(obras[0].exemplares.slice(1,11).map(e=>api('/api/reservas',leitores[0].cookie,{exemplarId:e.id})));
            assert.equal(resultados.filter(r=>r.status===201).length,9);
            assert.equal(resultados.filter(r=>r.status===409).length,1);
            assert.equal((await api('/api/emprestimos',coords[0],{leitorId:leitores[0].id,exemplarId:obras[0].exemplares[12].id})).status,409);
            const cancelar=resultados.find(r=>r.status===201).body;
            assert.equal((await api(`/api/reservas/${cancelar.id}/cancelar`,leitores[0].cookie,{})).status,200);
            assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=$1',[cancelar.exemplarId])).rows[0].status,'Disponível');
            assert.equal((await api(`/api/reservas/${cancelar.id}/cancelar`,leitores[0].cookie,{})).status,409);
            assert.equal((await api('/api/reservas',leitores[0].cookie,{exemplarId:cancelar.exemplarId})).status,201);
            assert.equal((await api('/api/reservas',leitores[0].cookie,{exemplarId:obras[0].exemplares[12].id})).status,409);
            const opcoes=await api('/api/emprestimos/opcoes',coords[0]);assert.equal(opcoes.body.leitores[0].abertos,10);
            // Converter uma reserva em retirada mantém o total em 10.
            const pendente=(await api('/api/reservas',coords[0])).body[0];
            assert.equal((await api(`/api/reservas/${pendente.id}/retirar`,coords[0],{})).status,200);
        });
        await t.test('onze reservas concorrentes não ultrapassam dez e mesma cópia não é reservada duas vezes', async () => {
            const resultados=await Promise.all(obras[1].exemplares.slice(0,11).map(e=>api('/api/reservas',leitores[1].cookie,{exemplarId:e.id})));
            assert.equal(resultados.filter(r=>r.status===201).length,10);assert.equal(resultados.filter(r=>r.status===409).length,1);
            const disputa=await Promise.all([1,2].map(()=>api('/api/reservas',leitores[2].cookie,{exemplarId:obras[2].exemplares[0].id})));
            assert.deepEqual(disputa.map(r=>r.status).sort(),[201,409]);
            const id=disputa.find(r=>r.status===201).body.id;
            const entrega=await Promise.all([1,2].map(()=>api(`/api/reservas/${id}/retirar`,coords[2],{})));
            assert.deepEqual(entrega.map(r=>r.status).sort(),[200,409]);
        });
        await t.test('coordenador edita sua obra sem alterar a descrição de outro Centro', async () => {
            const obra=await api(`/api/livros/${obras[0].id}/exemplares`,admin,{centroId:2,quantidade:1});assert.equal(obra.status,201);
            const atualizada=await api(`/api/livros/${obras[0].id}`,coords[0],{titulo:'Título só Maranhão',autor:'Autora',categoria:'Literatura'},'PUT');
            assert.equal(atualizada.status,200,JSON.stringify(atualizada.body));assert.notEqual(atualizada.body.id,obras[0].id);
            assert.ok(atualizada.body.exemplares.every(e=>e.centroId===1));
            assert.equal((await api(`/api/livros/${obras[0].id}`,coords[1])).body.titulo,'Obra do Centro 1');
        });
        assert.deepEqual(erros,[], 'Nenhum erro SQL inesperado');
    } finally {
        if (servidor) await new Promise(resolve => { servidor.close(resolve); servidor.closeAllConnections(); });
        if (banco) await banco.end();
        if (criado) await conexao.query(`DROP SCHEMA "${schema}" CASCADE`);
        await conexao.end();
    }
});
