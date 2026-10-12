/* =========================================================
   ESPAÇO DE LEITURA DIGITAL
   Página: Dashboard
   Resumo do acervo e da circulação, montado a partir da API.
========================================================= */

import { hojeCivil } from './datas.mjs';

const el = id => document.getElementById(id);
const formatarData = valor => valor ? valor.split('-').reverse().join('/') : '—';
const normalizarStatus = p => p.dataDevolucao ? 'Devolvido' : p.dataPrevistaDevolucao < hojeCivil() ? 'Atrasado' : 'Emprestado';
const classeStatus = status => status === 'Devolvido' ? 'badge-green' : status === 'Atrasado' ? 'badge-pink' : 'badge-purple';

// O mesmo padrão de requisição das outras páginas: erro de rede e erro da API
// viram mensagem em português, sem quebrar a tela.
async function api(caminho) {
    let resposta;
    try {
        resposta = await fetch(`/api${caminho}`, { signal: AbortSignal.timeout(15000) });
    } catch {
        throw new Error('Não foi possível conectar. Abra o dashboard em http://127.0.0.1:3001/dashboard.html com o backend iniciado.');
    }
    let resultado;
    try { resultado = await resposta.json(); }
    catch { throw new Error('Resposta inesperada. Abra http://127.0.0.1:3001/dashboard.html.'); }
    if (!resposta.ok) throw new Error(resultado.erro || (resposta.status === 503
        ? 'O banco de dados está indisponível.'
        : 'Não foi possível concluir a consulta.'));
    return resultado;
}

// Guardamos o que veio da API para recalcular o atraso quando o dia vira
// com a aba aberta, sem precisar consultar o servidor de novo.
let livros = [];
let emprestimos = [];

function iniciais(nome) {
    const partes = String(nome ?? '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    const primeira = partes[0][0];
    const segunda = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + segunda).toUpperCase();
}

function atualizarCards() {
    const disponiveis = livros.reduce((total, livro) =>
        total + livro.exemplares.filter(exemplar => exemplar.status === 'Disponível').length, 0);
    const emCurso = emprestimos.filter(p => !p.dataDevolucao);
    const atrasados = emprestimos.filter(p => normalizarStatus(p) === 'Atrasado');

    el('totalObrasDashboard').textContent = livros.length;
    el('disponiveisDashboard').textContent = disponiveis;
    el('emCursoDashboard').textContent = emCurso.length;
    el('atrasadosDashboard').textContent = atrasados.length;
}

function renderizarRecentes() {
    const tabela = el('tabelaRecentes');
    tabela.replaceChildren();
    // Mais recentes primeiro: data da retirada e, no empate, o último registro.
    const recentes = [...emprestimos]
        .sort((a, b) => (b.dataEmprestimo ?? '').localeCompare(a.dataEmprestimo ?? '') || b.id - a.id)
        .slice(0, 5);

    if (!recentes.length) {
        const linha = tabela.insertRow();
        const celula = linha.insertCell();
        celula.colSpan = 5;
        celula.textContent = 'Nenhum empréstimo registrado até agora.';
        return;
    }

    for (const p of recentes) {
        const status = normalizarStatus(p);
        const linha = tabela.insertRow();

        const celulaLeitor = linha.insertCell();
        const leitor = document.createElement('div');
        leitor.className = 'reader';
        const avatar = document.createElement('div');
        avatar.className = 'reader-avatar';
        avatar.textContent = iniciais(p.leitor);
        const nome = document.createElement('span');
        nome.textContent = p.leitor;
        leitor.append(avatar, nome);
        celulaLeitor.append(leitor);

        // Dados digitados entram como texto, nunca como HTML.
        for (const valor of [`${p.livro} · ${p.codigo}`, formatarData(p.dataEmprestimo),
            formatarData(p.dataDevolucao || p.dataPrevistaDevolucao)]) {
            linha.insertCell().textContent = valor;
        }

        const celulaStatus = linha.insertCell();
        const etiqueta = document.createElement('span');
        etiqueta.className = `badge-status ${classeStatus(status)}`;
        etiqueta.textContent = status;
        celulaStatus.append(etiqueta);
    }
}

function renderizar() {
    atualizarCards();
    renderizarRecentes();
}

function bloquear(bloqueado) {
    el('recarregarDashboard').disabled = bloqueado;
}

async function carregar() {
    bloquear(true);
    el('recarregarDashboard').hidden = true;
    el('avisoDashboard').textContent = 'Carregando o resumo…';
    try {
        // Duas consultas em paralelo: o resumo é calculado a partir delas.
        const [obras, circulacao] = await Promise.all([api('/livros'), api('/emprestimos')]);
        livros = obras;
        emprestimos = circulacao;
        renderizar();
        el('avisoDashboard').textContent = 'Resumo conectado ao banco de dados.';
    } catch (erro) {
        el('avisoDashboard').textContent = erro.message;
        el('recarregarDashboard').hidden = false;
        for (const id of ['totalObrasDashboard', 'disponiveisDashboard', 'emCursoDashboard', 'atrasadosDashboard']) {
            el(id).textContent = '—';
        }
        const tabela = el('tabelaRecentes');
        tabela.replaceChildren();
        const celula = tabela.insertRow().insertCell();
        celula.colSpan = 5;
        celula.textContent = 'Resumo não carregado.';
    } finally {
        bloquear(false);
    }
}

el('recarregarDashboard').addEventListener('click', carregar);
// Ao voltar à página em outro dia, o atraso exibido também é recalculado.
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderizar(); });
carregar();
