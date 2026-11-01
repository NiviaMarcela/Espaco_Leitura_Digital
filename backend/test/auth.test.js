import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import pg from 'pg';
import { criarApp } from '../src/app.js';
import { criarHash, conferirSenha, validarSenha, hashToken } from '../src/auth.js';

test('senhas usam sal aleatório e comparação segura; frases longas são aceitas', async()=>{
    const senha='Uma frase de teste bastante longa';
    const hash=await criarHash(senha);
    assert.notEqual(hash,await criarHash(senha));
    assert.equal(await conferirSenha(senha,hash),true);
    assert.equal(await conferirSenha('senha incorreta',hash),false);
    assert.equal(await conferirSenha(senha,null),false);
    assert.throws(()=>validarSenha('curta'),{status:400});
    assert.throws(()=>validarSenha('a'.repeat(129)),{status:400});
});

test('sem sessão: Biblioteca pública, páginas e APIs de gestão protegidas',async t=>{
    const app=criarApp({query:async()=>({rows:[]})},()=>{}).listen(0,'127.0.0.1');
    await once(app,'listening');t.after(()=>new Promise(r=>{app.close(r);app.closeAllConnections();}));
    const base=`http://127.0.0.1:${app.address().port}`;
    assert.equal((await fetch(base+'/biblioteca.html')).status,200);
    assert.equal((await fetch(base+'/login.html')).status,200);
    assert.deepEqual(await (await fetch(base+'/api/biblioteca')).json(),[]);
    for(const rota of ['livros','leitores','emprestimos','dashboard','usuarios','centros','health/db'])assert.equal((await fetch(base+'/api/'+rota)).status,401);
    for(const pagina of ['acervo','leitores','emprestimos','devolucoes','dashboard','usuarios','conta']){
        const r=await fetch(base+'/'+pagina+'.html',{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),'/login.html');
    }
});

