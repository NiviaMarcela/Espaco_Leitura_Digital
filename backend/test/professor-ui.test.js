import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import { lerPagina } from './ler-pagina.js';

class AvatarElemento {
    constructor(tagName='div',className='') {
        this.tagName=tagName.toLowerCase();
        this.className=className;
        this.children=[];
        this.attributes={};
        this.textContent='';
    }
    setAttribute(nome,valor){this.attributes[nome]=valor;}
    append(...elementos){this.children.push(...elementos);}
    prepend(...elementos){this.children.unshift(...elementos);}
    replaceChildren(...elementos){this.children=elementos;}
    addEventListener(){}
    querySelector(seletor){
        for(const filho of this.children){
            const corresponde=seletor.startsWith('.')
                ? filho.className.split(/\s+/).includes(seletor.slice(1))
                : filho.tagName===seletor;
            if(corresponde)return filho;
            const descendente=filho.querySelector(seletor);
            if(descendente)return descendente;
        }
        return null;
    }
}

for(const perfil of ['admin','coordenador','professor','funcionario','leitor']) test(`${perfil} vê o ícone de usuário no avatar`,async()=>{
    const identificacao=new AvatarElemento('div','user-info');
    if(perfil==='leitor'){
        const detalhes=new AvatarElemento();
        detalhes.append(new AvatarElemento('strong'),new AvatarElemento('span'));
        identificacao.append(detalhes);
    }
    const contexto=vm.createContext({
        document:{
            body:{dataset:{authRole:'admin,coordenador,professor,funcionario,leitor'}},
            hidden:false,
            addEventListener(){},
            querySelectorAll:()=>[],
            querySelector:seletor=>seletor==='.user-info'?identificacao:null,
            createElement:tagName=>new AvatarElemento(tagName)
        },
        window:{setInterval(){}},
        location:{pathname:'/biblioteca.html',replace(){}},
        fetch:async()=>({ok:true,json:async()=>({perfil,nome:'Usuário teste',trocarSenha:false})})
    });
    vm.runInContext(readFileSync(new URL('../../frontend/shared/js/auth-ui.js',import.meta.url),'utf8'),contexto);
    await new Promise(resolve=>setImmediate(resolve));
    const avatar=identificacao.querySelector('.user-avatar');
    assert.ok(avatar);
    assert.equal(avatar.querySelector('i').className,'bi bi-person-fill fs-4');
    assert.equal(identificacao.querySelector('strong').textContent,'Usuário teste');
});

test('telas com identificação de usuário exibem o ícone desde o carregamento',()=>{
    for(const arquivo of ['acervo.html','biblioteca.html','dashboard.html','devolucoes.html','emprestimos.html',
        'leitores.html','livroVivo.html','meusEmprestimos.html','Relatorios.html','reservas.html','usuarios.html']){
        const html=lerPagina(arquivo.replace(/\.html$/,''));
        assert.match(html,/class="user-avatar"[^>]*>[\s\S]*?class="bi bi-person-fill fs-4"/,arquivo);
    }
});

