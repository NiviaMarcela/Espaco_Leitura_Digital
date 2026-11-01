const perfilEsperado = document.body.dataset.authRole;
const pagina = location.pathname;
const linksAdmin = [...document.querySelectorAll('[data-admin-only]')];
const linksAnonimos = [...document.querySelectorAll('[data-anonymous-only]')];
linksAdmin.forEach(link => { link.hidden = true; });

async function carregarUsuario() {
    const resposta = await fetch('/api/auth/me', { cache: 'no-store' });
    if (!resposta.ok) {
        if (perfilEsperado && perfilEsperado !== 'public') {
            const retorno = `${location.pathname}${location.search}`;
            location.replace(`/login.html?next=${encodeURIComponent(retorno)}`);
        }
        return;
    }
    const usuario = await resposta.json();
    linksAnonimos.forEach(link => { link.hidden = true; });
    if (usuario.perfil === 'admin') linksAdmin.forEach(link => { link.hidden = false; });
    if (usuario.trocarSenha && pagina !== '/alterarSenha.html') {
        location.replace('/alterarSenha.html');
        return;
    }
    if (perfilEsperado && perfilEsperado !== 'public' && usuario.perfil !== perfilEsperado) {
        location.replace(usuario.perfil === 'admin' ? '/dashboard.html' : '/biblioteca.html');
        return;
    }
    const identificacao = document.querySelector('.user-info');
    if (identificacao) {
        const nome = identificacao.querySelector('strong');
        const perfil = identificacao.querySelector('span');
        if (nome) nome.textContent = usuario.nome || usuario.email;
        if (perfil) perfil.textContent = usuario.perfil === 'admin' ? 'Administrador' : 'Leitor';
        const alterar = document.createElement('a');
        alterar.href = '/alterarSenha.html';
        alterar.className = 'btn btn-secondary-custom btn-sm ms-2';
        alterar.textContent = 'Alterar senha';
        const sair = document.createElement('button');
        sair.type = 'button';
        sair.className = 'btn btn-secondary-custom btn-sm ms-2';
        sair.textContent = 'Sair';
        sair.addEventListener('click', async () => {
            sair.disabled = true;
            try {
                const encerrada = await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!encerrada.ok) throw new Error('Não foi possível encerrar a sessão. Tente novamente.');
                location.assign('/login.html');
            } catch (falha) {
                sair.disabled = false;
                let aviso = identificacao.querySelector('[role="alert"]');
                if (!aviso) {
                    aviso = document.createElement('span');
                    aviso.setAttribute('role', 'alert');
                    aviso.className = 'text-danger ms-2';
                    identificacao.append(aviso);
                }
                aviso.textContent = falha.message || 'Não foi possível conectar para encerrar a sessão.';
            }
        });
        identificacao.append(alterar, sair);
    }
}

carregarUsuario().catch(() => {
    if (perfilEsperado && perfilEsperado !== 'public') {
        location.replace(`/login.html?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
    }
});
