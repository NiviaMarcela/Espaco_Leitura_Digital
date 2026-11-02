/* =========================================================
   ESPAÇO DE LEITURA DIGITAL
   Página: Acervo
========================================================= */


// O banco é a fonte dos dados. Este array é apenas a cópia usada na tela.
let livros = [];
let acervoCarregado = false;

/* =========================================================
   ELEMENTOS DO HTML
========================================================= */

const tabela =
    document.getElementById("tabelaAcervo");


const campoBusca =
    document.getElementById("campoBusca");


const filtroCategoria =
    document.getElementById("filtroCategoria");


const filtroStatus =
    document.getElementById("filtroStatus");


const filtroCentro =
    document.getElementById("filtroCentro");


const formLivro =
    document.getElementById("formLivro");



/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */


/*
    Retorna todos os exemplares disponíveis
    de determinado livro.
*/

function exemplaresDisponiveis(livro) {

    return livro.exemplares.filter(

        exemplar =>
            exemplar.status === "Disponível"

    );

}



/*
    Retorna todos os exemplares emprestados.
*/

function exemplaresEmprestados(livro) {

    return livro.exemplares.filter(

        exemplar =>
            exemplar.status === "Emprestado"

    );

}



/*
    Determina o status geral apresentado na tabela.
*/

function descobrirStatusLivro(livro) {

    const disponiveis =
        exemplaresDisponiveis(livro).length;


    const emprestados =
        exemplaresEmprestados(livro).length;


    if (disponiveis > 0) {

        return "Disponível";

    }


    if (emprestados > 0) {

        return "Emprestado";

    }


    return "Indisponível";

}



/*
    Define a cor do badge.
*/

function classeStatus(status) {

    if (status === "Disponível") {

        return "badge-green";

    }


    if (status === "Emprestado") {

        return "badge-purple";

    }


    return "badge-pink";

}



/*
    Descobre em quais Centros existem
    exemplares daquele livro.
*/

function obterCentrosLivro(livro) {

    const centros =
        livro.exemplares.map(

            exemplar =>
                exemplar.centro

        );


    /*
        Set elimina valores repetidos.
    */

    return [...new Set(centros)];

}



/*
    Texto que será mostrado na tabela.
*/

function textoCentrosLivro(livro) {

    const centros =
        obterCentrosLivro(livro);


    if (centros.length === 1) {

        return centros[0];

    }


    return `${centros.length} Centros`;

}



/*
    Verifica se o livro corresponde
    ao filtro de status escolhido.
*/

function correspondeAoStatus(livro, statusSelecionado) {
    // Sem filtro, todas as obras podem aparecer.
    if (statusSelecionado === "") {
        return true;
    }

    // Usa a mesma classificação exibida no status da tabela.
    return descobrirStatusLivro(livro) === statusSelecionado;
}



/* =========================================================
   RENDERIZAR TABELA
========================================================= */