test('PostgreSQL: login, sessões, autorização por centro e revogação', {skip:process.env.RUN_POSTGRES_TESTS!=='1'},async()=>{
    const schema='teste_auth_'+randomUUID().replaceAll('-','');
    const config={...(process.env.DATABASE_URL?{connectionString:process.env.DATABASE_URL}:{}),connectionTimeoutMillis:5000};
    const admin=new pg.Pool(config);let banco,server,criado=false;
    try{
        await admin.query(`CREATE SCHEMA "${schema}"`);criado=true;
        banco=new pg.Pool({...config,options:`-c search_path=${schema}`});
        for(const nome of ['001_acervo.sql','002_leitores.sql','003_baixa_exemplares.sql','004_emprestimos.sql','005_devolucoes.sql','006_usuarios.sql','007_leitores_reservas.sql'])await banco.query(await readFile(new URL('../database/'+nome,import.meta.url),'utf8'));
        const senha='Senha teste longa de autenticação';const hash=await criarHash(senha);
        await banco.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,centro_id) VALUES
            ('Admin','admin@teste.local',$1,'Administrador',NULL),('Responsável A','a@teste.local',$1,'Coordenador',1),('Responsável B','b@teste.local',$1,'Coordenador',2)`,[hash]);
        server=criarApp(banco,()=>{}).listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
        async function pedir(rota,cookie='',method='GET',dados,extras={}){
            const r=await fetch(base+rota,{method,headers:{'Content-Type':'application/json','X-Requested-With':'EspacoLeitura',Cookie:cookie,...extras},body:dados?JSON.stringify(dados):undefined,redirect:'manual'});
            const tipo=r.headers.get('content-type')||'';return {status:r.status,headers:r.headers,body:tipo.includes('json')?await r.json():await r.text()};
        }
        const login=email=>pedir('/api/auth/login','','POST',{email,senha});
        assert.equal((await pedir('/api/auth/login','','POST',{email:'admin@teste.local',senha:'errada'})).status,401);
        const adm=await login('ADMIN@TESTE.LOCAL');assert.equal(adm.status,200);
        assert.match(adm.headers.get('set-cookie'),/HttpOnly/);assert.match(adm.headers.get('set-cookie'),/SameSite=Strict/);
        const ac=adm.headers.get('set-cookie').split(';')[0];
        const ca=(await login('a@teste.local')).headers.get('set-cookie').split(';')[0];
        const cb=(await login('b@teste.local')).headers.get('set-cookie').split(';')[0];
        const sessao=await pedir('/api/auth/sessao',ca);assert.equal(sessao.body.usuario.centroId,1);assert.equal('senha_hash' in sessao.body.usuario,false);
        const armazenada=(await banco.query('SELECT token_hash FROM sessoes WHERE usuario_id=1')).rows[0];assert.equal(armazenada.token_hash,hashToken(ac.split('=')[1]));
        assert.equal((await pedir('/api/usuarios',ca)).status,403);
        assert.equal((await pedir('/usuarios.html',ca)).status,403);
        assert.equal((await pedir('/api/usuarios',ca,'POST',{nome:'Intruso'})).status,403);
        const leitor={nome:'Leitor',tipo:'Comunidade',dataNascimento:'2000-01-01',centroId:1};
        const l1=await pedir('/api/leitores',ca,'POST',leitor);assert.equal(l1.status,201);
        const l2=await pedir('/api/leitores',cb,'POST',{...leitor,nome:'Outro',centroId:2});assert.equal(l2.status,201);
        assert.equal((await pedir('/api/leitores',ca)).body.length,1);
        assert.equal((await pedir('/api/leitores/'+l2.body.id,ca)).status,404);
        assert.equal((await pedir('/api/leitores/'+l2.body.id,ca,'PUT',leitor)).status,404);
        assert.equal((await pedir('/api/leitores/'+l1.body.id,ca,'PUT',{...leitor,centroId:2})).status,403);
        const obra={titulo:'Obra compartilhada',autor:'Autora',categoria:'Literatura',quantidade:2,centroId:1};
        const livro=await pedir('/api/livros',ca,'POST',obra);assert.equal(livro.status,201);
        assert.equal((await pedir('/api/livros/'+livro.body.id,ca,'PUT',obra)).status,403);
        assert.equal((await pedir('/api/livros/'+livro.body.id+'/exemplares',ca,'POST',{quantidade:1,centroId:2})).status,403);
        const adicao=await pedir('/api/livros/'+livro.body.id+'/exemplares',cb,'POST',{quantidade:1,centroId:2});assert.equal(adicao.status,201);
        const ex2=adicao.body.exemplares[0].id;
        assert.equal(adicao.body.exemplares.length,1);
        assert.equal((await pedir('/api/livros/'+livro.body.id,ca)).body.exemplares.length,2);
        assert.equal((await pedir('/api/exemplares/'+ex2+'/baixa',ca,'POST',{motivo:'Perda'})).status,404);
        assert.equal((await pedir('/api/emprestimos',ca,'POST',{leitorId:l1.body.id,exemplarId:ex2})).status,404);
        assert.equal((await pedir('/api/emprestimos',cb,'POST',{leitorId:l1.body.id,exemplarId:ex2})).status,403);
        const emprestimo=await pedir('/api/emprestimos',cb,'POST',{leitorId:l2.body.id,exemplarId:ex2});assert.equal(emprestimo.status,201);
        const id=emprestimo.body.id;
        assert.equal((await pedir('/api/emprestimos/'+id,ca)).status,404);
        assert.equal((await pedir('/api/emprestimos/'+id+'/renovacoes',ca,'POST',{versao:0})).status,404);
        assert.equal((await pedir('/api/emprestimos/'+id+'/devolucao',ca,'POST',{versao:0,condicao:'Disponível'})).status,404);
        assert.equal((await pedir('/api/emprestimos',ca)).body.length,0);
        assert.equal((await pedir('/api/dashboard',ca)).body.emprestimosAbertos,0);
        assert.equal((await pedir('/api/dashboard',cb)).body.emprestimosAbertos,1);
        assert.equal((await pedir('/api/dashboard',ac)).body.exemplaresDisponiveis,2);
        assert.equal((await pedir('/api/emprestimos/opcoes',ca)).body.exemplares.every(e=>e.centroId===1),true);
        assert.deepEqual((await pedir('/api/emprestimos/opcoes',ca)).body.leitores.find(l=>l.id===l1.body.id).abertosPorCentro,{});
        const baixa=await pedir('/api/exemplares/'+livro.body.exemplares[0].id+'/baixa',ca,'POST',{motivo:'Outro',observacao:'Nota privada'});assert.equal(baixa.status,200);
        const publico=await pedir('/api/biblioteca');assert.equal(publico.status,200);assert.equal(JSON.stringify(publico.body).includes('Nota privada'),false);
        // Cadastro público não pode promover o visitante a administrador.
        const cadastro={nome:'Leitora pública',email:'leitora@teste.local',senha:'teste123',dataNascimento:'2000-01-01',centroId:1,perfil:'Administrador'};
        assert.equal((await pedir('/api/auth/cadastro','','POST',{...cadastro,senha:'1234567'})).status,400);
        assert.equal((await pedir('/api/auth/cadastro','','POST',cadastro)).status,201);
        const acesso=await pedir('/api/auth/login','','POST',{email:cadastro.email,senha:cadastro.senha});
        assert.equal(acesso.status,200);assert.equal(acesso.body.perfil,'Leitor');
        const cl=acesso.headers.get('set-cookie').split(';')[0];
        const leitora=(await pedir('/api/auth/sessao',cl)).body.usuario;
        for(const rota of ['dashboard','livros','leitores','usuarios','emprestimos'])assert.equal((await pedir('/api/'+rota,cl)).status,403);
        assert.equal((await pedir('/dashboard.html',cl)).headers.get('location'),'/biblioteca.html');
        assert.equal((await pedir('/api/reservas','','POST',{exemplarId:ex2})).status,401);
        assert.equal((await pedir('/api/reservas',cl,'POST',{exemplarId:ex2})).status,403);
        const estoque=await pedir('/api/livros',ac,'POST',{...obra,titulo:'Reservas',quantidade:12});
        const copias=estoque.body.exemplares;
        const concorrentes=await Promise.all([1,2].map(()=>pedir('/api/reservas',cl,'POST',{exemplarId:copias[0].id,leitorId:l2.body.id})));
        assert.deepEqual(concorrentes.map(r=>r.status).sort(),[201,409]);
        const reserva=concorrentes.find(r=>r.status===201).body;
        assert.equal((await banco.query('SELECT leitor_id FROM reservas WHERE id=$1',[reserva.id])).rows[0].leitor_id,leitora.leitorId);
        assert.equal((await pedir('/api/reservas/'+reserva.id+'/retirar',cl,'POST',{})).status,403);
        assert.equal((await pedir('/api/reservas/'+reserva.id+'/retirar',cb,'POST',{})).status,404);
        assert.equal((await pedir('/api/reservas',cb)).body.length,0);
        const retiradas=await Promise.all([1,2].map(()=>pedir('/api/reservas/'+reserva.id+'/retirar',ca,'POST',{})));
        assert.deepEqual(retiradas.map(r=>r.status).sort(),[200,409]);
        const emprestimoReserva=retiradas.find(r=>r.status===200).body.emprestimoId;
        assert.equal((await banco.query('SELECT data_prevista_devolucao-data_emprestimo AS prazo FROM emprestimos WHERE id=$1',[emprestimoReserva])).rows[0].prazo,30);
        for(const e of copias.slice(1,10))assert.equal((await pedir('/api/reservas',cl,'POST',{exemplarId:e.id})).status,201);
        assert.equal((await pedir('/api/reservas',cl,'POST',{exemplarId:copias[10].id})).status,409);
        assert.equal((await pedir('/api/emprestimos',ac,'POST',{leitorId:leitora.leitorId,exemplarId:copias[10].id})).status,409);
        const pendente=(await pedir('/api/reservas',cl)).body.find(r=>r.status==='Pendente');
        assert.equal((await pedir('/api/reservas/'+pendente.id+'/cancelar',cl,'POST',{})).status,200);
        assert.equal((await pedir('/api/reservas/'+pendente.id+'/cancelar',cl,'POST',{})).status,409);
        assert.equal((await pedir('/api/reservas',cl,'POST',{exemplarId:copias[10].id})).status,201);
        assert.equal((await pedir('/api/leitores/'+leitora.leitorId,ac,'PUT',{...leitor,centroId:2})).status,409);
        assert.equal((await pedir('/api/auth/logout',ca,'POST',{}, {'X-Requested-With':''})).status,403);
        assert.equal((await pedir('/api/auth/logout',ca,'POST',{}, {Origin:'https://outro.example'})).status,403);
        assert.equal((await pedir('/api/auth/logout',ca,'POST',{})).status,200);
        assert.equal((await pedir('/api/leitores',ca)).status,401);
        await banco.query("UPDATE sessoes SET expira_em=now()-interval '1 second' WHERE usuario_id=3");assert.equal((await pedir('/api/leitores',cb)).status,401);
        const ca2=(await login('a@teste.local')).headers.get('set-cookie').split(';')[0];
        assert.equal((await pedir('/api/usuarios/2',ac,'PUT',{nome:'Responsável A',email:'a@teste.local',perfil:'Coordenador',centroId:1,ativo:false})).status,200);
        assert.equal((await pedir('/api/leitores',ca2)).status,401);assert.equal((await login('a@teste.local')).status,401);
        assert.equal((await pedir('/api/usuarios/1',ac,'PUT',{nome:'Admin',email:'admin@teste.local',perfil:'Administrador',ativo:false})).status,409);
        const novo=await pedir('/api/usuarios',ac,'POST',{nome:'Novo',email:'novo@teste.local',perfil:'Coordenador',centroId:1,senha});assert.equal(novo.status,201);
        const cn=(await login('novo@teste.local')).headers.get('set-cookie').split(';')[0];
        assert.equal((await pedir('/api/auth/senha',cn,'POST',{senhaAtual:senha,novaSenha:'Nova frase de senha bem longa'})).status,200);
        assert.equal((await pedir('/api/leitores',cn)).status,401);
        assert.equal((await login('novo@teste.local')).status,401);
        assert.equal((await pedir('/api/auth/login','','POST',{email:'novo@teste.local',senha:'Nova frase de senha bem longa'})).status,200);
        await banco.query("INSERT INTO tentativas_login(chave,quantidade) VALUES ($1,10)",[hashToken('email:bloqueado@teste.local')]);
        assert.equal((await login('bloqueado@teste.local')).status,429);
    }finally{
        if(server)await new Promise(r=>{server.close(r);server.closeAllConnections();});
        if(banco)await banco.end();if(criado)await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();
    }
});
