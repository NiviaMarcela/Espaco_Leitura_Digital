# Perfis, Centros e reservas

## O que mudou

| Perfil | Acesso |
| --- | --- |
| Administrador (`admin`) | Todos os Centros, reservas pessoais nos três Centros e gestão de usuários. Até quatro contas, contando também contas inativas. |
| Coordenador (`coordenador`) | Dashboard, acervo, leitores, reservas, empréstimos e devoluções somente do Centro vinculado, incluindo suas reservas pessoais. Sem limite de contas. |
| Professor (`professor`) | Biblioteca, acervo, leitores, empréstimos e devoluções do próprio Centro. Sem Dashboard nem gestão de usuários. |
| Leitor (`leitor`) | Biblioteca do próprio Centro, suas reservas e seu histórico de empréstimos. Sem menus de gestão. |

Os Centros são CE Maranhão, CE Piauí e CE Bahia. A sessão recupera o Centro do coordenador ou do cadastro do leitor em cada requisição. Um ID digitado manualmente não concede acesso a outro Centro.

## Como usar

1. Entre como administrador e abra **Usuários** na sidebar. Cadastre coordenadores escolhendo o Centro. Contas criadas pela gestão recebem senha temporária e devem trocá-la no primeiro acesso. O administrador inicial continua sendo criado por `npm run admin:criar`; os adicionais são criados na tela.
2. O leitor pode cadastrar-se na página inicial como Aluno ou Comunidade, informando Centro, nascimento e senha de 8 a 128 caracteres. Em **Leitores → Cadastrar leitor**, a gestão pode preencher a senha inicial opcional e sua confirmação. Ao preencher, leitor e acesso são criados juntos; a senha deve ter de 8 a 128 caracteres e ser trocada no primeiro login. Deixar em branco cria somente o cadastro; **Criar acesso** continua disponível depois. Em **Usuários**, o perfil Leitor vincula uma conta a um leitor ativo já cadastrado e ainda sem acesso, com o mesmo e-mail.
3. Na Biblioteca, **Reservar Livro** está disponível para todos os perfis. Leitores e coordenadores escolhem uma cópia disponível do próprio Centro; administradores podem escolher nos três Centros. O servidor obtém o leitor pela sessão, nunca pelo ID enviado pelo navegador.
4. Em **Minhas reservas e empréstimos**, a pessoa vê a reserva como Pendente e pode cancelá-la. Ainda não há empréstimo. A retirada deve ocorrer em até 7 dias; a data prevista de devolução já é calculada a partir da reserva.
5. O coordenador abre **Reservas → Reservas aguardando retirada** e usa **Confirmar retirada** no momento da entrega física. O administrador também pode confirmar.
6. Nesse momento o empréstimo inicia, com devolução prevista para 30 dias corridos depois da reserva, conforme a regra atual do repositório. A reserva fica Retirada. Uma segunda confirmação é recusada.

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

## Reservas pessoais da equipe e senha no cadastro (07/11/2026)

O perfil de acesso (administrador, coordenador ou leitor) é diferente do tipo de leitor (Aluno, Professor, Funcionário, Voluntário ou Comunidade). O formulário público oferece somente Aluno e Comunidade, com a mesma restrição no servidor. A área administrativa mantém os cinco tipos.

No primeiro clique em **Reservar livro**, uma conta administrativa sem vínculo pessoal informa nome, tipo, nascimento, telefone e Centro de referência. A aplicação usa o e-mail da conta autenticada e vincula o novo registro de circulação ao mesmo login. Não cria outra senha, não muda o perfil e não ocupa outra vaga de administrador. O Centro de referência do administrador não limita as reservas; o coordenador só pode selecionar o seu Centro.

**Minhas reservas e empréstimos** mostra somente os registros da própria conta, inclusive para a equipe. **Reservas → Reservas aguardando retirada** continua sendo a lista de gestão. O coordenador do Centro do exemplar pode entregar a reserva de um administrador mesmo quando o Centro de referência dele é outro. O limite de 10 soma as reservas e empréstimos da pessoa nos três Centros, sem multiplicar a cota do administrador.

A senha opcional do novo leitor é armazenada como hash scrypt. Se o e-mail já pertence a outra conta, toda a transação é desfeita: não sobra um leitor incompleto. Cadastros pessoais vinculados à equipe têm edição e redefinição de senha bloqueadas em Leitores, impedindo que essa tela altere credenciais administrativas. A equipe pode usar **Alterar senha** para a própria conta.

Arquivos principais:
- `database/008_emprestimos_todos_perfis.sql`: permite vínculo pessoal nos três perfis, mantém as quatro vagas de administrador e protege a referência ao cadastro.
- `src/repositories/cadastro-pessoal.js` e `POST /api/meu-cadastro-emprestimos`: completam o cadastro da conta autenticada; bloqueio transacional impede duplicação por solicitações simultâneas.
- `src/repositories/leitores.js`: cria leitor e acesso juntos quando há senha inicial.
- `src/repositories/reservas.js`: aplica as permissões e separa listagem pessoal de gestão.
- `biblioteca.html` e `js/biblioteca.js`: formulário pessoal e retomada da reserva.
- `leitores.html` e `js/leitores.js`: senha inicial e confirmação no cadastro administrativo.

Validação: 55 testes automatizados aprovados, incluindo PostgreSQL em schemas temporários, reservas do administrador nos três Centros, isolamento do coordenador, limite global, concorrência, proteção das credenciais da equipe e criação atômica de acesso. O formulário da Biblioteca foi exercitado com DOM simulado; isso não substitui inspeção visual no navegador.

## Perfil Professor (07/11/2026)