function renderizarLivros(lista) {

    tabela.innerHTML = "";

    // Os indicadores devem mudar mesmo quando os filtros deixam a tabela vazia.
    atualizarIndicadores();


    if (lista.length === 0) {

        tabela.innerHTML = `

            <tr>

                <td
                    colspan="7"
                    class="text-center py-5"
                >

                    <div class="mb-2">

                        <i
                            class="bi bi-search"
                            style="font-size: 24px;"
                        ></i>

                    </div>

                    ${livros.length === 0 ? "Nenhum livro cadastrado. Clique em Novo livro para começar." : "Nenhum livro encontrado para os filtros selecionados."}

                </td>

            </tr>

        `;

        return;

    }



    lista.forEach(livro => {


        /*
            Agora calculamos automaticamente.
        */

        const totalExemplares =
            livro.exemplares.length;


        const disponiveis =
            exemplaresDisponiveis(livro).length;


        const status =
            descobrirStatusLivro(livro);


        const centros =
            obterCentrosLivro(livro);


        const linha =
            document.createElement("tr");


        linha.innerHTML = `

            <td>

                <div class="book-info">

                    <div class="book-cover">

                        <i class="bi bi-book"></i>

                    </div>


                    <div>

                        <strong>
                            
                        </strong>

                        <span>
                            
                        </span>

                    </div>

                </div>

            </td>



            <td>

                <span class="category-badge">

                    

                </span>

            </td>



            <td
                class="centros-livro"
            >

                

            </td>



            <td>

                ${totalExemplares}

            </td>



            <td>

                ${disponiveis}

            </td>



            <td>

                <span
                    class="
                        badge-status
                        ${classeStatus(status)}
                    "
                >

                    ${status}

                </span>

            </td>



            <td class="text-end">

                <button
                    class="table-action"
                    title="Visualizar livro"
                    aria-label="Visualizar livro"
                    data-livro-id="${livro.id}"
                    onclick="visualizarLivro(${livro.id})"
                >

                    <i class="bi bi-eye"></i>

                </button>


                <button
                    class="table-action"
                    title="Editar livro"
                    aria-label="Editar livro"
                    data-editar-livro-id="${livro.id}" ${window.usuarioAtual?.perfil === "Administrador" ? "" : "hidden"}
                    onclick="editarLivro(${livro.id})"
                >

                    <i class="bi bi-pencil"></i>

                </button>

            </td>

        `;


        linha.querySelector(".centros-livro").textContent = textoCentrosLivro(livro);
        linha.querySelector(".centros-livro").title = centros.join(", ");
        linha.querySelector(".book-info strong").textContent = livro.titulo;
        linha.querySelector(".book-info span").textContent = livro.autor;
        linha.querySelector(".category-badge").textContent = livro.categoria;

        // A capa é inserida como elemento, sem transformar o link em HTML.
        if (livro.capaUrl) {
            const espacoCapa = linha.querySelector(".book-cover");
            const imagem = document.createElement("img");

            imagem.alt = `Capa de ${livro.titulo}`;
            imagem.loading = "lazy";
            imagem.referrerPolicy = "no-referrer";

            // Se o endereço não carregar uma imagem, recuperamos o ícone.
            imagem.addEventListener("error", function () {
                const icone = document.createElement("i");
                icone.className = "bi bi-book";
                espacoCapa.replaceChildren(icone);
            }, { once: true });

            imagem.src = livro.capaUrl;
            espacoCapa.replaceChildren(imagem);
        }

        tabela.appendChild(linha);

    });


}



/* =========================================================
   INDICADORES
========================================================= */

function atualizarIndicadores() {

    const totalObras =
        livros.length;


    const totalExemplares =
        livros.reduce(

            (total, livro) =>

                total +
                livro.exemplares.length,

            0

        );


    const totalDisponiveis =
        livros.reduce(

            (total, livro) =>

                total +
                exemplaresDisponiveis(livro).length,

            0

        );


    document.getElementById(
        "totalObras"
    ).textContent =
        totalObras;


    document.getElementById(
        "totalExemplares"
    ).textContent =
        totalExemplares;


    document.getElementById(
        "totalDisponiveis"
    ).textContent =
        totalDisponiveis;

}



/* =========================================================
   FILTROS
========================================================= */

