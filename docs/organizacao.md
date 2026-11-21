# Organização do projeto

## Mapa de pastas

```text
Espaco_Leitura_Digital/
├─ docs/                    esta documentação
│  ├─ frontend/             guias das telas
│  ├─ backend/              guias por domínio (empréstimos, reservas, livros e afins)
│  └─ tutoriais/            instalação, uso e primeiros passos
├─ frontend/                todo o código que roda no navegador
│  ├─ assets/               favicon e logos (compartilhados)
│  ├─ shared/
│  │  ├─ css/style.css      design system usado por todas as telas
│  │  └─ js/                scripts compartilhados
│  └─ pages/                uma pasta por tela, com o HTML, o JS e o CSS da página
└─ backend/                 API e banco
   ├─ src/
   │  ├─ routes/            rotas da API, um módulo por domínio
   │  ├─ middlewares/       sessão por cookie e guardas de perfil
   │  ├─ validacao/         validação dos corpos, um módulo por domínio
   │  ├─ repositories/      consultas SQL, um arquivo por domínio
   │  ├─ app.js             montagem da aplicação, páginas e tratamento de erros
   │  ├─ server.js          entrada do processo
   │  └─ database.js        pool de conexões
   ├─ database/             migrações SQL incrementais
   ├─ scripts/              migrate, criar-admin, recuperar-admin
   ├─ test/                 suítes do node --test
   └─ .env                  conexão do banco (local, fora do Git)
```

## Frontend: uma pasta por tela

Cada tela vive em `frontend/pages/<página>/` e leva o nome dela. A pasta da página contém o HTML, o JavaScript da tela e, quando existir, o CSS exclusivo dela. Em `pages/acervo/` ficam `acervo.html`, `acervo.js` e `acervo.css`; em `pages/index/`, `index.html`, `home.js` e `index.css`.

O que mais de uma tela usa fica em `frontend/shared/`:

- `css/style.css` concentra o design system: variáveis de cor, sidebar, menu, topbar, cards, tabela, badges, modal, footer e responsividade.
- `js/auth-ui.js` preenche a identidade do usuário no cabeçalho de todas as telas autenticadas.
- `js/datas.mjs` tem os cálculos de data civil usados por quatro telas e pelo backend.
- `js/reservas.js` atende Reservas e Meus empréstimos, que compartilham as mesmas listas.

Quando um estilo é exclusivo de uma tela, ele mora na pasta dela e o HTML carrega os dois arquivos, o compartilhado primeiro e o da página depois. A divisão foi medida seletor a seletor: um seletor só sai do `style.css` quando nenhuma outra tela o usa. Classes montadas por JavaScript com nome composto em tempo de execução, como `reserva-status-` + situação, permanecem no arquivo compartilhado porque o script que as cria atende duas telas.

## Convenções que mantêm tudo funcionando

**URLs públicas não mudam com a estrutura de pastas.** O navegador acessa `/acervo.html` e o servidor entrega `frontend/pages/acervo/acervo.html`. Links entre telas e favoritos continuam valendo mesmo que o arquivo mude de lugar.

**Caminhos de assets são absolutos.** Dentro das páginas, referências a estilos, scripts e imagens começam com `/` (`/css/style.css`, `/pages/acervo/acervo.js`, `/assets/img/...`). Módulos ES importam pelo caminho absoluto também (`import ... from '/js/datas.mjs'`), porque um import relativo resolve contra a URL do módulo no navegador e quebra quando o arquivo se move.

**Páginas protegidas são autorizadas no servidor.** O Express verifica a sessão e o perfil antes de entregar cada HTML protegido, com redirecionamento para o login ou para a troca de senha. A checagem na interface é só aparência; a que vale é a da rota.

## Backend: camadas curtas

- `src/server.js` sobe o processo na porta configurada e agenda a expiração de reservas vencidas a cada minuto.
- `src/app.js` monta a aplicação: middlewares gerais da API, registro das rotas por domínio, páginas e estáticos, e o tratamento de erros.
- `src/routes/<domínio>.js` concentra as rotas daquele domínio. Cada rota valida a entrada, chama o repositório e devolve JSON com status coerente (400 para dado inválido, 404 para inexistente, 503 para banco fora).
- `src/middlewares/sessao.js` carrega a sessão pelo cookie e fornece os guardas de perfil (`exigirPerfil` e variantes), que também criam os repositórios com escopo de Centro da requisição.
- `src/repositories/<domínio>.js` guarda todo o SQL daquele domínio e recebe o Centro como escopo quando aplicável.
- `src/validacao/<domínio>.js` valida os corpos das requisições antes de qualquer consulta; `erros.js` guarda `erroHttp` e o helper de texto usados pelo backend inteiro.
- `database/` guarda as migrações; `scripts/migrate.js` as aplica em transação.
- `test/` roda com `npm test`; suítes de interface leem os arquivos das páginas por caminho, então movimentações de arquivo vão junto com o ajuste de caminho nos testes.

## Onde mexer em quê

| Quero | Lugar |
| --- | --- |
| Mudar algo visual de uma tela | `frontend/pages/<página>/` (CSS exclusivo) ou `frontend/shared/css/style.css` (design system) |
| Mudar o comportamento de uma tela | o `<página>.js` dela |
| Criar ou alterar rota da API | `backend/src/routes/<domínio>.js`; a montagem fica em `backend/src/app.js` |
| Validar um campo ou corpo novo | `backend/src/validacao/<domínio>.js` |
| Mudar regra de negócio com SQL | `backend/src/repositories/<domínio>.js` |
| Mudar estrutura do banco | migração nova em `backend/database/` |
| Adicionar tela nova | pasta em `frontend/pages/`, rota no módulo de domínio em `backend/src/routes/` e, se a página for restrita, no `paginaProtegida` |
| Documentar regra nova | guia correspondente em `docs/backend/` |
