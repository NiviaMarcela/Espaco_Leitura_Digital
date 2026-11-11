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
    window.usuarioAtual = usuario;
    document.body.dataset.userRole = usuario.perfil;
    linksAnonimos.forEach(link => { link.hidden = true; });
    document.querySelectorAll('[data-gestao-only]').forEach(link => { link.hidden = !['admin','coordenador','professor','funcionario'].includes(usuario.perfil); });
    document.querySelectorAll('[data-dashboard-only]').forEach(link => { link.hidden = !['admin','coordenador'].includes(usuario.perfil); });
    document.querySelectorAll('[data-usuarios-only]').forEach(link => { link.hidden = !['admin','coordenador'].includes(usuario.perfil); });
    document.querySelectorAll('[data-relatorios-only]').forEach(link => { link.hidden = !['admin','coordenador','professor'].includes(usuario.perfil); });
    if (['admin', 'coordenador', 'professor', 'funcionario'].includes(usuario.perfil)) {
        atualizarContadorReservas();
        atualizarContadorDevolucoes();
    }
    if (['admin', 'coordenador'].includes(usuario.perfil)) {
        atualizarContadorSolicitacoesSenha();
    }
    if (usuario.perfil === 'admin') linksAdmin.forEach(link => { link.hidden = false; });
    if (usuario.trocarSenha && pagina !== '/alterarSenha.html') {
        location.replace('/alterarSenha.html');
        return;
    }
    if (perfilEsperado && perfilEsperado !== 'public' && !perfilEsperado.split(',').includes(usuario.perfil)) {
        location.replace(['admin','coordenador'].includes(usuario.perfil) ? '/dashboard.html' : '/biblioteca.html');
        return;
    }
    const identificacao = document.querySelector('.user-info');
    if (identificacao) {
        let nome = identificacao.querySelector('strong');
        let perfil = identificacao.querySelector('span');
        if (!nome || !perfil) {
            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = (usuario.nome || usuario.email).slice(0, 2).toLocaleUpperCase('pt-BR');
            const detalhes = document.createElement('div');
            detalhes.className = 'd-none d-md-block';
            nome = document.createElement('strong');
            perfil = document.createElement('span');
            detalhes.append(nome, perfil);
            identificacao.replaceChildren(avatar, detalhes);
        }
        nome.textContent = usuario.nome || usuario.email;
        perfil.textContent = ({ admin: 'Administrador', coordenador: 'Coordenador', professor: 'Professor', funcionario: 'Funcionário', leitor: 'Leitor' })[usuario.perfil];
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

async function atualizarContadorReservas() {
    const indicadores = [...document.querySelectorAll('[data-reservas-count]')];
    if (!indicadores.length) return;
    try {
        const resposta = await fetch('/api/reservas', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        let reservas;
        try { reservas = await resposta.json(); }
        catch { throw new Error('Resposta inválida ao consultar reservas.'); }
        if (!resposta.ok) throw new Error(reservas.erro || 'Não foi possível consultar reservas.');
        if (!Array.isArray(reservas)) throw new Error('Lista de reservas inválida.');
        indicadores.forEach(indicador => {
            indicador.textContent = String(reservas.length);
            indicador.hidden = reservas.length === 0;
            indicador.title = `${reservas.length} reserva(s) aguardando retirada`;
            indicador.parentElement.setAttribute('aria-label', `Reservas, ${reservas.length} aguardando retirada`);
        });
    } catch (erro) {
        indicadores.forEach(indicador => {
            indicador.textContent = '!';
            indicador.hidden = false;
            indicador.title = erro.message;
            indicador.parentElement.setAttribute('aria-label', 'Reservas, não foi possível consultar a quantidade');
        });
    }
}

function hojeEmFortaleza() {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const valor = tipo => partes.find(parte => parte.type === tipo).value;
    return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

function somarDias(data, dias) {
    const resultado = new Date(`${data}T00:00:00Z`);
    resultado.setUTCDate(resultado.getUTCDate() + dias);
    return resultado.toISOString().slice(0, 10);
}

async function atualizarContadorDevolucoes() {
    const indicadores = [...document.querySelectorAll('[data-devolucoes-count]')];
    if (!indicadores.length) return;
    try {
        const resposta = await fetch('/api/emprestimos', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        let emprestimos;
        try { emprestimos = await resposta.json(); }
        catch { throw new Error('Resposta inválida ao consultar empréstimos.'); }
        if (!resposta.ok) throw new Error(emprestimos.erro || 'Não foi possível consultar empréstimos.');
        if (!Array.isArray(emprestimos)) throw new Error('Lista de empréstimos inválida.');
        const hoje = hojeEmFortaleza();
        const limite = somarDias(hoje, 7);
        const abertos = emprestimos.filter(item => !item.dataDevolucao);
        const vencidos = abertos.filter(item => item.status === 'Atrasado').length;
        const vencendo = abertos.filter(item => item.dataPrevistaDevolucao >= hoje
            && item.dataPrevistaDevolucao <= limite).length;
        const total = vencidos + vencendo;
        indicadores.forEach(indicador => {
            indicador.textContent = String(total);
            indicador.hidden = total === 0;
            indicador.title = `${vencidos} vencido(s); ${vencendo} vence(m) nos próximos 7 dias`;
            indicador.parentElement.setAttribute('aria-label', `Devoluções, ${vencidos} vencido(s) e ${vencendo} vencendo nos próximos 7 dias`);
        });
    } catch (erro) {
        indicadores.forEach(indicador => {
            indicador.textContent = '!';
            indicador.hidden = false;
            indicador.title = erro.message;
            indicador.parentElement.setAttribute('aria-label', 'Devoluções, não foi possível consultar os prazos');
        });
    }
}

async function atualizarContadorSolicitacoesSenha() {
    const indicadores = [...document.querySelectorAll('[data-solicitacoes-senha-count]')];
    if (!indicadores.length) return;
    try {
        const resposta = await fetch('/api/recuperacoes/contagem', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        let resultado;
        try { resultado = await resposta.json(); }
        catch { throw new Error('Resposta inválida ao consultar pedidos de senha.'); }
        if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível consultar os pedidos de senha.');
        if (!Number.isInteger(resultado.quantidade) || resultado.quantidade < 0) throw new Error('Contagem de pedidos de senha inválida.');
        const quantidade = resultado.quantidade;
        indicadores.forEach(indicador => {
            indicador.textContent = String(quantidade);
            indicador.hidden = quantidade === 0;
            indicador.title = `${quantidade} pedido(s) de redefinição de senha aguardando análise`;
            indicador.parentElement.setAttribute('aria-label', `Usuários, ${quantidade} pedido(s) de senha aguardando análise`);
        });
    } catch (erro) {
        indicadores.forEach(indicador => {
            indicador.textContent = '!';
            indicador.hidden = false;
            indicador.title = erro.message;
            indicador.parentElement.setAttribute('aria-label', 'Usuários, não foi possível consultar pedidos de senha');
        });
    }
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.usuarioAtual
        && ['admin', 'coordenador', 'professor', 'funcionario'].includes(window.usuarioAtual.perfil)) {
        atualizarContadorReservas();
        atualizarContadorDevolucoes();
    }
    if (!document.hidden && ['admin', 'coordenador'].includes(window.usuarioAtual?.perfil)) {
        atualizarContadorSolicitacoesSenha();
    }
});
window.setInterval(() => {
    if (window.usuarioAtual
        && ['admin', 'coordenador', 'professor', 'funcionario'].includes(window.usuarioAtual.perfil)) {
        atualizarContadorReservas();
        atualizarContadorDevolucoes();
    }
    if (['admin', 'coordenador'].includes(window.usuarioAtual?.perfil)) {
        atualizarContadorSolicitacoesSenha();
    }
}, 60000);
document.addEventListener('solicitacoes-senha-atualizadas', () => {
    if (['admin', 'coordenador'].includes(window.usuarioAtual?.perfil)) atualizarContadorSolicitacoesSenha();
});

carregarUsuario().catch(() => {
    if (perfilEsperado && perfilEsperado !== 'public') {
        location.replace(`/login.html?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`);
    }
});