function aplicarFiltros() {
    if (!acervoCarregado) return;

    const busca =
        campoBusca.value
            .toLowerCase()
            .trim();


    const categoria =
        filtroCategoria.value;


    const statusSelecionado =
        filtroStatus.value;


    /*
        Caso ainda não exista filtroCentro no HTML,
        o código não quebra.
    */

    const centroSelecionado =
        filtroCentro
            ? filtroCentro.value
            : "";


    const resultado =
        livros.filter(livro => {


            /*
                Busca por título, autor ou ISBN.
            */

            const correspondeBusca =

                livro.titulo
                    .toLowerCase()
                    .includes(busca)

                ||

                livro.autor
                    .toLowerCase()
                    .includes(busca)

                ||

                (
                    livro.isbn &&
                    livro.isbn
                        .toLowerCase()
                        .includes(busca)
                );



            /*
                Categoria.
            */

            const correspondeCategoria =

                categoria === ""

                ||

                livro.categoria === categoria;



            /*
                Status.
            */

            const correspondeStatus =

                correspondeAoStatus(
                    livro,
                    statusSelecionado
                );



            /*
                Centro.
            */

            const correspondeCentro =

                centroSelecionado === ""

                ||

                livro.exemplares.some(

                    exemplar =>
                        exemplar.centro ===
                        centroSelecionado

                );



            return (

                correspondeBusca

                &&

                correspondeCategoria

                &&

                correspondeStatus

                &&

                correspondeCentro

            );

        });


    renderizarLivros(resultado);

}



/* =========================================================
   EVENTOS DOS FILTROS
========================================================= */

campoBusca.addEventListener(

    "input",

    aplicarFiltros

);


filtroCategoria.addEventListener(

    "change",

    aplicarFiltros

);


filtroStatus.addEventListener(

    "change",

    aplicarFiltros

);


if (filtroCentro) {

    filtroCentro.addEventListener(

        "change",

        aplicarFiltros

    );

}



/* =========================================================
   COMUNICAÇÃO COM A API
========================================================= */
async function requisitarApi(caminho, metodo = "GET", dados) {
    let resposta;
    try {
        resposta = await fetch(`/api${caminho}`, {
            method: metodo,
            headers: dados ? { "Content-Type": "application/json" } : {},
            body: dados ? JSON.stringify(dados) : undefined,
            signal: AbortSignal.timeout(15000)
        });
    } catch {
        throw new Error(metodo === "GET"
            ? "Não foi possível conectar. Abra o acervo pelo servidor em http://127.0.0.1:3001/acervo.html."
            : "Não foi possível confirmar o salvamento. Atualize o acervo antes de tentar novamente, para verificar se os dados foram gravados.");
    }
    let resultado;
    try { resultado = await resposta.json(); }
    catch { throw new Error("Resposta inesperada. Abra o acervo em http://127.0.0.1:3001/acervo.html."); }
    if (!resposta.ok) {
        if (resposta.status === 503) {
            throw new Error("O banco de dados não está respondendo. Verifique o serviço PostgreSQL e tente novamente.");
        }
        throw new Error(resultado.erro || "Não foi possível concluir a operação.");
    }
    return resultado;
}

function atualizarObraNaTela(livro) {
    const indice = livros.findIndex(item => item.id === livro.id);
    if (indice === -1) livros.push(livro);
    else livros[indice] = livro;
    aplicarFiltros();
}

// Desabilitar controles evita envios repetidos enquanto o servidor responde.
function bloquearFormulario(form, bloqueado) {
    if (bloqueado) {
        form.dataset.salvando = "true";
        form.querySelectorAll("input, select, textarea, button").forEach(campo => {
            campo.dataset.desabilitadoAntes = String(campo.disabled);
            campo.disabled = true;
        });
    } else {
        delete form.dataset.salvando;
        form.querySelectorAll("[data-desabilitado-antes]").forEach(campo => {
            campo.disabled = campo.dataset.desabilitadoAntes === "true";
            delete campo.dataset.desabilitadoAntes;
        });
    }
}

