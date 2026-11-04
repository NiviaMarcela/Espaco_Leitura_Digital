# Perfis, Centros e reservas

## O que mudou

| Perfil | Acesso |
| --- | --- |
| Administrador (`admin`) | Todos os Centros e gestão de usuários. Até quatro contas, contando também contas inativas. |
| Coordenador (`coordenador`) | Dashboard, acervo, leitores, reservas, empréstimos e devoluções somente do Centro vinculado. Sem limite de contas. |
| Leitor (`leitor`) | Biblioteca do próprio Centro, suas reservas e seu histórico de empréstimos. Sem menus de gestão. |

Os Centros são CE Maranhão, CE Piauí e CE Bahia. A sessão recupera o Centro do coordenador ou do cadastro do leitor em cada requisição. Um ID digitado manualmente não concede acesso a outro Centro.

## Como usar

1. Entre como administrador e abra **Usuários** na sidebar. Cadastre coordenadores escolhendo o Centro. Contas criadas pela gestão recebem senha temporária e devem trocá-la no primeiro acesso. O administrador inicial continua sendo criado por `npm run admin:criar`; os adicionais são criados na tela.
2. O leitor pode cadastrar-se na página inicial, informando Centro, nascimento e senha de 8 a 128 caracteres. Também é possível cadastrar seu perfil em **Leitores** e criar o acesso pela gestão. Em **Usuários**, o perfil Leitor vincula uma conta a um leitor ativo já cadastrado e ainda sem acesso, com o mesmo e-mail.
3. Na Biblioteca, **Reservar Livro** permite escolher uma cópia disponível do próprio Centro. O servidor obtém o leitor pela sessão, nunca pelo ID enviado pelo navegador.
4. Em **Minhas reservas e empréstimos**, a pessoa vê a reserva como Pendente e pode cancelá-la. Ainda não há empréstimo nem prazo.
5. O coordenador abre **Empréstimos → Reservas aguardando retirada** e usa **Confirmar retirada** no momento da entrega física. O administrador também pode confirmar.
6. Nesse momento o empréstimo inicia, com devolução prevista para 30 dias corridos depois da retirada. A reserva fica Retirada. Uma segunda confirmação é recusada.

O limite de 10 soma reservas pendentes e empréstimos ainda não devolvidos, incluindo atrasados. Canceladas, retiradas e empréstimos devolvidos não são contados como reservas pendentes. Converter uma reserva em empréstimo não aumenta o total. A retirada direta por **Novo empréstimo** também respeita esse limite.

## Como o código funciona

- `database/007_perfis_reservas.sql`: acrescenta os campos de perfil e Centro, substitui a regra de administrador único por quatro vagas únicas e cria a tabela `reservas`. Não apaga os registros anteriores.
- `src/app.js`: verifica o perfil e constrói repositórios limitados ao Centro da requisição. Usuários é exclusivo do administrador. Contas sem Centro válido são recusadas.
- `src/repositories/usuarios.js`: cadastra acessos e escolhe uma vaga de administrador dentro de uma transação. A restrição única no PostgreSQL impede ultrapassar quatro mesmo sob concorrência.
- `src/repositories/reservas.js`: cria, lista, cancela e confirma reservas. Bloqueia primeiro o leitor, depois o exemplar e a reserva; a transação impede cópias duplicadas e ultrapassagem do limite em pedidos simultâneos.
- `src/repositories/emprestimos.js`: conta também as reservas pendentes antes da retirada direta. Usa o calendário de Fortaleza e soma 30 dias à data efetiva da retirada.
- `js/reservas.js`: controla as duas listas de reservas (leitor e gestão). A confirmação de entrega atualiza também a lista de empréstimos.
- `usuarios.html` e `js/usuarios.js`: formulário e listagem de contas, sem retornar hashes ou senhas à interface.

Obras podem ter cópias em mais de um Centro. Quando o coordenador edita uma obra compartilhada, o sistema separa a descrição para suas cópias; os dados do outro Centro permanecem iguais. Transferir um leitor de Centro exige encerrar suas reservas e empréstimos primeiro. O histórico do leitor continua disponível.

## Rotas principais

| Método | Rota | Finalidade |
| --- | --- | --- |
| GET/POST | `/api/usuarios` | Listar/cadastrar contas, somente administrador |
| POST | `/api/cadastro-leitor` | Cadastro público |
| GET | `/api/biblioteca` | Catálogo limitado ao Centro; administrador vê todos |
| POST | `/api/reservas` | Reservar como leitor |
| GET | `/api/minhas-reservas` | Reservas da própria conta |
| GET | `/api/meus-emprestimos` | Histórico da própria conta |
| GET | `/api/reservas` | Pendentes do Centro da gestão |
| POST | `/api/reservas/:id/cancelar` | Cancelar uma reserva pendente autorizada |
| POST | `/api/reservas/:id/retirar` | Confirmar entrega pela gestão |

## Banco e testes

No diretório `backend`, execute `npm run db:migrate` e reinicie o servidor. A migração pode ser reaplicada pelo comando: o registro em `schema_migrations` impede executá-la novamente.

Para testar incluindo PostgreSQL no PowerShell:

```powershell
$env:RUN_POSTGRES_TESTS='1'
node --env-file-if-exists=.env --test
Remove-Item Env:RUN_POSTGRES_TESTS
```

Os testes criam schemas temporários e os removem ao terminar; não usam os cadastros reais. `test/perfis-reservas.integration.test.js` cobre os três Centros, senha de 8 caracteres, quatro administradores concorrentes, bloqueios entre perfis/Centros, reservas, cancelamento, retirada, prazo de 30 dias, limite combinado e concorrência pela mesma cópia. Os testes antigos continuam cobrindo acervo, renovação, devolução, Dashboard e autenticação.

Empréstimos existentes continuam sendo empréstimos: não são convertidos retroativamente em reservas. O novo fluxo se aplica às novas reservas.

## Sinalização visual das reservas

A função `seloReserva(status)` em `js/reservas.js` monta um selo com texto e ícone: amarelo para Aguardando retirada, verde para Retirada confirmada e vermelho para Cancelada. Os botões usam verde em Confirmar retirada e contorno vermelho em Cancelar; Atualizar reservas tem contorno azul. As classes `reserva-status-*` e `reserva-acoes` em `css/style.css` controlam a aparência e a quebra de linha dos botões. Essa apresentação não altera as regras de circulação.
