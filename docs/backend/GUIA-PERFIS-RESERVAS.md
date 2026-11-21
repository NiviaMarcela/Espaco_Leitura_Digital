# Perfis, Centros e reservas

## O que mudou

| Perfil | Acesso |
| --- | --- |
| Administrador (`admin`) | Todos os Centros, reservas pessoais nos três Centros e gestão de usuários. Sem limite de quantidade de contas. |
| Coordenador (`coordenador`) | Dashboard, acervo, leitores, reservas, empréstimos e devoluções somente do Centro vinculado, incluindo suas reservas pessoais. Sem limite de contas. Pode cadastrar coordenadores, professores e funcionários do próprio Centro. |
| Professor (`professor`) | Biblioteca, acervo, leitores, empréstimos e devoluções do próprio Centro. Sem Dashboard nem gestão de usuários. |
| Outro (`funcionario`) | Mesmos acessos do Professor: Biblioteca, Acervo, Leitores, Reservas, Empréstimos, Devoluções e Relatórios do próprio Centro. |
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

- `backend/database/007_perfis_reservas.sql`: acrescenta os campos de perfil e Centro, substitui a regra de administrador único por quatro vagas únicas e cria a tabela `reservas`. Não apaga os registros anteriores.
- `backend/src/middlewares/sessao.js`: verifica o perfil e constrói repositórios limitados ao Centro da requisição. Usuários permite cadastro de equipe pelo coordenador do próprio Centro; edição, situação e senha também são permitidas ao coordenador para a equipe do próprio Centro. Contas sem Centro válido são recusadas.
- `backend/src/repositories/usuarios.js`: cadastra acessos e escolhe uma vaga de administrador dentro de uma transação. A restrição única no PostgreSQL impede ultrapassar quatro mesmo sob concorrência.
- `backend/src/repositories/reservas.js`: cria, lista, cancela e confirma reservas. Bloqueia primeiro o leitor, depois o exemplar e a reserva; a transação impede cópias duplicadas e ultrapassagem do limite em pedidos simultâneos.
- `backend/src/repositories/emprestimos.js`: conta também as reservas pendentes antes da retirada direta. Usa o calendário de Fortaleza e soma 30 dias à data efetiva da retirada.
- `frontend/shared/js/reservas.js`: controla as duas listas de reservas (leitor e gestão). A confirmação de entrega atualiza também a lista de empréstimos.
- `usuarios.html` e `frontend/pages/usuarios/usuarios.js`: formulário e listagem de contas, sem retornar hashes ou senhas à interface.

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

Os testes criam schemas temporários e os removem ao terminar; não usam os cadastros reais. `test/perfis-reservas.integration.test.js` cobre os três Centros, senha de 8 caracteres, mais de quatro administradores concorrentes, bloqueios entre perfis/Centros, reservas, cancelamento, retirada, prazo de 30 dias, limite combinado e concorrência pela mesma cópia. Os testes antigos continuam cobrindo acervo, renovação, devolução, Dashboard e autenticação.

Empréstimos existentes continuam sendo empréstimos: não são convertidos retroativamente em reservas. O novo fluxo se aplica às novas reservas.

## Sinalização visual das reservas

A função `seloReserva(status)` em `frontend/shared/js/reservas.js` monta um selo com texto e ícone: amarelo para Aguardando retirada, verde para Retirada confirmada e vermelho para Cancelada. Os botões usam verde em Confirmar retirada e contorno vermelho em Cancelar; Atualizar reservas tem contorno azul. As classes `reserva-status-*` e `reserva-acoes` em `frontend/shared/css/style.css` controlam a aparência e a quebra de linha dos botões. Essa apresentação não altera as regras de circulação.

## Reservas pessoais da equipe e senha no cadastro (07/11/2026)

O perfil de acesso (administrador, coordenador, professor, funcionário ou leitor) é diferente do tipo de leitor (Aluno, Professor, Funcionário, Voluntário ou Comunidade). O formulário público oferece somente Aluno e Comunidade, com a mesma restrição no servidor. A área administrativa mantém os cinco tipos.

No primeiro clique em **Reservar livro**, uma conta administrativa sem vínculo pessoal informa nome, tipo, nascimento, telefone e Centro de referência. A aplicação usa o e-mail da conta autenticada e vincula o novo registro de circulação ao mesmo login. Não cria outra senha, não muda o perfil e não ocupa outra vaga de administrador. O Centro de referência do administrador não limita as reservas; o coordenador só pode selecionar o seu Centro.

**Minhas reservas e empréstimos** mostra somente os registros da própria conta, inclusive para a equipe. **Reservas → Reservas aguardando retirada** continua sendo a lista de gestão. O coordenador do Centro do exemplar pode entregar a reserva de um administrador mesmo quando o Centro de referência dele é outro. O limite de 10 soma as reservas e empréstimos da pessoa nos três Centros, sem multiplicar a cota do administrador.

A senha opcional do novo leitor é armazenada como hash scrypt. Se o e-mail já pertence a outra conta, toda a transação é desfeita: não sobra um leitor incompleto. Cadastros pessoais vinculados à equipe têm edição e redefinição de senha bloqueadas em Leitores, impedindo que essa tela altere credenciais administrativas. A equipe pode usar **Alterar senha** para a própria conta.

