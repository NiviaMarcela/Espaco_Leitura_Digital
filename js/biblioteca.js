// 1. Estado: guarda uma cópia dos livros recebidos do servidor.
// O cadastro continua no Acervo; esta página apenas consulta os dados.
let livros = [];
const elemento = id => document.getElementById(id);
const busca = elemento("buscaBiblioteca");
const categoria = elemento("categoriaBiblioteca");
const faixa = elemento("faixaBiblioteca");
const disponiveis = elemento("disponiveisBiblioteca");
const ordem = elemento("ordemBiblioteca");
const tabela = elemento("tabelaBiblioteca");
const aviso = elemento("avisoBiblioteca");
const repetir = elemento("recarregarBiblioteca");
const limpar = elemento("limparBiblioteca");
const modalReserva = elemento("modalReserva");
const formReserva = elemento("formReserva");
let livroReservar = null;
let reservando = false;

// textContent trata o conteúdo do cadastro como texto, nunca como código HTML.
function criar(tag, texto, classe) {
    const no = document.createElement(tag);
    if (texto !== undefined) no.textContent = texto;
    if (classe) no.className = classe;
    return no;
}

// Assim, buscar "ciencias" também encontra "Ciências".
function normalizar(texto) {
    return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function formatarData(data) {
    return data ? data.split('-').reverse().join('/') : '—';
}

function quantidadeDisponivel(livro) {
    return livro.exemplares.filter(exemplar => exemplar.status === "Disponível").length;
}

function statusLivro(livro) {
    if (quantidadeDisponivel(livro) > 0) return ["Disponível", "badge-green"];
    if (livro.exemplares.some(exemplar => exemplar.status === "Emprestado")) return ["Emprestado", "badge-purple"];
    return ["Indisponível", "badge-pink"];
}

function criarCapa(livro) {
    const capa = criar("div", undefined, "book-cover");
    const icone = criar("i", undefined, "bi bi-book-half");
    icone.setAttribute("aria-hidden", "true");
    capa.append(icone);
    // Links de imagem precisam usar HTTP ou HTTPS, como no cadastro do Acervo.
    if (/^https?:\/\//i.test(livro.capaUrl ?? "")) {
        const imagem = document.createElement("img");
        imagem.src = livro.capaUrl;
        imagem.alt = "";
        imagem.loading = "lazy";
        imagem.addEventListener("error", () => capa.replaceChildren(icone));
        capa.replaceChildren(imagem);
    }
    return capa;
}

// 2. Os filtros são gerados a partir dos valores reais do cadastro.
function preencherFiltro(select, campo, rotulo) {
    select.replaceChildren(new Option(rotulo, ""));
    const valores = [...new Set(livros.map(livro => livro[campo]).filter(Boolean))];
    valores.sort((a, b) => a.localeCompare(b, "pt-BR"));
    valores.forEach(valor => select.add(new Option(valor, valor)));
}

function mensagemTabela(texto) {
    const linha = criar("tr");
    const celula = criar("td", texto, "text-center py-4");
    celula.colSpan = 5;
    linha.append(celula);
    tabela.replaceChildren(linha);
}

// 3. filter seleciona os livros; sort ordena a lista; o DOM exibe o resultado.
function aplicarFiltros() {
    const termo = normalizar(busca.value.trim());
    const resultado = livros.filter(livro => {
        const texto = normalizar([livro.titulo, livro.autor, livro.categoria, livro.sinopse].join(" "));
        return texto.includes(termo)
            && (!categoria.value || livro.categoria === categoria.value)
            && (!faixa.value || livro.faixaEtaria === faixa.value)
            && (!disponiveis.checked || quantidadeDisponivel(livro) > 0);
    });
    resultado.sort((a, b) => ordem.value === "recentes"
        ? b.id - a.id
        : String(a[ordem.value] ?? "").localeCompare(String(b[ordem.value] ?? ""), "pt-BR"));
    elemento("resultadosBiblioteca").textContent = `${resultado.length} de ${livros.length} títulos`;
    tabela.replaceChildren();
    if (!resultado.length) {
        mensagemTabela(livros.length ? "Nenhum livro encontrado. Experimente limpar os filtros." : "Nenhum livro cadastrado no Acervo.");
        return;
    }
    resultado.forEach(livro => {
        const linha = criar("tr");
        const celulaLivro = criar("td");
        const informacoes = criar("div", undefined, "book-info");
        const texto = criar("div");
        texto.append(criar("strong", livro.titulo), criar("span", livro.autor));
        informacoes.append(criarCapa(livro), texto);
        celulaLivro.append(informacoes);
        const celulaCategoria = criar("td");
        celulaCategoria.append(criar("span", livro.categoria || "Não informada", "category-badge"));
        const celulaStatus = criar("td");
        const [status, cor] = statusLivro(livro);
        celulaStatus.append(criar("span", status, `badge-status ${cor}`));
        const acao = criar("td");
        const botao = criar("button", "Ver", "btn btn-secondary-custom");
        botao.type = "button";
        botao.setAttribute("aria-label", `Ver detalhes de ${livro.titulo}`);
        botao.dataset.bsToggle = "modal";
        botao.dataset.bsTarget = "#modalBiblioteca";
        botao.addEventListener("click", () => mostrarDetalhes(livro));
        const reservar = criar("button", "Reservar Livro", "btn btn-primary-custom btn-sm mt-2");
        reservar.type = "button";
        reservar.disabled = quantidadeDisponivel(livro) === 0;
        reservar.setAttribute("aria-label", `Reservar ${livro.titulo}`);
        reservar.addEventListener("click", () => abrirReserva(livro));
        acao.append(botao, reservar);
        linha.append(celulaLivro, celulaCategoria, criar("td", livro.faixaEtaria || "Não informada"), celulaStatus, acao);
        tabela.append(linha);
    });
}

async function abrirReserva(livro) {
    let sessao;
    try {
        const resposta = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (resposta.status === 401) {
            location.assign(`/login.html?next=${encodeURIComponent('/biblioteca.html')}`);
            return;
        }
        if (!resposta.ok) throw new Error('Não foi possível verificar a sessão. Tente novamente.');
        sessao = await resposta.json();
    } catch (erro) {
        aviso.textContent = erro.message || 'Não foi possível conectar ao servidor.';
        return;
    }
    if (sessao.perfil !== 'leitor') {
        aviso.textContent = 'Entre com uma conta de leitor para pegar livros emprestados.';
        return;
    }
    if (sessao.trocarSenha) {
        location.assign('/alterarSenha.html');
        return;
    }

    livroReservar = livro;
    formReserva.reset();
    elemento('erroReserva').textContent = '';
    elemento('tituloReserva').textContent = `Reservar: ${livro.titulo}`;
    const disponiveis = livro.exemplares.filter(exemplar => exemplar.status === 'Disponível');
    const select = elemento('exemplarReserva');
    select.replaceChildren(new Option('Selecione uma cópia', ''));
    disponiveis.forEach(exemplar => select.add(new Option(
        `${exemplar.centro} · ${exemplar.codigo}${exemplar.localizacao ? ` · ${exemplar.localizacao}` : ''}`,
        String(exemplar.id)
    )));
    elemento('avisoReserva').textContent = 'Ao confirmar, o empréstimo será registrado no seu cadastro com prazo de 30 dias corridos.';
    bootstrap.Modal.getOrCreateInstance(modalReserva).show();
}

formReserva.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (reservando || !livroReservar || !formReserva.reportValidity()) return;
    reservando = true;
    elemento('confirmarReserva').disabled = true;
    elemento('confirmarReserva').textContent = 'Registrando…';
    elemento('erroReserva').textContent = '';
    try {
        const resposta = await fetch('/api/reservas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ exemplarId: Number(elemento('exemplarReserva').value) }),
            signal: AbortSignal.timeout(15000)
        });
        const resultado = resposta.status === 204 ? null : await resposta.json();
        if (resposta.status === 401) {
            location.assign(`/login.html?next=${encodeURIComponent('/biblioteca.html')}`);
            return;
        }
        if (!resposta.ok) throw new Error(resultado?.erro || 'Não foi possível registrar o empréstimo.');
        bootstrap.Modal.getOrCreateInstance(modalReserva).hide();
        await carregarBiblioteca();
        aviso.textContent = `Empréstimo registrado para ${resultado.livro}. Prazo: ${formatarData(resultado.dataPrevistaDevolucao)}.`;
    } catch (erro) {
        elemento('erroReserva').textContent = erro.name === 'TimeoutError' || erro instanceof TypeError
            ? 'Não foi possível confirmar a reserva. Consulte “Meus Empréstimos” antes de tentar novamente.'
            : erro.message || 'Não foi possível conectar ao servidor.';
        elemento('erroReserva').focus();
    } finally {
        reservando = false;
        elemento('confirmarReserva').disabled = false;
        elemento('confirmarReserva').textContent = 'Confirmar empréstimo';
    }
});

