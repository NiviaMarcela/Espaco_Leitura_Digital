# Livro Vivo

Implementado em 15/11/2026. O Livro Vivo registra saídas de exemplares para escolas e comunidades sem cadastrar a mesma obra novamente.

## Acessos

- Administrador: consulta e opera os três Centros, com uma transferência separada por Centro.
- Coordenador: consulta, transfere e recebe exemplares somente do próprio Centro.
- Professor, Outro e Leitor: não acessam a página nem a API do Livro Vivo.
- Quem confirma a transferência é o autorizador. O nome e o ID são obtidos da conta autenticada; não há campo para atribuir a autorização a outra pessoa. O nome é preservado no histórico mesmo que o cadastro mude depois.

## Transferência

1. Cadastrar a obra e suas cópias no Acervo, como de costume.
2. Abrir **Livro Vivo** na sidebar, escolher o Centro e informar o nome da escola, comunidade ou localidade de destino.
3. Escolher **Definitiva** ou **Com possibilidade de devolução**.
4. Buscar e selecionar os exemplares disponíveis. A quantidade corresponde às cópias selecionadas, e não ao número de títulos. A busca preserva seleções ocultas e o contador avisa isso; mudar de Centro limpa a seleção.
5. Clicar em **Transferir selecionados** e conferir destino, quantidade e modalidade na confirmação.

O sistema registra a transferência e dá baixa em todos os exemplares na mesma transação: status `Baixado`, motivo exato `doação livro vivo`, data e referência ao destino. A obra e os exemplares permanecem cadastrados para preservar o histórico; as cópias baixadas deixam de estar disponíveis para reservas e empréstimos. Os contadores de títulos cadastrados continuam incluindo obras históricas, como já acontecia com outras baixas.

Não é possível enviar cópias reservadas, emprestadas, danificadas, perdidas ou já baixadas. Se uma cópia ficar indisponível entre a seleção e a confirmação, nenhuma cópia daquele envio é transferida. Bloqueios de linhas e índice único impedem duas saídas simultâneas do mesmo exemplar. A quantidade e o autorizador enviados indevidamente pelo navegador não substituem os valores calculados pelo servidor.

## Modalidades e retorno

- **Definitiva:** recebe a tag correspondente e não oferece retorno.
- **Com possibilidade de devolução:** também dá baixa durante a saída, mas permite registrar o retorno individual no histórico. Não é um empréstimo comum: não tem prazo, multa, renovação nem entra no limite de dez reservas/empréstimos de um leitor.

Após receber e conferir fisicamente uma cópia em condições de voltar à estante, clicar em **Registrar retorno** ao lado dela. O sistema guarda data e responsável pelo recebimento, limpa os campos da baixa atual e muda o status para `Disponível`. O registro original permanece no Livro Vivo. É possível receber parte de uma transferência; somente as cópias recebidas voltam à circulação. Uma cópia retornada pode participar de outra transferência, com novo registro. Não há alteração de modalidade nem cancelamento de transferência nesta versão.

## Histórico para a diretoria

Exibe data, Centro, destino, tag de modalidade, quantidade enviada, quantidade retornada, quantidade no destino, autorizador, títulos e códigos das cópias. Retornos mostram data e recebedor. Há filtros por texto (destino, Centro, livro, código e responsável), período da saída e modalidade; os totais acompanham o filtro. A impressão permite salvar o histórico filtrado como PDF pelo navegador.

Os totais contam movimentações: uma mesma cópia enviada novamente após retornar será contada em outra transferência. Este histórico apresenta doações/saídas do Livro Vivo; os empréstimos regulares continuam em Relatórios.

## Arquitetura e instalação

- `database/013_livro_vivo.sql`: amplia o motivo de baixa e cria transferências e itens, com referências aos exemplares existentes e registro de retornos. Não altera o status de livros já cadastrados.
- `scripts/migrate.js`: inclui a migração 013; executar `npm run db:migrate` em outros ambientes antes de usar a página.
- `src/repositories/livro-vivo.js`: escopo por Centro, consultas, validação, transações, autoria obtida da sessão e concorrência.
- `src/app.js`: página protegida e endpoints `GET /api/livro-vivo`, `GET /api/livro-vivo/disponiveis`, `POST /api/livro-vivo`, `POST /api/livro-vivo/:id/retorno`.
- `livroVivo.html` e `js/livro-vivo.js`: seleção, confirmação, histórico, filtros, impressão e retorno.
- `js/auth-ui.js` e sidebars: menu restrito ao administrador e coordenador, no desktop e celular. A API também verifica permissões independentemente do menu.

## Validação

Testes de PostgreSQL em schema temporário cobrem acesso, isolamento entre Centros, lote inválido sem baixa parcial, autoria, quantidade, concorrência, retorno parcial, nova saída após retorno, bloqueio de retorno definitivo e preservação de nomes/títulos históricos. Testes com DOM simulado verificam seleção, envio, filtros, botão de retorno e links das sidebars. Os testes não transferem exemplares reais. A conferência visual no navegador não foi realizada nesta etapa.