Arquivos principais:
- `backend/database/008_emprestimos_todos_perfis.sql`: permite vínculo pessoal nos três perfis, mantém as quatro vagas de administrador e protege a referência ao cadastro.
- `backend/src/repositories/cadastro-pessoal.js` e `POST /api/meu-cadastro-emprestimos`: completam o cadastro da conta autenticada; bloqueio transacional impede duplicação por solicitações simultâneas.
- `backend/src/repositories/leitores.js`: cria leitor e acesso juntos quando há senha inicial.
- `backend/src/repositories/reservas.js`: aplica as permissões e separa listagem pessoal de gestão.
- `biblioteca.html` e `frontend/pages/biblioteca/biblioteca.js`: formulário pessoal e retomada da reserva.
- `leitores.html` e `frontend/pages/leitores/leitores.js`: senha inicial e confirmação no cadastro administrativo.

Validação: 55 testes automatizados aprovados, incluindo PostgreSQL em schemas temporários, reservas do administrador nos três Centros, isolamento do coordenador, limite global, concorrência, proteção das credenciais da equipe e criação atômica de acesso. O formulário da Biblioteca foi exercitado com DOM simulado; isso não substitui inspeção visual no navegador.

## Perfil Professor (07/11/2026)

Em **Usuários**, o administrador seleciona **Professor**, informa nome, e-mail, senha temporária e o Centro obrigatório. Não há limite de contas de professor. A pessoa troca a senha no primeiro acesso e entra pela Biblioteca.

O professor pode consultar e cadastrar acervo e leitores, criar acessos de leitores, registrar empréstimos, confirmar retiradas de reservas, renovar empréstimos e registrar devoluções somente no Centro ao qual está vinculado. Também pode reservar para si e acompanhar seu histórico pessoal. Na primeira reserva, completa seus dados de circulação usando o mesmo login.

Dashboard e Usuários não aparecem nos menus do professor e suas APIs são bloqueadas no servidor. As páginas restritas redirecionam para a Biblioteca. IDs de livros, leitores, exemplares e empréstimos de outros Centros não concedem acesso, mesmo enviados diretamente à API. A gestão de leitores também não permite redefinir senhas da equipe.

**Professor como perfil de acesso** é diferente de **Professor como tipo de leitor**: selecionar o tipo no cadastro de leitores não concede permissões administrativas. O acesso de professor é criado pelo administrador ou pelo coordenador do próprio Centro na tela Usuários. O cadastro público continua restrito aos tipos Aluno e Comunidade.

A migração `009_perfil_professor.sql` inclui o perfil e exige seu Centro no PostgreSQL, com o antigo limite de quatro administradores (removido pela migração 014). As verificações estão em `backend/src/middlewares/sessao.js`, nos repositórios de autenticação, usuários, cadastro pessoal e reservas. Os menus e destinos de login foram atualizados em `frontend/shared/js/auth-ui.js`, `frontend/pages/login/login.js`, `frontend/pages/alterarSenha/alterarSenha.js` e nas páginas correspondentes.

Testes: o fluxo de professor é exercitado nos três Centros, incluindo login, troca de senha, cinco páginas permitidas, bloqueios de Dashboard/Usuários, cadastros, reserva pessoal, retirada, empréstimo direto e devolução. Testes com DOM simulado verificam os menus e o destino do login; não foi realizada inspeção visual em navegador.

## Gestão de contas: edição, situação e senha (08/11/2026)

A tabela de **Usuários** oferece **Editar**, **Inativar/Ativar** e **Redefinir senha**, para administradores e, no caso da equipe do próprio Centro, coordenadores.

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

A página `reservas.html` usa `frontend/shared/js/reservas.js` para consultar as reservas pendentes e manter as ações Confirmar retirada e Cancelar, com suas cores e confirmações. Administradores visualizam os três Centros; coordenadores e professores continuam limitados ao próprio Centro. Leitores permanecem em Minhas reservas e empréstimos, com acesso apenas aos próprios registros.

Empréstimos mantém empréstimos registrados, criação direta e renovações. Não carrega o painel nem o JavaScript de reservas. Ao confirmar uma retirada em Reservas e abrir Empréstimos, a consulta mostra o novo empréstimo. Se Empréstimos já estiver aberta em outra aba, use Atualizar lista.

A rota de Reservas é protegida no servidor. Não há alteração de banco nem dos prazos, limites e regras de circulação. A tela de gestão continua exibindo as reservas pendentes; o histórico pessoal permanece em Minhas reservas e empréstimos.

Validação: testes de rota protegida, acesso dos três perfis de gestão, bloqueio do leitor, links dos menus desktop/celular e ausência do painel em Empréstimos. A suíte de integração continua cobrindo confirmação, cancelamento e isolamento por Centro. Não houve inspeção visual em navegador.

## Dashboard por Centro e cadastro de equipe (10/11/2026)

