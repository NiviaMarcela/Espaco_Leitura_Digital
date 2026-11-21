const form = document.getElementById('formAlterarSenha');
const erro = document.getElementById('erroAlterarSenha');
const botao = document.getElementById('salvarNovaSenha');
let conta = null;
let salvando = false;

async function carregarConta() {
    try {
        const resposta = await fetch('/api/auth/me', {cache:'no-store',signal:AbortSignal.timeout(10000)});
        if (resposta.status === 401) { location.replace('/login.html'); return; }
        if (!resposta.ok) throw new Error('Não foi possível verificar a conta. Entre novamente.');
        conta = await resposta.json();
        document.getElementById('contaAlterarSenha').value = conta.email;
        botao.disabled = false;
    } catch(falha) { erro.textContent = falha.message || 'Não foi possível verificar a sessão.'; }
}
document.getElementById('mostrarSenhas').addEventListener('change',evento=>{
    for (const id of ['senhaAtual','novaSenha','confirmarSenha']) document.getElementById(id).type=evento.target.checked?'text':'password';
});
document.getElementById('trocarContaSenha').addEventListener('click',async()=>{
    if(salvando)return;
    try {
        const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'}});
        if(!r.ok)throw new Error('Não foi possível sair. Tente novamente.');
        location.assign('/login.html');
    }catch(falha){erro.textContent=falha.message;}
});
form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (salvando || !conta || !form.reportValidity()) return;
    const senhaAtual = document.getElementById('senhaAtual').value;
    const novaSenha = document.getElementById('novaSenha').value;
    if (novaSenha !== document.getElementById('confirmarSenha').value) {
        erro.textContent = 'A confirmação não corresponde à nova senha.';erro.focus();return;
    }
    if(senhaAtual===novaSenha){erro.textContent='Escolha uma nova senha diferente da senha usada para entrar.';erro.focus();return;}
    erro.textContent = '';salvando = true;botao.disabled = true;botao.textContent = 'Salvando…';
    try {
        const resposta = await fetch('/api/auth/change-password', {
            method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({senhaAtual,novaSenha,usuarioId:conta.id}),signal:AbortSignal.timeout(15000)
        });
        const resultado = resposta.status===204?{}:await resposta.json();
        if(resposta.status===401){location.assign('/login.html');return;}
        if(!resposta.ok)throw new Error(resultado.erro || 'Não foi possível trocar a senha.');
        form.reset();
        for(const id of ['senhaAtual','novaSenha','confirmarSenha'])document.getElementById(id).type='password';
        erro.textContent='Senha alterada com sucesso. Abrindo sua área…';
        location.assign(['admin','coordenador'].includes(conta.perfil)?'/dashboard.html':['professor','funcionario'].includes(conta.perfil)?'/biblioteca.html':'/meusEmprestimos.html');
    } catch(falha) {
        erro.textContent=falha.name==='TimeoutError' || falha instanceof TypeError
            ? 'Não foi possível confirmar a alteração. Saia e tente entrar com a nova senha antes de repetir a troca.'
            : falha.message || 'Não foi possível conectar ao servidor.';
        erro.focus();salvando=false;botao.disabled=false;botao.textContent='Salvar nova senha';
    }
});
carregarConta();
