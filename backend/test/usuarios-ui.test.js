import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

class Elemento {
    constructor(texto='',valor=''){this.textContent=texto;this.value=valor;this.children=[];this.eventos={};this.disabled=false;}
    addEventListener(e,f){this.eventos[e]=f;}
    append(e){this.children.push(e);}
    add(e){this.append(e);}
    replaceChildren(...e){this.children=e;}
    insertRow(){const e=new Elemento();this.append(e);return e;}
    insertCell(){return this.insertRow();}
    reset(){} focus(){} scrollIntoView(){} reportValidity(){return true;}
}
async function preparar(perfil='admin'){
    const elementos=new Map(),pedidos=[];const get=id=>{if(!elementos.has(id))elementos.set(id,new Elemento());return elementos.get(id);};
    const usuario={id:2,nome:'Professor',email:'prof@teste.invalid',perfil:'professor',centroId:1,ativo:true};
    const contexto=vm.createContext({
        document:{getElementById:get,createElement:()=>new Elemento()},Option:Elemento,AbortSignal,
        FormData:class{constructor(){return [['nome',get('nomeUsuario').value],['email',get('emailUsuario').value],['centroId',get('centroUsuario').value]];}},
        location:{assign:p=>pedidos.push({redirect:p})},confirm:()=>true,
        bootstrap:{Modal:{getOrCreateInstance:()=>({show(){},hide(){}})}},
        fetch:async(url,opcoes)=>{
            pedidos.push({url,...opcoes});let body={};
            if(url==='/api/auth/me')body={id:1,perfil,centroId:1};
            if(url==='/api/usuarios' && opcoes.method==='GET')body=[usuario];
            if(url==='/api/centros')body=[{id:1,nome:'Maranhão'}];
            if(url==='/api/leitores')body=[];
            return {ok:true,json:async()=>body};
        }
    });
    vm.runInContext(readFileSync(new URL('../../js/usuarios.js',import.meta.url),'utf8'),contexto);
    await new Promise(r=>setImmediate(r));
    return {get,pedidos,usuario,executar:s=>vm.runInContext(s,contexto)};
}
test('editar usuário envia PUT sem senha nem troca de perfil',async()=>{
    const {get,pedidos,executar}=await preparar();
    executar("editar({id:2,nome:'Professor',email:'prof@teste.invalid',perfil:'professor',centroId:1})");
    assert.equal(get('perfilUsuario').disabled,true);assert.equal(get('senhaUsuario').disabled,true);
    get('nomeUsuario').value='Nome novo';
    await get('formUsuario').eventos.submit({preventDefault(){}});
    const pedido=pedidos.find(p=>p.method==='PUT');assert.equal(pedido.url,'/api/usuarios/2');
    const dados=JSON.parse(pedido.body);assert.equal(dados.nome,'Nome novo');assert.equal(dados.senha,undefined);assert.equal(dados.perfil,undefined);
    assert.equal(get('senhaUsuario').disabled,false);
});
test('senha exige confirmação e situação usa endpoint separado',async()=>{
    const {get,pedidos,executar}=await preparar();
    executar("abrirSenha({id:2,nome:'Professor'})");
    get('novaSenhaUsuario').value='Temporaria123';get('confirmarSenhaUsuario').value='Diferente123';
    const evento={preventDefault(){},target:get('formSenhaUsuario')};
    await get('formSenhaUsuario').eventos.submit(evento);
    assert.equal(pedidos.some(p=>p.url.endsWith('/senha')),false);
    get('confirmarSenhaUsuario').value='Temporaria123';await get('formSenhaUsuario').eventos.submit(evento);
    assert.equal(JSON.parse(pedidos.find(p=>p.url.endsWith('/senha')).body).senha,'Temporaria123');
    await executar("alterarSituacao({id:2,nome:'Professor',ativo:true})");
    const status=pedidos.find(p=>p.url.endsWith('/status'));assert.equal(status.method,'PATCH');assert.equal(JSON.parse(status.body).ativo,false);
});

test('atendimento exige confirmação da identidade e usa a solicitação correta',async()=>{
    const {get,pedidos,executar}=await preparar();
    executar("abrirSenha({id:2,nome:'Professor'},{id:9})");
    assert.equal(get('grupoConfirmarIdentidade').hidden,false);
    assert.equal(get('confirmarIdentidade').required,true);
    get('novaSenhaUsuario').value='Temporaria123';get('confirmarSenhaUsuario').value='Temporaria123';
    const evento={preventDefault(){},target:get('formSenhaUsuario')};
    await get('formSenhaUsuario').eventos.submit(evento);
    assert.equal(pedidos.some(p=>p.url.endsWith('/concluir')),false);
    get('confirmarIdentidade').checked=true;await get('formSenhaUsuario').eventos.submit(evento);
    const r=pedidos.find(p=>p.url.endsWith('/concluir'));assert.equal(r.url,'/api/recuperacoes/9/concluir');
    assert.equal(JSON.parse(r.body).identidadeConfirmada,true);
});

test('coordenador recebe perfis locais e ações de equipe sem consultar recuperação',async()=>{
    const {get,pedidos}=await preparar('coordenador');
    assert.deepEqual(get('perfilUsuario').children.map(o=>o.value),['coordenador','professor','funcionario']);
    assert.equal(pedidos.some(p=>p.url==='/api/recuperacoes'),false);
    const acoes=get('tabelaUsuarios').children[0].children[5];
    assert.equal(acoes.children.length,3);assert.deepEqual(acoes.children.map(b=>b.textContent),['Editar','Redefinir senha','Inativar']);
});
