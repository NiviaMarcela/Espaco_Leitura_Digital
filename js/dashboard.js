const el = id => document.getElementById(id);
const indicadores = ['totalLivros', 'exemplaresDisponiveis', 'emprestimosAbertos', 'emprestimosAtrasados', 'leitoresAtivos'];
const numero = new Intl.NumberFormat('pt-BR');
const data = valor => valor.split('-').reverse().join('/');
let carregando = false;

function mensagemTabela(texto) {
    const tabela = el('emprestimosRecentes');
    tabela.replaceChildren();
    const celula = tabela.insertRow().insertCell();
    celula.colSpan = 5;
    celula.textContent = texto;
}

function renderizar(dados) {
    for (const id of indicadores) el(id).textContent = numero.format(dados[id]);
    mensagemTabela('Nenhum empréstimo registrado.');
    if (!dados.recentes.length) return;
    const tabela = el('emprestimosRecentes');
    tabela.replaceChildren();
    for (const item of dados.recentes) {
        const linha = tabela.insertRow();
        // textContent mostra os cadastros como texto, sem interpretar HTML.
        for (const texto of [item.leitor, `${item.livro} · ${item.codigo} · ${item.centro}`,
            data(item.dataEmprestimo), data(item.dataPrevistaDevolucao)]) {
            linha.insertCell().textContent = texto;
        }
        const badge = document.createElement('span');
        badge.className = `badge-status ${item.status === 'Atrasado' ? 'badge-pink' : item.status === 'Devolvido' ? 'badge-green' : 'badge-purple'}`;
        badge.textContent = item.status;
        linha.insertCell().append(badge);
    }
}

async function carregar() {
    if (carregando) return;
    carregando = true;
    el('atualizarDashboard').disabled = true;
    el('dadosDashboard').setAttribute('aria-busy', 'true');
    el('avisoDashboard').textContent = 'Consultando os dados do Dashboard…';
    // Não apresentar números antigos como se estivessem atualizados em caso de falha.
    for (const id of indicadores) el(id).textContent = '—';
    mensagemTabela('Carregando empréstimos…');
    try {
        const resposta = await fetch('/api/dashboard', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!resposta.ok) throw new Error(resposta.status === 503
            ? 'O banco de dados está indisponível. Confira o PostgreSQL e tente atualizar.'
            : 'Não foi possível consultar o Dashboard. Confira o terminal do backend e tente atualizar.');
        renderizar(await resposta.json());
        el('avisoDashboard').textContent = `${window.usuarioAtual?.centro || "Dados de todos os centros"} · Atualizado às ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date())} (Fortaleza).`;
    } catch (erro) {
        for (const id of indicadores) el(id).textContent = '—';
        mensagemTabela('Dados indisponíveis. Use Atualizar para tentar novamente.');
        el('avisoDashboard').textContent = erro instanceof TypeError || erro.name === 'TimeoutError'
            ? 'Não foi possível conectar. Confira o backend e abra esta página pelo endereço http://127.0.0.1:3001/dashboard.html.'
            : erro.message;
    } finally {
        carregando = false;
        el('atualizarDashboard').disabled = false;
        el('dadosDashboard').setAttribute('aria-busy', 'false');
    }
}

el('atualizarDashboard').addEventListener('click', carregar);
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });
window.addEventListener('pageshow', evento => { if (evento.persisted) carregar(); });
carregar();
