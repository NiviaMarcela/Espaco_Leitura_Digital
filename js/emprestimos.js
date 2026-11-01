await window.sessaoPronta;
import { hojeCivil, somarDias } from './datas.mjs';

const el = id => document.getElementById(id);
const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const formatarData = data => data ? data.split('-').reverse().join('/') : '—';
let emprestimos = [];
let opcoes = null;
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
        throw new Error(dados
            ? 'Não foi possível confirmar a gravação. Feche o formulário e atualize a lista antes de tentar novamente.'
            : 'Não foi possível conectar. Verifique o backend e abra http://127.0.0.1:3001/emprestimos.html.');
    }
    let resultado;
    try { resultado = await resposta.json(); }
    catch { throw new Error('Resposta inesperada. Use http://127.0.0.1:3001/emprestimos.html.'); }
    if (!resposta.ok) throw new Error(resposta.status === 503 ? 'O banco de dados está indisponível.' : resultado.erro || 'Não foi possível concluir a operação.');
    return resultado;
}

function renderizar() {
    const hoje = hojeCivil();
    // Atualiza o atraso também quando a pessoa volta à aba em outro dia.
    emprestimos.forEach(p => p.status = p.dataDevolucao ? 'Devolvido' : p.dataPrevistaDevolucao < hoje ? 'Atrasado' : 'Emprestado');
    const busca = normalizar(el('buscaEmprestimo').value.trim());
    const filtro = el('statusEmprestimo').value;
    const filtrados = emprestimos.filter(p => normalizar(`${p.leitor} ${p.matriculaCodigo || ''} ${p.livro} ${p.codigo}`).includes(busca)
        && (!filtro || (filtro === 'Abertos' ? !p.dataDevolucao : p.status === filtro)));
    el('resumoEmprestimos').textContent = `${filtrados.length} registro(s) exibido(s) · ${emprestimos.filter(p => !p.dataDevolucao).length} em aberto · ${emprestimos.filter(p => p.status === 'Atrasado').length} em atraso`;
    const tabela = el('tabelaEmprestimos');
    tabela.replaceChildren();
    if (!filtrados.length) {
        const celula = tabela.insertRow().insertCell();
        celula.colSpan = 7;
        celula.textContent = emprestimos.length ? 'Nenhum empréstimo corresponde aos filtros.' : 'Nenhum empréstimo registrado. Clique em Novo empréstimo para começar.';
    }
    for (const p of filtrados) {
        const linha = tabela.insertRow();
        if (p.status === 'Atrasado') linha.className = 'table-warning';
        for (const valor of [`${p.leitor}${p.matriculaCodigo ? ' · ' + p.matriculaCodigo : ''}`,
            `${p.livro} · ${p.codigo} · ${p.centro}`, formatarData(p.dataEmprestimo), formatarData(p.dataPrevistaDevolucao), p.status, p.renovacoes.length]) {
            linha.insertCell().textContent = valor;
        }
        const botao = document.createElement('button');
        botao.className = 'btn btn-primary-custom btn-sm';
        botao.textContent = p.dataDevolucao ? 'Detalhes' : 'Detalhes / renovar';
        botao.setAttribute('aria-label', `Detalhes do empréstimo ${p.codigo} para ${p.leitor}`);
        botao.disabled = ocupado;
        botao.addEventListener('click', () => abrirRenovacao(p.id));
        const acoes = linha.insertCell();
        acoes.append(botao);
        if (!p.dataDevolucao) {
            const devolver = document.createElement('a');
            devolver.className = 'btn btn-outline-primary btn-sm mt-2';
            devolver.href = `devolucoes.html?emprestimo=${p.id}`;
            devolver.textContent = 'Devolver';
            devolver.setAttribute('aria-label', `Devolver ${p.codigo} de ${p.leitor}`);
            acoes.append(devolver);
        }
    }
}

function atualizarRegistro(p) {
    const indice = emprestimos.findIndex(item => item.id === p.id);
    if (indice === -1) emprestimos.push(p); else emprestimos[indice] = p;
    renderizar();
}

async function carregar() {
    if (carregando || ocupado) return;
    carregando = true;
    ['novoEmprestimo', 'atualizarEmprestimos', 'buscaEmprestimo', 'statusEmprestimo'].forEach(id => el(id).disabled = true);
    el('avisoEmprestimos').textContent = 'Carregando empréstimos…';
    try {
        emprestimos = await api('/emprestimos');
        renderizar();
        ['novoEmprestimo', 'buscaEmprestimo', 'statusEmprestimo'].forEach(id => el(id).disabled = false);
        el('avisoEmprestimos').textContent = 'Empréstimos conectados ao banco de dados.';
    } catch (erro) {
        el('avisoEmprestimos').textContent = erro.message;
    } finally { carregando = false; el('atualizarEmprestimos').disabled = false; }
}

