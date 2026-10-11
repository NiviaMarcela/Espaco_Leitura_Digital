import { erroHttp } from "./http.js";

// Atalhos para as situações de domínio já usadas pelas rotas, serviços e repositórios.
export const erroValidacao = mensagem => erroHttp(400, mensagem);
export const erroNaoEncontrado = mensagem => erroHttp(404, mensagem);
export const erroConflito = mensagem => erroHttp(409, mensagem);
