const form=document.getElementById('formSenha');const aviso=document.getElementById('avisoSenha');
form.addEventListener('submit',async e=>{
    e.preventDefault();if(form.novaSenha.value!==form.confirmacao.value){aviso.textContent='As novas senhas não coincidem.';return;}
    const b=form.querySelector('button');b.disabled=true;
    try{const r=await fetch('/api/auth/senha',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({senhaAtual:form.senhaAtual.value,novaSenha:form.novaSenha.value})});
        const d=await r.json();if(!r.ok)throw new Error(d.erro);form.reset();aviso.textContent=d.mensagem;location.assign('/login.html');
    }catch(erro){aviso.textContent=erro.message;}finally{b.disabled=false;}
});
