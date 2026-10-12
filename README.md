# Espaco_Leitura_Digital
Projeto Let's Code para o Instituto Janela para o Mundo

Sistema de gestão do espaço de leitura: acervo de obras e exemplares, cadastro de leitores, empréstimos, renovações e devoluções. As páginas HTML na raiz conversam com a API Express em `backend/`, que guarda tudo em PostgreSQL.

## Como rodar

Pré-requisitos: Node.js 22.9 ou superior, pnpm e um PostgreSQL no ar (local ou hospedado).

```powershell
cd backend
pnpm install
pnpm db:migrate   # aplica as migrações numeradas
pnpm dev
```

Depois abra http://127.0.0.1:3001/acervo.html. O resumo geral está em http://127.0.0.1:3001/dashboard.html.

Na primeira vez, copie `backend/.env.example` para `backend/.env` e informe as credenciais do banco (host, porta, banco, usuário e senha); o arquivo não é versionado. O projeto não depende de Docker.

As páginas precisam ser abertas pelo endereço do backend: elas chamam `/api` na mesma origem e não funcionam por duplo clique no arquivo nem por Live Server.

## Estrutura

- `*.html`, `css/`, `js/`, `assets/`: páginas e recursos do navegador. Bootstrap e Bootstrap Icons ficam copiados em `assets/vendor/`, sem depender de CDN.
- `backend/`: API Express em camadas (`src/`), migrações numeradas (`database/`), testes (`test/`) e guias por etapa (`docs/`).

Os detalhes das camadas, das rotas e da verificação estão em `backend/README.md` e em `backend/docs/`.
