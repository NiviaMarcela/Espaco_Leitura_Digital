# Cadastro, reserva e retirada

## Testar nas telas

1. Inicie o backend em `backend` com `node --env-file=.env src/server.js`. Se estiver rodando uma versão anterior, encerre com Ctrl+C antes de iniciar novamente.
2. Abra `http://127.0.0.1:3001/biblioteca.html`, sem login. Não deve haver sidebar administrativa.
3. Clique em **Cadastre-se para reservar**. Preencha nome, email, nascimento, centro e senha de pelo menos 8 caracteres. O centro determina onde o leitor poderá retirar livros.
4. Entre com a conta criada. A Biblioteca exibe livros do centro escolhido. Em um livro disponível, clique **Pegar emprestado**.
5. Confira a reserva em **Minhas reservas**. Uma cópia fica Reservada. Ainda não existe prazo de devolução.
6. Entre como coordenador do mesmo centro, em outra sessão de navegador ou após sair da conta do leitor. Abra **Empréstimos → Reservas aguardando retirada**.
7. Após entregar o exemplar, clique **Confirmar retirada**. A reserva fica Retirada, o exemplar fica Emprestado e a data prevista é a data da retirada mais 30 dias.
8. Para testar cancelamento, crie outra reserva e cancele pela Biblioteca ou pela gestão. A cópia volta a ficar Disponível.

O administrador pode cadastrar um coordenador no menu Usuários, informando seu centro. O coordenador de outro centro não vê nem confirma a reserva. O leitor não acessa a gestão, mesmo digitando seu endereço.

Reservas pendentes contam junto com empréstimos abertos no limite de 10. Cancelar libera uma vaga; confirmar a retirada apenas transforma a reserva em empréstimo, sem consumir uma segunda vaga. Não há expiração automática de reservas nesta etapa.

## Entendendo os blocos de código

- `js/biblioteca.js`: espera a sessão, monta o botão dos livros disponíveis e envia somente o ID do exemplar. Depois atualiza catálogo e reservas. `carregarReservasLeitor()` exibe o histórico e o botão de cancelar nas reservas pendentes.
- `backend/src/app.js`: identifica a conta e encaminha o pedido. O leitor não escolhe qual identidade usar: o backend obtém seu cadastro pela sessão.
- `backend/src/repositories/reservas.js`: confere centro, disponibilidade e limite dentro de uma transação. Bloqueia as linhas do leitor e do exemplar para impedir duas reservas simultâneas da mesma cópia.
- `js/reservas-gestao.js`: apresenta a fila do centro e pede confirmação da entrega física. A data é calculada no servidor, não pelo navegador.
- `backend/database/007_leitores_reservas.sql`: adiciona o vínculo entre conta e leitor e guarda o histórico das reservas. Impede transferir leitores de centro enquanto houver empréstimos abertos ou reservas pendentes.

## Validação automatizada

Os testes de integração usam schemas temporários no PostgreSQL, sem modificar os cadastros do sistema. Cobrem cadastro e login de leitor, senha mínima, permissões, centro, cliques simultâneos, limite, retirada e cancelamento. O teste de interface usa um DOM simulado; não substitui a conferência visual das telas.

No terminal da pasta `backend`:

```powershell
$env:RUN_POSTGRES_TESTS='1'
node --env-file=.env --test
```
