import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import { lerPagina } from './ler-pagina.js';

class Elemento {
    constructor(texto='',valor=''){this.textContent=texto;this.value=valor;this.children=[];this.eventos={};this.disabled=false;this.hidden=false;}
    addEventListener(e,f){this.eventos[e]=f;}
    append(e){this.children.push(e);}
    add(e){this.append(e);}
    replaceChildren(...e){this.children=e;}
    insertRow(){const e=new Elemento();this.append(e);return e;}
    insertCell(){return this.insertRow();}
    reset(){} focus(){} scrollIntoView(){} reportValidity(){return true;}
}

async function preparar(){
 const elementos=new Map(),pedidos=[];const get=id=>{if(!elementos.has(id))elementos.set(id,new Elemento());return elementos.get(id);};
 const contexto=vm.createContext({document:{getElementById:get,createElement:()=>new Elemento()},Option:Elemento,AbortSignal,confirm:()=>true,
 fetch:async(url,opcoes)=>{pedidos.push({url,...opcoes});return {ok:true,json:async()=>url==='/api/centros'?[{id:1,nome:'Maranhão'}]:opcoes.method==='GET'?[{id:8,nome:'Literatura',centroId:1,centro:'Maranhão',livros:2}]:{sucesso:true}};}});
 vm.runInContext(readFileSync(new URL('../../frontend/pages/categorias/categorias.js',import.meta.url),'utf8'),contexto);await new Promise(r=>setImmediate(r));
 return {get,pedidos};
}
test('página de categorias cadastra, edita com Centro preservado e exclui com JSON',async()=>{
 const {get,pedidos}=await preparar();assert.equal(get('camposCategoria').disabled,false);
 get('nomeCategoria').value='Ciências';await get('formCategoria').eventos.submit({preventDefault(){},target:get('formCategoria')});
 assert.deepEqual(JSON.parse(pedidos.find(p=>p.method==='POST').body),{nome:'Ciências',centroId:1});
 const acoes=get('tabelaCategorias').children[0].children[3];acoes.children[0].eventos.click();assert.equal(get('centroCategoria').disabled,true);
 get('nomeCategoria').value='Literatura infantil';await get('formCategoria').eventos.submit({preventDefault(){},target:get('formCategoria')});
 assert.equal(pedidos.find(p=>p.method==='PUT').url,'/api/categorias/8');
 await get('tabelaCategorias').children[0].children[3].children[1].eventos.click();assert.equal(pedidos.find(p=>p.method==='DELETE').body,'{}');
});
test('submenu Categorias aparece somente em Acervo e Categorias, nas duas sidebars',()=>{
 for(const nome of ['acervo','categorias','dashboard','biblioteca','livroVivo','leitores','reservas','emprestimos','devolucoes','usuarios','Relatorios','meusEmprestimos']){
  const html=lerPagina(nome);
  assert.equal((html.match(/href="\/categorias.html"/g)||[]).length,['acervo','categorias'].includes(nome)?2:0,nome);
 }
 const acervo=lerPagina('acervo');assert.ok(!acervo.includes('id="gerenciarCategorias"'));assert.ok(!acervo.includes('id="formCategoria"'));assert.ok(acervo.includes('id="categoriaLivro"'));
});
