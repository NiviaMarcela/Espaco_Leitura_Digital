# Arquitetura

## Visão geral

O sistema tem duas partes separadas por uma fronteira clara: o backend responde em `http://127.0.0.1:3001/api` e serve as páginas do frontend pela mesma origem. Não há build de frontend, bundler nem framework: cada página é um arquivo HTML que carrega seu próprio JavaScript.

| Camada | Tecnologia | Responsabilidade |
| --- | --- | --- |
| Interface | HTML, CSS e JavaScript puros, com Bootstrap 5 via CDN | Formulários, tabelas, filtros e chamadas `fetch` à API |
| API | Node.js 22.9+ (ES Modules), Express 5 | Rotas, validação de entrada, perfis de acesso, respostas JSON |
| Banco | PostgreSQL (driver `pg` 8), acesso por pool | Dados, integridade e regras que exigem transação |

O Express também publica os arquivos estáticos: cada URL de página (`/acervo.html`, `/biblioteca.html` e afins) entrega o arquivo correspondente de `frontend/pages/`, e os caminhos `/css`, `/js`, `/assets` e `/pages` servem os estilos, scripts e imagens.

## Fluxo de uma requisição

```text
página (fetch) → rota em src/routes/<domínio>.js → exigirPerfil (src/middlewares/sessao.js) → repositório (SQL parametrizado) → PostgreSQL → JSON → tela atualiza
```

O passo `exigirPerfil`, definido em `src/middlewares/sessao.js`, merece atenção. Ele carrega a sessão pelo cookie, recusa quem não tem o perfil exigido e, antes de chamar a rota, monta os repositórios daquela requisição já filtrados pelo Centro do usuário. Coordenadores, professores e funcionários só enxergam o próprio Centro porque esse filtro nasce aqui, no servidor, e não em um parâmetro que a interface envia.

A tela só atualiza o estado depois de confirmar a resposta da API. Não existe reenvio automático quando a rede falha: se a gravação não confirmar, a pessoa confere o acervo e tenta de novo.

## Modelo de dados

```text
livros (obra) ──< exemplares (cópia física) >── centros
```

A separação entre obra e cópia é a decisão central do modelo. Um livro pode ter cópias em vários Centros, então o Centro pertence ao exemplar, junto do código único (`EX-0001`, gerado pelo banco para evitar colisão com cadastros simultâneos), da localização e do status físico.

Os status físicos são: Disponível, Emprestado, Reservado, Danificado, Perdido e Baixado. Quantidade e disponibilidade da obra não ficam armazenadas; elas são calculadas a partir das cópias no momento da consulta, o que evita campo desatualizado.

A integridade mora no banco: chaves estrangeiras exigem que livro e Centro existam, restrições `CHECK` rejeitam status inválidos, `ON DELETE RESTRICT` impede apagar uma obra ou Centro que ainda tem exemplares, e uma restrição parcial garante que a mesma cópia não tenha duas retiradas abertas, mesmo com requisições concorrentes. As tabelas de contas, sessões, reservas, empréstimos, renovações, devoluções, recuperação de senha, livro vivo e categorias seguem o mesmo padrão.

## Perfis de acesso

| Perfil | Escopo | O que faz |
| --- | --- | --- |
| Administrador | Os três Centros | Gerencia tudo, incluindo usuários e Livro Vivo |
| Coordenador | O próprio Centro | Gestão do Centro, usuários locais e redefinição de senha da equipe |
| Professor e Funcionário | O próprio Centro | Circulação: empréstimos, devoluções, reservas e leitores |
| Leitor | Os próprios registros | Catálogo do Centro, reservas e histórico pessoal |

O cadastro público cria conta de leitor com senha de 8 a 128 caracteres. Contas de equipe são criadas por um administrador em Usuários. Uma conta com senha temporária fica presa à troca de senha até trocá-la.

## Sessão e segurança

O login cria um cookie `HttpOnly` com `SameSite=Lax`; o token da sessão é guardado como hash no banco, e senhas usam `scrypt`. Escritas vindas de outra origem são rejeitadas, o corpo JSON tem limite de 32 KB, IDs passam por validação antes de virar número, e login, cadastro público e recuperação de senha limitam a taxa por IP em janelas de 15 minutos. Erros devolvem mensagens para a pessoa sem expor SQL, credenciais ou caminhos internos.

Em produção, `NODE_ENV=production` acrescenta o atributo `Secure` ao cookie, e o servidor deve rodar atrás de HTTPS.

## Migrações

O schema evolui por migrações SQL incrementais em `backend/database/` (`001_acervo.sql` a `016_livro_vivo_doacao.sql`). O script `backend/scripts/migrate.js` aplica cada arquivo pendente em uma transação e registra a aplicação em `schema_migrations`; rodar de novo informa que o banco está atualizado. Mudanças de estrutura sempre entram como migração nova, nunca editando um arquivo já aplicado.

## Testes

A suíte roda com `npm test` dentro de `backend` (`node --test`). As suítes de rota e de interface usam um banco substituto controlado, por isso verificam rotas, permissões e formato de resposta sem executar SQL. Já as suítes de integração, ativadas com `RUN_POSTGRES_TESTS=1`, criam um schema descartável com prefixo `teste_` em um PostgreSQL em execução e o removem ao final. Os testes de interface leem o HTML e o JavaScript das páginas por caminho, então mover arquivos de página exige atualizar esses caminhos junto.