function preencherOpcoes() {
    if (!opcoes) return;
    for (const [id, lista, busca, rotulo] of [
        ['leitorEmprestimo', opcoes.leitores, el('buscaLeitorEmprestimo').value, l => `${l.nome} · ${l.matriculaCodigo || 'Sem matrícula'} · ${l.centro} · ${l.abertos} em aberto no total`],
        ['exemplarEmprestimo', opcoes.exemplares, el('buscaExemplarEmprestimo').value, e => `${e.titulo} · ${e.codigo} · ${e.centro}`]
    ]) {
        const select = el(id);
        const anterior = select.value;
        select.replaceChildren(new Option('Selecione', ''));
        lista.filter(item => normalizar(rotulo(item)).includes(normalizar(busca.trim()))).forEach(item => {
            const option = new Option(rotulo(item), String(item.id));
            select.add(option);
        });
        if ([...select.options].some(o => o.value === anterior && !o.disabled)) select.value = anterior;
    }
    mostrarSaldo();
}
function mostrarSaldo() {
    const leitor = opcoes?.leitores.find(l => l.id === Number(el('leitorEmprestimo').value));
    const exemplar = opcoes?.exemplares.find(e => e.id === Number(el('exemplarEmprestimo').value));
    const abertos = leitor && exemplar ? (leitor.abertosPorCentro[exemplar.centroId] || 0) : 0;
    el('saldoLeitor').textContent = leitor && exemplar
        ? `${exemplar.centro}: ${abertos}/${opcoes.limite} em aberto; pode retirar mais ${Math.max(0, opcoes.limite - abertos)} exemplar(es) neste centro.`
        : 'Selecione leitor e exemplar para consultar o saldo por centro. Até 10 em aberto por leitor em cada centro, incluindo atrasados.';
    el('salvarEmprestimo').disabled = ocupado || !leitor || !exemplar || abertos >= opcoes.limite;
}

function bloquearModal(id, bloqueado) {
    el(id).querySelectorAll('input, select, textarea, button').forEach(c => c.disabled = bloqueado);
}

async function abrirNovo() {
    if (ocupado) return;
    ocupado = true;
    el('formEmprestimo').reset();
    opcoes = null;
    el('leitorEmprestimo').replaceChildren(new Option('Carregando…', ''));
    el('exemplarEmprestimo').replaceChildren(new Option('Carregando…', ''));
    el('erroEmprestimo').textContent = '';
    el('avisoOpcoes').textContent = 'Atualizando leitores e exemplares disponíveis…';
    bloquearModal('modalEmprestimo', true);
    bootstrap.Modal.getOrCreateInstance(el('modalEmprestimo')).show();
    try {
        opcoes = await api('/emprestimos/opcoes');
        preencherOpcoes();
        el('retiradaEmprestimo').value = opcoes.hoje;
        el('prazoEmprestimo').value = opcoes.dataPrevistaDevolucao;
        el('avisoOpcoes').textContent = !opcoes.leitores.length ? 'Cadastre um leitor ativo na página Leitores.'
            : !opcoes.exemplares.length ? 'Não há exemplares disponíveis. Confira o acervo.' : 'Selecione o leitor e confira o código do exemplar.';
    } catch (erro) { el('erroEmprestimo').textContent = erro.message; }
    finally {
        ocupado = false;
        bloquearModal('modalEmprestimo', false);
        mostrarSaldo();
    }
}

el('formEmprestimo').addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || el('salvarEmprestimo').disabled || !el('formEmprestimo').reportValidity()) return;
    const dados = { leitorId: Number(el('leitorEmprestimo').value), exemplarId: Number(el('exemplarEmprestimo').value), observacao: el('observacaoEmprestimo').value.trim() };
    ocupado = true;
    bloquearModal('modalEmprestimo', true);
    el('salvarEmprestimo').textContent = 'Registrando…';
    el('erroEmprestimo').textContent = '';
    let salvo = false;
    try {
        const p = await api('/emprestimos', dados);
        atualizarRegistro(p);
        el('avisoEmprestimos').textContent = `Empréstimo registrado. Devolver ${p.codigo} até ${formatarData(p.dataPrevistaDevolucao)}.`;
        salvo = true;
    } catch (erro) { el('erroEmprestimo').textContent = erro.message; el('erroEmprestimo').focus(); }
    finally {
        ocupado = false;
        bloquearModal('modalEmprestimo', false);
        el('salvarEmprestimo').textContent = 'Registrar empréstimo';
        mostrarSaldo();
        renderizar();
    }
    if (salvo) bootstrap.Modal.getOrCreateInstance(el('modalEmprestimo')).hide();
});

