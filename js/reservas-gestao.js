// A gestão confirma a entrega física; só então o backend inicia os 30 dias.
const usuario=await window.sessaoPronta;
if(usuario && usuario.perfil!=='Leitor') {
    const area=document.createElement('section');area.className='content-card mb-4';
    const titulo=document.createElement('h3');titulo.textContent='Reservas aguardando retirada';
    const aviso=document.createElement('p');aviso.setAttribute('role','status');
    const atualizar=document.createElement('button');atualizar.type='button';atualizar.className='btn btn-outline-secondary mb-3';atualizar.textContent='Atualizar reservas';
    const lista=document.createElement('div');
    area.append(titulo,aviso,atualizar,lista);
    document.querySelector('main .page-header').after(area);
    async function carregar(){
        lista.replaceChildren();aviso.textContent='Carregando…';
        try {
            const r=await fetch('/api/reservas');const dados=await r.json();if(!r.ok)throw new Error(dados.erro);
            const pendentes=dados.filter(r=>r.status==='Pendente');aviso.textContent=pendentes.length?'Confira a entrega antes de confirmar.':'Nenhuma reserva pendente.';
            for(const reserva of pendentes){
                const linha=document.createElement('div');linha.className='border-bottom py-3 d-flex flex-wrap gap-2 align-items-center';
                const texto=document.createElement('span');texto.textContent=`${reserva.leitor} · ${reserva.livro} · ${reserva.codigo} · ${reserva.centro}`;linha.append(texto);
                for(const [acao,rotulo] of [['retirar','Confirmar retirada'],['cancelar','Cancelar reserva']]){
                    const b=document.createElement('button');b.type='button';b.className=acao==='retirar'?'btn btn-primary-custom':'btn btn-outline-danger';b.textContent=rotulo;
                    b.onclick=async()=>{
                        if(!confirm(acao==='retirar'?'O exemplar foi entregue ao leitor? Confirmar inicia o prazo de 30 dias.':'Cancelar esta reserva e liberar o exemplar?'))return;
                        b.disabled=true;
                        try{const r=await fetch(`/api/reservas/${reserva.id}/${acao}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});const d=await r.json();if(!r.ok)throw new Error(d.erro);location.reload();}
                        catch(erro){aviso.textContent=erro.message;b.disabled=false;}
                    };linha.append(b);
                }
                lista.append(linha);
            }
        }catch(erro){aviso.textContent=erro.message;}
    }
    atualizar.onclick=carregar;await carregar();
}
