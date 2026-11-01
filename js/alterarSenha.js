const form = document.getElementById('formAlterarSenha');
const erro = document.getElementById('erroAlterarSenha');
const botao = document.getElementById('salvarNovaSenha');

form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!form.reportValidity()) return;
    const senhaAtual = document.getElementById('senhaAtual').value;
    const novaSenha = document.getElementById('novaSenha').value;
    if (novaSenha !== document.getElementById('confirmarSenha').value) {
        erro.textContent = 'A confirmação não corresponde à nova senha.';
        erro.focus();
        return;
    }
    erro.textContent = '';
    botao.disabled = true;
    botao.textContent = 'Salvando…';
    try {
        const resposta = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senhaAtual, novaSenha }),
            signal: AbortSignal.timeout(15000)
        });
        const resultado = resposta.status === 204 ? {} : await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível trocar a senha.');
        const sessao = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!sessao.ok) throw new Error('A senha foi alterada. Entre novamente para continuar.');
        const usuario = await sessao.json();
        location.assign(usuario.perfil === 'admin' ? '/dashboard.html' : '/meusEmprestimos.html');
    } catch (falha) {
        erro.textContent = falha.message || 'Não foi possível conectar ao servidor.';
        erro.focus();
        botao.disabled = false;
        botao.textContent = 'Salvar nova senha';
    }
});
