import { hojeCivil } from './datas.mjs';

const el = id => document.getElementById(id);
const data = valor => valor ? valor.split('-').reverse().join('/') : '—';
const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const atraso = (prazo, fim = hojeCivil()) => Math.max(0, Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${prazo}T00:00:00Z`)) / 86400000));
let registros = [];
let selecionado = null;
let ocupado = false;
let carregando = false;

async function api(caminho, dados) {
    let resposta;
    try {
        resposta = await fetch(`/api${caminho}`, { method: dados ? 'POST' : 'GET',
            headers: dados ? { 'Content-Type': 'application/json' } : {},
            body: dados ? JSON.stringify(dados) : undefined, signal: AbortSignal.timeout(15000) });
    } catch {
        throw new Error(dados ? 'Não foi possível confirmar a gravação. Feche o formulário e atualize a lista antes de tentar novamente.'
            : 'Não foi possível conectar. Verifique o backend e abra http://127.0.0.1:3001/devolucoes.html.');
    }
    let resultado;
    try { resultado = await resposta.json(); } catch { throw new Error('Resposta inesperada. Abra http://127.0.0.1:3001/devolucoes.html.'); }
    if (!resposta.ok) throw new Error(resposta.status === 503 ? 'O banco de dados está indisponível.' : resultado.erro || 'Não foi possível concluir a operação.');
    return resultado;
}

function renderizar() {
    const filtro = el('filtroDevolucao').value;
    const busca = normalizar(el('buscaDevolucao').value.trim());
    const lista = registros.filter(p => normalizar(`${p.leitor} ${p.matriculaCodigo || ''} ${p.livro} ${p.codigo}`).includes(busca)
        && (filtro === 'todos' || (filtro === 'devolvidos' ? Boolean(p.dataDevolucao)
            : !p.dataDevolucao && (filtro === 'pendentes' || atraso(p.dataPrevistaDevolucao) > 0))));
    el('resumoDevolucoes').textContent = `${lista.length} registro(s) exibido(s) · ${registros.filter(p => !p.dataDevolucao).length} aguardando devolução · ${registros.filter(p => p.dataDevolucao).length} devolvido(s)`;
    const tabela = el('tabelaDevolucoes');
    tabela.replaceChildren();
    if (!lista.length) {
        const celula = tabela.insertRow().insertCell(); celula.colSpan = 6;
        celula.textContent = 'Nenhum empréstimo corresponde a esta busca e situação.';
    }
    for (const p of lista) {
        const dias = p.devolucao?.diasAtraso ?? atraso(p.dataPrevistaDevolucao, p.dataDevolucao || hojeCivil());
        const linha = tabela.insertRow();
        if (!p.dataDevolucao && dias) linha.className = 'table-warning';
        for (const valor of [`${p.leitor}${p.matriculaCodigo ? ' · ' + p.matriculaCodigo : ''}`,
            `${p.livro} · ${p.codigo} · ${p.centro}`, data(p.dataPrevistaDevolucao), data(p.dataDevolucao),
            `${p.dataDevolucao ? 'Devolvido' : dias ? 'Atrasado' : 'No prazo'}${dias ? ` · ${dias} dia(s) de atraso` : ''}`]) {
            linha.insertCell().textContent = valor;
        }
        const botao = document.createElement('button'); botao.type = 'button';
        botao.className = 'btn btn-primary-custom btn-sm';
        botao.textContent = p.dataDevolucao ? 'Detalhes' : 'Devolver';
        botao.setAttribute('aria-label', `${p.dataDevolucao ? 'Detalhes da devolução' : 'Devolver exemplar'} ${p.codigo} de ${p.leitor}`);
        botao.disabled = ocupado;
        botao.addEventListener('click', () => abrir(p.id));
        linha.insertCell().append(botao);
    }
}

function bloquear(bloqueado) {
    el('modalDevolucao').querySelectorAll('select, textarea, button').forEach(c => c.disabled = bloqueado);
}
function mostrar(p) {
    const devolvido = Boolean(p.dataDevolucao);
    el('tituloDevolucao').textContent = devolvido ? 'Devolução registrada' : 'Registrar devolução';
    el('identificacaoDevolucao').textContent = `${p.leitor} · ${p.livro} · ${p.codigo} · ${p.centro}`;
    el('datasDevolucao').textContent = `Retirada: ${data(p.dataEmprestimo)} · Prazo: ${data(p.dataPrevistaDevolucao)} · Devolução: ${data(p.dataDevolucao || hojeCivil())}`;
    const dias = p.devolucao?.diasAtraso ?? atraso(p.dataPrevistaDevolucao, p.dataDevolucao || hojeCivil());
    el('situacaoDevolucao').textContent = dias ? `${dias} dia(s) de atraso. O atraso ficará no histórico, sem cobrança de multa.` : 'Devolução dentro do prazo.';
    el('camposDevolucao').hidden = devolvido;
    el('historicoDevolucao').hidden = !devolvido;
    el('confirmarDevolucao').hidden = devolvido;
    // Campos ocultos não devem participar da validação nativa.
    el('condicaoDevolucao').required = !devolvido;
    el('observacaoDevolucao').required = false;
    el('condicaoRegistrada').textContent = p.devolucao ? `Condição na devolução: ${p.devolucao.condicao}.` : 'Sem registro de condição.';
    el('observacaoRegistrada').textContent = p.devolucao?.observacao || 'Sem observação.';
    el('momentoRegistrado').textContent = p.devolucao ? `Registrado em ${new Intl.DateTimeFormat('pt-BR', {dateStyle:'short',timeStyle:'short',timeZone:'America/Fortaleza'}).format(new Date(p.devolucao.registradoEm))}.` : '';
}
async function carregar() {
    if (ocupado || carregando) return;
    carregando = true;
    ['atualizarDevolucoes','buscaDevolucao','filtroDevolucao'].forEach(id => el(id).disabled = true);
    el('avisoDevolucoes').textContent = 'Carregando empréstimos…';
    try {
        registros = await api('/emprestimos'); renderizar();
        el('avisoDevolucoes').textContent = 'Devoluções conectadas ao banco de dados.';
        ['buscaDevolucao','filtroDevolucao'].forEach(id => el(id).disabled = false);
    } catch (erro) { el('avisoDevolucoes').textContent = erro.message; }
    finally { carregando = false; el('atualizarDevolucoes').disabled = false; }
}
async function abrir(id) {
    if (ocupado) return;
    ocupado = true; selecionado = null;
    el('formDevolucao').reset(); el('erroDevolucao').textContent = '';
    el('efeitoDevolucao').textContent = 'A devolução libera uma vaga no limite de 10 exemplares do leitor neste centro.';
    el('identificacaoDevolucao').textContent = 'Carregando os dados atuais…';
    el('datasDevolucao').textContent = ''; el('situacaoDevolucao').textContent = '';
    el('historicoDevolucao').hidden = true; el('camposDevolucao').hidden = true;
    el('confirmarDevolucao').hidden = true;
    bloquear(true);
    bootstrap.Modal.getOrCreateInstance(el('modalDevolucao')).show();
    try {
        selecionado = await api(`/emprestimos/${id}`);
        mostrar(selecionado);
        const indice = registros.findIndex(p => p.id === id);
        if (indice >= 0) registros[indice] = selecionado;
    } catch (erro) { el('erroDevolucao').textContent = erro.message; }
    finally { ocupado = false; bloquear(false); renderizar(); }
}
el('condicaoDevolucao').addEventListener('change', () => {
    const danificado = el('condicaoDevolucao').value === 'Danificado';
    el('observacaoDevolucao').required = danificado;
    el('efeitoDevolucao').textContent = danificado
        ? 'A vaga do leitor será liberada, mas esta cópia continuará indisponível. Descreva os danos na observação.'
        : 'A cópia ficará disponível novamente e uma vaga do leitor será liberada.';
});
el('formDevolucao').addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || !selecionado || selecionado.dataDevolucao || !el('formDevolucao').reportValidity()) return;
    const dados = { versao: selecionado.versao, condicao: el('condicaoDevolucao').value, observacao: el('observacaoDevolucao').value.trim() };
    ocupado = true; bloquear(true); el('confirmarDevolucao').textContent = 'Registrando…'; el('erroDevolucao').textContent = '';
    try {
        const p = await api(`/emprestimos/${selecionado.id}/devolucao`, dados);
        selecionado = p;
        const indice = registros.findIndex(r => r.id === p.id);
        if (indice === -1) registros.push(p); else registros[indice] = p;
        mostrar(p);
        el('avisoDevolucoes').textContent = `Devolução de ${p.codigo} registrada. ${p.devolucao.condicao === 'Disponível' ? 'Exemplar disponível para novo empréstimo.' : 'Exemplar danificado: permanece indisponível.'}`;
    } catch (erro) {
        el('erroDevolucao').textContent = `${erro.message} Feche e reabra os detalhes para conferir a situação atual.`;
        el('erroDevolucao').focus();
        // Impede reenvio com uma versão antiga após resposta incerta.
        el('confirmarDevolucao').hidden = true;
    } finally {
        ocupado = false; bloquear(false); el('confirmarDevolucao').textContent = 'Confirmar devolução'; renderizar();
    }
});
el('modalDevolucao').addEventListener('hide.bs.modal', evento => { if (ocupado) evento.preventDefault(); });
el('atualizarDevolucoes').addEventListener('click', carregar);
el('buscaDevolucao').addEventListener('input', renderizar);
el('filtroDevolucao').addEventListener('change', renderizar);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderizar(); });
await carregar();
const idSolicitado = new URLSearchParams(location.search).get('emprestimo');
if (idSolicitado && /^[1-9]\d*$/.test(idSolicitado) && Number(idSolicitado) <= 2147483647) await abrir(Number(idSolicitado));
