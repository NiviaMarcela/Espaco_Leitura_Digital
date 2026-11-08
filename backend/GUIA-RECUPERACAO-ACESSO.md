# Recuperação assistida de acesso

Implementação: 08/11/2026. O projeto não tem serviço de e-mail configurado. A opção escolhida foi atendimento pelo administrador, usando a tela de Usuários e a redefinição de senha temporária.

## Como a pessoa recupera o acesso

1. No login, clicar em **Esqueceu a senha?**.
2. Informar o e-mail cadastrado e clicar em **Solicitar ajuda para recuperar acesso**.
3. Procurar a equipe do seu Centro para confirmar a identidade. O sistema não envia e-mail, SMS ou WhatsApp e não promete atendimento automático.
4. Receber a senha temporária de forma privada, entrar no login e escolher uma nova senha. A senha antiga não é consultada, exibida ou enviada.

A resposta pública é a mesma para e-mail inexistente, conta ativa e conta inativa. Só contas ativas geram uma solicitação interna. O pedido não muda a senha, não encerra sessões, não reativa a conta e não concede acesso.

## Como o administrador atende

1. Abrir **Usuários → Solicitações de recuperação**. Usar **Atualizar solicitações** para consultar pedidos novos; não há atualização automática nem notificação externa.
2. Conferir nome, e-mail, perfil e Centro da conta.
3. Verificar a identidade presencialmente por um procedimento institucional, ou por um contato previamente conhecido e confiável. Apenas saber o e-mail, o nome ou a data de nascimento não é prova suficiente. Não aceitar um contato novo fornecido no próprio pedido como única comprovação. Nunca pedir a senha antiga.
4. Selecionar **Verificar e atender**, informar uma senha temporária de 8 a 128 caracteres, confirmar a senha e marcar a confirmação de identidade.
5. Entregar a senha temporária de modo privado à pessoa verificada. O sistema não faz essa entrega. Não publicar a senha em grupos nem incluir senhas em observações ou documentos.

A confirmação na tela registra que o administrador realizou a verificação; o sistema não verifica identidade automaticamente. Se não for possível verificar, usar **Encerrar sem alterar senha**. A conta permanece intacta.

Depois do atendimento, o sistema armazena o hash scrypt da nova senha, exige troca no próximo login, encerra as sessões antigas e marca a solicitação como Atendida na mesma transação. Uma segunda tentativa de atendimento é recusada. O registro guarda data de criação, encerramento e ID do administrador responsável; nunca guarda a senha temporária. Esse registro fica no banco, ainda sem tela de histórico de atendimentos.

Contas inativas não são reativadas pela recuperação. Se uma conta for inativada após solicitar ajuda, o administrador pode encerrar o pedido, mas não atendê-lo enquanto permanecer inativa. Reativação exige ação separada em Usuários.

## Proteções implementadas e seus limites

- Resposta e status HTTP públicos iguais para contas existentes, inexistentes e inativas, com espera mínima de 300 ms para reduzir diferenças de tempo. Isso não garante tempo idêntico sob qualquer carga.
- Limite de cinco envios por IP em 15 minutos. O contador é limitado em memória e expira; reiniciar o servidor zera o contador. Em produção com múltiplas instâncias, usar limitador compartilhado e proteção na infraestrutura.
- Um único pedido pendente por conta, garantido por índice único no PostgreSQL. Repetições não alteram a data nem geram várias entradas.
- Listagem e atendimento exclusivos do administrador, também verificados na API. Coordenador, professor e leitor não atendem pedidos.
- Conferência obrigatória de identidade antes da redefinição. Solicitações pendentes não são códigos de acesso nem tokens secretos; não autenticam ninguém.
- Nenhuma credencial é enviada por resposta pública, registrada no pedido ou incluída em logs.
- A senha e a revogação de sessões são gravadas junto com o encerramento do pedido. Concorrência não permite atender duas vezes.

## Se todos os administradores esquecerem a senha

O responsável técnico, com acesso autorizado ao computador/servidor e ao banco, pode executar no diretório backend:

```powershell
npm run admin:recuperar
```

O programa pede o e-mail de um administrador ativo, a nova senha temporária e sua confirmação. A digitação da senha não é exibida nem passada como argumento do comando. Não cria contas, não promove usuários, não reativa contas e não altera o limite de administradores. Encerra as sessões anteriores e exige a troca da senha no login.

Esse procedimento é administrativo local, não é uma rota pública. Exige confiança no responsável e proteção das credenciais do banco. Não foi executado sobre uma conta real durante o desenvolvimento. Se não houver administrador ativo, é necessário corrigir a situação por suporte técnico autorizado; o script não contorna a inativação.

## Arquivos e funções

- `login.html`: link de recuperação.
- `recuperarSenha.html` e `js/recuperarSenha.js`: formulário público, envio do e-mail e orientação.
- `src/repositories/recuperacao.js`: `solicitar` cria somente pedidos elegíveis; `listar` consulta a fila; `concluir` atende ou encerra atomicamente.
- `src/app.js`: `POST /api/auth/recuperacao`, `GET /api/recuperacoes`, `POST /api/recuperacoes/:id/concluir`, limitação de envios e autorização.
- `usuarios.html` e `js/usuarios.js`: fila, verificação e uso do formulário de senha temporária.
- `database/010_recuperacao_assistida.sql`: fila, unicidade de pedidos pendentes e registro dos atendimentos. Aplicar com `npm run db:migrate`.
- `scripts/recuperar-admin.js`: recuperação local de emergência de administrador ativo.

## Validação

A suíte com PostgreSQL testa resposta genérica, duplicação, limite por IP, autorização, confirmação de identidade, concorrência, revogação de sessões, senha antiga inválida, troca obrigatória, encerramento sem atendimento e bloqueio de conta inativa. Os formulários públicos e administrativos têm testes com DOM simulado; a aparência não foi inspecionada em navegador.

Referência de segurança: [OWASP — Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). O projeto usa atendimento assistido, sem tokens ou envio de e-mail.

## Diagnóstico da troca de senha temporária (08/11/2026)

A tela Alterar senha agora mostra o e-mail da conta conectada, diferencia a senha usada para entrar da nova senha, oferece Mostrar senhas e permite sair para entrar novamente. O salvamento aguarda a consulta da sessão e impede envios simultâneos. O ID da conta exibida acompanha o pedido; se a sessão tiver mudado para outra conta, a API recusa a alteração com uma mensagem específica.

Após confirmação de sucesso pela API, a tela segue diretamente para a área do perfil. Não depende de uma segunda consulta para apresentar sucesso. Em falhas de rede, orienta testar o login com a nova senha antes de repetir a troca, pois a gravação pode já ter ocorrido.

A senha atual continua obrigatória e é comparada com o hash armazenado. Não removemos espaços nem alteramos caracteres das senhas. Testes cobrem professor e coordenador, criação, redefinição, caracteres especiais/espaços, senha antiga recusada, conta diferente e prevenção de envio duplicado. O erro relatado em uso manual não foi reproduzido nos testes; essas melhorias não estabelecem sua causa.
