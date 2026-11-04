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

const carrosselDestaques = elemento('destaquesLeitura');
const slidesDestaques = elemento('slidesDestaques');
const indicadoresDestaques = elemento('indicadoresDestaques');
const controlesDestaques = carrosselDestaques.querySelectorAll('.carousel-control-prev, .carousel-control-next');
const modalDetalhesLivro = elemento('modalDetalhesLivroPublico');
const modalLivrosCategoria = elemento('modalLivrosCategoria');
const listaLivrosCategoria = elemento('listaLivrosCategoria');
const gruposCategoria = {
    stories: { titulo: 'Contos e imaginação', categorias: ['Literatura', 'Infantojuvenil'] },
    adventure: { titulo: 'Aventura e fantasia', categorias: ['Aventura', 'Fantasia'] },
    knowledge: { titulo: 'Conhecimento e descobertas', categorias: ['Conhecimento e descobertas'] }
};
let livrosPublicos = [];
let catalogoCarregado = false;
let erroCatalogo = null;
let grupoCategoriaAtual = null;

function criarNo(tag, texto, classe) {
    const no = document.createElement(tag);
    if (texto !== undefined) no.textContent = texto;
    if (classe) no.className = classe;
    return no;
}

function mostrarEstadoDestaques(mensagem, falha = false) {
    const conteudo = criarNo('div', undefined, 'home-slide home-slide-empty');
    const mensagemElemento = criarNo('p', mensagem);
    conteudo.append(mensagemElemento);
    if (falha) {
        const tentarNovamente = criarNo('button', 'Tentar novamente', 'home-slide-retry');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', carregarCatalogoPublico);
        conteudo.append(tentarNovamente);
    }
    slidesDestaques.replaceChildren(criarNo('article', undefined, 'carousel-item active'));
    slidesDestaques.firstElementChild.append(conteudo);
    slidesDestaques.setAttribute('aria-busy', 'false');
    indicadoresDestaques.replaceChildren();
    indicadoresDestaques.hidden = true;
    controlesDestaques.forEach(controle => { controle.hidden = true; });
}

function criarSlideLivro(livro, indice, ordemCategoria, totalCategoria) {
    const categoria = livro.categoria || 'Outras leituras';
    const artigo = criarNo('article', undefined, `carousel-item${indice === 0 ? ' active' : ''}`);
    const slide = criarNo('div', undefined, `home-slide ${['home-slide-stories', 'home-slide-adventure', 'home-slide-learning'][indice % 3]}`);
    const texto = criarNo('div', undefined, 'home-slide-copy');
    const titulo = livro.titulo || 'Livro sem título';
    const autor = livro.autor ? `Por ${livro.autor}. ` : '';
    texto.append(
        criarNo('span', `${categoria} · ${String(ordemCategoria).padStart(2, '0')} de ${totalCategoria}`, 'home-slide-label'),
        criarNo('h2', titulo)
    );
    const descricao = [autor, livro.sinopse].filter(Boolean).join('');
    texto.append(criarNo('p', descricao || 'Uma leitura esperando por você no nosso acervo.'));
    const link = criarNo('button', undefined, 'home-book-details-action');
    link.type = 'button';
    link.setAttribute('aria-label', `Ver informações de ${titulo}`);
    link.append(document.createTextNode('Ver informações '));
    const iconeLink = criarNo('i');
    iconeLink.className = 'bi bi-arrow-up-right';
    iconeLink.setAttribute('aria-hidden', 'true');
    link.append(iconeLink);
    link.addEventListener('click', () => abrirDetalhesLivro(livro));
    texto.append(link);

    const capa = criarNo('div', undefined, 'home-book-art home-featured-book-art');
    const criarCapaFallback = () => {
        const fallback = criarNo('div', undefined, 'home-book home-book-front home-book-fallback');
        const icone = criarNo('i');
        icone.className = 'bi bi-book-half';
        icone.setAttribute('aria-hidden', 'true');
        fallback.append(icone, criarNo('span', titulo), criarNo('small', categoria));
        return fallback;
    };
    const urlCapa = livro.capaUrl;
    if (typeof urlCapa === 'string' && /^https?:\/\//i.test(urlCapa)) {
        const fallback = criarCapaFallback();
        fallback.setAttribute('aria-hidden', 'true');
        const imagem = document.createElement('img');
        imagem.className = 'home-featured-book-cover';
        imagem.src = urlCapa;
        imagem.alt = `Capa de ${titulo}`;
        imagem.loading = 'lazy';
        imagem.referrerPolicy = 'no-referrer';
        imagem.addEventListener('error', () => capa.replaceChildren(criarCapaFallback()), { once: true });
        imagem.addEventListener('load', () => fallback.remove(), { once: true });
        capa.append(fallback, imagem);
    } else {
        capa.append(criarCapaFallback());
    }

    const botaoCapa = criarNo('button', undefined, 'home-featured-book-trigger');
    botaoCapa.type = 'button';
    botaoCapa.setAttribute('aria-label', `Ver informações de ${titulo}`);
    botaoCapa.append(capa);
    botaoCapa.addEventListener('click', () => abrirDetalhesLivro(livro));
    slide.append(texto, botaoCapa);
    artigo.append(slide);
    return artigo;
}

