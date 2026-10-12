# Baixa de exemplares

No acervo, abra os detalhes do livro e clique em Dar baixa na linha da cópia.
Escolha Perda, Dano/rasuras, Doação ou Outro. Observação é obrigatória para Outro
e opcional nos demais motivos. Confirmar baixa grava o registro; Cancelar não grava.

O exemplar recebe status Baixado. Código, Centro e vínculo com o livro permanecem.
O total cadastrado inclui baixados; disponíveis não os inclui. A obra só fica
indisponível se não tiver cópias disponíveis nem emprestadas, conforme a regra atual.
A data/hora é gerada pelo banco e exibida no horário de Fortaleza.

## Caminho do código

- `../acervo.html`: formulário e coluna de baixa dentro do modal de detalhes.
- `../js/acervo.js`: lê motivo/observação, envia à API e atualiza a obra com a resposta.
- `POST /api/exemplares/:id/baixa`: recebe e valida os dados em `src/routes/acervo.js`.
- `validarBaixa` em `src/services/validation/acervo.js`: limita observação a 2000 caracteres e
  rejeita motivos inválidos e Outro sem explicação.
- `baixarExemplar` em `src/repositories/acervo.js`: usa uma transação e bloqueia
  a linha durante a operação. Duas tentativas simultâneas não sobrescrevem o registro.
- `../database/003_baixa_exemplares.sql`: adiciona o status e os campos de motivo,
  observação e data, com restrições de consistência.

Não há exclusão nem reativação nesta etapa. Uma segunda baixa retorna conflito (409).
Emprestados e reservados também retornam 409, mesmo se alguém tentar enviar pela API.
Encerrar por perda um exemplar emprestado ainda não tem ação própria: a baixa continua
bloqueada enquanto o empréstimo estiver aberto, e registrar uma devolução fictícia só para
liberar a baixa segue sendo incorreto — o fluxo de perda será uma etapa própria.
O responsável pela baixa poderá ser registrado quando a autenticação for implementada.

Os testes de integração verificam persistência, motivos, limites, bloqueios, exemplar
inexistente e tentativas simultâneas em schema temporário, sem modificar os livros reais.
