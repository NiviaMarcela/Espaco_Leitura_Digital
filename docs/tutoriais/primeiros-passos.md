# Primeiros passos

Este roteiro leva de máquina limpa ao sistema logado. O tutorial completo de instalação e uso está em [TUTORIAL-INSTALACAO-E-USO.md](TUTORIAL-INSTALACAO-E-USO.md).

## 1. Banco PostgreSQL e credenciais

O sistema precisa de um PostgreSQL acessível em `localhost:5432` (ou no endereço que o seu ambiente usar), com um banco dedicado ao projeto e um usuário com permissão para criar tabelas nele. A forma de subir esse banco fica a seu critério: serviço instalado, container, provedor gerenciado. O que o sistema lê são as credenciais do arquivo `backend/.env`, que fica fora do Git; nenhuma credencial deve ser enviada por chat ou colada em documentação.

## 2. Conexão do backend

Em `backend/`, copie `.env.example` para `.env` e preencha com as credenciais do seu banco:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=espaco_leitura
PGUSER=biblioteca
PGPASSWORD=<a senha do ambiente>
```

Os nomes do banco e do usuário são os deste exemplo no ambiente em que o projeto nasceu; em outro ambiente, use os que você criou. Os campos separados dispensam codificar a senha na URL; `DATABASE_URL` também funciona e tem prioridade sobre os campos separados.

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

**`/api/health/db` responde "Banco de dados indisponível".** O PostgreSQL não está em execução no endereço configurado, a porta está ocupada por outro serviço ou as credenciais do `.env` não correspondem ao banco disponível. Confira os três pontos antes de subir o servidor de novo.

**Login recusa e-mail válido.** A conta foi criada em outro banco. Confirme que o `PGDATABASE` do `.env` aponta para o banco onde o admin foi criado.

**Página 404.** A rota da página precisa existir em `backend/src/app.js`; páginas novas entram na lista de `arquivoPagina`.
