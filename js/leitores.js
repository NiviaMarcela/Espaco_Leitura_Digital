import { calcularIdade, hojeCivil } from './datas.mjs';

const elemento = id => document.getElementById(id);
const form = elemento('formLeitor');
const modal = elemento('modalLeitor');
const campos = { nome: 'nomeLeitor', tipo: 'tipoLeitor', dataNascimento: 'nascimentoLeitor',
    centroId: 'centroLeitor', matriculaCodigo: 'matriculaLeitor', turma: 'turmaLeitor',
    telefone: 'telefoneLeitor', email: 'emailLeitor', status: 'statusLeitor' };
let leitores = [];
let idEditando = null;
let salvando = false;

async function api(caminho, metodo = 'GET', dados) {
    let resposta;
    try {
        resposta = await fetch(`/api${caminho}`, { method: metodo,
            headers: dados ? { 'Content-Type': 'application/json' } : {},
            body: dados ? JSON.stringify(dados) : undefined, signal: AbortSignal.timeout(15000) });
    } catch {
        throw new Error(metodo === 'GET'
            ? 'Não foi possível conectar. Abra a página em http://127.0.0.1:3001/leitores.html com o backend iniciado.'
            : 'Não foi possível confirmar o salvamento. Feche o formulário e atualize a página antes de reenviar, para evitar duplicação.');
    }
    let resultado;
    try { resultado = await resposta.json(); }
    catch { throw new Error('Resposta inesperada. Abra http://127.0.0.1:3001/leitores.html.'); }
    if (!resposta.ok) throw new Error(resultado.erro || (resposta.status === 503
        ? 'O PostgreSQL não está respondendo. Verifique o serviço e tente novamente.'
        : 'Não foi possível concluir a operação.'));
    return resultado;
}

const normalizar = texto => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function renderizar() {
    const busca = normalizar(elemento('buscaLeitor').value.trim());
    const centro = elemento('filtroCentroLeitor').value;
    const status = elemento('filtroStatusLeitor').value;
    const filtrados = leitores.filter(leitor =>
        normalizar(`${leitor.nome} ${leitor.matriculaCodigo || ''} ${leitor.turma || ''}`).includes(busca)
        && (!centro || String(leitor.centroId) === centro) && (!status || leitor.status === status));
    const tbody = elemento('tabelaLeitores');
    tbody.replaceChildren();
    elemento('totalLeitores').textContent = `${filtrados.length} de ${leitores.length} leitor(es) · ${leitores.filter(l => l.status === 'Ativo').length} ativo(s)`;
    if (!filtrados.length) {
        const td = document.createElement('td');
        td.colSpan = 7;
        td.textContent = leitores.length ? 'Nenhum leitor corresponde aos filtros.' : 'Nenhum leitor cadastrado. Clique em Novo leitor para começar.';
        tbody.insertRow().append(td);
    }
    for (const leitor of filtrados) {
        const linha = tbody.insertRow();
        const idade = calcularIdade(leitor.dataNascimento);
        for (const valor of [leitor.nome, leitor.tipo, [leitor.matriculaCodigo, leitor.turma].filter(Boolean).join(' / ') || '—',
            idade === null ? '—' : `${idade} ano(s)`, leitor.centro, leitor.status]) {
            // Dados digitados são texto, nunca HTML executável.
            linha.insertCell().textContent = valor;
        }
        const botao = document.createElement('button');
        botao.className = 'btn btn-primary-custom btn-sm';
        botao.textContent = 'Editar';
        botao.setAttribute('aria-label', `Editar ${leitor.nome}`);
        botao.addEventListener('click', () => abrirFormulario(leitor));
        linha.insertCell().append(botao);
    }
}

function mostrarIdade() {
    const idade = calcularIdade(elemento('nascimentoLeitor').value);
    elemento('idadeLeitor').textContent = idade === null
        ? 'Informe uma data válida, que não esteja no futuro.'
        : `Idade atual: ${idade} ano(s). Será atualizada automaticamente com o passar do tempo.`;
}

