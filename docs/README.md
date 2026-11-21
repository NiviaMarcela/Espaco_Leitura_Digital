# Espaço de Leitura Digital

Sistema de biblioteca do Instituto Janela para o Mundo. Ele gerencia o acervo de obras físicas de três Centros de Educação (Maranhão, Piauí e Bahia): cadastro de livros e exemplares, reservas, empréstimos, devoluções, baixas, contas de acesso e doações pelo Livro Vivo.

A interface roda no navegador, sem dependência de frameworks, e conversa com uma API em Node.js que consulta um banco PostgreSQL. Tudo funciona em um único computador por padrão, na porta 3001.

## Mapa da documentação

| Caminho | Conteúdo |
| --- | --- |
| [arquitetura.md](arquitetura.md) | Como o sistema funciona: stack, fluxo de uma requisição, modelo de dados, perfis de acesso e segurança |
| [organizacao.md](organizacao.md) | Onde está cada coisa no repositório e as convenções para alterar |
| [tutoriais/primeiros-passos.md](tutoriais/primeiros-passos.md) | Subir o ambiente do zero: banco, migrações, administrador e servidor |
| [tutoriais/TUTORIAL-INSTALACAO-E-USO.md](tutoriais/TUTORIAL-INSTALACAO-E-USO.md) | Tutorial completo de instalação e uso original do projeto |
| [frontend/GUIA-BIBLIOTECA.md](frontend/GUIA-BIBLIOTECA.md) | Como a tela Biblioteca consulta e exibe o acervo |
| [backend/README.md](backend/README.md) | Visão geral do backend, modelo do acervo e endereços da API |
| [backend/EMPRESTIMOS.md](backend/EMPRESTIMOS.md) | Regras e fluxo de empréstimos, renovações e prazos |
| [backend/DEVOLUCOES.md](backend/DEVOLUCOES.md) | Devolução, conferência e baixa por dano |
| [backend/BAIXA-EXEMPLARES.md](backend/BAIXA-EXEMPLARES.md) | Baixa definitiva de exemplares |
| [backend/GUIA-PERFIS-RESERVAS.md](backend/GUIA-PERFIS-RESERVAS.md) | Perfis de acesso e ciclo completo de reservas |
| [backend/GUIA-LIVRO-VIVO.md](backend/GUIA-LIVRO-VIVO.md) | Doação de exemplares a escolas e comunidades |
| [backend/GUIA-CATEGORIAS.md](backend/GUIA-CATEGORIAS.md) | Categorias por Centro no Acervo |
| [backend/GUIA-RECUPERACAO-ACESSO.md](backend/GUIA-RECUPERACAO-ACESSO.md) | Recuperação assistida de senha |
| [backend/LEITORES.md](backend/LEITORES.md) | Cadastro e gestão de leitores |
| [backend/DASHBOARD.md](backend/DASHBOARD.md) | Indicadores da tela inicial de gestão |

Os guias de backend descrevem regras de negócio e testes de cada domínio. Ao alterar uma regra, atualize o guia correspondente no mesmo trabalho.