async function carregarAcervo() {
    const aviso = document.getElementById("avisoAcervo");
    const repetir = document.getElementById("recarregarAcervo");
    acervoCarregado = false;
    const controles = [campoBusca, filtroCategoria, filtroStatus, filtroCentro, document.getElementById("novoLivro")];
    controles.forEach(c => { c.disabled = true; });
    repetir.disabled = true;
    repetir.hidden = true;
    aviso.textContent = "Carregando acervo…";
    tabela.innerHTML = '<tr><td colspan="7" class="text-center py-4">Carregando livros…</td></tr>';
    ["totalObras", "totalExemplares", "totalDisponiveis"].forEach(id => document.getElementById(id).textContent = "—");
    try {
        const [obras, centros] = await Promise.all([requisitarApi("/livros"), requisitarApi("/centros")]);
        for (const id of ["centroLivro", "centroExemplares", "filtroCentro"]) {
            const select = document.getElementById(id);
            const anterior = select.value;
            select.replaceChildren(new Option(id === "filtroCentro" ? "Todos os Centros" : "Selecione o Centro", ""));
            centros.forEach(centro => select.add(new Option(centro.nome, id === "filtroCentro" ? centro.nome : String(centro.id))));
            if ([...select.options].some(o => o.value === anterior)) select.value = anterior;
        }
        livros = obras;
        acervoCarregado = true;
        controles.forEach(c => { c.disabled = false; });
        aviso.textContent = "Acervo conectado. Os cadastros são salvos no banco de dados.";
        aplicarFiltros();
    } catch (erro) {
        aviso.textContent = erro.message;
        tabela.innerHTML = '<tr><td colspan="7" class="text-center py-4">Acervo não carregado. Tente novamente.</td></tr>';
        repetir.hidden = false;
    } finally { repetir.disabled = false; }
}

document.getElementById("recarregarAcervo").addEventListener("click", carregarAcervo);

/* =========================================================
   CADASTRAR E EDITAR OS DADOS DA OBRA
========================================================= */

// null indica cadastro; um ID indica qual obra está sendo editada.
let idLivroEmEdicao = null;
const camposObra = {
    titulo: "tituloLivro",
    autor: "autorLivro",
    isbn: "isbnLivro",
    editora: "editoraLivro",
    categoria: "categoriaLivro",
    ano: "anoLivro",
    faixaEtaria: "faixaLivro",
    capaUrl: "capaLivro",
    sinopse: "sinopseLivro"
};

function prepararFormularioLivro(livro = null) {
    formLivro.reset();
    idLivroEmEdicao = livro ? livro.id : null;
    const editando = livro !== null;
    document.getElementById("erroFormularioLivro").textContent = "";
    document.getElementById("tituloFormularioLivro").textContent =
        editando ? "Editar livro" : "Cadastrar novo livro";
    document.getElementById("textoSalvarLivro").textContent =
        editando ? "Salvar alterações" : "Cadastrar livro";
    document.getElementById("descricaoFormularioLivro").textContent = editando
        ? "Atualize os dados da obra. Para incluir cópias, use Adicionar exemplares nos detalhes."
        : "Insira as principais informações da obra.";

    // Centro e localização pertencem às cópias físicas, não aos dados da obra.
    ["quantidadeLivro", "centroLivro", "localizacaoLivro"].forEach(idCampo => {
        const campo = document.getElementById(idCampo);
        campo.disabled = editando;
        campo.parentElement.hidden = editando;
    });

    if (editando) {
        Object.entries(camposObra).forEach(([propriedade, idCampo]) => {
            document.getElementById(idCampo).value = livro[propriedade] ?? "";
        });
    }
}

document.getElementById("novoLivro").addEventListener("click", function () {
    prepararFormularioLivro();
});

