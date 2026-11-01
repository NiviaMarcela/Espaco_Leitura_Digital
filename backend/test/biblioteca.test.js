import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// DOM mínimo para exercitar a lógica sem depender de navegador ou PostgreSQL.
// Este teste não verifica aparência nem o comportamento do Bootstrap.
class Elemento {
    constructor(texto = '', valor = '') {
        this.textContent = texto;
        this.value = valor;
        this.children = [];
        this.dataset = {};
        this.checked = false;
        this.eventos = {};
    }
    append(...nos) { this.children.push(...nos); }
    replaceChildren(...nos) { this.children = nos; }
    add(no) { this.append(no); }
    setAttribute() {}
    addEventListener(evento, callback) { this.eventos[evento] = callback; }
    focus() {}
}

async function preparar(resposta, extras = {}) {
    const elementos = new Map();
    const get = id => {
        if (!elementos.has(id)) elementos.set(id, new Elemento());
        return elementos.get(id);
    };
    get('ordemBiblioteca').value = 'recentes';
    const contexto = vm.createContext({
        document: { getElementById: get, createElement: () => new Elemento() },
        Option: Elemento, AbortSignal,
        fetch: async () => resposta, ...extras
    });
    vm.runInContext(readFileSync(new URL('../../js/biblioteca.js', import.meta.url), 'utf8'), contexto);
    await new Promise(resolve => setImmediate(resolve));
    return { get, executar: codigo => vm.runInContext(codigo, contexto) };
}

const livros = [
    { id: 1, titulo: 'Ciências', autor: 'Ana', categoria: 'Estudo', faixaEtaria: 'Livre', exemplares: [{ status: 'Disponível' }] },
    { id: 2, titulo: 'Aventura', autor: 'Bia', categoria: 'Literatura', faixaEtaria: '6 a 9 anos', exemplares: [{ status: 'Emprestado' }] },
    { id: 3, titulo: 'Sem estoque', autor: 'Caio', categoria: 'Estudo', exemplares: [{ status: 'Baixado' }] }
];

test('leitor reserva pelo botão, acompanha e cancela; visitante vai ao cadastro', async () => {
    const usuario={perfil:'Leitor',centroId:1};
    const catalogo=[{...livros[0],exemplares:[{id:17,centroId:1,status:'Disponível'}]}];
    let reservas=[];const chamadas=[];
    const {get}=await preparar(null,{
        window:{usuarioAtual:usuario,sessaoPronta:Promise.resolve(usuario)},
        fetch:async(url,opcoes)=>{
            chamadas.push([url,opcoes?.body]);
            if(url==='/api/biblioteca')return {ok:true,json:async()=>catalogo};
            if(url==='/api/reservas' && opcoes?.method==='POST')reservas=[{id:1,livro:'Ciências',codigo:'EX17',centro:'Centro 1',status:'Pendente'}];
            if(url.endsWith('/cancelar'))reservas=[];
            return {ok:true,json:async()=>opcoes?.method==='POST'?{mensagem:'Concluído'}:reservas};
        }
    });
    const botao=get('tabelaBiblioteca').children[0].children[4].children[1];
    assert.equal(botao.textContent,'Pegar emprestado');
    await botao.eventos.click();
    assert.ok(chamadas.some(([url,body])=>url==='/api/reservas' && body==='{"exemplarId":17}'));
    assert.equal(get('listaReservas').children.length,1);
    await get('listaReservas').children[0].children[1].onclick();
    assert.equal(get('listaReservas').children.length,0);
    let destino;
    const visitante=await preparar({ok:true,json:async()=>catalogo},{location:{assign:url=>destino=url}});
    await visitante.get('tabelaBiblioteca').children[0].children[4].children[1].eventos.click();
    assert.equal(destino,'/cadastro.html');
});

test('catálogo combina busca sem acentos, filtros, ordenação e limpeza', async () => {
    const { get, executar } = await preparar({ ok: true, json: async () => livros });
    const titulos = () => get('tabelaBiblioteca').children.map(linha => linha.children[0].children[0].children[1].children[0].textContent);
    assert.deepEqual(titulos(), ['Sem estoque', 'Aventura', 'Ciências']);
    get('buscaBiblioteca').value = 'ciencias';
    executar('aplicarFiltros()');
    assert.deepEqual(titulos(), ['Ciências']);
    get('categoriaBiblioteca').value = 'Literatura';
    executar('aplicarFiltros()');
    assert.match(get('tabelaBiblioteca').children[0].children[0].textContent, /Nenhum livro encontrado/);
    get('limparBiblioteca').eventos.click();
    get('disponiveisBiblioteca').checked = true;
    executar('aplicarFiltros()');
    assert.deepEqual(titulos(), ['Ciências']);
    get('limparBiblioteca').eventos.click();
    get('faixaBiblioteca').value = '6 a 9 anos';
    executar('aplicarFiltros()');
    assert.deepEqual(titulos(), ['Aventura']);
    get('limparBiblioteca').eventos.click();
    get('ordemBiblioteca').value = 'titulo';
    executar('aplicarFiltros()');
    assert.deepEqual(titulos(), ['Aventura', 'Ciências', 'Sem estoque']);
});

test('catálogo distingue banco indisponível de acervo vazio', async () => {
    const falha = await preparar({ ok: false });
    assert.equal(falha.get('recarregarBiblioteca').hidden, false);
    assert.equal(falha.get('buscaBiblioteca').disabled, true);
    assert.match(falha.get('avisoBiblioteca').textContent, /Não foi possível/);
    const vazio = await preparar({ ok: true, json: async () => [] });
    assert.equal(vazio.get('buscaBiblioteca').disabled, false);
    assert.match(vazio.get('tabelaBiblioteca').children[0].children[0].textContent, /Nenhum livro cadastrado/);
});