async function abrirRenovacao(id) {
    if (ocupado) return;
    ocupado = true;
    selecionado = null;
    el('erroRenovacao').textContent = '';
    ['identificacaoRenovacao', 'observacaoRenovacao', 'prazoRenovacao', 'novoPrazoRenovacao'].forEach(i => el(i).textContent = '');
    el('historicoRenovacoes').replaceChildren();
    el('avisoRenovacao').textContent = 'Carregando dados atuais…';
    bloquearModal('modalRenovacao', true);
    bootstrap.Modal.getOrCreateInstance(el('modalRenovacao')).show();
    let permitido = false;
    try {
        const p = await api(`/emprestimos/${id}`);
        selecionado = p;
        atualizarRegistro(p);
        const novaData = somarDias(hojeCivil(), p.prazoDias);
        permitido = !p.dataDevolucao && p.statusLeitor === 'Ativo' && novaData > p.dataPrevistaDevolucao;
        el('identificacaoRenovacao').textContent = `${p.leitor} · ${p.livro} · ${p.codigo}`;
        el('observacaoRenovacao').textContent = p.observacao || 'Sem observação.';
        if (p.devolucao) el('observacaoRenovacao').textContent += ` Devolução: ${p.devolucao.condicao}; ${p.devolucao.diasAtraso} dia(s) de atraso. ${p.devolucao.observacao || ''}`;
        el('prazoRenovacao').textContent = `Retirada: ${formatarData(p.dataEmprestimo)} · Prazo atual: ${formatarData(p.dataPrevistaDevolucao)} · ${p.status}`;
        el('novoPrazoRenovacao').textContent = permitido ? `Ao confirmar, o novo prazo será ${formatarData(novaData)}.` : '';
        el('avisoRenovacao').textContent = p.dataDevolucao ? `Devolvido em ${formatarData(p.dataDevolucao)}.`
            : p.statusLeitor !== 'Ativo' ? 'O leitor está inativo. Regularize o cadastro antes de renovar.'
            : permitido ? 'A renovação mantém este exemplar com o leitor e não ocupa uma nova vaga.'
            : `O prazo atual já cobre os próximos ${p.prazoDias} dias. Ainda não é necessário renovar.`;
        const historico = p.renovacoes.length ? p.renovacoes.map(r => `${new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short', timeZone:'America/Fortaleza'}).format(new Date(r.renovadoEm))}: de ${formatarData(r.dataAnterior)} para ${formatarData(r.novaData)}`) : ['Nenhuma renovação registrada.'];
        historico.forEach(texto => { const li = document.createElement('li'); li.textContent = texto; el('historicoRenovacoes').append(li); });
    } catch (erro) { el('erroRenovacao').textContent = erro.message; }
    finally { ocupado = false; bloquearModal('modalRenovacao', false); el('confirmarRenovacao').disabled = !permitido; renderizar(); }
}

el('formRenovacao').addEventListener('submit', async evento => {
    evento.preventDefault();
    if (ocupado || !selecionado || el('confirmarRenovacao').disabled) return;
    ocupado = true;
    bloquearModal('modalRenovacao', true);
    el('confirmarRenovacao').textContent = 'Renovando…';
    el('erroRenovacao').textContent = '';
    let salvo = false;
    try {
        const p = await api(`/emprestimos/${selecionado.id}/renovacoes`, { versao: selecionado.versao });
        selecionado = p;
        atualizarRegistro(p);
        el('avisoEmprestimos').textContent = `Renovação registrada. Novo prazo: ${formatarData(p.dataPrevistaDevolucao)}.`;
        salvo = true;
    } catch (erro) { el('erroRenovacao').textContent = erro.message; el('erroRenovacao').focus(); }
    finally {
        ocupado = false;
        bloquearModal('modalRenovacao', false);
        el('confirmarRenovacao').textContent = 'Confirmar renovação';
        // Em caso de erro, reabrir os detalhes garante que a versão e o prazo sejam atuais.
        el('confirmarRenovacao').disabled = true;
        renderizar();
    }
    if (salvo) bootstrap.Modal.getOrCreateInstance(el('modalRenovacao')).hide();
});

for (const id of ['modalEmprestimo', 'modalRenovacao']) {
    el(id).addEventListener('hide.bs.modal', evento => { if (ocupado) evento.preventDefault(); });
}
el('novoEmprestimo').addEventListener('click', abrirNovo);
el('atualizarEmprestimos').addEventListener('click', carregar);
el('buscaEmprestimo').addEventListener('input', renderizar);
el('statusEmprestimo').addEventListener('change', renderizar);
['buscaLeitorEmprestimo', 'buscaExemplarEmprestimo'].forEach(id => el(id).addEventListener('input', preencherOpcoes));
el('leitorEmprestimo').addEventListener('change', mostrarSaldo);
el('exemplarEmprestimo').addEventListener('change', mostrarSaldo);
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderizar(); });
carregar();