formLivro.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (formLivro.dataset.salvando || !acervoCarregado) return;
    const erro = document.getElementById("erroFormularioLivro");
    erro.textContent = "";
    if (!formLivro.reportValidity()) return;
    const dadosObra = {};
    Object.entries(camposObra).forEach(([propriedade, idCampo]) => {
        dadosObra[propriedade] = document.getElementById(idCampo).value.trim();
    });
    if (idLivroEmEdicao === null) {
        dadosObra.quantidade = Number(document.getElementById("quantidadeLivro").value);
        dadosObra.centroId = Number(document.getElementById("centroLivro").value);
        dadosObra.localizacao = document.getElementById("localizacaoLivro").value.trim();
    }
    const id = idLivroEmEdicao;
    let salvo = false;
    bloquearFormulario(formLivro, true);
    document.getElementById("textoSalvarLivro").textContent = "Salvando…";
    try {
        const livro = await requisitarApi(id === null ? "/livros" : `/livros/${id}`, id === null ? "POST" : "PUT", dadosObra);
        atualizarObraNaTela(livro);
        document.getElementById("avisoAcervo").textContent = "Livro salvo no banco de dados.";
        salvo = true;
    } catch (falha) {
        erro.textContent = falha.message;
        // O formulário é longo: trazer o erro à vista evita parecer que nada aconteceu.
        erro.scrollIntoView({ block: "center", behavior: "smooth" });
    } finally {
        bloquearFormulario(formLivro, false);
        document.getElementById("textoSalvarLivro").textContent = id === null ? "Cadastrar livro" : "Salvar alterações";
    }
    if (salvo) bootstrap.Modal.getOrCreateInstance(document.getElementById("modalLivro")).hide();
});


/* =========================================================
   VISUALIZAR LIVRO
   Preenche o mesmo modal a cada clique no botão de visualizar.
========================================================= */

function preencherDetalhesLivro(livro) {
    // textContent exibe os dados como texto, sem interpretá-los como HTML.
    const campos = {
        tituloDetalhesLivro: livro.titulo,
        detalhesAutorLivro: livro.autor,
        detalhesCategoriaLivro: livro.categoria,
        detalhesIsbnLivro: livro.isbn || "Não informado",
        detalhesEditoraLivro: livro.editora || "Não informada",
        detalhesAnoLivro: livro.ano || "Não informado",
        detalhesFaixaLivro: livro.faixaEtaria || "Não informada",
        detalhesSinopseLivro: livro.sinopse || "Sinopse não informada."
    };

    Object.entries(campos).forEach(([idCampo, valor]) => {
        document.getElementById(idCampo).textContent = valor;
    });

    // Limpa a capa anterior para não mostrar a imagem de outra obra.
    const capa = document.getElementById("detalhesCapaLivro");
    function mostrarCapaPadrao() {
        const icone = document.createElement("i");
        icone.className = "bi bi-book";
        icone.setAttribute("aria-hidden", "true");
        const legenda = document.createElement("span");
        legenda.textContent = "Capa indisponível";
        capa.replaceChildren(icone, legenda);
    }
    mostrarCapaPadrao();

    if (livro.capaUrl) {
        const imagem = document.createElement("img");
        imagem.alt = `Capa de ${livro.titulo}`;
        imagem.referrerPolicy = "no-referrer";
        imagem.addEventListener("error", function () {
            // Uma imagem antiga não pode substituir a capa do próximo livro.
            if (capa.contains(imagem)) mostrarCapaPadrao();
        }, { once: true });
        imagem.src = livro.capaUrl;
        capa.replaceChildren(imagem);
    }

    // Os totais são calculados a partir dos exemplares, sem duplicar dados.
    const total = livro.exemplares.length;
    const disponiveis = exemplaresDisponiveis(livro).length;
    document.getElementById("detalhesResumoLivro").textContent =
        `Total cadastrado (inclui baixados): ${total} · Disponíveis: ${disponiveis} · Emprestados: ${exemplaresEmprestados(livro).length} · Baixados: ${livro.exemplares.filter(e => e.status === 'Baixado').length}`;

    const lista = document.getElementById("detalhesExemplaresLivro");
    lista.replaceChildren();

    // Cada objeto do array de exemplares vira uma linha na tabela.
    livro.exemplares.forEach(exemplar => {
        const linha = document.createElement("tr");
        const valores = [
            exemplar.codigo,
            exemplar.centro || "Não informado",
            exemplar.localizacao || "Não informada"
        ];

        valores.forEach(valor => {
            const celula = document.createElement("td");
            celula.textContent = valor;
            linha.appendChild(celula);
        });

        const celulaStatus = document.createElement("td");
        const etiqueta = document.createElement("span");
        etiqueta.className = `badge-status ${classeStatus(exemplar.status)}`;
        etiqueta.textContent = exemplar.status || "Não informado";
        celulaStatus.appendChild(etiqueta);
        linha.appendChild(celulaStatus);
        const acao = document.createElement('td');
        if (exemplar.status === 'Baixado') {
            const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(exemplar.baixaEm));
            acao.textContent = `${exemplar.baixaMotivo} · ${data}${exemplar.baixaObservacao ? ' · ' + exemplar.baixaObservacao : ''}`;
            acao.style.whiteSpace = 'normal';
            acao.style.overflowWrap = 'anywhere';
        } else if (['Emprestado', 'Reservado'].includes(exemplar.status)) {
            acao.textContent = 'Baixa bloqueada: empréstimo ou reserva em aberto.';
        } else {
            const botao = document.createElement('button');
            botao.type = 'button';
            botao.className = 'btn btn-outline-danger btn-sm';
            botao.textContent = 'Dar baixa';
            botao.setAttribute('aria-label', `Dar baixa no exemplar ${exemplar.codigo}`);
            botao.addEventListener('click', () => abrirBaixa(exemplar));
            acao.append(botao);
        }
        linha.append(acao);
        lista.appendChild(linha);
    });

    if (total === 0) {
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 5;
        celula.className = "text-center py-4";
        celula.textContent = "Nenhum exemplar cadastrado para esta obra.";
        linha.appendChild(celula);
        lista.appendChild(linha);
    }

}

