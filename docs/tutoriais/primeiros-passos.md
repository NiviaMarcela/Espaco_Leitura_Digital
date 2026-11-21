# Primeiros passos

Este roteiro leva de máquina limpa ao sistema logado. Ele descreve a configuração em uso neste computador; o tutorial completo de instalação e uso está em [TUTORIAL-INSTALACAO-E-USO.md](TUTORIAL-INSTALACAO-E-USO.md).

## 1. Banco PostgreSQL

O banco roda no Docker, no container `espaco-leitura-postgres` (imagem `postgres:18-alpine`), publicado na porta 5432 com o volume `backend_dados-postgres`. Se o container existir mas estiver parado, basta iniciá-lo:

```bash
docker start espaco-leitura-postgres
```

Conferir que respondeu:

```bash
docker ps --format '{{.Names}} | {{.Status}}'
```

O container atende o banco `espaco_leitura` com o usuário `biblioteca`. A senha dele está configurada no arquivo `backend/.env`, que fica fora do Git; nenhuma credencial deve ser enviada por chat ou colada em documentação.

## 2. Conexão do backend

Na raiz do projeto, dentro de `backend/`, o arquivo `.env` carrega os campos de conexão:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=espaco_leitura
PGUSER=biblioteca
PGPASSWORD=<a senha do ambiente>
```

Em máquina nova, copie `.env.example` para `.env` e preencha com os valores do ambiente local. O campo separado por variáveis dispensa codificar a senha na URL; `DATABASE_URL` também funciona e tem prioridade sobre os campos separados.

## 3. Dependências e migrações

Ainda dentro de `backend/`:

```bash
npm install
npm run db:migrate
```

O migrate aplica em transação cada migração pendente de `backend/database/` e registra em `schema_migrations`. Rodar de novo informa que o banco já está atualizado, sem duplicar nada. Em ambiente novo, a primeira aplicação cria as tabelas e os três Centros (Maranhão, Piauí e Bahia).

## 4. Primeiro administrador

```bash
npm run admin:criar
```

O comando pede o e-mail e uma senha de pelo menos 8 caracteres, digitada sem aparecer no terminal. Essa conta entra no perfil administrador, que enxerga os três Centros. Administradores adicionais são cadastrados dentro do sistema, em Usuários.

## 5. Servidor

```bash
npm run dev
```

O atalho sobe com recarga automática ao alterar arquivos (`node --watch`). Para subir sem watch, use `npm start`. O servidor atende somente `127.0.0.1` na porta 3001, configurável pela variável `PORT`.

Conferir a saúde:

```bash
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/health/db
```

O primeiro responde `ok` quando o processo está de pé; o segundo executa uma consulta real e confirma o banco.

## 6. Entrar no sistema

Abra `http://127.0.0.1:3001/` no navegador. A página inicial é pública, com o catálogo em destaque e o cadastro de leitor. Para a gestão, entre por `http://127.0.0.1:3001/login.html` com a conta de administrador criada no passo 4. Sem sessão, qualquer tela de gestão redireciona para o login.

## Problemas comuns

**`/api/health/db` responde "Banco de dados indisponível".** O container está parado ou a porta 5432 está ocupada por outro serviço. Veja `docker ps` e a seção 1.

**Login recusa e-mail válido.** A conta foi criada em outro banco. Confirme que o `PGDATABASE` do `.env` aponta para o banco onde o admin foi criado.

**Página 404.** A rota da página precisa existir em `backend/src/app.js`; páginas novas entram na lista de `arquivoPagina`.
