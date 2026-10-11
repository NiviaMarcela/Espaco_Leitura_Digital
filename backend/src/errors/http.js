// Erro com status HTTP: o tratador de erros em app.js converte em resposta JSON.
export function erroHttp(status, mensagem) {
    return Object.assign(new Error(mensagem), { status });
}
