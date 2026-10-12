## Verificação inicial — preparação do backend

Na preparação inicial, os sete testes passaram. O servidor real respondeu 200 em `/api/health`, 503 nas consultas ao banco não configurado e 400 para ID inválido. O comando de migração encerrou sem aplicar alterações por ausência de `DATABASE_URL`, como esperado.

## Integração com o PostgreSQL — 4 de outubro de 2026

A migração foi aplicada ao banco local `espaco_leitura` no PostgreSQL 18. Foram verificadas as tabelas `livros`, `centros`, `exemplares` e `schema_migrations`, os três Centros, a geração de códigos, as consultas com exemplares e as restrições de status e relacionamentos. Reaplicar a migração não duplicou dados. As rotas `/api/health/db`, `/api/centros` e `/api/livros` responderam 200 usando o banco real.

Registros temporários de teste foram desfeitos por `ROLLBACK`; o banco permanece sem obras. As sequências de IDs avançam mesmo quando há rollback, portanto os primeiros códigos cadastrados podem não começar em 0001. Não reinicializamos essas sequências.

No PostgreSQL 18, a tentativa de excluir uma obra com exemplares retornou `23001` (`restrict_violation`); a referência a um Centro inexistente retornou `23503` e o status inválido retornou `23514`. Todas essas rejeições são esperadas.

## Integração da interface — 5 de outubro de 2026

`carregarAcervo()` usa `Promise.all` para buscar livros e Centros. `requisitarApi()` centraliza `fetch`, conversão JSON e erros. Os formulários usam `async/await` para aguardar a confirmação antes de atualizar a tela. O array `livros` agora é uma cópia dos dados consultados, e não o armazenamento definitivo.

Fluxo de um cadastro: formulário → POST /api/livros → validarObra/validarExemplares → transação SQL → resposta JSON → atualizarObraNaTela.

Oito testes passaram, incluindo integração com um schema PostgreSQL isolado: persistência, edição preservando exemplares emprestados, rollback, validações e inclusões simultâneas com códigos únicos. O teste de navegador confirmou persistência após recarga nos três formulários e erro de rede sem falso sucesso. A obra temporária criada no navegador foi removida ao final.

## Banco de teste, dashboard ligado à API e ajustes — 12 de outubro de 2026

O `backend/.env` passou a apontar para um PostgreSQL de teste no ar, e o README descreve a configuração sem exigir Docker: basta um PostgreSQL local ou hospedado, com banco e usuário próprios. A verificação desta rodada usou um PostgreSQL 18.6 em container, montado fora da configuração do projeto — nenhum arquivo de Docker fica versionado. As migrações foram aplicadas por `pnpm db:migrate`; a segunda execução informou que o banco já estava atualizado e `schema_migrations` registrou os cinco arquivos. O fuso do banco ficou em `America/Fortaleza`, para que `CURRENT_DATE` coincida com a data civil calculada pela API.

`pnpm test` passou com 17 testes (2 desligados) e `pnpm test:integracao` rodou os 19, incluindo os dois que precisam de PostgreSQL, contra o banco indicado no `.env`.

O dashboard deixou de ter números fixos: `js/dashboard.js` calcula obras, exemplares disponíveis, empréstimos em curso e atrasados a partir de `/api/livros` e `/api/emprestimos`, e monta a lista de empréstimos recentes com avatares, datas e situação. Verificado no navegador com dados reais de exemplo: 3 obras, 4 exemplares disponíveis, 3 empréstimos em curso e 1 atrasado.

Bootstrap e Bootstrap Icons passaram a ser servidos de `assets/vendor/`, sem CDN. Com a CDN bloqueada no navegador, as cinco páginas abriram, listaram os dados e abriram seus modais sem erro de script — antes disso o clique em "Novo leitor" não fazia nada e o console registrava `bootstrap is not defined`.

Outros ajustes desta rodada: o módulo de datas do servidor virou `src/utils/datas.js` e não importa mais um arquivo do navegador (o front mantém `js/datas.mjs`; `test/datas.test.js` compara as duas cópias e falha se divergirem); banco sem configuração responde com a orientação de criar o `.env`, em vez da mensagem de serviço fora do ar; `index.html` deixou de ser um arquivo vazio e entrou na lista de páginas servidas (antes `/index.html` respondia 404); `js/app.js`, que só escrevia no console, foi removido; os guias de `docs/` passaram a citar os atalhos do pnpm em vez de comandos soltos.

O dashboard ainda mostra "Silvia — Administrador" no topo, como as outras páginas: é um usuário de maquete, sem login, e a decisão de trocar por um rótulo neutro ou implementar autenticação ficou para a etapa de usuários e permissões.