function abrirFormulario(leitor = null) {
    form.reset();
    idEditando = leitor?.id ?? null;
    elemento('erroLeitor').textContent = '';
    elemento('nascimentoLeitor').max = hojeCivil();
    elemento('tituloFormularioLeitor').textContent = leitor ? 'Editar leitor' : 'Cadastrar leitor';
    elemento('salvarLeitor').textContent = leitor ? 'Salvar alterações' : 'Cadastrar leitor';
    if (leitor) for (const [chave, id] of Object.entries(campos)) elemento(id).value = leitor[chave] ?? '';
    elemento('idadeLeitor').textContent = 'A idade será calculada automaticamente.';
    if (leitor) mostrarIdade();
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

async function carregar() {
    const controles = ['novoLeitor', 'buscaLeitor', 'filtroCentroLeitor', 'filtroStatusLeitor'];
    controles.forEach(id => elemento(id).disabled = true);
    elemento('recarregarLeitores').hidden = true;
    elemento('avisoLeitores').textContent = 'Carregando leitores…';
    try {
        const [dados, centros] = await Promise.all([api('/leitores'), api('/centros')]);
        leitores = dados;
        for (const id of ['centroLeitor', 'filtroCentroLeitor']) {
            const select = elemento(id);
            const anterior = select.value;
            select.replaceChildren(new Option(id === 'centroLeitor' ? 'Selecione o Centro' : 'Todos os Centros', ''));
            centros.forEach(centro => select.add(new Option(centro.nome, String(centro.id))));
            if ([...select.options].some(o => o.value === anterior)) select.value = anterior;
        }
        renderizar();
        controles.forEach(id => elemento(id).disabled = false);
        elemento('avisoLeitores').textContent = 'Leitores conectados ao banco de dados.';
    } catch (erro) {
        elemento('avisoLeitores').textContent = erro.message;
        elemento('tabelaLeitores').innerHTML = '<tr><td colspan="7">Não foi possível carregar os leitores.</td></tr>';
        elemento('recarregarLeitores').hidden = false;
    }
}

form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (salvando || !form.reportValidity()) return;
    const dados = Object.fromEntries(Object.entries(campos).map(([chave, id]) => [chave, elemento(id).value.trim()]));
    dados.centroId = Number(dados.centroId);
    salvando = true;
    elemento('erroLeitor').textContent = '';
    modal.querySelectorAll('input, select, button').forEach(c => c.disabled = true);
    elemento('salvarLeitor').textContent = 'Salvando…';
    let sucesso = false;
    try {
        const leitor = await api(idEditando === null ? '/leitores' : `/leitores/${idEditando}`,
            idEditando === null ? 'POST' : 'PUT', dados);
        const indice = leitores.findIndex(l => l.id === leitor.id);
        if (indice === -1) leitores.push(leitor); else leitores[indice] = leitor;
        renderizar();
        elemento('avisoLeitores').textContent = 'Leitor salvo no banco de dados.';
        sucesso = true;
    } catch (erro) {
        elemento('erroLeitor').textContent = erro.message;
        elemento('erroLeitor').focus();
    } finally {
        salvando = false;
        modal.querySelectorAll('input, select, button').forEach(c => c.disabled = false);
        elemento('salvarLeitor').textContent = idEditando === null ? 'Cadastrar leitor' : 'Salvar alterações';
    }
    if (sucesso) bootstrap.Modal.getOrCreateInstance(modal).hide();
});
modal.addEventListener('hide.bs.modal', evento => { if (salvando) evento.preventDefault(); });
modal.addEventListener('shown.bs.modal', () => elemento('nomeLeitor').focus());
elemento('novoLeitor').addEventListener('click', () => abrirFormulario());
elemento('nascimentoLeitor').addEventListener('input', mostrarIdade);
elemento('recarregarLeitores').addEventListener('click', carregar);
elemento('buscaLeitor').addEventListener('input', renderizar);
['filtroCentroLeitor', 'filtroStatusLeitor'].forEach(id => elemento(id).addEventListener('change', renderizar));
// Ao voltar à página em outro dia, a idade exibida também é recalculada.
document.addEventListener('visibilitychange', () => { if (!document.hidden) renderizar(); });
carregar();