for(const perfil of ['professor','funcionario','coordenador']) test(perfil+' recebe os menus permitidos',async()=>{
    const admin={hidden:false},dashboard={hidden:false},gestao={hidden:true},usuarios={hidden:true},relatorios={hidden:true};
    const linkReservas={attributes:{},setAttribute(nome,valor){this.attributes[nome]=valor;}};
    const contador={hidden:true,textContent:'',parentElement:linkReservas};
    const linkDevolucoes={attributes:{},setAttribute(nome,valor){this.attributes[nome]=valor;}};
    const contadorDevolucoes={hidden:true,textContent:'',parentElement:linkDevolucoes};
    const grupos={'[data-usuarios-only]':[usuarios],'[data-admin-only]':[admin],'[data-dashboard-only]':[dashboard],'[data-gestao-only]':[gestao],'[data-relatorios-only]':[relatorios],'[data-reservas-count]':[contador],'[data-devolucoes-count]':[contadorDevolucoes],'[data-anonymous-only]':[]};
    const redirecionamentos=[];
    const contexto=vm.createContext({
        AbortSignal,
        document:{body:{dataset:{authRole:'admin,coordenador,professor,funcionario,leitor'}},hidden:false,addEventListener(){},querySelectorAll:s=>grupos[s]||[],querySelector:()=>null},
        window:{setInterval(){}},location:{pathname:'/biblioteca.html',replace:p=>redirecionamentos.push(p)},
        fetch:async url=>url==='/api/reservas'
            ? ({ok:true,json:async()=>[{id:1},{id:2}]})
            : url==='/api/emprestimos'
                ? ({ok:true,json:async()=>[
                    {id:1,status:'Atrasado',dataPrevistaDevolucao:'2000-01-01',dataDevolucao:null},
                    {id:2,status:'Emprestado',dataPrevistaDevolucao:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza'}).format(new Date(Date.now()+7*86400000)),dataDevolucao:null}
                ]})
                : ({ok:true,json:async()=>({perfil,nome:'Equipe teste',trocarSenha:false})})
    });
    vm.runInContext(readFileSync(new URL('../../frontend/shared/js/auth-ui.js',import.meta.url),'utf8'),contexto);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(admin.hidden,true);assert.equal(dashboard.hidden,perfil!=='coordenador');assert.equal(usuarios.hidden,perfil!=='coordenador');assert.equal(gestao.hidden,false);assert.equal(relatorios.hidden,!['professor','coordenador','funcionario'].includes(perfil));
    assert.equal(contador.hidden,false);assert.equal(contador.textContent,'2');assert.equal(linkReservas.attributes['aria-label'],'Reservas, 2 aguardando retirada');
    assert.equal(contadorDevolucoes.hidden,false);
    assert.equal(contadorDevolucoes.textContent,'2');
    assert.equal(linkDevolucoes.attributes['aria-label'],'Devoluções, 1 vencido(s) e 1 vencendo nos próximos 7 dias');
    assert.deepEqual(redirecionamentos,[]);
});

test('login do professor tem Biblioteca como destino inicial',()=>{
    const contexto=vm.createContext({document:{getElementById:()=>({addEventListener(){}})},location:{search:''},URLSearchParams});
    vm.runInContext(readFileSync(new URL('../../frontend/pages/login/login.js',import.meta.url),'utf8'),contexto);
    assert.equal(vm.runInContext("destino({perfil:'professor'})",contexto),'/biblioteca.html');
});

for (const perfil of ['admin', 'coordenador']) test(`${perfil} vê no menu Usuários a quantidade de pedidos pendentes de senha`,async()=>{
    const linkUsuarios=Array.from({length:2},()=>({attributes:{},setAttribute(nome,valor){this.attributes[nome]=valor;}}));
    const contadores=linkUsuarios.map(parentElement=>({parentElement,hidden:true,textContent:''}));
    const grupos={'[data-usuarios-only]':linkUsuarios,'[data-admin-only]':[],'[data-dashboard-only]':[],'[data-gestao-only]':[],'[data-relatorios-only]':[],'[data-reservas-count]':[],'[data-solicitacoes-senha-count]':contadores,'[data-anonymous-only]':[]};
    const urls=[];
    const contexto=vm.createContext({
        AbortSignal,
        document:{body:{dataset:{authRole:'admin'}},hidden:false,addEventListener(){},querySelectorAll:s=>grupos[s]||[],querySelector:()=>null},
        window:{setInterval(){}},location:{pathname:'/dashboard.html',replace(){}},
        fetch:async url=>{
            urls.push(url);
            return {ok:true,json:async()=>url==='/api/auth/me'
                ? {id:1,perfil,nome:'Equipe',centroId:4,trocarSenha:false}
                : url==='/api/recuperacoes/contagem' ? {quantidade:3} : []};
        }
    });
    vm.runInContext(readFileSync(new URL('../../frontend/shared/js/auth-ui.js',import.meta.url),'utf8'),contexto);
    await new Promise(resolve=>setImmediate(resolve));
    assert.ok(urls.includes('/api/recuperacoes/contagem'));
    assert.deepEqual(contadores.map(contador=>contador.textContent),['3','3']);
    assert.ok(contadores.every(contador=>!contador.hidden));
    assert.ok(linkUsuarios.every(link=>link.attributes['aria-label']==='Usuários, 3 pedido(s) de senha aguardando análise'));
});
