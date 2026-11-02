const elemento = id => document.getElementById(id);
const modal = elemento('modalCadastroLeitor');
const form = elemento('formCadastroPublico');
const campos = elemento('camposCadastroPublico');
const centro = elemento('centroCadastroPublico');
const botaoEnviar = elemento('enviarCadastroPublico');
const avisoCentros = elemento('avisoCentrosCadastro');
const erro = elemento('erroCadastroPublico');
const botaoTentarCentros = elemento('tentarCentrosCadastro');
let centrosCarregados = false;
let salvando = false;

async function carregarCentros() {
    centro.disabled = true;
    botaoEnviar.disabled = true;
    botaoTentarCentros.hidden = true;
    avisoCentros.textContent = 'Carregando Centros…';
    centro.replaceChildren(new Option('Carregando Centros…', ''));

    try {
        const resposta = await fetch('/api/centros', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!resposta.ok) throw new Error('Não foi possível carregar os Centros. Tente novamente.');
        const centros = await resposta.json();
        if (!Array.isArray(centros) || centros.length === 0) {
            throw new Error('Nenhum Centro está disponível para o cadastro. Entre em contato com a biblioteca.');
        }
        centro.replaceChildren(new Option('Selecione o Centro', ''));
        centros.forEach(item => centro.add(new Option(item.nome, String(item.id))));
        centro.disabled = false;
        botaoEnviar.disabled = false;
        avisoCentros.textContent = '';
        centrosCarregados = true;
    } catch (falha) {
        avisoCentros.textContent = falha.name === 'TimeoutError'
            ? 'A consulta demorou demais. Tente novamente.'
            : falha.message || 'Não foi possível conectar para carregar os Centros.';
        centro.replaceChildren(new Option('Centros indisponíveis', ''));
        botaoTentarCentros.hidden = false;
    }
}

modal.addEventListener('show.bs.modal', () => {
    erro.textContent = '';
    if (!centrosCarregados) carregarCentros();
});

const parametros = new URLSearchParams(location.search);
if (parametros.get('cadastro') === '1') {
    parametros.delete('cadastro');
    const consulta = parametros.toString();
    history.replaceState(null, '', `${location.pathname}${consulta ? `?${consulta}` : ''}${location.hash}`);
    bootstrap.Modal.getOrCreateInstance(modal).show();
}

modal.addEventListener('hide.bs.modal', evento => {
    if (salvando) evento.preventDefault();
});

modal.addEventListener('hidden.bs.modal', () => {
    if (salvando) return;
    form.reset();
    campos.hidden = false;
    elemento('sucessoCadastroPublico').hidden = true;
    elemento('linkLoginCadastroPublico').hidden = true;
    elemento('cancelarCadastroPublico').textContent = 'Cancelar';
    botaoEnviar.hidden = false;
    botaoEnviar.disabled = !centrosCarregados;
    botaoEnviar.textContent = 'Cadastrar leitor';
    erro.textContent = '';
});

botaoTentarCentros.addEventListener('click', carregarCentros);

form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (salvando || !form.reportValidity()) return;

    const senha = elemento('senhaCadastroPublico').value;
    if (senha !== elemento('confirmarSenhaCadastroPublico').value) {
        erro.textContent = 'As senhas não coincidem. Confira os dois campos.';
        elemento('confirmarSenhaCadastroPublico').focus();
        return;
    }

    salvando = true;
    erro.textContent = '';
    form.querySelectorAll('input, select, button').forEach(controle => { controle.disabled = true; });
    botaoEnviar.textContent = 'Enviando…';

    try {
        const dados = Object.fromEntries(new FormData(form));
        dados.centroId = Number(dados.centroId);
        const resposta = await fetch('/api/cadastro-leitor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
            signal: AbortSignal.timeout(15000)
        });
        let resultado;
        try {
            resultado = await resposta.json();
        } catch {
            throw new Error('O servidor respondeu em um formato inesperado. Tente novamente mais tarde.');
        }
        if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível concluir o cadastro.');

        campos.hidden = true;
        elemento('sucessoCadastroPublico').hidden = false;
        elemento('linkLoginCadastroPublico').hidden = false;
        elemento('cancelarCadastroPublico').textContent = 'Fechar';
        botaoEnviar.hidden = true;
    } catch (falha) {
        erro.textContent = falha.name === 'TimeoutError'
            ? 'A tentativa demorou demais. Confira sua conexão antes de tentar novamente.'
            : falha.message || 'Não foi possível conectar ao servidor.';
        erro.focus();
    } finally {
        salvando = false;
        form.querySelectorAll('input, select, button').forEach(controle => { controle.disabled = false; });
        centro.disabled = !centrosCarregados;
        botaoEnviar.disabled = !centrosCarregados;
        if (!botaoEnviar.hidden) botaoEnviar.textContent = 'Cadastrar leitor';
    }
});
