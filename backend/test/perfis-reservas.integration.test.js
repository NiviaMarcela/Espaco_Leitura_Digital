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
            const dados = { nome:'Leitor teste',tipo:'Comunidade',dataNascimento:'2000-01-01',centroId:1,
                telefone:'85999999999',email:'invalido@teste.invalid',senha:'1234567' };
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
                const dados={nome:'Invasão',tipo:'Comunidade',centroId:i+1,dataNascimento:'2000-01-01',telefone:'85999999999',email:'invasao@teste.invalid'};
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
            assert.equal(reserva.dataLimiteRetirada,somarDias(reserva.dataReserva,7));
            assert.equal(reserva.dataPrevistaDevolucao,somarDias(reserva.dataReserva,30));
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
        await t.test('retirada confirmada mantém a devolução prevista 30 dias após a reserva', async () => {
            await banco.query("UPDATE reservas SET criada_em=($2::date::timestamp AT TIME ZONE 'America/Fortaleza') WHERE id=$1",
                [reserva.id,somarDias(hojeCivil(),-7)]);
            const reservaAtual=(await api('/api/minhas-reservas',leitores[0].cookie)).body.find(item=>item.id===reserva.id);
            assert.equal(reservaAtual.dataLimiteRetirada,hojeCivil());
            const r=await api(`/api/reservas/${reserva.id}/retirar`,coords[0],{});
            assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.status,'Retirada');
            assert.equal(r.body.dataEmprestimo,hojeCivil());
            assert.equal(r.body.dataPrevistaDevolucao,somarDias(reservaAtual.dataReserva,30));
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
        await t.test('reserva sem retirada após 7 dias libera a cópia automaticamente', async () => {
            const exemplarId=obras[2].exemplares[1].id;
            const criada=await api('/api/reservas',leitores[2].cookie,{exemplarId});
            assert.equal(criada.status,201,JSON.stringify(criada.body));
            await banco.query("UPDATE reservas SET criada_em=($2::date::timestamp AT TIME ZONE 'America/Fortaleza') WHERE id=$1",
                [criada.body.id,somarDias(hojeCivil(),-8)]);
            const opcoes=await api('/api/emprestimos/opcoes',coords[2]);
            assert.equal(opcoes.status,200,JSON.stringify(opcoes.body));
            assert.ok(opcoes.body.exemplares.some(item=>item.id===exemplarId));
            assert.equal((await banco.query('SELECT status FROM reservas WHERE id=$1',[criada.body.id])).rows[0].status,'Cancelada');
            assert.equal((await banco.query('SELECT status FROM exemplares WHERE id=$1',[exemplarId])).rows[0].status,'Disponível');
            assert.equal((await api('/api/reservas',leitores[2].cookie,{exemplarId})).status,201);
        });
        await t.test('coordenador edita sua obra sem alterar a descrição de outro Centro', async () => {
            const obra=await api(`/api/livros/${obras[0].id}/exemplares`,admin,{centroId:2,quantidade:1});assert.equal(obra.status,201);
            const atualizada=await api(`/api/livros/${obras[0].id}`,coords[0],{titulo:'Título só Maranhão',autor:'Autora',categoria:'Literatura'},'PUT');
            assert.equal(atualizada.status,200,JSON.stringify(atualizada.body));assert.notEqual(atualizada.body.id,obras[0].id);
            assert.ok(atualizada.body.exemplares.every(e=>e.centroId===1));
            assert.equal((await api(`/api/livros/${obras[0].id}`,coords[1])).body.titulo,'Obra do Centro 1');
        });
        const pessoal={nome:'Pessoa da equipe',tipo:'Funcionário',dataNascimento:'1990-01-01',telefone:'85999999999',centroId:1};
        let adminLeitor;
        await t.test('cadastro pessoal é único, preserva perfil e impede Centro forjado pelo coordenador', async () => {
            assert.deepEqual((await api('/api/minhas-reservas',admin)).body,[]);
            assert.deepEqual((await api('/api/meus-emprestimos',admin)).body,[]);
            assert.equal((await api('/api/reservas',admin,{exemplarId:obras[0].exemplares[30].id})).status,409);
            assert.equal((await api('/api/meu-cadastro-emprestimos',coords[0],{...pessoal,centroId:2})).status,403);
            const resultados=await Promise.all([api('/api/meu-cadastro-emprestimos',admin,pessoal),api('/api/meu-cadastro-emprestimos',admin,pessoal)]);
            assert.deepEqual(resultados.map(r=>r.status).sort(),[201,409]);
            const me=(await api('/api/auth/me',admin)).body;adminLeitor=me.leitorId;
            assert.equal(me.perfil,'admin');assert.ok(adminLeitor);
            assert.equal((await api('/api/meu-cadastro-emprestimos',coords[0],pessoal)).status,201);
            assert.equal((await api('/api/auth/me',coords[0])).body.perfil,'coordenador');
        });
        await t.test('todos os perfis reservam; administrador usa três Centros e histórico pessoal isolado', async () => {
            const minhas=[];
            for(let i=0;i<3;i++) {
                const r=await api('/api/reservas',admin,{exemplarId:obras[i].exemplares[30].id,leitorId:leitores[0].id});
                assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.leitorId,adminLeitor);minhas.push(r.body);
            }
            assert.equal((await api('/api/minhas-reservas',admin)).body.length,3);
            assert.deepEqual((await api('/api/minhas-reservas',coords[0])).body,[]);
            assert.equal((await api('/api/reservas',coords[0],{exemplarId:obras[1].exemplares[31].id})).status,404);
            const propria=await api('/api/reservas',coords[0],{exemplarId:obras[0].exemplares[31].id});
            assert.equal(propria.status,201,JSON.stringify(propria.body));
            assert.equal((await api('/api/minhas-reservas',coords[0])).body.length,1);
            assert.ok((await api('/api/reservas',coords[0])).body.length>1);
            assert.equal((await api('/meusEmprestimos.html',admin)).status,200);
            assert.equal((await api('/meusEmprestimos.html',coords[0])).status,200);
            assert.equal((await api('/api/reservas/'+minhas[1].id+'/retirar',coords[0],{})).status,404);
            assert.equal((await api('/api/reservas/'+minhas[1].id+'/retirar',coords[1],{})).status,200);
            assert.equal((await api('/api/meus-emprestimos',admin)).body.length,1);
            const extras=await Promise.all(obras[2].exemplares.slice(31,39).map(e=>api('/api/reservas',admin,{exemplarId:e.id})));
            assert.equal(extras.filter(r=>r.status===201).length,7);assert.equal(extras.filter(r=>r.status===409).length,1);
            assert.equal((await api('/api/reservas/'+minhas[0].id+'/cancelar',admin,{})).status,200);
            assert.equal((await api('/api/reservas/'+propria.body.id+'/cancelar',coords[0],{})).status,200);
        });
        await t.test('gestão de leitores não permite alterar conta ou senha da equipe', async () => {
            assert.equal((await api('/api/leitores/'+adminLeitor+'/acesso',coords[0],{senhaInicial:'Invasao123'})).status,403);
            assert.equal((await api('/api/leitores/'+adminLeitor,coords[0],{...pessoal,status:'Ativo',email:'roubo@teste.invalid'},'PUT')).status,403);
            assert.ok(await login('admin@teste.invalid'));
        });
        await t.test('cadastro administrativo com senha cria acesso atomicamente e exige troca inicial', async () => {
            const dados={...pessoal,tipo:'Aluno',email:'novo@teste.invalid',status:'Ativo',senhaInicial:'Inicial123'};
            const antes=Number((await banco.query('SELECT count(*) FROM leitores')).rows[0].count);
            assert.equal((await api('/api/leitores',coords[0],{...dados,senhaInicial:'curta'})).status,400);
            assert.equal((await api('/api/leitores',coords[0],{...dados,email:'admin@teste.invalid'})).status,409);
            assert.equal(Number((await banco.query('SELECT count(*) FROM leitores')).rows[0].count),antes);
            assert.equal((await api('/api/leitores',coords[0],{...dados,centroId:2})).status,403);
            const r=await api('/api/leitores',coords[0],dados);assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(r.body.temAcesso,true);
            assert.equal(r.body.senhaInicial,undefined);assert.equal(r.body.senha_hash,undefined);
            const cookie=await login(dados.email,dados.senhaInicial);
            assert.equal((await api('/api/auth/me',cookie)).body.trocarSenha,true);
            assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:'Inicial123',novaSenha:'Definitiva123'})).status,200);
            assert.equal((await api('/api/minhas-reservas',cookie)).status,200);
            const sem=await api('/api/leitores',coords[0],{...dados,email:'sem@teste.invalid',senhaInicial:''});
            assert.equal(sem.status,201);assert.equal(sem.body.temAcesso,false);
        });
        await t.test('professores operam as cinco áreas somente no próprio Centro', async () => {
            const baseProfessor={nome:'Professor teste',perfil:'professor',senha:'Senha123'};
            assert.equal((await api('/api/usuarios',admin,{...baseProfessor,email:'semcentro@teste.invalid'})).status,400);
            for(let centroId=1;centroId<=3;centroId++) {
                const email='professor'+centroId+'@teste.invalid';
                assert.equal((await api('/api/usuarios',admin,{...baseProfessor,email,centroId})).status,201);
                const cookie=await login(email);
                assert.equal((await api('/api/livros',cookie)).status,403);
                assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:'Senha123',novaSenha:'Professor123'})).status,200);
                const me=(await api('/api/auth/me',cookie)).body;
                assert.equal(me.perfil,'professor');assert.equal(me.centroId,centroId);
                for(const pagina of ['biblioteca','acervo','leitores','emprestimos','devolucoes','meusEmprestimos']) assert.equal((await api('/'+pagina+'.html',cookie)).status,200);
                for(const path of ['/api/dashboard','/api/usuarios']) assert.equal((await api(path,cookie)).status,403);
                for(const pagina of ['dashboard','usuarios']) {
                    const r=await api('/'+pagina+'.html',cookie);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/biblioteca.html');
                }
                assert.equal((await api('/api/usuarios',cookie,{...baseProfessor,email:'negado@teste.invalid',centroId})).status,403);
                assert.ok((await api('/api/leitores',cookie)).body.every(l=>l.centroId===centroId));
                const outro=centroId%3;
                assert.equal((await api('/api/leitores/'+leitores[outro].id,cookie)).status,404);
                assert.equal((await api('/api/livros/'+obras[outro].id,cookie)).status,404);
                assert.ok((await api('/api/biblioteca',cookie)).body.every(l=>l.exemplares.every(e=>e.centroId===centroId)));
                assert.equal((await api('/api/meu-cadastro-emprestimos',cookie,{...pessoal,tipo:'Professor',centroId:outro+1})).status,403);
                assert.equal((await api('/api/meu-cadastro-emprestimos',cookie,{...pessoal,tipo:'Professor',centroId})).status,201);
                const obra=await api('/api/livros',cookie,{titulo:'Livro do professor',autor:'Autora',categoria:'Literatura',centroId,quantidade:2});
                assert.equal(obra.status,201,JSON.stringify(obra.body));
                assert.equal((await api('/api/livros',cookie,{titulo:'Fora',autor:'Autora',categoria:'Literatura',centroId:outro+1,quantidade:1})).status,403);
                const leitor=await api('/api/leitores',cookie,{...pessoal,centroId,tipo:'Aluno',email:'alunoprof'+centroId+'@teste.invalid',status:'Ativo',senhaInicial:'Senha123'});
                assert.equal(leitor.status,201,JSON.stringify(leitor.body));
                const reserva=await api('/api/reservas',cookie,{exemplarId:obra.body.exemplares[0].id});
                assert.equal(reserva.status,201,JSON.stringify(reserva.body));
                assert.equal((await api('/api/minhas-reservas',cookie)).body.length,1);
                assert.equal((await api('/api/reservas',cookie,{exemplarId:obras[outro].exemplares[39].id})).status,404);
                const retirada=await api('/api/reservas/'+reserva.body.id+'/retirar',cookie,{});
                assert.equal(retirada.status,200,JSON.stringify(retirada.body));
                assert.equal((await api('/api/emprestimos/'+retirada.body.emprestimoId+'/devolucao',cookie,{versao:0,condicao:'Disponível'})).status,200);
                const direto=await api('/api/emprestimos',cookie,{leitorId:leitor.body.id,exemplarId:obra.body.exemplares[1].id});
                assert.equal(direto.status,201,JSON.stringify(direto.body));
                assert.equal((await api('/api/emprestimos/'+direto.body.id+'/devolucao',coords[outro],{versao:0,condicao:'Disponível'})).status,404);
                assert.equal((await api('/api/emprestimos/'+direto.body.id+'/devolucao',cookie,{versao:0,condicao:'Disponível'})).status,200);
                assert.equal((await api('/api/leitores/'+adminLeitor+'/acesso',cookie,{senhaInicial:'Invasao123'})).status,centroId===1?403:404);
            }
        });
        await t.test('administrador edita, inativa, reativa e redefine senha sem perder histórico', async () => {
            const criado=await api('/api/usuarios',admin,{nome:'Conta editável',email:'editar@teste.invalid',senha:'Inicial123',perfil:'professor',centroId:1});
            assert.equal(criado.status,201);const id=criado.body.id;
            let cookie=await login('editar@teste.invalid','Inicial123');
            assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:'Inicial123',novaSenha:'Atual1234'})).status,200);
            const dados={nome:'Nome atualizado',email:'editado@teste.invalid',centroId:2};
            for(const ator of [coords[0],cookie,leitores[0].cookie]) {
                assert.equal((await api('/api/usuarios/'+id,ator,dados,'PUT')).status,403);
                assert.equal((await api('/api/usuarios/'+id+'/status',ator,{ativo:false},'PATCH')).status,403);
                assert.equal((await api('/api/usuarios/'+id+'/senha',ator,{senha:'Outra123'})).status,403);
            }
            assert.equal((await api('/api/usuarios/'+id,admin,{...dados,email:'admin@teste.invalid'},'PUT')).status,409);
            assert.equal((await api('/api/auth/me',cookie)).status,200);
            assert.equal((await api('/api/usuarios/'+id,admin,{...dados,perfil:'admin'},'PUT')).status,400);
            assert.equal((await api('/api/usuarios/'+id,admin,dados,'PUT')).status,200);
            assert.equal((await api('/api/auth/me',cookie)).status,401);
            cookie=await login(dados.email,'Atual1234');
            assert.equal((await api('/api/auth/me',cookie)).body.centroId,2);
            assert.equal((await api('/api/meu-cadastro-emprestimos',cookie,{...pessoal,centroId:2})).status,201);
            const vinculo=(await api('/api/auth/me',cookie)).body.leitorId;
            const reserva=await api('/api/reservas',cookie,{exemplarId:obras[1].exemplares[39].id});assert.equal(reserva.status,201);
            assert.equal((await api('/api/usuarios/'+id,admin,{...dados,centroId:3},'PUT')).status,409);
            assert.equal((await api('/api/usuarios/'+id+'/status',admin,{ativo:'false'},'PATCH')).status,400);
            assert.equal((await api('/api/usuarios/'+id+'/status',admin,{ativo:false},'PATCH')).status,200);
            assert.equal((await api('/api/auth/me',cookie)).status,401);
            assert.equal((await api('/api/auth/login',null,{email:dados.email,senha:'Atual1234'})).status,401);
            assert.equal((await api('/api/usuarios/'+id+'/senha',admin,{senha:'curta'})).status,400);
            assert.equal((await api('/api/usuarios/'+id+'/senha',admin,{senha:'Temporaria123'})).status,200);
            assert.equal((await api('/api/auth/login',null,{email:dados.email,senha:'Temporaria123'})).status,401);
            assert.equal((await banco.query('SELECT status FROM reservas WHERE id=$1',[reserva.body.id])).rows[0].status,'Pendente');
            assert.equal((await api('/api/usuarios/'+id+'/status',admin,{ativo:true},'PATCH')).status,200);
            assert.equal((await api('/api/auth/me',cookie)).status,401);
            assert.equal((await api('/api/auth/login',null,{email:dados.email,senha:'Atual1234'})).status,401);
            cookie=await login(dados.email,'Temporaria123');
            assert.equal((await api('/api/auth/me',cookie)).body.trocarSenha,true);
            assert.equal((await api('/api/leitores',cookie)).status,403);
            assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:'Temporaria123',novaSenha:'Definitiva123'})).status,200);
            assert.equal((await api('/api/minhas-reservas',cookie)).body[0].id,reserva.body.id);
            assert.equal((await api('/api/reservas/'+reserva.body.id+'/cancelar',cookie,{})).status,200);
            assert.equal((await api('/api/usuarios/'+id,admin,{...dados,nome:'Nome final',centroId:3},'PUT')).status,200);
            const leitor=(await api('/api/leitores/'+vinculo,admin)).body;assert.equal(leitor.nome,'Nome final');assert.equal(leitor.centroId,3);assert.equal(leitor.email,dados.email);
            const adminId=(await api('/api/auth/me',admin)).body.id;
            assert.equal((await api('/api/usuarios/'+adminId+'/status',admin,{ativo:false},'PATCH')).status,409);
            assert.equal((await api('/api/usuarios/999999/status',admin,{ativo:false},'PATCH')).status,404);
            assert.equal((await api('/api/usuarios/0/senha',admin,{senha:'Temporaria123'})).status,400);
            const contaLeitor=(await api('/api/auth/me',leitores[0].cookie)).body.id;
            assert.equal((await api('/api/usuarios/'+contaLeitor+'/status',admin,{ativo:false},'PATCH')).status,200);
            assert.equal((await api('/api/leitores/'+leitores[0].id+'/acesso',coords[0],{senhaInicial:'NovaLeitor123'})).status,204);
            assert.equal((await banco.query('SELECT ativo FROM usuarios WHERE id=$1',[contaLeitor])).rows[0].ativo,false);
            const listagem=(await api('/api/usuarios',admin)).body;
            assert.ok(listagem.every(u=>u.senha_hash===undefined && u.senha===undefined));
        });
        await t.test('recuperação assistida não revela contas e exige administrador e identidade confirmada', async () => {
            const email='recuperar@teste.invalid';
            const novo=await api('/api/usuarios',admin,{nome:'Recuperação',email,senha:'Inicial123',perfil:'professor',centroId:1});assert.equal(novo.status,201);
            const cookie=await login(email,'Inicial123');
            await api('/api/auth/change-password',cookie,{senhaAtual:'Inicial123',novaSenha:'Original123'});
            assert.equal((await api('/recuperarSenha.html')).status,200);
            const solicitar=()=>api('/api/auth/recuperacao',null,{email});
            const primeira=await solicitar();assert.equal(primeira.status,202);
            const inexistente=await api('/api/auth/recuperacao',null,{email:'inexistente@teste.invalid'});
            assert.deepEqual(inexistente.body,primeira.body);assert.equal(inexistente.status,202);
            assert.deepEqual((await solicitar()).body,primeira.body);
            assert.equal((await api('/api/auth/me',cookie)).status,200);
            let fila=(await api('/api/recuperacoes',admin)).body;assert.equal(fila.length,1);
            const id=fila[0].id;assert.equal(fila[0].email,email);assert.equal(fila[0].senha_hash,undefined);
            for(const ator of [coords[0],cookie,leitores[1].cookie]) {
                assert.equal((await api('/api/recuperacoes',ator)).status,403);
                assert.equal((await api('/api/recuperacoes/'+id+'/concluir',ator,{acao:'atender',senha:'NovaSenha123',identidadeConfirmada:true})).status,403);
            }
            assert.equal((await api('/api/recuperacoes/'+id+'/concluir',null,{acao:'encerrar'})).status,401);
            assert.equal((await api('/api/recuperacoes/'+id+'/concluir',admin,{acao:'atender',senha:'NovaSenha123'})).status,400);
            assert.equal((await api('/api/recuperacoes/'+id+'/concluir',admin,{acao:'atender',senha:'curta',identidadeConfirmada:true})).status,400);
            const respostas=await Promise.all([1,2].map(()=>api('/api/recuperacoes/'+id+'/concluir',admin,{acao:'atender',senha:'NovaSenha123',identidadeConfirmada:true})));
            assert.deepEqual(respostas.map(r=>r.status).sort(),[200,409]);
            assert.equal((await api('/api/auth/me',cookie)).status,401);
            assert.equal((await api('/api/auth/login',null,{email,senha:'Original123'})).status,401);
            const recuperado=await login(email,'NovaSenha123');assert.equal((await api('/api/auth/me',recuperado)).body.trocarSenha,true);
            const auditoria=(await banco.query('SELECT status,atendido_por,encerrada_em FROM recuperacoes_acesso WHERE id=$1',[id])).rows[0];
            assert.equal(auditoria.status,'Atendida');assert.ok(auditoria.atendido_por);assert.ok(auditoria.encerrada_em);
            assert.equal((await solicitar()).status,202);
            const pendente=(await api('/api/recuperacoes',admin)).body[0];
            assert.equal((await api('/api/usuarios/'+novo.body.id+'/status',admin,{ativo:false},'PATCH')).status,200);
            assert.deepEqual((await solicitar()).body,primeira.body);
            assert.equal((await api('/api/recuperacoes/'+pendente.id+'/concluir',admin,{acao:'atender',senha:'OutraSenha123',identidadeConfirmada:true})).status,409);
            assert.equal((await api('/api/recuperacoes/'+pendente.id+'/concluir',admin,{acao:'encerrar'})).status,200);
            assert.equal((await solicitar()).status,429);
            assert.equal((await banco.query('SELECT ativo FROM usuarios WHERE id=$1',[novo.body.id])).rows[0].ativo,false);
            assert.deepEqual((await api('/api/recuperacoes',admin)).body,[]);
        });
        await t.test('senha temporária de professor e coordenador funciona após criação e redefinição',async()=>{
            for(const perfil of ['professor','coordenador']) {
                const email='troca-'+perfil+'@teste.invalid';
                const inicial=' Temporária#123 ';
                const criado=await api('/api/usuarios',admin,{nome:'Teste troca',email,senha:inicial,perfil,centroId:1});assert.equal(criado.status,201);
                const id=criado.body.id;
                let cookie=await login(email,inicial);
                assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:inicial,novaSenha:'Nova#12345',usuarioId:id+1})).status,409);
                assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:inicial,novaSenha:'Nova#12345',usuarioId:id})).status,200);
                assert.ok(await login(email,'Nova#12345'));
                assert.equal((await api('/api/usuarios/'+id+'/senha',admin,{senha:'Outra#12345'})).status,200);
                assert.equal((await api('/api/auth/me',cookie)).status,401);
                cookie=await login(email,'Outra#12345');
                assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:inicial,novaSenha:'Final#12345',usuarioId:id})).status,400);
                assert.equal((await api('/api/auth/change-password',cookie,{senhaAtual:'Outra#12345',novaSenha:'Final#12345',usuarioId:id})).status,200);
                assert.ok(await login(email,'Final#12345'));
            }
        });
        assert.deepEqual(erros,[], 'Nenhum erro SQL inesperado');
    } finally {
        if (servidor) await new Promise(resolve => { servidor.close(resolve); servidor.closeAllConnections(); });
        if (banco) await banco.end();
        if (criado) await conexao.query(`DROP SCHEMA "${schema}" CASCADE`);
        await conexao.end();
    }
});