function mostrarDetalhes(livro) {
    elemento("tituloLivroBiblioteca").textContent = livro.titulo;
    const detalhes = elemento("detalhesBiblioteca");
    const dados = criar("dl", undefined, "detalhes-dados");
    for (const [rotulo, valor] of [["Autor", livro.autor], ["Categoria", livro.categoria],
        ["Faixa etária", livro.faixaEtaria], ["Editora", livro.editora], ["Ano", livro.ano],
        ["ISBN", livro.isbn], ["Exemplares disponíveis", quantidadeDisponivel(livro)]]) {
        const item = criar("div");
        item.append(criar("dt", rotulo), criar("dd", valor === 0 ? "0" : valor || "Não informado"));
        dados.append(item);
    }
    detalhes.replaceChildren(dados, criar("h3", "Sinopse", "fs-6 mt-4"),
        criar("p", livro.sinopse || "Sinopse não cadastrada.", "detalhes-sinopse"));
    detalhes.append(criar("h3", "Onde encontrar", "fs-6 mt-4"));
    const lista = criar("ul");
    livro.exemplares.filter(exemplar => exemplar.status === "Disponível").forEach(exemplar => {
        lista.append(criar("li", `${exemplar.centro} — ${exemplar.localizacao || "Localização não informada"} (${exemplar.codigo})`));
    });
    detalhes.append(lista.children.length ? lista : criar("p", "Sem exemplares disponíveis no momento."));
}