Em **Usuários**, o administrador seleciona **Professor**, informa nome, e-mail, senha temporária e o Centro obrigatório. Não há limite de contas de professor. A pessoa troca a senha no primeiro acesso e entra pela Biblioteca.

O professor pode consultar e cadastrar acervo e leitores, criar acessos de leitores, registrar empréstimos, confirmar retiradas de reservas, renovar empréstimos e registrar devoluções somente no Centro ao qual está vinculado. Também pode reservar para si e acompanhar seu histórico pessoal. Na primeira reserva, completa seus dados de circulação usando o mesmo login.

Dashboard e Usuários não aparecem nos menus do professor e suas APIs são bloqueadas no servidor. As páginas restritas redirecionam para a Biblioteca. IDs de livros, leitores, exemplares e empréstimos de outros Centros não concedem acesso, mesmo enviados diretamente à API. A gestão de leitores também não permite redefinir senhas da equipe.

**Professor como perfil de acesso** é diferente de **Professor como tipo de leitor**: selecionar o tipo no cadastro de leitores não concede permissões administrativas. O acesso de professor é criado exclusivamente por um administrador na tela Usuários. O cadastro público continua restrito aos tipos Aluno e Comunidade.

A migração `009_perfil_professor.sql` inclui o perfil e exige seu Centro no PostgreSQL, mantendo o limite de quatro administradores. As verificações estão em `src/app.js`, nos repositórios de autenticação, usuários, cadastro pessoal e reservas. Os menus e destinos de login foram atualizados em `js/auth-ui.js`, `js/login.js`, `js/alterarSenha.js` e nas páginas correspondentes.

Testes: o fluxo de professor é exercitado nos três Centros, incluindo login, troca de senha, cinco páginas permitidas, bloqueios de Dashboard/Usuários, cadastros, reserva pessoal, retirada, empréstimo direto e devolução. Testes com DOM simulado verificam os menus e o destino do login; não foi realizada inspeção visual em navegador.

## Gestão de contas: edição, situação e senha (08/11/2026)

A tabela de **Usuários** oferece **Editar**, **Inativar/Ativar** e **Redefinir senha**, exclusivamente para administradores.

- **Editar:** altera nome, e-mail e Centro (para contas com Centro). Mantém o perfil, o vínculo pessoal e o histórico. Nome e e-mail são sincronizados com o leitor vinculado; mudar o Centro também atualiza esse cadastro e exige encerrar reservas pendentes e empréstimos abertos. O administrador continua com acesso aos três Centros.
- **Inativar:** impede novos logins e encerra sessões abertas, sem excluir reservas, empréstimos ou leitores. **Ativar** permite entrar novamente, sem restaurar sessões antigas. A conta de administrador inativa continua ocupando uma das quatro vagas. Não é permitido inativar a própria conta nem deixar o sistema sem administrador ativo.
- **Redefinir senha:** exige senha temporária de 8 a 128 caracteres e confirmação no formulário. Armazena somente hash scrypt, encerra sessões e exige troca no próximo acesso. Não reativa contas inativas. Essa regra vale também para redefinições realizadas em Leitores.

Editar os próprios dados ou redefinir a própria senha encerra a sessão do administrador e retorna ao login. A situação da conta de acesso e o status do cadastro de leitor são independentes; reativar a conta não altera automaticamente um leitor inativo.

As rotas são `PUT /api/usuarios/:id`, `PATCH /api/usuarios/:id/status` e `POST /api/usuarios/:id/senha`. Todas verificam o perfil no servidor. O repositório de usuários grava cada alteração e a revogação das sessões na mesma transação; conflitos de e-mail desfazem a operação. Não é necessária nova migração: o banco já possui os campos de situação e senha.

Testes cobrem bloqueio de outros perfis, edição e sincronização, conflitos de e-mail, troca de Centro com pendências, inativação, reativação, revogação de sessões, senha antiga recusada, troca obrigatória e preservação do histórico. Os formulários de edição e senha foram exercitados com DOM simulado; a aparência não foi inspecionada em navegador.

## Esqueceu a senha?

A recuperação assistida pelo administrador está descrita em [GUIA-RECUPERACAO-ACESSO.md](GUIA-RECUPERACAO-ACESSO.md). A solicitação aparece em Usuários e só é atendida após a confirmação da identidade.

## Página própria para Reservas (10/11/2026)

A lista de reservas aguardando retirada saiu da tela de Empréstimos e agora fica em **Reservas**, na sidebar desktop e no menu do celular. O menu está disponível em Dashboard, Acervo, Leitores, Reservas, Empréstimos, Devoluções, Usuários e Biblioteca, conforme as permissões de cada perfil.

A página `reservas.html` usa `js/reservas.js` para consultar as reservas pendentes e manter as ações Confirmar retirada e Cancelar, com suas cores e confirmações. Administradores visualizam os três Centros; coordenadores e professores continuam limitados ao próprio Centro. Leitores permanecem em Minhas reservas e empréstimos, com acesso apenas aos próprios registros.

Empréstimos mantém empréstimos registrados, criação direta e renovações. Não carrega o painel nem o JavaScript de reservas. Ao confirmar uma retirada em Reservas e abrir Empréstimos, a consulta mostra o novo empréstimo. Se Empréstimos já estiver aberta em outra aba, use Atualizar lista.

A rota de Reservas é protegida no servidor. Não há alteração de banco nem dos prazos, limites e regras de circulação. A tela de gestão continua exibindo as reservas pendentes; o histórico pessoal permanece em Minhas reservas e empréstimos.

Validação: testes de rota protegida, acesso dos três perfis de gestão, bloqueio do leitor, links dos menus desktop/celular e ausência do painel em Empréstimos. A suíte de integração continua cobrindo confirmação, cancelamento e isolamento por Centro. Não houve inspeção visual em navegador.
