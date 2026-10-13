# Espaço de Leitura Digital: instalação e uso no Windows

Este tutorial corresponde à estrutura atual do projeto. O frontend usa HTML, CSS e JavaScript; o Express entrega as páginas e a API, e o PostgreSQL armazena os dados. A migração para Next.js ainda será uma etapa posterior.

## 1. Entenda o que precisa estar ligado

| Componente | Função | Como iniciar |
| --- | --- | --- |
| PostgreSQL | Armazena livros, leitores, empréstimos e devoluções | Serviço do Windows |
| Backend Node.js/Express | Recebe pedidos da página e consulta o banco | Terminal dentro de `backend` |
| Navegador | Exibe a aplicação | Abrir o endereço do sistema |

O pgAdmin é uma ferramenta para administrar o banco. Ele pode ficar fechado durante o uso do sistema; abrir o pgAdmin não substitui iniciar o serviço PostgreSQL.

## 2. Uso diário: para quem já instalou e configurou

### Passo 1 — Confira o PostgreSQL

1. Pressione **Windows + R**.
2. Digite `services.msc` e pressione Enter.
3. Procure `postgresql-x64-18`. Outra versão pode ter outro número no nome.
4. Se estiver **Em execução**, prossiga.
5. Se estiver parado, clique com o botão direito e escolha **Iniciar**. O Windows pode solicitar autorização de administrador.

Para iniciar junto com o Windows, confira em **Propriedades → Tipo de inicialização** se está **Automático**. Se o serviço não iniciar, anote o erro; não apague arquivos internos do PostgreSQL nem recrie seu banco.

### Passo 2 — Inicie o backend

Abra a pasta completa do projeto no VS Code e use **Terminal → Novo Terminal**. A partir da raiz do projeto:

```powershell
cd backend
node --env-file=.env src/server.js
```

Se o terminal já estiver dentro de `backend`, execute apenas a segunda linha.

A mensagem esperada, usando a porta padrão, é:

```text
API disponível em http://127.0.0.1:3001/api/health
```

Deixe esse terminal aberto. É normal ele ficar ocupado enquanto o servidor funciona. Essa mensagem indica que o backend iniciou, mas a conexão com o banco precisa ser conferida no próximo passo.

### Passo 3 — Confira a conexão e abra o sistema

Abra estes endereços no navegador:

1. [Backend em execução](http://127.0.0.1:3001/api/health): deve mostrar `{"status":"ok","servico":"espaco-leitura-api"}`.
2. [Conexão real com o PostgreSQL](http://127.0.0.1:3001/api/health/db): deve mostrar `{"status":"ok","banco":"PostgreSQL"}`.
3. [Acervo](http://127.0.0.1:3001/acervo.html): abre o sistema.

O segundo teste confirma conectividade, mas não verifica se todas as tabelas existem. Em uma instalação nova, execute as migrações da seção 3 antes de usar os cadastros.

Abra pelo endereço acima, sem Live Server e sem dar duplo clique no HTML. Atualmente, não existe um segundo comando para iniciar um frontend Next.js.

### Passo 4 — Ao terminar

No terminal do backend, pressione **Ctrl + C**. Isso encerra o servidor sem apagar os dados. O PostgreSQL pode continuar como serviço do Windows. Fechar apenas o navegador não encerra o backend.

Não é necessário reinstalar dependências ou recriar o banco a cada dia.

## 3. Primeira instalação na máquina de um colega

### Passo 1 — Instale os programas

Instale:

- [Node.js 24 LTS](https://nodejs.org/en/download), com o npm incluído. O projeto exige Node.js 22.9 ou superior; usamos a linha 24 neste tutorial.
- [PostgreSQL para Windows](https://www.postgresql.org/download/windows/), versão 18 para acompanhar o ambiente do projeto, incluindo PostgreSQL Server e pgAdmin.
- Um editor de código, como VS Code, para abrir o projeto e editar a configuração.

Na instalação do PostgreSQL, guarde a senha definida para o usuário `postgres` e mantenha a porta `5432`, se estiver livre. Caso escolha outra porta, informe esse mesmo número no `.env`.

Depois de instalar, feche e reabra o terminal/VS Code para atualizar o PATH. Confira:

```powershell
node --version
npm.cmd --version
```

Ambos devem mostrar números de versão. Se aparecer “não reconhecido”, confira a instalação e o PATH antes de continuar.

### Passo 2 — Receba e abra a pasta completa

Extraia o projeto, por exemplo, em `C:\Projetos\EspacoDeLeituraDigital`, e abra essa pasta no VS Code. Esse caminho é apenas um exemplo: use a pasta escolhida na sua máquina.

É necessário receber os HTMLs e as pastas `backend`, `js`, `css` e `assets`, além dos arquivos de configuração do projeto. Não copie somente `backend`, pois o servidor também usa arquivos fora dessa pasta.

No terminal aberto na raiz:

```powershell
cd backend
```

Daqui em diante, execute os comandos do projeto dentro de `backend`, onde está `package.json`.

### Passo 3 — Instale as dependências

O projeto possui `pnpm-lock.yaml`. Para manter as versões registradas nele, use pnpm:

```powershell
npm.cmd install --global pnpm@11
pnpm.cmd --version
pnpm.cmd install --frozen-lockfile
```

A primeira linha instala o gerenciador; a última instala as bibliotecas do projeto. É necessário acesso à internet. A opção `--frozen-lockfile` evita alterar as versões registradas; se houver erro de incompatibilidade do lockfile, confira se recebeu `package.json` e `pnpm-lock.yaml` da mesma versão do projeto.

O sufixo `.cmd` evita o bloqueio comum dos atalhos PowerShell `.ps1`, sem alterar a política de execução do Windows. Consulte a [documentação oficial do pnpm](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/installation.md) e a [documentação de instalação de dependências](https://github.com/pnpm/pnpm/blob/main/pnpm/docs/cli/install.md).

### Passo 4 — Crie o banco

1. Confira se o serviço PostgreSQL está em execução, como na seção 2.
2. Abra o pgAdmin e expanda **Servers → PostgreSQL 18**.
3. Quando solicitado, informe a senha do usuário `postgres` definida na instalação.
4. Clique com o botão direito em **Databases → Create → Database**.
5. Em **Database**, digite `espaco_leitura`.
6. Em **Owner**, selecione `postgres` e salve.

Se o banco já existir, use-o; não o exclua para repetir a instalação. Se o servidor não estiver listado no pgAdmin, cadastre-o em **Servers → Register → Server**: escolha um nome e, em **Connection**, informe host `localhost`, porta `5432`, maintenance database `postgres`, username `postgres` e a senha da instalação.

### Passo 5 — Configure a senha no projeto

No terminal, dentro de `backend`, execute:

```powershell
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item -LiteralPath .env.example -Destination .env
}
```

Esse comando cria `.env` somente se ele ainda não existir, preservando configurações anteriores.

No explorador do VS Code, abra **backend → .env** e ajuste:

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=espaco_leitura
PGUSER=postgres
PGPASSWORD="COLOQUE_AQUI_A_SENHA_DESTA_MAQUINA"
PORT=3001
```

Substitua apenas o texto de exemplo da senha pela senha real e salve com **Ctrl + S**. Não é a senha mestra do pgAdmin: é a senha do usuário PostgreSQL indicado em `PGUSER`.

O `.env.example` original traz `PGUSER=biblioteca`; esse usuário não é criado automaticamente. Para o ambiente local deste tutorial, altere para `postgres`. Se usar um usuário próprio, ele deve existir e ter permissão para criar e acessar as tabelas do banco.

| Campo | Significado |
| --- | --- |
| `PGHOST` | Computador onde o banco está; `localhost` significa esta máquina |
| `PGPORT` | Porta do PostgreSQL, normalmente 5432 |
| `PGDATABASE` | Nome do banco criado no pgAdmin |
| `PGUSER` | Usuário que acessa o PostgreSQL |
| `PGPASSWORD` | Senha desse usuário |
| `PORT` | Porta do backend, normalmente 3001 |

Mantenha a senha entre aspas para preservar caracteres como `#`. Se contiver aspas duplas, use aspas simples externas, desde que elas não façam parte da senha. O nome do arquivo deve ser exatamente `.env`, não `.env.txt`. Editar somente `.env.example` não configura o backend.

Se houver `DATABASE_URL` configurada, ela tem prioridade sobre `PGHOST`, `PGUSER` e os demais campos. Para seguir esta configuração local, não use simultaneamente uma URL de outro banco. Após alterar `.env`, pare o backend com **Ctrl + C** e inicie novamente.

### Passo 6 — Crie as tabelas com as migrações

Ainda em `backend`, com o PostgreSQL ligado:

```powershell
node --env-file=.env scripts/migrate.js
```

Em um banco novo, a versão atual aplica cinco migrações, incluindo acervo, leitores, baixa de exemplares, empréstimos e devoluções. O script registra quais já foram executadas; repetir o comando não reaplica as mesmas migrações. Se tudo já estiver aplicado, mostra `Banco já atualizado.`

Esse comando cria as tabelas, mas não cria o banco `espaco_leitura` — por isso o passo 4 vem antes. Se falhar, corrija a causa antes de avançar.

### Passo 7 — Inicie e confira

```powershell
node --env-file=.env src/server.js
```

Deixe o terminal aberto, confira [a conexão com o banco](http://127.0.0.1:3001/api/health/db) e abra [o acervo](http://127.0.0.1:3001/acervo.html).

Cada colega terá inicialmente seu próprio banco sem seus livros, leitores e empréstimos. As migrações incluem os Centros iniciais, mas não copiam os seus cadastros. Para as próximas vezes, siga apenas a seção 2.

## 4. Como compartilhar o projeto

Envie o código completo e este tutorial, incluindo `backend/.env.example`, `backend/package.json`, `backend/pnpm-lock.yaml` e os arquivos SQL em `backend/database`.

Não inclua seu `.env`, senhas, pastas `node_modules`, `.pnpm-store`, logs ou cópias do banco com dados pessoais. Ao preparar um ZIP, exclua esses itens da cópia que será compactada; mantenha seu `.env` original na sua máquina. O `.gitignore` não filtra arquivos de um ZIP feito pelo Explorador do Windows.

Os endereços `localhost` e `127.0.0.1` apontam para o computador de quem os abre. O servidor atual atende somente a própria máquina. Este tutorial permite que cada colega execute sua cópia; não transforma seu computador em um servidor acessível aos demais. Compartilhar a mesma base será uma etapa de hospedagem e autenticação.

## 5. Erros comuns

| Sintoma | O que conferir |
| --- | --- |
| Navegador não abre nem `/api/health` | Backend em execução, terminal aberto, endereço e porta corretos |
| `/api/health` funciona, mas `/api/health/db` falha | Serviço PostgreSQL, `.env`, usuário, senha, porta e nome do banco |
| `connection timeout expired` ou `ECONNREFUSED` | Serviço parado/travado ou host/porta incorretos; confira o serviço antes de trocar a senha |
| Código `28P01` / autenticação por senha falhou | `PGUSER` e `PGPASSWORD`; salve e reinicie o backend |
| Código `3D000` / banco inexistente | Crie `espaco_leitura` ou corrija `PGDATABASE` |
| Código `42P01` / tabela inexistente | Execute as migrações no banco indicado pelo `.env` |
| `EADDRINUSE` | A porta do backend já está ocupada; confira se ele já está aberto em outro terminal. Pare apenas o processo conhecido ou escolha outra `PORT` e ajuste os links |
| `.env` não encontrado / `package.json` não encontrado | Execute dentro da pasta `backend`; confira o nome do arquivo |
| Módulo não encontrado | Instale as dependências e confira se recebeu a pasta completa do projeto |
| `npm.ps1` ou `pnpm.ps1` bloqueado | Use `npm.cmd` ou `pnpm.cmd`, como neste tutorial |
| Página sem estilos ou ícones | Confira acesso à internet: Bootstrap e ícones são carregados por CDN |

As mensagens na interface podem ser genéricas; o terminal pode mostrar o código do erro. Ao pedir ajuda, envie o texto do erro e o comando executado, sem enviar o `.env` nem senhas.

## 6. Onde a conexão é implementada

- `backend/.env`: configuração local, inclusive senha.
- `backend/src/database.js`: cria o pool de conexões com PostgreSQL.
- `backend/src/app.js`: define `/api/health` e `/api/health/db`; o segundo executa `SELECT 1` para testar o banco.
- `backend/src/server.js`: inicia o servidor HTTP.
- `backend/scripts/migrate.js`: aplica e registra as migrações SQL.

Tutorial conferido com os scripts e rotas do projeto em 11/10/2026. A instalação completa em outra máquina depende da configuração local desse computador.