// Abrir o modal é separado de atualizar seus dados para não perder o foco ao salvar.
function visualizarLivro(id) {
    const livro = livros.find(livro => livro.id === id);
    if (!livro) return;
    document.getElementById('formBaixa').hidden = true;

    const form = document.getElementById("formExemplares");
    form.reset();
    // Guarda apenas o ID da obra que receberá as novas cópias.
    form.dataset.livroId = String(id);
    document.getElementById("painelNovosExemplares").open = false;
    document.getElementById("erroExemplares").textContent = "";
    document.getElementById("sucessoExemplares").textContent = "";
    preencherDetalhesLivro(livro);

    const modalElement = document.getElementById("modalDetalhesLivro");
    modalElement.addEventListener("hidden.bs.modal", function () {
        // A tabela pode ter sido recriada, por isso procuramos o botão novamente.
        const botao = document.querySelector(`button[data-livro-id="${id}"]`);
        (botao || campoBusca).focus();
    }, { once: true });
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}

/* =========================================================
   ADICIONAR EXEMPLARES A UMA OBRA EXISTENTE
========================================================= */
const formExemplares = document.getElementById("formExemplares");
const formBaixa = document.getElementById('formBaixa');

function abrirBaixa(exemplar) {
    if (formBaixa.dataset.salvando || formExemplares.dataset.salvando) return;
    formBaixa.reset();
    formBaixa.dataset.exemplarId = String(exemplar.id);
    document.getElementById('observacaoBaixa').required = false;
    document.getElementById('tituloBaixa').textContent = `Dar baixa no exemplar ${exemplar.codigo}`;
    document.getElementById('erroBaixa').textContent = '';
    document.getElementById('sucessoExemplares').textContent = '';
    formBaixa.hidden = false;
    document.getElementById('motivoBaixa').focus();
}
document.getElementById('motivoBaixa').addEventListener('change', event => {
    document.getElementById('observacaoBaixa').required = event.target.value === 'Outro';
});
document.getElementById('cancelarBaixa').addEventListener('click', () => { formBaixa.hidden = true; });
formBaixa.addEventListener('submit', async event => {
    event.preventDefault();
    if (formBaixa.dataset.salvando || formExemplares.dataset.salvando || !formBaixa.reportValidity()) return;
    const dados = { motivo: document.getElementById('motivoBaixa').value,
        observacao: document.getElementById('observacaoBaixa').value.trim() };
    const id = formBaixa.dataset.exemplarId;
    const erro = document.getElementById('erroBaixa');
    erro.textContent = '';
    bloquearFormulario(formBaixa, true);
    const botao = formBaixa.querySelector('[type="submit"]');
    botao.textContent = 'Salvando…';
    try {
        const livro = await requisitarApi(`/exemplares/${id}/baixa`, 'POST', dados);
        atualizarObraNaTela(livro);
        preencherDetalhesLivro(livro);
        formBaixa.hidden = true;
        document.getElementById('sucessoExemplares').textContent = 'Baixa registrada. O exemplar foi preservado no histórico.';
    } catch (falha) { erro.textContent = falha.message; erro.focus(); }
    finally { bloquearFormulario(formBaixa, false); botao.textContent = 'Confirmar baixa'; }
});
document.getElementById('modalDetalhesLivro').addEventListener('hide.bs.modal', event => {
    if (formBaixa.dataset.salvando) event.preventDefault();
});

