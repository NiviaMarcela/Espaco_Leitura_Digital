import { criarApp } from "./app.js";
import { criarBanco } from "./settings/database.js";

const porta = Number(process.env.PORT || 3001);
if (!Number.isInteger(porta) || porta < 1 || porta > 65535) {
    throw new Error("PORT deve ser uma porta válida entre 1 e 65535.");
}
const banco = criarBanco();
// Nesta etapa a API é de desenvolvimento e atende somente neste computador.
const servidor = criarApp(banco).listen(porta, "127.0.0.1", () => {
    console.log(`API disponível em http://127.0.0.1:${porta}/api/health`);
    if (!process.env.DATABASE_URL && !(process.env.PGDATABASE && process.env.PGUSER)) {
        console.log("Configure backend/.env para habilitar as consultas ao PostgreSQL.");
    }
});
servidor.on("error", async erro => {
    console.error("Não foi possível iniciar a API:", erro.code);
    await banco.end();
    process.exitCode = 1;
});
for (const sinal of ["SIGINT", "SIGTERM"]) {
    process.once(sinal, () => servidor.close(async () => {
        await banco.end();
    }));
}
