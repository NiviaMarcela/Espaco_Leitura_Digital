import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { lerPagina } from './ler-pagina.js';
class Elemento {
    constructor(texto='',valor=''){this.textContent=texto;this.value=valor;this.children=[];this.eventos={};this.disabled=false;}
    addEventListener(e,f){this.eventos[e]=f;}
    append(...e){this.children.push(...e);}
    replaceChildren(...e){this.children=e;}
    insertRow(){const e=new Elemento();this.append(e);return e;}
    insertCell(){return this.insertRow();}
    get rows(){return this.children;}
    setAttribute(){} reportValidity(){return true;}
}
async function preparar(){
    const elementos=new Map(),pedidos=[];const get=id=>{if(!elementos.has(id))elementos.set(id,new Elemento());return elementos.get(id);};
    get('centroLivroVivo').value='1';
    const exemplares=[{id:1,codigo:'EX-1',titulo:'Histórias',autor:'Autora',centroId:1,centro:'Maranhão'},
        {id:2,codigo:'EX-2',titulo:'Contos',autor:'Autora',centroId:1,centro:'Maranhão'},{id:3,codigo:'EX-3',titulo:'Histórias',autor:'Autora',centroId:2,centro:'Piauí'}];
    const historico=[{id:7,localidade:'Escola A',centro:'Maranhão',criadaEm:'2026-11-15T12:00:00Z',modalidade:'doacao',autorizadorNome:'Coord',quantidade:1,retornados:0,itens:[{id:8,exemplarId:10,codigo:'EX-10',titulo:'Contos'}]},
        {id:9,localidade:'Escola B',centro:'Maranhão',criadaEm:'2026-11-15T12:00:00Z',modalidade:'doacao',autorizadorNome:'Admin',quantidade:1,retornados:0,itens:[{id:9,exemplarId:11,codigo:'EX-11',titulo:'Contos'}]}];
    const contexto=vm.createContext({document:{getElementById:get,createElement:()=>new Elemento(),createTextNode:texto=>new Elemento(texto)},Option:Elemento,AbortSignal,confirm:()=>true,window:{print(){}},
        fetch:async(url,opcoes={})=>{pedidos.push({url,...opcoes});let body=[];
            if(url==='/api/centros')body=[{id:1,nome:'Maranhão'},{id:2,nome:'Piauí'}];
            if(url.endsWith('/disponiveis'))body=exemplares;
            if(url==='/api/livro-vivo')body=opcoes.method==='POST'?{id:20,quantidade:JSON.parse(opcoes.body).exemplarIds.length}:historico;
            return {ok:true,json:async()=>body};}
    });
    vm.runInContext(readFileSync(new URL('../../js/livro-vivo.js',import.meta.url),'utf8'),contexto);
    await new Promise(r=>setImmediate(r));return {get,pedidos};
}
test('seleção mantém cópias ocultas na busca, envia IDs e limpa ao mudar Centro',async()=>{
    const {get,pedidos}=await preparar();assert.equal(get('disponiveisLivroVivo').rows.length,2);
    const check=get('disponiveisLivroVivo').rows[0].children[0].children[0];check.checked=true;check.eventos.change();
    get('buscaLivroVivo').value='Contos';get('buscaLivroVivo').eventos.input();assert.match(get('quantidadeLivroVivo').textContent,/1 exemplar/);
    get('localidadeLivroVivo').value='Escola teste';
    await get('formLivroVivo').eventos.submit({preventDefault(){},target:get('formLivroVivo')});
    const post=pedidos.find(p=>p.method==='POST');assert.deepEqual(JSON.parse(post.body),{localidade:'Escola teste',modalidade:'doacao',exemplarIds:[1]});
    get('centroLivroVivo').value='2';get('centroLivroVivo').eventos.change();assert.match(get('quantidadeLivroVivo').textContent,/0 exemplar/);
});
test('doações oferecem retorno e filtro altera totais',async()=>{
    const {get,pedidos}=await preparar();const linhas=get('historicoLivroVivo').rows;
    assert.equal(linhas[0].children[0].children[0].textContent,'Escola A');
    assert.equal(get('totalDoadoVivo').textContent,2);
    const parcial=linhas[0].children[4].children[0],definitiva=linhas[1].children[4].children[0];
    assert.equal(parcial.children[0].textContent,'Registrar retorno');assert.equal(definitiva.children[0].textContent,'Registrar retorno');
    await parcial.children[0].eventos.click();const post=pedidos.find(p=>p.method==='POST');
    assert.equal(post.url,'/api/livro-vivo/7/retorno');assert.deepEqual(JSON.parse(post.body),{exemplarIds:[10]});
    get('buscaHistoricoVivo').value='Escola B';get('buscaHistoricoVivo').eventos.input();assert.equal(get('historicoLivroVivo').rows.length,1);assert.match(get('resumoLivroVivo').textContent,/1 exemplares enviados/);
    assert.equal(get('totalDoadoVivo').textContent,1);
    assert.equal(get('totalDestinoVivo').textContent,1);
});
test('Livro Vivo tem link nas duas sidebars e página restrita',()=>{
    for(const nome of ['dashboard','acervo','leitores','reservas','emprestimos','devolucoes','usuarios','Relatorios','biblioteca','meusEmprestimos','livroVivo']){
        const html=lerPagina(nome);
        assert.equal((html.match(/href="\/livroVivo.html"/g)||[]).length,2,nome);
        assert.equal((html.match(/data-livro-vivo-only/g)||[]).length,2,nome);
    }
    assert.match(lerPagina('livroVivo'),/data-auth-role="admin,coordenador"/);
});
