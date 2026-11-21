const form=document.getElementById('formRecuperacao');
const botao=document.getElementById('solicitarRecuperacao');
const aviso=document.getElementById('avisoRecuperacao');
form.addEventListener('submit',async evento=>{
    evento.preventDefault();
    if(botao.disabled || !form.reportValidity())return;
    botao.disabled=true;aviso.textContent='Registrando solicitação…';
    try {
        const resposta=await fetch('/api/auth/recuperacao',{
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({email:document.getElementById('emailRecuperacao').value.trim()}),signal:AbortSignal.timeout(15000)
        });
        const dados=await resposta.json();
        if(!resposta.ok)throw new Error(dados.erro || 'Não foi possível registrar a solicitação.');
        aviso.textContent=dados.mensagem;form.reset();
    } catch(erro) {
        aviso.textContent=erro.name==='TimeoutError' || erro instanceof TypeError
            ? 'Não foi possível confirmar o envio. Procure a equipe do seu Centro ou tente novamente mais tarde.'
            : erro.message;
    } finally {botao.disabled=false;aviso.focus();}
});
