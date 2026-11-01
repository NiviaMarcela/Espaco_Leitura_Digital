# Login e permissões — instalação e guia didático

## Primeiro acesso

Com PostgreSQL ligado e `.env` configurado, abra um terminal em `backend`:

```powershell
node --env-file=.env scripts/migrate.js
node --env-file=.env scripts/criar-admin.js
```

O primeiro comando aplica as migrações pendentes, incluindo `006_usuarios.sql` e `007_leitores_reservas.sql` sem apagar cadastros. O segundo pede nome, email e senha para o primeiro administrador. Digite uma senha de 8 a 128 caracteres (uma frase funciona bem) e repita-a. Nada aparece enquanto você digita a senha: isso é intencional. Não coloque a senha em comandos, no Git ou no chat.

Esse script só cria a primeira conta quando não existem usuários. Não há credencial padrão. A senha de login é própria do sistema e não precisa ser a senha do PostgreSQL. O email funciona como identificador; não há envio nem verificação por email nesta etapa.

Pare o backend anterior com Ctrl+C e inicie uma única instância:

```powershell
node --env-file=.env src/server.js
```

Abra `http://127.0.0.1:3001/login.html`. Na gestão, o administrador usa o menu **Usuários** para criar contas de administradores, coordenadores ou leitores. Informe uma senha inicial e compartilhe-a diretamente com a pessoa por um canal privado. A pessoa pode alterá-la em **Minha conta**.

Use sempre o mesmo endereço: `localhost` e `127.0.0.1` têm cookies separados. Não abra os HTMLs por arquivo ou Live Server.

## Permissões

| Ação | Visitante | Coordenador | Administrador |
| --- | --- | --- | --- |
| Biblioteca, busca e detalhes de livros | Sim | Sim | Sim |
| Dashboard e histórico de empréstimos | Não | Do seu centro | Todos os centros |
| Ver/cadastrar/editar leitores completos | Não | Do seu centro | Todos os centros |
| Cadastrar obra e adicionar exemplares | Não | Exemplares no seu centro | Todos os centros |
| Editar descrição compartilhada da obra | Não | Não | Sim |
| Dar baixa em exemplar | Não | Do seu centro | Todos os centros |
| Emprestar, renovar e devolver | Não | Exemplares do seu centro | Todos os centros |
| Criar contas e alterar perfil/centro/situação | Não | Não | Sim |
| Alterar a própria senha | Não | Sim | Sim |

O leitor acessa somente a Biblioteca, suas reservas e a alteração da própria senha. O visitante vê o catálogo público; ao entrar como leitor ou coordenador, vê apenas livros e cópias do seu centro. A Biblioteca não tem menus administrativos. Administradores têm acesso a todos os centros.

O leitor só pode reservar e retirar no centro do cadastro. Reservas pendentes e empréstimos abertos somam no limite de 10 exemplares. O coordenador confirma a entrega física na tela Empréstimos; somente então começa o prazo de 30 dias. Reservas podem ser canceladas pelo próprio leitor ou pela gestão do centro e não expiram automaticamente nesta etapa.

Transferir o leitor de centro exige encerrar suas reservas pendentes e empréstimos abertos. Contas antigas de perfil Responsavel são migradas para Coordenador, preservando senhas e cadastros.

## Como o código funciona

1. **Banco (`database/006_usuarios.sql`):** `usuarios` guarda nome, email, perfil, centro e o hash da senha. `sessoes` guarda hashes dos identificadores de sessão e sua validade. `tentativas_login` limita tentativas repetidas por email e endereço de origem.
2. **Senha (`src/auth.js`):** `scrypt` transforma a senha usando um sal aleatório. O banco guarda esse resultado, não a senha original. A comparação usa `timingSafeEqual`.
3. **Login:** `POST /api/auth/login` confere as credenciais e gera uma nova sessão aleatória de oito horas. O navegador recebe um cookie `HttpOnly` e `SameSite=Strict`; nenhum token vai para localStorage. Em produção, o cookie também exige HTTPS (`Secure`).
4. **Identificação:** a cada pedido protegido, o servidor verifica validade da sessão e se a conta continua ativa. As permissões vêm do banco; enviar outro perfil no JSON não muda a autorização.
5. **Autorização:** `src/app.js` cria os repositórios com o centro da conta. Consultas SQL filtram esse centro, e gravações conferem o centro antes de alterar registros. Trocar um ID no navegador não permite acessar outro centro.
6. **Proteção contra pedidos de outros sites:** gravações exigem JSON e o cabeçalho `X-Requested-With: EspacoLeitura`; origens diferentes são rejeitadas e não há CORS liberado. `js/sessao.js` acrescenta esse cabeçalho nas chamadas locais.
7. **Saída:** `POST /api/auth/logout` remove a sessão no banco e o cookie. Alterar uma conta ou sua senha revoga suas sessões anteriores. Páginas protegidas e APIs não são armazenadas em cache.

Não se pode desativar o último administrador ativo nem retirar o próprio acesso administrativo. Desativar uma conta não apaga cadastros ou histórico de empréstimos. Leitores e usuários de gestão são cadastros diferentes: cadastrar um leitor não cria login automaticamente.

## Testar

1. Sem entrar, consulte `/biblioteca.html`: os livros devem aparecer normalmente.
2. Tente abrir `/dashboard.html`: deve ir para o login.
3. Entre como administrador: confira o menu Usuários, o nome no cabeçalho e o Dashboard global.
4. Crie uma conta de coordenador vinculada a um centro. Saia e entre com ela.
5. Confira que os centros de cadastro disponíveis se restringem ao centro da conta e que o Dashboard/histórico exibem somente esse centro.
6. Use Sair e tente voltar à gestão. Será necessário entrar novamente.

Testes automatizados (dados temporários separados dos cadastros reais):

```powershell
$env:RUN_POSTGRES_TESTS='1'
node --env-file=.env --test
```

## Limites desta etapa

O servidor continua acessível apenas no próprio computador. A Biblioteca ser pública significa dispensar login; isso não publica o projeto na internet. Hospedagem com HTTPS deve ser configurada antes de disponibilizar a aplicação em rede. Não há recuperação automática por email, MFA ou auditoria da identidade do operador em cada movimentação nesta etapa. Guarde o acesso inicial; a interface altera a própria senha mediante a senha atual, mas não recupera uma senha esquecida.

Referências: [armazenamento de senhas — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [sessões — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) e [proteção CSRF — OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
