const el=id=>document.getElementById(id);
const normalizar=valor=>String(valor).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
let categorias=[],editando=null,ocupado=false,carregado=false;
async function api(caminho,metodo='GET',dados){
    const resposta=await fetch('/api'+caminho,{method:metodo,cache:'no-store',signal:AbortSignal.timeout(15000),
        headers:dados?{'Content-Type':'application/json'}:undefined,body:dados?JSON.stringify(dados):undefined});
    const resultado=await resposta.json();
    if(!resposta.ok)throw new Error(resultado.erro||'Não foi possível concluir a operação.');
    return resultado;
}
function bloquear(valor){
    ocupado=valor;el('camposCategoria').disabled=valor||!carregado;
    el('centroCategoria').disabled=editando!==null;
    el('atualizarCategorias').disabled=valor;renderizar();
}
function limpar(){
    editando=null;el('nomeCategoria').value='';el('centroCategoria').disabled=false;
    el('cancelarCategoria').hidden=true;el('tituloCategoria').textContent='Cadastrar categoria';el('salvarCategoria').textContent='Cadastrar';
}
function editar(categoria){
    if(ocupado)return;
    editando=categoria.id;el('centroCategoria').value=String(categoria.centroId);el('centroCategoria').disabled=true;
    el('nomeCategoria').value=categoria.nome;el('cancelarCategoria').hidden=false;
    el('tituloCategoria').textContent='Editar categoria';el('salvarCategoria').textContent='Salvar alterações';
    el('nomeCategoria').focus();el('formCategoria').scrollIntoView({behavior:'smooth',block:'center'});
}
function renderizar(){
    const tabela=el('tabelaCategorias');tabela.replaceChildren();
    const centro=Number(el('filtroCentroCategoria').value),busca=normalizar(el('buscaCategoria').value);
    const lista=categorias.filter(c=>(!centro||c.centroId===centro)&&normalizar(c.nome).includes(busca));
    for(const c of lista){
        const linha=tabela.insertRow();for(const valor of [c.nome,c.centro,c.livros])linha.insertCell().textContent=valor;
        const acoes=linha.insertCell();
        for(const [texto,classe,acao] of [['Editar','btn-primary',()=>editar(c)],['Excluir','btn-outline-danger',()=>excluir(c)]]){
            const botao=document.createElement('button');botao.type='button';botao.className='btn btn-sm me-2 '+classe;botao.textContent=texto;
            botao.disabled=ocupado;botao.addEventListener('click',acao);acoes.append(botao);
        }
    }
    if(!lista.length){const celula=tabela.insertRow().insertCell();celula.colSpan=4;celula.textContent=carregado?'Nenhuma categoria encontrada.':'Aguardando carregamento das categorias.';}
}
async function atualizarLista(){categorias=await api('/categorias');renderizar();}
async function excluir(categoria){
    if(ocupado||!confirm(`Excluir a categoria “${categoria.nome}” do ${categoria.centro}?`))return;
    bloquear(true);let excluida=false;
    try{
        await api('/categorias/'+categoria.id,'DELETE',{});excluida=true;
        if(editando===categoria.id)limpar();
        await atualizarLista();el('avisoCategorias').textContent='Categoria excluída.';
    }catch(erro){el('avisoCategorias').textContent=excluida?'Categoria excluída, mas a lista não atualizou. Clique em Atualizar.':erro.message;}
    finally{bloquear(false);}
}
el('formCategoria').addEventListener('submit',async evento=>{
    evento.preventDefault();if(ocupado||!carregado||!evento.target.reportValidity())return;
    const dados={nome:el('nomeCategoria').value.trim(),centroId:Number(el('centroCategoria').value)};
    if(!dados.nome){el('avisoCategorias').textContent='Informe o nome da categoria.';return;}
    bloquear(true);let salva=false;
    try{
        await api('/categorias'+(editando?'/'+editando:''),editando?'PUT':'POST',dados);salva=true;limpar();
        await atualizarLista();el('avisoCategorias').textContent='Categoria salva. Os livros vinculados usam o nome atualizado.';
    }catch(erro){el('avisoCategorias').textContent=salva?'Categoria salva, mas a lista não atualizou. Clique em Atualizar.':erro.message;}
    finally{bloquear(false);}
});
el('cancelarCategoria').addEventListener('click',()=>{if(!ocupado)limpar();});
el('buscaCategoria').addEventListener('input',renderizar);
el('filtroCentroCategoria').addEventListener('change',renderizar);
el('atualizarCategorias').addEventListener('click',carregar);
async function carregar(){
    if(ocupado)return;bloquear(true);el('avisoCategorias').textContent='Carregando categorias…';
    try{
        const [centros,lista]=await Promise.all([api('/centros'),api('/categorias')]);
        for(const id of ['centroCategoria','filtroCentroCategoria']){
            const select=el(id),anterior=select.value;
            select.replaceChildren(new Option(id==='centroCategoria'?'Selecione o Centro':'Todos os Centros',''));
            centros.forEach(c=>select.add(new Option(c.nome,String(c.id))));
            if(centros.some(c=>String(c.id)===anterior))select.value=anterior;
            else if(centros.length===1)select.value=String(centros[0].id);
        }
        categorias=lista;carregado=true;el('avisoCategorias').textContent='Categorias atualizadas.';
    }catch(erro){el('avisoCategorias').textContent=erro.message;}
    finally{bloquear(false);}
}
carregar();
