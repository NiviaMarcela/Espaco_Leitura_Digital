# Espaco_Leitura_Digital
Projeto Let's Code para o Instituto Janela para o Mundo

A documentação completa está em [docs/](docs/README.md): arquitetura, organização das pastas, tutoriais e guias por domínio.

## Livro Vivo — 15/11/2026

Novo menu exclusivo de administrador e coordenador para transferir exemplares às escolas e comunidades, com baixa automática, histórico e modalidade única Doação, que permite retorno parcial à estante. Consulte [o guia do Livro Vivo](docs/backend/GUIA-LIVRO-VIVO.md) para fluxo, permissões e testes. Em outros ambientes, aplique a migração 013 com `npm run db:migrate` no backend antes de usar.

## Categorias por Centro — 20/11/2026

O Acervo permite cadastrar, editar e excluir categorias persistidas por Centro. Veja [o guia de categorias](docs/backend/GUIA-CATEGORIAS.md). Aplicar a migração 015 antes de executar esta versão em outros ambientes.
