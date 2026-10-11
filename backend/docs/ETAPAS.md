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
