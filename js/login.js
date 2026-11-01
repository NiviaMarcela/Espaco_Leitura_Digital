const form=document.getElementById('formLogin');
const aviso=document.getElementById('avisoLogin');
form.addEventListener('submit',async evento=>{
    evento.preventDefault();
    const botao=form.querySelector('button'); botao.disabled=true; aviso.textContent='Entrando…';
    try {
        const resposta=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({email:form.email.value,senha:form.senha.value})});
        const dados=await resposta.json();
        if(!resposta.ok) throw new Error(dados.erro || 'Não foi possível entrar.');
        form.senha.value='';location.assign(dados.perfil==='Leitor'?'/biblioteca.html':'/dashboard.html');
    } catch(erro){ aviso.textContent=erro instanceof TypeError?'Não foi possível conectar ao servidor.':erro.message; }
    finally {botao.disabled=false;}
});