// 4. fetch consulta a mesma API usada pelo Acervo, sem duplicar o banco de dados.
async function carregarBiblioteca() {
    const controles = [busca, categoria, faixa, disponiveis, ordem, limpar];
    controles.forEach(controle => { controle.disabled = true; });
    repetir.hidden = true;
    aviso.textContent = "Carregando biblioteca…";
    mensagemTabela("Carregando livros…");
    try {
        const resposta = await fetch("/api/biblioteca", { signal: AbortSignal.timeout(15000) });
        if (!resposta.ok) throw new Error("Não foi possível consultar o acervo. Verifique se o servidor e o banco estão funcionando.");
        livros = await resposta.json();
        preencherFiltro(categoria, "categoria", "Todas as categorias");
        preencherFiltro(faixa, "faixaEtaria", "Todas as faixas");
        elemento("totalBiblioteca").textContent = `${livros.length} títulos cadastrados`;
        aplicarFiltros();
        aviso.textContent = "Biblioteca atualizada com os livros do Acervo.";
        controles.forEach(controle => { controle.disabled = false; });
    } catch {
        livros = [];
        aviso.textContent = "Não foi possível carregar a biblioteca. Abra esta página pelo servidor do sistema e verifique a conexão com o banco de dados.";
        elemento("totalBiblioteca").textContent = "Acervo indisponível";
        elemento("resultadosBiblioteca").textContent = "Consulta não concluída";
        mensagemTabela("Os livros não puderam ser carregados. Tente novamente.");
        repetir.hidden = false;
    }
}

// 5. Os eventos conectam as ações da pessoa às funções acima.
busca.addEventListener("input", aplicarFiltros);
[categoria, faixa, disponiveis, ordem].forEach(controle => controle.addEventListener("change", aplicarFiltros));
limpar.addEventListener("click", () => {
    busca.value = categoria.value = faixa.value = "";
    disponiveis.checked = false;
    ordem.value = "recentes";
    aplicarFiltros();
    busca.focus();
});
repetir.addEventListener("click", carregarBiblioteca);
carregarBiblioteca();
