# Entendendo a integração da Biblioteca

A Biblioteca consulta os livros que você cadastra no Acervo. As duas telas usam o mesmo banco: cadastrar ou editar continua sendo responsabilidade do Acervo.

## 1. HTML: a estrutura

Em `biblioteca.html`, o menu, o cabeçalho, os cartões e a tabela usam as classes já existentes em `css/style.css`. Por exemplo, `content-card` aplica a aparência dos cartões e `btn-primary-custom` aplica o estilo do botão principal. Não foi necessário criar outro CSS.

O atributo `class` serve para aplicar estilos. Já o `id` identifica um elemento específico para o JavaScript encontrá-lo. Por exemplo, `id="tabelaBiblioteca"` identifica o corpo da tabela que receberá os livros.

Nos menus de computador e celular das outras páginas, o link `href="biblioteca.html"` permite entrar no catálogo. Na Biblioteca, a classe `active` destaca a página atual.

## 2. Servidor: liberar o endereço

Em `backend/src/app.js`, a lista de páginas permitidas agora inclui `biblioteca`. Essa lista faz o Express responder ao endereço `/biblioteca.html` com o arquivo correspondente. Antes, a página não estava nessa lista e o servidor retornava 404.

## 3. JavaScript: buscar os dados

Leia `js/biblioteca.js` começando por `carregarBiblioteca()`:

```js
const resposta = await fetch("/api/livros", { signal: AbortSignal.timeout(15000) });
livros = await resposta.json();
```

`fetch` faz uma requisição ao servidor. `await` espera a resposta sem travar a interface. `json()` transforma os dados da resposta em valores que o JavaScript entende. O array `livros` mantém esses dados em memória enquanto a página está aberta. O limite de 15 segundos evita uma espera indefinida.

Os títulos e as quantidades fixas foram removidos: agora são calculados a partir da resposta. Se a consulta falhar, a tela mostra um aviso e o botão “Tentar novamente”. Acervo vazio e falha de conexão têm mensagens diferentes.

## 4. Busca, filtros e ordenação

`preencherFiltro()` usa os valores cadastrados para montar as opções de categoria e faixa etária. `Set` remove repetições: se dez livros forem de Literatura, a opção aparece uma vez.

`aplicarFiltros()` usa `filter()` para selecionar os livros que atendem a todos os critérios. Exemplo: categoria Literatura + somente disponíveis mostra apenas obras de Literatura que tenham ao menos um exemplar disponível.

`normalizar()` remove acentos e transforma o texto em minúsculas. Assim, a busca por `ciencias` encontra `Ciências`. A busca considera título, autor, categoria e sinopse.

`sort()` organiza o resultado pelo título, autor ou ID decrescente. A opção “Últimos cadastrados” usa os IDs gerados pelo cadastro; não representa o ano de publicação do livro.

## 5. Montar a tabela e mostrar detalhes

`document.createElement()` cria elementos, `textContent` coloca texto neles e `append()` os insere na tela. Usar `textContent` evita interpretar o conteúdo de um título como HTML.

`quantidadeDisponivel()` conta apenas exemplares com status `Disponível`. Um exemplar baixado ou emprestado não entra nessa contagem.

Ao clicar em “Ver”, `mostrarDetalhes()` preenche um modal com dados do livro, sinopse e localização dos exemplares disponíveis. O Bootstrap controla a abertura e o fechamento desse modal.

## 6. Eventos: ligar os controles às funções

```js
busca.addEventListener("input", aplicarFiltros);
```

Leia como: “quando o conteúdo do campo de busca mudar, execute aplicarFiltros”. Nos seletores, o evento usado é `change`. Nos botões, é `click`.

## Roteiro para experimentar

1. Inicie o servidor e o banco seguindo o tutorial de instalação do projeto.
2. Abra `http://127.0.0.1:3001/biblioteca.html` (ajuste a porta se sua configuração for diferente). Abrir o HTML por duplo clique não fornece a API.
3. Compare os títulos com os cadastrados no Acervo.
4. Busque parte de um título ou autor; teste também uma palavra sem acento.
5. Combine categoria, faixa etária e disponibilidade. Use “Limpar filtros” para voltar à lista completa.
6. Clique em “Ver” e confira a sinopse e a localização.
7. Diminua a janela para conferir a navegação móvel e a rolagem horizontal da tabela.

Os dados são consultados ao abrir ou recarregar a página. Depois de alterar o Acervo em outra aba, recarregue a Biblioteca para obter os dados atuais.

Os testes automatizados verificam a rota, os links, a busca, os filtros, a ordenação e os estados de erro e lista vazia. A conferência visual e a interação real com o modal ainda precisam ser feitas no navegador: o navegador integrado bloqueou o acesso local neste ambiente.
