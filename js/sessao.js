// As credenciais ficam em cookie HttpOnly: nenhum token é salvo no localStorage.
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (entrada, opcoes = {}) => {
    const url = new URL(typeof entrada === 'string' ? entrada : entrada.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return fetchOriginal(entrada,opcoes);
    const headers = new Headers(opcoes.headers || (entrada instanceof Request ? entrada.headers : undefined));
    headers.set('X-Requested-With','EspacoLeitura');
    const resposta = await fetchOriginal(entrada,{...opcoes,headers,credentials:'same-origin'});
    if (resposta.status === 401 && !url.pathname.startsWith('/api/auth/')) location.assign('/login.html');
    return resposta;
};
window.sessaoPronta = (async () => {
    const r = await fetch('/api/auth/sessao');
    if (!r.ok) throw new Error('Não foi possível conferir a sessão. Atualize a página.');
    const { usuario } = await r.json();
    const publica = ['/biblioteca.html','/login.html','/cadastro.html','/'].includes(location.pathname);
    if (!usuario && !publica) { location.replace('/login.html'); return null; }
    window.usuarioAtual = usuario;
    for (const bloco of document.querySelectorAll('.user-info')) {
        bloco.replaceChildren();
        if (usuario) {
            const nome = document.createElement('span');
            nome.textContent = `${usuario.nome} · ${usuario.perfil === 'Administrador' ? 'Administrador' : usuario.centro}`;
            const conta = document.createElement('a'); conta.href=usuario.perfil==='Leitor'?'/biblioteca.html#areaLeitor':'/conta.html'; conta.textContent='Minha conta'; conta.className='btn btn-sm btn-outline-primary';
            const sair = document.createElement('button'); sair.type='button'; sair.textContent='Sair'; sair.className='btn btn-sm btn-outline-secondary';
            sair.onclick = async () => {
                sair.disabled=true;
                try { const resposta=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
                    if(!resposta.ok) throw new Error(); location.assign('/login.html');
                } catch { sair.disabled=false; sair.textContent='Falha ao sair; tente novamente'; }
            };
            bloco.append(nome,conta,sair);
            if(usuario.perfil!=='Leitor' && location.pathname==='/biblioteca.html') {
                const gestao=document.createElement('a');gestao.href='/dashboard.html';gestao.textContent='Área de gestão';gestao.className='btn btn-sm btn-primary-custom';bloco.append(gestao);
            }
        } else {
            const entrar=document.createElement('a'); entrar.href='/login.html'; entrar.textContent='Entrar'; entrar.className='btn btn-primary-custom'; bloco.append(entrar);
        }
    }
    if (usuario?.perfil === 'Administrador') for (const menu of document.querySelectorAll('nav.menu')) {
        const link=document.createElement('a'); link.href='/usuarios.html';link.textContent='Usuários';link.className='menu-item';menu.append(link);
    }
    for (const link of document.querySelectorAll('nav.menu a')) {
        const atual = new URL(link.href).pathname === location.pathname;
        link.classList.toggle('active', atual);
        if (atual) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
    }
    if (usuario?.centroId) {
        const legenda = document.getElementById('leitoresAtivos')?.parentElement.querySelector('small');
        if (legenda) legenda.textContent = 'cadastros ativos no seu centro';
    }
    document.querySelectorAll('[data-admin]').forEach(e=>e.hidden=usuario?.perfil!=='Administrador');
    return usuario;
})();
window.sessaoPronta.catch(erro => {
    const aviso=document.createElement('p');aviso.className='alert alert-danger';aviso.setAttribute('role','alert');aviso.textContent=erro.message;
    document.querySelector('main')?.prepend(aviso);
});
window.addEventListener('pageshow', evento => { if(evento.persisted) location.reload(); });
