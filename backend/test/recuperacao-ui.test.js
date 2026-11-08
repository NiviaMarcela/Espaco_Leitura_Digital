import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('formulário público envia somente o e-mail e mostra orientação, sem simular envio de e-mail',async()=>{
    const nos=new Map();const get=id=>{if(!nos.has(id))nos.set(id,{value:'',disabled:false,eventos:{},addEventListener(e,f){this.eventos[e]=f;},reportValidity(){return true;},reset(){},focus(){}});return nos.get(id);};
    let pedido;
    const contexto=vm.createContext({document:{getElementById:get},AbortSignal,fetch:async(url,opts)=>{
        pedido={url,body:JSON.parse(opts.body)};return {ok:true,json:async()=>({mensagem:'Procure a equipe. Nenhum e-mail será enviado.'})};
    }});
    vm.runInContext(readFileSync(new URL('../../js/recuperarSenha.js',import.meta.url),'utf8'),contexto);
    get('emailRecuperacao').value=' pessoa@teste.invalid ';
    await get('formRecuperacao').eventos.submit({preventDefault(){}});
    assert.equal(pedido.url,'/api/auth/recuperacao');assert.deepEqual(pedido.body,{email:'pessoa@teste.invalid'});
    assert.match(get('avisoRecuperacao').textContent,/Nenhum e-mail/);assert.equal(get('solicitarRecuperacao').disabled,false);
});