formExemplares.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (formExemplares.dataset.salvando || formBaixa.dataset.salvando) return;
    const erro = document.getElementById("erroExemplares");
    const sucesso = document.getElementById("sucessoExemplares");
    erro.textContent = "";
    sucesso.textContent = "";
    if (!formExemplares.reportValidity()) return;
    const id = Number(formExemplares.dataset.livroId);
    const dados = {
        quantidade: Number(document.getElementById("quantidadeExemplares").value),
        centroId: Number(document.getElementById("centroExemplares").value),
        localizacao: document.getElementById("localizacaoExemplares").value.trim()
    };
    bloquearFormulario(formExemplares, true);
    const botao = formExemplares.querySelector('[type="submit"]');
    botao.textContent = "Salvando…";
    try {
        const livro = await requisitarApi(`/livros/${id}/exemplares`, "POST", dados);
        atualizarObraNaTela(livro);
        preencherDetalhesLivro(livro);
        formExemplares.reset();
        sucesso.textContent = `${dados.quantidade} ${dados.quantidade === 1 ? "exemplar salvo" : "exemplares salvos"} no banco de dados.`;
    } catch (falha) { erro.textContent = falha.message; }
    finally {
        bloquearFormulario(formExemplares, false);
        botao.textContent = "Salvar exemplares";
    }
});

document.getElementById("cancelarExemplares").addEventListener("click", function () {
    formExemplares.reset();
    document.getElementById("erroExemplares").textContent = "";
    document.getElementById("sucessoExemplares").textContent = "";
    const painel = document.getElementById("painelNovosExemplares");
    painel.open = false;
    painel.querySelector("summary").focus();
});


/* =========================================================
   ABRIR O FORMULÁRIO NO MODO DE EDIÇÃO
========================================================= */
function editarLivro(id) {
    const livro = livros.find(livro => livro.id === id);
    if (!livro) return;
    prepararFormularioLivro(livro);
    const modalElement = document.getElementById("modalLivro");
    modalElement.addEventListener("hidden.bs.modal", function () {
        // A edição pode retirar a obra do filtro atual.
        const botao = document.querySelector(`button[data-editar-livro-id="${id}"]`);
        (botao || campoBusca).focus();
    }, { once: true });
    bootstrap.Modal.getOrCreateInstance(modalElement).show();
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

// Não permite fechar um modal durante o envio e perder o contexto da resposta.
for (const [modalId, form] of [["modalLivro", formLivro], ["modalDetalhesLivro", formExemplares]]) {
    document.getElementById(modalId).addEventListener("hide.bs.modal", event => {
        if (form.dataset.salvando) event.preventDefault();
    });
}
carregarAcervo();