function mostrarCapaDetalhe(livro) {
    const capa = elemento('capaDetalhesLivroPublico');
    const icone = criarNo('i');
    icone.className = 'bi bi-book-half';
    icone.setAttribute('aria-hidden', 'true');
    const legenda = criarNo('span', 'Capa indisponível');
    capa.replaceChildren(icone, legenda);

    if (typeof livro.capaUrl !== 'string' || !/^https?:\/\//i.test(livro.capaUrl)) return;
    const imagem = document.createElement('img');
    imagem.src = livro.capaUrl;
    imagem.alt = `Capa de ${livro.titulo || 'livro'}`;
    imagem.loading = 'lazy';
    imagem.referrerPolicy = 'no-referrer';
    imagem.addEventListener('error', () => capa.replaceChildren(icone, legenda), { once: true });
    capa.replaceChildren(imagem);
}

function preencherDetalhesLivro(livro) {
    elemento('tituloDetalhesLivroPublico').textContent = livro.titulo || 'Livro sem título';
    elemento('autorDetalhesLivroPublico').textContent = livro.autor ? `Por ${livro.autor}` : 'Autor não informado';
    elemento('categoriaDetalhesLivroPublico').textContent = livro.categoria || 'Categoria não informada';
    elemento('isbnDetalhesLivroPublico').textContent = livro.isbn || 'Não informado';
    elemento('editoraDetalhesLivroPublico').textContent = livro.editora || 'Não informada';
    elemento('anoDetalhesLivroPublico').textContent = livro.ano || 'Não informado';
    elemento('faixaDetalhesLivroPublico').textContent = livro.faixaEtaria || 'Não informada';
    elemento('sinopseDetalhesLivroPublico').textContent = livro.sinopse || 'Sinopse não informada.';
    mostrarCapaDetalhe(livro);
}

function abrirDetalhesLivro(livro) {
    preencherDetalhesLivro(livro);
    const mostrarModal = () => bootstrap.Modal.getOrCreateInstance(modalDetalhesLivro).show();
    if (modalLivrosCategoria.classList.contains('show')) {
        modalLivrosCategoria.addEventListener('hidden.bs.modal', mostrarModal, { once: true });
        bootstrap.Modal.getOrCreateInstance(modalLivrosCategoria).hide();
        return;
    }
    mostrarModal();
}

function criarImagemLista(livro) {
    const capa = criarNo('div', undefined, 'home-category-book-cover');
    const icone = criarNo('i');
    icone.className = 'bi bi-book-half';
    icone.setAttribute('aria-hidden', 'true');
    capa.append(icone);
    if (typeof livro.capaUrl === 'string' && /^https?:\/\//i.test(livro.capaUrl)) {
        const imagem = document.createElement('img');
        imagem.src = livro.capaUrl;
        imagem.alt = `Capa de ${livro.titulo || 'livro'}`;
        imagem.loading = 'lazy';
        imagem.referrerPolicy = 'no-referrer';
        imagem.addEventListener('error', () => capa.replaceChildren(icone), { once: true });
        capa.replaceChildren(imagem);
    }
    return capa;
}

function adicionarDadoLivro(lista, rotulo, valor) {
    if (!valor) return;
    const item = criarNo('div');
    item.append(criarNo('dt', rotulo), criarNo('dd', String(valor)));
    lista.append(item);
}

function mostrarLivrosCategoria(grupoId) {
    grupoCategoriaAtual = grupoId;
    const grupo = gruposCategoria[grupoId];
    if (!grupo) return;
    elemento('tituloLivrosCategoria').textContent = grupo.titulo;
    elemento('descricaoLivrosCategoria').textContent = `Livros cadastrados em ${grupo.categorias.join(' e ')}.`;
    listaLivrosCategoria.replaceChildren();

    if (!catalogoCarregado) {
        listaLivrosCategoria.append(criarNo('p', erroCatalogo || 'Carregando livros…', 'text-secondary mb-0'));
        return;
    }
    if (erroCatalogo) {
        const mensagem = criarNo('p', erroCatalogo, 'text-danger mb-0');
        const tentarNovamente = criarNo('button', 'Tentar novamente', 'btn btn-secondary-custom mt-3');
        tentarNovamente.type = 'button';
        tentarNovamente.addEventListener('click', carregarCatalogoPublico);
        listaLivrosCategoria.append(mensagem, tentarNovamente);
        return;
    }

    const categorias = new Set(grupo.categorias);
    const livros = livrosPublicos.filter(livro => categorias.has(livro.categoria));
    if (!livros.length) {
        listaLivrosCategoria.append(criarNo('p', 'Ainda não há livros cadastrados nesta categoria.', 'text-secondary mb-0'));
        return;
    }

    livros.forEach(livro => {
        const artigo = criarNo('article', undefined, 'home-category-book');
        const botaoCapa = criarNo('button', undefined, 'home-category-book-trigger');
        botaoCapa.type = 'button';
        botaoCapa.setAttribute('aria-label', `Ver informações de ${livro.titulo || 'livro'}`);
        botaoCapa.append(criarImagemLista(livro));
        botaoCapa.addEventListener('click', () => abrirDetalhesLivro(livro));

        const informacoes = criarNo('div', undefined, 'home-category-book-info');
        const titulo = criarNo('button', livro.titulo || 'Livro sem título', 'home-category-book-title');
        titulo.type = 'button';
        titulo.addEventListener('click', () => abrirDetalhesLivro(livro));
        const metadados = criarNo('dl', undefined, 'home-category-book-metadata');
        adicionarDadoLivro(metadados, 'Autor', livro.autor);
        adicionarDadoLivro(metadados, 'Categoria', livro.categoria);
        adicionarDadoLivro(metadados, 'Editora', livro.editora);
        adicionarDadoLivro(metadados, 'Ano', livro.ano);
        adicionarDadoLivro(metadados, 'Faixa etária', livro.faixaEtaria);
        adicionarDadoLivro(metadados, 'ISBN', livro.isbn);
        informacoes.append(titulo, metadados, criarNo('p', livro.sinopse || 'Sinopse não informada.', 'home-category-book-synopsis'));
        artigo.append(botaoCapa, informacoes);
        listaLivrosCategoria.append(artigo);
    });
}

async function carregarCatalogoPublico() {
    slidesDestaques.setAttribute('aria-busy', 'true');
    catalogoCarregado = false;
    erroCatalogo = null;
    try {
        const resposta = await fetch('/api/catalogo-publico', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        if (!resposta.ok) throw new Error('Não foi possível carregar os livros do acervo.');
        const livros = await resposta.json();
        if (!Array.isArray(livros)) throw new Error('A resposta dos livros está em um formato inesperado.');
        livrosPublicos = livros;
        catalogoCarregado = true;
        if (livros.length === 0) {
            mostrarEstadoDestaques('Ainda não há livros cadastrados no acervo.');
            if (grupoCategoriaAtual) mostrarLivrosCategoria(grupoCategoriaAtual);
            return;
        }

        const destaquesRecentes = livros.slice(0, 12);
        const categorias = new Map();
        destaquesRecentes.forEach(livro => {
            const categoria = livro.categoria || 'Outras leituras';
            if (!categorias.has(categoria)) categorias.set(categoria, []);
            categorias.get(categoria).push(livro);
        });
        const destaques = [...categorias.entries()]
            .sort(([categoriaA], [categoriaB]) => categoriaA.localeCompare(categoriaB, 'pt-BR'))
            .flatMap(([, titulos]) => titulos.map((livro, indice) => ({
                livro,
                ordemCategoria: indice + 1,
                totalCategoria: titulos.length
            })));

        slidesDestaques.replaceChildren(...destaques.map(({ livro, ordemCategoria, totalCategoria }, indice) =>
            criarSlideLivro(livro, indice, ordemCategoria, totalCategoria)));
        slidesDestaques.setAttribute('aria-busy', 'false');
        indicadoresDestaques.replaceChildren(...destaques.map(({ livro }, indice) => {
            const indicador = document.createElement('button');
            indicador.type = 'button';
            indicador.dataset.bsTarget = '#destaquesLeitura';
            indicador.dataset.bsSlideTo = String(indice);
            indicador.setAttribute('aria-label', `Livro ${indice + 1}: ${livro.titulo || 'sem título'} · ${livro.categoria || 'Outras leituras'}`);
            if (indice === 0) {
                indicador.className = 'active';
                indicador.setAttribute('aria-current', 'true');
            }
            return indicador;
        }));
        indicadoresDestaques.hidden = destaques.length < 2;
        controlesDestaques.forEach(controle => { controle.hidden = destaques.length < 2; });
        const carrossel = bootstrap.Carousel.getOrCreateInstance(carrosselDestaques, { interval: 6500 });
        if (destaques.length > 1) carrossel.cycle();
        else carrossel.pause();
        if (grupoCategoriaAtual) mostrarLivrosCategoria(grupoCategoriaAtual);
    } catch (falha) {
        erroCatalogo = falha.name === 'TimeoutError'
            ? 'A consulta aos livros demorou demais. Tente novamente.'
            : falha.message || 'Não foi possível carregar os livros do acervo.';
        catalogoCarregado = true;
        mostrarEstadoDestaques(erroCatalogo, true);
        if (grupoCategoriaAtual) mostrarLivrosCategoria(grupoCategoriaAtual);
    }
}

carregarCatalogoPublico();

modalLivrosCategoria.addEventListener('show.bs.modal', evento => {
    mostrarLivrosCategoria(evento.relatedTarget?.dataset.categoryGroup);
});

elemento('cadastrarParaReservar').addEventListener('click', () => {
    modalDetalhesLivro.addEventListener('hidden.bs.modal', () => {
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }, { once: true });
    bootstrap.Modal.getOrCreateInstance(modalDetalhesLivro).hide();
});

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
    modal.querySelectorAll('input, select, button').forEach(controle => { controle.disabled = true; });
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
        modal.querySelectorAll('input, select, button').forEach(controle => { controle.disabled = false; });
        centro.disabled = !centrosCarregados;
        botaoEnviar.disabled = !centrosCarregados;
        if (!botaoEnviar.hidden) botaoEnviar.textContent = 'Cadastrar leitor';
    }
});
