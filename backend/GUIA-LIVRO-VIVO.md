# Livro Vivo

Atualizado em 20/11/2026: modalidade única **Doação**, com retorno à estante permitido. A opção Definitiva e o seletor de modalidades foram retirados da interface.

## Como usar

1. Cadastre a obra e suas cópias no Acervo.
2. Em Livro Vivo, escolha o Centro, informe a escola/comunidade de destino e selecione exemplares disponíveis.
3. Confirme a transferência. A quantidade vem das cópias selecionadas; o autorizador é a conta autenticada que confirma a operação.
4. Cada exemplar recebe baixa com motivo **doação livro vivo**, deixando de ficar disponível para empréstimos e reservas.
5. Ao receber e conferir uma cópia, clique no botão verde **Registrar retorno** no histórico. Somente a cópia recebida volta a ficar disponível. Data, responsável e saída original permanecem registrados.

Não há prazo automático de devolução, multa nem limite de circulação pessoal associado à doação. É possível devolver parte das cópias e enviá-las novamente em uma nova transferência. Exemplares emprestados, reservados, danificados, perdidos ou baixados não podem ser doados. A operação é atômica: um conflito impede a transferência do lote inteiro.

## Permissões e histórico

Administrador opera os três Centros; coordenador somente o próprio. Professor, Outro e Leitor não acessam o Livro Vivo. Cada transferência é de um único Centro. O histórico exibe a tag Doação, destino, data, autorizador, exemplares, quantidades enviadas e retornadas. Busca e filtros de datas atualizam os totais e a impressão/PDF. Os totais representam movimentações, portanto uma cópia enviada novamente após retornar participa de outro registro.

## Registros anteriores e banco

A migração 016 converte as antigas modalidades para doacao e preserva a classificação anterior em modalidade_anterior para auditoria. Não apaga transferências, exemplares nem retornos. As antigas doações definitivas também passam a permitir retorno; nenhuma cópia volta automaticamente à estante. A migração 013 permanece como histórico da estrutura original.

Aplicar npm run db:migrate no backend antes de executar esta versão em outros ambientes. A API aceita modalidade doacao (ou ausência do campo) e recusa valores antigos, orientando atualizar a página.

Arquivos: database/016_livro_vivo_doacao.sql, src/repositories/livro-vivo.js, livroVivo.html e js/livro-vivo.js. As rotas continuam GET /api/livro-vivo, GET /api/livro-vivo/disponiveis, POST /api/livro-vivo e POST /api/livro-vivo/:id/retorno.

Testes cobrem transferência, isolamento, concorrência, retorno parcial, conservação do histórico e interface com DOM simulado. A aparência deve ser conferida no navegador.
