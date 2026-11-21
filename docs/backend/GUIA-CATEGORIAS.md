# Categorias por Centro

Implementado em 20/11/2026.

## Uso

Em **Acervo → Categorias**, na sidebar, escolha o Centro, informe o nome e cadastre. A tabela oferece Editar e Excluir. O nome aceita até 100 caracteres. Nomes iguais (ignorando maiúsculas/minúsculas e espaços nas pontas) não podem ser repetidos dentro de um Centro; Centros diferentes podem usar o mesmo nome.

Administrador gerencia todos os Centros. Coordenador, Professor e Outro gerenciam apenas seu Centro, seguindo as permissões do Acervo. Leitor não gerencia categorias. Renomear muda a classificação exibida nos livros vinculados somente naquele Centro. Excluir categoria usada é recusado: primeiro reclassifique os livros, inclusive obras com exemplares baixados.

O formulário do livro lista as categorias do Centro escolhido. O gerenciamento fica na página Categorias; o formulário do livro mantém apenas a seleção das categorias cadastradas. No modo de edição, o Centro do livro é preservado. O Centro de uma categoria não pode ser alterado.

## Banco e compatibilidade

A migração 015 cria categorias com ID, nome e Centro. A associação dos livros usa uma chave estrangeira composta por Centro e nome, com atualização em cascata e exclusão restrita: o texto categoria no livro deixa de ser uma informação sem vínculo. Não é necessário um campo categoria_id adicional porque a chave composta já garante o relacionamento no PostgreSQL.

Obras que possuíam cópias em vários Centros são separadas em registros por Centro, preservando IDs/códigos dos exemplares, empréstimos, reservas e Livro Vivo. A quantidade de registros de obras pode aumentar. Os nomes anteriores são importados e variantes de maiúsculas/espaços no mesmo Centro são reunidas. Obras antigas sem nenhum exemplar são preservadas sem Centro; para editá-las, adicione exemplares primeiro.

Adicionar exemplares em outro Centro como administrador cria uma descrição da obra e a categoria correspondente nesse Centro. Cópias de um mesmo registro de livro não podem pertencer a Centros diferentes. A API de cadastro/edição de livros continua aceitando o campo categoria textual e registra uma categoria local quando necessário, para compatibilidade com integrações anteriores.

## Arquivos e rotas

- backend/database/015_categorias_por_centro.sql: migração de categorias, livros e integridade de exemplares.
- backend/src/repositories/categorias.js: CRUD, validação, isolamento e mensagens de conflito.
- backend/src/repositories/acervo.js: criação e edição com categorias locais e livros por Centro.
- GET/POST /api/categorias; PUT/DELETE /api/categorias/:id: rotas de gestão protegidas.
- categorias.html e frontend/pages/categorias/categorias.js: página de gerenciamento, busca e filtro por Centro.
- acervo.html e frontend/pages/acervo/acervo.js: seleção de categoria do livro por Centro.
- O submenu Categorias aparece abaixo de Acervo somente nas páginas Acervo e Categorias, em desktop e celular, preservando as permissões da gestão.

Aplicar com npm run db:migrate no backend antes de iniciar esta versão em outros ambientes. Testes PostgreSQL usam schemas temporários para verificar migração de obra compartilhada, preservação dos exemplares, renomeação isolada, duplicidade, concorrência e exclusão protegida. A conferência visual no navegador permanece manual.
