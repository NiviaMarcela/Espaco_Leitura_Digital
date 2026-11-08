import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

async function preparar(perfil, resposta) {
    const elementos=new Map(), pedidos=[],destinos=[];
    const get=id=>{if(!elementos.has(id))elementos.set(id,{value:'',eventos:{},addEventListener(e,f){this.eventos[e]=f;},reportValidity(){return true;},focus(){},reset(){}});return elementos.get(id);};
    const contexto=vm.createContext({document:{getElementById:get},AbortSignal,location:{assign:p=>destinos.push(p),replace:p=>destinos.push(p)},fetch:async(url,opcoes)=>{
        if(url==='/api/auth/me')return {ok:true,json:async()=>({id:7,email:'teste@example.org',perfil})};
        pedidos.push({url,body:JSON.parse(opcoes.body)});return resposta();
    }});
    vm.runInContext(readFileSync(new URL('../../js/alterarSenha.js',import.meta.url),'utf8'),contexto);
    await new Promise(r=>setImmediate(r));
    get('senhaAtual').value=' Temporaria123 ';get('novaSenha').value=get('confirmarSenha').value='NovaSenha123';
    return {get,pedidos,destinos,enviar:()=>get('formAlterarSenha').eventos.submit({preventDefault(){}})};
}
for(const perfil of ['professor','coordenador'])test('troca temporária de '+perfil+' envia uma vez e usa a conta exibida',async()=>{
    let liberar;const resposta=new Promise(r=>liberar=r);
    const t=await preparar(perfil,()=>resposta);
    assert.equal(t.get('contaAlterarSenha').value,'teste@example.org');
    const envio=t.enviar();await t.enviar();assert.equal(t.pedidos.length,1);
    assert.deepEqual(t.pedidos[0].body,{senhaAtual:' Temporaria123 ',novaSenha:'NovaSenha123',usuarioId:7});
    liberar({ok:true,status:200,json:async()=>({ok:true})});await envio;
    assert.equal(t.destinos[0],perfil==='professor'?'/biblioteca.html':'/dashboard.html');
});
test('senha rejeitada mantém a tela e permite nova tentativa sem informar sucesso',async()=>{
    const t=await preparar('professor',async()=>({ok:false,status:400,json:async()=>({erro:'A senha atual está incorreta.'})}));
    await t.enviar();assert.equal(t.destinos.length,0);assert.match(t.get('erroAlterarSenha').textContent,/incorreta/);assert.equal(t.get('salvarNovaSenha').disabled,false);
    t.get('mostrarSenhas').eventos.change({target:{checked:true}});assert.equal(t.get('senhaAtual').type,'text');
});