O Dashboard identifica o escopo no título: Todos os Centros para administrador e o nome do Centro para coordenador. O backend já possuía filtro pelo Centro da sessão; a validação foi ampliada para conferir livros, leitores ativos, exemplares disponíveis, empréstimos abertos/atrasados e empréstimos recentes nos três Centros. Parâmetros enviados pelo navegador não escolhem nem ampliam o Centro do coordenador.

O coordenador agora acessa **Usuários** para listar e cadastrar a equipe do próprio Centro. Pode criar Coordenador, Professor e Funcionário, com senha temporária e troca obrigatória no primeiro login. Não cria administradores, não consulta equipe de outro Centro e não muda de Centro pelo formulário. Criação de acesso de leitores continua disponível na tela Leitores. O coordenador também edita, ativa/inativa e redefine senhas da equipe do próprio Centro. O coordenador também atende a fila de recuperação do seu Centro, exceto pedidos de administradores.

O perfil Outro (antes Funcionário) tem os mesmos acessos de Professor, inclusive Relatórios, reservas pessoais e confirmação de retirada no próprio Centro. Não acessa Dashboard nem Usuários. O tipo Funcionário no cadastro de leitor não concede essas permissões; o perfil de acesso precisa ser cadastrado em Usuários.

A migração `011_perfil_funcionario.sql` adiciona o perfil e exige Centro vinculado, sem alterar as quatro vagas de administrador. `backend/src/repositories/usuarios.js` aplica as restrições ao cadastro e à listagem do coordenador; `backend/src/routes/usuarios.js` separa acesso ao cadastro de equipe das operações com escopo por Centro e do atendimento de recuperação exclusivo do administrador. `frontend/pages/usuarios/usuarios.js` ajusta os campos e ações conforme a sessão. O Dashboard recebe o ID e nome do Centro junto dos indicadores, evitando um rótulo genérico na tela.

Testes PostgreSQL verificam valores distintos por Centro, acesso global do administrador, tentativas de cadastro em outro Centro, bloqueio de promoção para administrador, listagem local e ciclo de reserva/retirada/devolução do funcionário. Testes com DOM simulado verificam os menus e o formulário do coordenador; não substituem conferência visual no navegador.

## Coordenador: edição, situação e senha da equipe (10/11/2026)

Em **Usuários**, o coordenador pode editar nome e e-mail, ativar/inativar e redefinir senhas de coordenadores, professores e funcionários do próprio Centro. Não pode transferir uma conta para outro Centro, mudar seu perfil, alterar o vínculo pessoal, modificar administradores ou acessar contas de outros Centros. A listagem continua limitada à equipe local; os leitores seguem sendo tratados na tela Leitores.

As três rotas de alteração agora autorizam administrador e coordenador. Dentro da transação, o repositório de usuários consulta novamente a situação, o perfil e o Centro do responsável e verifica a conta de destino antes de modificar qualquer dado. Os scripts técnicos locais continuam usando seu fluxo autorizado de manutenção.

Inativação e edição encerram sessões abertas; redefinição também exige troca da senha temporária no próximo login e não reativa conta inativa. O coordenador não pode inativar a própria conta. Ao editar a própria conta ou redefinir sua senha, precisa entrar novamente. A fila de solicitações de recuperação continua restrita ao administrador.

Testes exercitam as três ações para os três perfis de equipe em cada Centro, além dos bloqueios de outro Centro, administrador, mudança de Centro/perfil e inativação da própria conta. Não foi necessária migração de banco.

## Atualização de permissões — 15/11/2026

- O perfil de acesso **Funcionário** passa a aparecer como **Outro**, adequado também a estagiários e outros integrantes da equipe. Novos cadastros e contas existentes usam esse nome.
- Mantido o identificador interno `funcionario` para compatibilidade com contas, sessões e restrições do banco. Não é necessário migrar dados. O tipo **Funcionário** do cadastro de leitores é uma classificação separada e permanece disponível.
- **Professor e Outro** possuem Biblioteca, Acervo, Leitores, Reservas, Empréstimos, Devoluções e Relatórios, sempre do próprio Centro. Não possuem Dashboard nem Usuários.
- **Coordenador** pode abrir e concluir a fila em **Usuários → Solicitações de recuperação**, inclusive pedidos de leitores locais. Pode definir senha temporária após confirmar identidade ou encerrar sem alterar senha. Não atende administradores nem contas de outros Centros.
- A lista, o contador e a conclusão aplicam o mesmo escopo. A conclusão verifica novamente perfil ativo do responsável e Centro da conta no banco, registra quem atendeu e invalida sessões ao redefinir senha.
- Testes da API, DOM simulado e PostgreSQL verificam essas regras. A aparência no navegador precisa de conferência manual.

## Administradores sem limite — 16/11/2026

A migração `014_administradores_sem_limite.sql` remove o controle de vagas do banco, preservando todas as contas. Cadastro normal e criação inicial não usam mais vagas. A tela Usuários informa a quantidade cadastrada sem um teto. Somente administradores continuam podendo criar administradores; coordenadores permanecem limitados à equipe do próprio Centro. A proteção contra inativar a própria conta ou o último administrador ativo permanece. Aplicar com `npm run db:migrate` antes de iniciar a versão atual em outros ambientes.
