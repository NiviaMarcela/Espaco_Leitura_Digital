# Dashboard — guia didático

Abra `http://127.0.0.1:3001/dashboard.html` com o backend e o PostgreSQL em execução. Esta etapa não exige uma nova migração; utiliza as tabelas já existentes.

## O que cada indicador conta

- **Livros cadastrados:** obras distintas na tabela `livros`, mesmo que não tenham cópias disponíveis.
- **Exemplares disponíveis:** cópias com status Disponível e sem empréstimo em aberto. Baixados, reservados, danificados e perdidos não entram.
- **Empréstimos em aberto:** retiradas ainda sem devolução, incluindo atrasadas.
- **Empréstimos atrasados:** retiradas abertas cuja data prevista já passou. Vencer hoje ainda não é atraso.
- **Leitores ativos:** cadastros com status Ativo.

Os indicadores somam todos os centros. Obras e exemplares são unidades diferentes: um livro com três cópias representa uma obra e três exemplares.

## Do banco à tela

1. `js/dashboard.js` faz um GET para `/api/dashboard` ao abrir a página, clicar em Atualizar ou retornar à aba.
2. `src/app.js` recebe o pedido e chama o repositório.
3. `src/repositories/dashboard.js` executa uma única consulta SQL. `COUNT` calcula os totais; `WHERE` seleciona os registros que atendem a cada regra. A consulta única faz os indicadores e a lista refletirem a mesma fotografia do banco.
4. O PostgreSQL devolve os totais e as cinco retiradas mais recentes, ordenadas por data da retirada e ID decrescentes. A lista inclui registros devolvidos, mostrando sua situação atual; não é uma lista de eventos de renovação e devolução.
5. O JavaScript preenche a página usando `textContent`, sem interpretar nomes ou títulos como HTML.

A data de referência segue Fortaleza, como no módulo de empréstimos. O Dashboard lê a data prevista salva: novos empréstimos e renovações usam 30 dias, mas registros antigos não são recalculados. Ele não altera as regras nem os dados de empréstimos.

Durante o carregamento ou uma falha, os cards mostram um travessão. Zero aparece somente após uma consulta bem-sucedida sem registros correspondentes. A mensagem informa a falha e o botão Atualizar permite tentar novamente. A página não mantém atualização contínua enquanto fica aberta; use o botão para buscar mudanças feitas por outra pessoa.

## Teste manual

1. Reinicie o backend e abra o Dashboard pelo endereço acima.
2. Compare obras, cópias disponíveis e leitores ativos com as outras páginas.
3. Registre uma retirada: o total em aberto deve aumentar e o de disponíveis diminuir.
4. Devolva a cópia: o total em aberto deve diminuir. Disponíveis aumenta somente se ela voltar em condição Disponível.
5. Retorne ao Dashboard ou use Atualizar para consultar os novos valores.

Os testes de integração usam um schema temporário com dados próprios, incluindo banco vazio, vários exemplares da mesma obra, situações indisponíveis, devoluções, prazo vencendo hoje e limite de cinco registros recentes.
