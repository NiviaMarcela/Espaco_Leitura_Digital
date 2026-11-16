const el=id=>document.getElementById(id);
const normalizar=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const data=s=>new Date(s).toLocaleString('pt-BR');
const modalidade=t=>t==='definitiva'?'Definitiva':'Com possibilidade de devolução';
let exemplares=[],historico=[],selecionados=new Set(),ocupado=false;
async function api(caminho,dados) {
    const r=await fetch('/api/livro-vivo'+caminho,{method:dados?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(15000),
        headers:dados?{'Content-Type':'application/json'}:undefined,body:dados?JSON.stringify(dados):undefined});
    const body=await r.json();if(!r.ok)throw new Error(body.erro||'Falha ao consultar Livro Vivo.');return body;
}
function contar(){el('quantidadeLivroVivo').textContent=`${selecionados.size} exemplar(es) selecionado(s), incluindo os ocultos pela busca.`;el('transferirLivroVivo').disabled=ocupado||!selecionados.size;}
function listarDisponiveis(){
    const tabela=el('disponiveisLivroVivo');tabela.replaceChildren();
    const centro=Number(el('centroLivroVivo').value),busca=normalizar(el('buscaLivroVivo').value);
    for(const e of exemplares.filter(e=>e.centroId===centro&&normalizar(`${e.titulo} ${e.autor} ${e.codigo}`).includes(busca))){
        const linha=tabela.insertRow(),check=document.createElement('input');check.type='checkbox';check.className='form-check-input';check.checked=selecionados.has(e.id);check.setAttribute('aria-label',`Selecionar ${e.codigo} — ${e.titulo}`);
        check.addEventListener('change',()=>{check.checked?selecionados.add(e.id):selecionados.delete(e.id);contar();});linha.insertCell().append(check);
        for(const valor of [e.titulo+' — '+e.autor,e.codigo,e.centro])linha.insertCell().textContent=valor;
    }
    if(!tabela.rows.length){const celula=tabela.insertRow().insertCell();celula.colSpan=4;celula.textContent='Nenhum exemplar disponível para este Centro e busca.';}contar();
}
function listarHistorico(){
    const tabela=el('historicoLivroVivo');tabela.replaceChildren();
    const busca=normalizar(el('buscaHistoricoVivo').value),inicio=el('inicioHistoricoVivo').value,fim=el('fimHistoricoVivo').value,tipo=el('tipoHistoricoVivo').value;
    if(inicio&&fim&&inicio>fim){el('resumoLivroVivo').textContent='Revise o intervalo de datas.';el('imprimirLivroVivo').disabled=true;return;}
    const filtrados=historico.filter(t=>{
        const dia=new Date(t.criadaEm).toLocaleDateString('sv-SE');
        return (!inicio||dia>=inicio)&&(!fim||dia<=fim)&&(!tipo||tipo===t.modalidade)&&normalizar(`${t.localidade} ${t.centro} ${t.autorizadorNome} ${t.itens.map(i=>i.titulo+' '+i.codigo).join(' ')}`).includes(busca);
    });
    let total=0,retornados=0;
    for(const t of filtrados){
        total+=t.quantidade;retornados+=t.retornados;
        const linha=tabela.insertRow();linha.insertCell().textContent=data(t.criadaEm)+' · '+t.centro;
        const destino=linha.insertCell();destino.append(document.createTextNode(t.localidade+' '));const tag=document.createElement('span');tag.className='badge '+(t.modalidade==='definitiva'?'bg-danger-subtle text-danger-emphasis':'text-bg-info');tag.textContent=modalidade(t.modalidade);destino.append(tag);
        linha.insertCell().textContent=`${t.quantidade} enviados · ${t.retornados} retornados · ${t.quantidade-t.retornados} no destino`;
        linha.insertCell().textContent=t.autorizadorNome;
        const itens=linha.insertCell();
        for(const i of t.itens){
            const bloco=document.createElement('div');bloco.className='mb-2';bloco.textContent=`${i.codigo} — ${i.titulo}`;
            if(i.retornadoEm){const retorno=document.createElement('small');retorno.className='d-block text-success';retorno.textContent=`Retornou em ${data(i.retornadoEm)} · Recebido por ${i.recebedorNome}`;bloco.append(retorno);}
            else if(t.modalidade==='possivel_devolucao'){
                const botao=document.createElement('button');botao.type='button';botao.className='btn btn-sm btn-success ms-2 report-actions';botao.textContent='Registrar retorno';botao.disabled=ocupado;
                botao.addEventListener('click',()=>retornar(t,i));bloco.append(botao);
            }itens.append(bloco);
        }
    }
    el('resumoLivroVivo').textContent=`${filtrados.length} transferência(s) · ${total} exemplares enviados · ${retornados} retornados · ${total-retornados} no destino. Totais do histórico filtrado; uma cópia pode participar de mais de uma transferência após retornar.`;
    el('imprimirLivroVivo').disabled=ocupado||!filtrados.length;
    if(!filtrados.length){const celula=tabela.insertRow().insertCell();celula.colSpan=5;celula.textContent='Nenhuma transferência encontrada.';}
}
function bloquear(valor){ocupado=valor;el('camposLivroVivo').disabled=valor;el('atualizarLivroVivo').disabled=valor;contar();listarHistorico();}
async function carregar(){
    const [disponiveis,transferencias]=await Promise.all([api('/disponiveis'),api('')]);exemplares=disponiveis;historico=transferencias;
    selecionados=new Set([...selecionados].filter(id=>exemplares.some(e=>e.id===id)));
    listarDisponiveis();listarHistorico();
}
async function retornar(t,i){
    if(ocupado||!confirm(`Você recebeu e conferiu ${i.codigo} — ${i.titulo}? O exemplar voltará a ficar disponível no acervo.`))return;
    bloquear(true);let registrado=false;
    try{await api('/'+t.id+'/retorno',{exemplarIds:[i.exemplarId]});registrado=true;await carregar();el('avisoLivroVivo').textContent='Retorno registrado. Exemplar disponível novamente.';}
    catch(erro){el('avisoLivroVivo').textContent=registrado?'Retorno registrado, mas a atualização da tela falhou. Clique em Atualizar.':erro.message+' Atualize o histórico antes de tentar novamente.';}
    finally{bloquear(false);}
}
el('formLivroVivo').addEventListener('submit',async evento=>{
    evento.preventDefault();if(ocupado||!selecionados.size||!evento.target.reportValidity())return;
    const dados={localidade:el('localidadeLivroVivo').value.trim(),modalidade:el('modalidadeLivroVivo').value,exemplarIds:[...selecionados]};
    if(!confirm(`Confirmar transferência de ${dados.exemplarIds.length} exemplar(es) para ${dados.localidade}?\nModalidade: ${modalidade(dados.modalidade)}.\nVocê será registrado como autorizador e as cópias receberão baixa por doação livro vivo.`))return;
    bloquear(true);let registrada=false;
    try{const t=await api('',dados);registrada=true;selecionados.clear();await carregar();el('avisoLivroVivo').textContent=`Transferência #${t.id} registrada com ${t.quantidade} exemplar(es).`;}
    catch(erro){el('avisoLivroVivo').textContent=registrada?'Transferência registrada, mas a atualização da tela falhou. Clique em Atualizar.':erro.message+' Atualize o histórico antes de tentar novamente.';}
    finally{bloquear(false);}
});
el('centroLivroVivo').addEventListener('change',()=>{selecionados.clear();listarDisponiveis();});
el('buscaLivroVivo').addEventListener('input',listarDisponiveis);
for(const id of ['buscaHistoricoVivo','inicioHistoricoVivo','fimHistoricoVivo','tipoHistoricoVivo'])el(id).addEventListener('input',listarHistorico);
el('imprimirLivroVivo').addEventListener('click',()=>window.print());
el('atualizarLivroVivo').addEventListener('click',()=>iniciar());
async function iniciar(){
    bloquear(true);el('avisoLivroVivo').textContent='Carregando Livro Vivo…';
    try{
        const r=await fetch('/api/centros',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Não foi possível carregar os Centros.');
        const centros=await r.json(),anterior=el('centroLivroVivo').value;el('centroLivroVivo').replaceChildren(...centros.map(c=>new Option(c.nome,c.id)));
        if(centros.some(c=>String(c.id)===anterior))el('centroLivroVivo').value=anterior;
        await carregar();bloquear(false);el('avisoLivroVivo').textContent='Livro Vivo conectado. Selecione os exemplares para transferir.';
    }catch(erro){el('avisoLivroVivo').textContent=erro.message;ocupado=false;el('atualizarLivroVivo').disabled=false;}
}
iniciar();
