# Devoluções — guia didático

Abra http://127.0.0.1:3001/devolucoes.html ou use Devolver na página de empréstimos.

## Uso

1. Busque pelo código da cópia, título, nome do leitor ou matrícula.
2. Clique em Devolver e confira o leitor, a obra e o código do exemplar físico.
3. Selecione a condição: Disponível (em boas condições) ou Danificado.
4. Descreva os danos quando houver; a observação é obrigatória nesse caso.
5. Confirme. O modal passa a mostrar o registro concluído.

O filtro Histórico de devoluções permite consultar os registros encerrados.
A data é automática, no dia atual de Fortaleza; não existe opção de retroagir,
editar ou desfazer uma devolução nesta etapa. O histórico exibe a condição no
momento do recebimento, mesmo se o exemplar sofrer alterações posteriormente.

## Regras

- A devolução encerra o empréstimo e libera uma vaga do leitor, inclusive se ele estiver inativo.
- Cópia em boas condições volta a Disponível e pode ser emprestada novamente.
- Cópia Danificada não aparece nas opções de novos empréstimos. Sua baixa definitiva
  pode ser registrada no acervo; reparo/reativação ainda não tem uma ação própria.
- Dias de atraso são a diferença entre devolução e prazo vigente (considerando renovações),
  com mínimo zero. Devolver na data prevista gera zero dias de atraso.
- O atraso registrado fica congelado no histórico e não gera multa.
- Segunda devolução, renovação de empréstimo encerrado e envio de uma versão antiga
  são rejeitados. Um reenvio antigo nunca libera uma cópia que já foi emprestada novamente.
- Perda não é devolução física. O fluxo de encerramento por perda ainda será uma etapa própria.

## Como o código funciona

`../devolucoes.html` organiza filtros, tabela e o modal de conferência.
`../js/devolucoes.js` busca os empréstimos, filtra a lista e consulta o registro mais
recente antes de abrir a confirmação. Dados digitados são exibidos por textContent.

Ao confirmar, o navegador envia:

```json
{ "versao": 0, "condicao": "Disponível", "observacao": "" }
```

para `POST /api/emprestimos/:id/devolucao`. A API valida esses campos em
`validarDevolucao`, no arquivo `src/services/validation/emprestimos.js`. O cliente não escolhe data,
dias de atraso, leitor nem exemplar: essas informações vêm do registro no banco.

O método `devolver`, em `src/repositories/emprestimos.js`, abre uma transação:

1. Bloqueia o empréstimo e verifica se ele continua aberto e com a mesma versão.
2. Bloqueia leitor e exemplar, coordenando a operação com retiradas e renovações.
3. Insere o registro de recebimento em `devolucoes`, calculando o atraso no SQL.
4. Preenche `emprestimos.data_devolucao` e incrementa sua versão.
5. Atualiza o exemplar para Disponível ou Danificado e confirma tudo com COMMIT.

Se houver falha, ROLLBACK desfaz as três gravações. O índice único de
`devolucoes.emprestimo_id` protege contra registros duplicados. A versão impede que
uma confirmação com prazo antigo sobrescreva uma renovação feita em outra sessão.

A migração `../database/005_devolucoes.sql` cria a tabela sem apagar dados anteriores.
As listagens de empréstimos agora incluem o objeto `devolucao` com condição,
observação, atraso e horário de registro. Os detalhes de empréstimos também exibem
as informações do recebimento.

## Verificação

Os testes cobrem devolução normal/danificada, leitor inativo, duplicação, corrida
com renovação, liberação do limite de cinco, persistência do atraso e reversão de
gravações quando a atualização do exemplar falha. Usam schemas temporários.

```powershell
pnpm test:integracao
```

Autenticação e identificação do funcionário que recebeu o exemplar serão acrescentadas
na etapa de usuários e permissões. A aplicação continua restrita ao computador local.
