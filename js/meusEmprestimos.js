const elemento = id => document.getElementById(id);
const formatarData = data => data ? data.split('-').reverse().join('/') : '—';
const tabela = elemento('tabelaMeusEmprestimos');
const aviso = elemento('avisoMeusEmprestimos');
let emprestimos = [];

function renderizar() {
    elemento('resumoMeusEmprestimos').textContent =
        `${emprestimos.length} empréstimo(s) · ${emprestimos.filter(item => !item.dataDevolucao).length} em aberto`;
    tabela.replaceChildren();

    if (!emprestimos.length) {
        const linha = tabela.insertRow();
        const celula = linha.insertCell();
        celula.colSpan = 5;
        celula.textContent = 'Você ainda não tem empréstimos registrados. Volte à Biblioteca para reservar um livro.';
        return;
    }

    for (const item of emprestimos) {
        const linha = tabela.insertRow();
        if (item.status === 'Atrasado') linha.className = 'table-warning';
        for (const valor of [
            `${item.livro} · ${item.codigo} · ${item.centro}`,
            formatarData(item.dataEmprestimo),
            formatarData(item.dataPrevistaDevolucao),
            formatarData(item.dataDevolucao),
            item.status
        ]) {
            linha.insertCell().textContent = valor;
        }
    }
}

async function carregar() {
    const botao = elemento('atualizarMeusEmprestimos');
    botao.disabled = true;
    aviso.textContent = 'Carregando seus empréstimos…';
    try {
        const resposta = await fetch('/api/minhas-reservas', {
            cache: 'no-store',
            signal: AbortSignal.timeout(15000)
        });
        if (resposta.status === 401) {
            location.assign(`/login.html?next=${encodeURIComponent('/meusEmprestimos.html')}`);
            return;
        }
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível consultar seus empréstimos.');
        emprestimos = resultado;
        renderizar();
        aviso.textContent = 'Lista atualizada com seus empréstimos.';
    } catch (erro) {
        aviso.textContent = erro.name === 'TimeoutError'
            ? 'A consulta demorou demais. Verifique o servidor e tente novamente.'
            : `Não foi possível carregar seus empréstimos. ${erro.message}`;
        tabela.replaceChildren();
        const linha = tabela.insertRow();
        const celula = linha.insertCell();
        celula.colSpan = 5;
        celula.textContent = 'A consulta não foi concluída. Use “Atualizar lista” para tentar novamente.';
    } finally {
        botao.disabled = false;
    }
}

elemento('atualizarMeusEmprestimos').addEventListener('click', carregar);
carregar();
