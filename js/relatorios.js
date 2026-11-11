import { hojeCivil } from './datas.mjs';

const el = id => document.getElementById(id);
const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const formatarData = data => data ? data.split('-').reverse().join('/') : '—';
let emprestimos = [];
let carregado = false;

async function carregar() {
    el('avisoRelatorios').textContent = 'Carregando empréstimos…';
    el('atualizarRelatorios').disabled = true;
    try {
        const resposta = await fetch('/api/emprestimos', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        let dados;
        try { dados = await resposta.json(); }
        catch { throw new Error('O servidor retornou uma resposta inválida ao carregar os empréstimos.'); }
        if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível carregar os empréstimos.');
        if (!Array.isArray(dados)) throw new Error('O servidor retornou uma lista de empréstimos inválida.');
        emprestimos = dados;
        carregado = true;
        ['buscaRelatorio', 'dataInicial', 'dataFinal', 'filtroSituacao', 'limparFiltros', 'gerarPdf'].forEach(id => { el(id).disabled = false; });
        el('avisoRelatorios').textContent = 'Empréstimos conectados ao banco de dados.';
        renderizar();
    } catch (erro) {
        el('avisoRelatorios').textContent = erro.name === 'TimeoutError'
            ? 'A consulta demorou demais. Atualize a lista para tentar novamente.'
            : erro.message || 'Não foi possível conectar ao servidor. Verifique o backend.';
    } finally {
        el('atualizarRelatorios').disabled = false;
    }
}

function renderizar() {
    if (!carregado) return;
    const hoje = hojeCivil();
    emprestimos.forEach(item => {
        item.status = item.dataDevolucao ? 'Devolvido' : item.dataPrevistaDevolucao < hoje ? 'Atrasado' : 'Emprestado';
    });
    const busca = normalizar(el('buscaRelatorio').value.trim());
    const inicio = el('dataInicial').value;
    const fim = el('dataFinal').value;
    const situacao = el('filtroSituacao').value;
    if (inicio && fim && inicio > fim) {
        el('avisoRelatorios').textContent = 'A data inicial deve ser anterior ou igual à data final.';
        el('resumoRelatorios').textContent = 'Revise o intervalo de datas para exibir o relatório.';
        el('gerarPdf').disabled = true;
        const tabela = el('tabelaRelatorios');
        tabela.replaceChildren();
        const celula = tabela.insertRow().insertCell();
        celula.colSpan = 7;
        celula.textContent = 'A data inicial deve ser anterior ou igual à data final.';
        return;
    }
    el('gerarPdf').disabled = false;
    el('avisoRelatorios').textContent = 'Filtros aplicados ao histórico de empréstimos.';
    const filtrados = emprestimos.filter(item => {
        const vencido = item.status === 'Atrasado';
        const devolvido = Boolean(item.dataDevolucao);
        const correspondeBusca = normalizar(`${item.leitor} ${item.matriculaCodigo || ''} ${item.livro} ${item.codigo} ${item.aprovador || ''}`).includes(busca);
        return correspondeBusca
            && (!inicio || item.dataEmprestimo >= inicio)
            && (!fim || item.dataEmprestimo <= fim)
            && (situacao === 'todos' || (situacao === 'atrasados' && vencido)
                || (situacao === 'devolvidos' && devolvido) || (situacao === 'abertos' && !devolvido && !vencido));
    });
    const inadimplentes = filtrados.filter(item => item.status === 'Atrasado').length;
    el('resumoRelatorios').textContent = `${filtrados.length} registro(s) · ${inadimplentes} inadimplente(s) · ${emprestimos.length} no total`;
    el('filtrosImpressao').textContent = `Período de retirada: ${inicio ? formatarData(inicio) : 'sem limite'} a ${fim ? formatarData(fim) : 'sem limite'} · Situação: ${{ todos: 'Todas', atrasados: 'Inadimplentes', abertos: 'Em aberto no prazo', devolvidos: 'Devolvidos' }[situacao]}${busca ? ` · Busca: ${el('buscaRelatorio').value.trim()}` : ''} · Gerado em ${new Date().toLocaleString('pt-BR')}`;
    const tabela = el('tabelaRelatorios');
    tabela.replaceChildren();
    if (!filtrados.length) {
        const celula = tabela.insertRow().insertCell();
        celula.colSpan = 7;
        celula.textContent = emprestimos.length ? 'Nenhum empréstimo corresponde aos filtros.' : 'Nenhum empréstimo registrado.';
        return;
    }
    for (const item of filtrados) {
        const linha = tabela.insertRow();
        if (item.status === 'Atrasado') linha.className = 'table-warning';
        const valores = [
            `${item.leitor}${item.matriculaCodigo ? ` · ${item.matriculaCodigo}` : ''}`,
            `${item.livro} · ${item.codigo} · ${item.centro}`,
            formatarData(item.dataEmprestimo),
            formatarData(item.dataPrevistaDevolucao),
            formatarData(item.dataDevolucao),
            item.aprovador || 'Não informado (registro anterior)',
            item.status === 'Atrasado' ? 'Inadimplente' : item.status === 'Devolvido' ? 'Devolvido' : 'Em aberto'
        ];
        valores.forEach(valor => { linha.insertCell().textContent = valor; });
    }
}

['buscaRelatorio', 'dataInicial', 'dataFinal', 'filtroSituacao'].forEach(id => {
    el(id).addEventListener(id === 'buscaRelatorio' ? 'input' : 'change', renderizar);
});
el('limparFiltros').addEventListener('click', () => {
    el('buscaRelatorio').value = '';
    el('dataInicial').value = '';
    el('dataFinal').value = '';
    el('filtroSituacao').value = 'todos';
    renderizar();
});
el('gerarPdf').addEventListener('click', () => window.print());
el('atualizarRelatorios').addEventListener('click', carregar);
document.addEventListener('visibilitychange', () => { if (carregado && !document.hidden) renderizar(); });
carregar();
