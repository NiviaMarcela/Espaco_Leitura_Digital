const form = document.getElementById('formLogin');
const erro = document.getElementById('erroLogin');
const botao = document.getElementById('entrarLogin');

function destino(usuario) {
    const proximo = new URLSearchParams(location.search).get('next');
    if (proximo?.startsWith('/') && !proximo.startsWith('//')
        && !proximo.startsWith('/login.html') && !proximo.startsWith('/alterarSenha.html')) return proximo;
    return usuario.perfil === 'admin' ? '/dashboard.html' : '/meusEmprestimos.html';
}

form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!form.reportValidity()) return;
    erro.textContent = '';
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    try {
        const resposta = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('emailLogin').value.trim(),
                senha: document.getElementById('senhaLogin').value
            }),
            signal: AbortSignal.timeout(15000)
        });
        const conteudo = await resposta.text();
        let usuario;
        try {
            usuario = conteudo ? JSON.parse(conteudo) : null;
        } catch {
            throw new Error(`O servidor respondeu em um formato inesperado (HTTP ${resposta.status}). Reinicie a API pelo terminal do backend e tente novamente.`);
        }
        if (!usuario || typeof usuario !== 'object') {
            throw new Error(`O servidor enviou uma resposta vazia (HTTP ${resposta.status}). Reinicie a API pelo terminal do backend e tente novamente.`);
        }
        if (!resposta.ok) throw new Error(usuario.erro || 'Não foi possível entrar.');
        location.assign(usuario.trocarSenha ? '/alterarSenha.html' : destino(usuario));
    } catch (falha) {
        erro.textContent = falha.name === 'TimeoutError'
            ? 'A tentativa demorou demais. Tente novamente.'
            : falha.message || 'Não foi possível conectar ao servidor.';
        erro.focus();
        botao.disabled = false;
        botao.textContent = 'Entrar';
    }
});
