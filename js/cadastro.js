const form=document.getElementById('formCadastro');
const aviso=document.getElementById('avisoCadastro');
const botao=document.getElementById('cadastrar');
try {
    const resposta=await fetch('/api/biblioteca/centros');
    if(!resposta.ok) throw new Error('Não foi possível carregar os centros. Atualize a página.');
    for(const c of await resposta.json()) form.centroId.add(new Option(c.nome,c.id));
    botao.disabled=false;aviso.textContent='';
} catch(erro) {aviso.textContent=erro.message;}
form.addEventListener('submit',async evento=>{
    evento.preventDefault();
    if(form.senha.value!==form.confirmacao.value){aviso.textContent='As senhas não conferem.';return;}
    botao.disabled=true;aviso.textContent='Criando cadastro…';
    try {
        const dados=Object.fromEntries(new FormData(form));
        dados.centroId=Number(dados.centroId);delete dados.confirmacao;
        const r=await fetch('/api/auth/cadastro',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)});
        const d=await r.json();if(!r.ok)throw new Error(d.erro);
        form.reset();aviso.textContent=d.mensagem;
        const link=document.createElement('a');link.href='/login.html';link.textContent=' Entrar para reservar';aviso.append(link);
    } catch(erro) {aviso.textContent=erro.message;} finally {botao.disabled=false;}
});
