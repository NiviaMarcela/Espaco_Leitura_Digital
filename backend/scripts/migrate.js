import { readFile } from "node:fs/promises";
import { criarBanco } from "../src/database.js";

const banco = criarBanco();
let conexao;
try {
    conexao = await banco.connect();
    await conexao.query("BEGIN");
    // Impede dois processos de aplicar a mesma migração simultaneamente.
    await conexao.query("SELECT pg_advisory_xact_lock(20261004)");
    await conexao.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        nome text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now()
    )`);
    let total = 0;
    for (const nome of ["001_acervo.sql", "002_leitores.sql", "003_baixa_exemplares.sql", "004_emprestimos.sql", "005_devolucoes.sql", "006_usuarios.sql", "007_leitores_reservas.sql"]) {
        const aplicada = await conexao.query("SELECT nome FROM schema_migrations WHERE nome = $1", [nome]);
        if (aplicada.rowCount === 0) {
            const sql = await readFile(new URL(`../database/${nome}`, import.meta.url), "utf8");
            await conexao.query(sql);
            await conexao.query("INSERT INTO schema_migrations(nome) VALUES ($1)", [nome]);
            total++;
        }
    }
    await conexao.query("COMMIT");
    console.log(total ? `${total} migração(ões) aplicada(s) com sucesso.` : "Banco já atualizado.");
} catch (erro) {
    if (conexao) await conexao.query("ROLLBACK").catch(() => {});
    console.error("Migração não aplicada. Verifique o banco e backend/.env. Código:", erro.code || "SEM_CODIGO");
    process.exitCode = 1;
} finally {
    conexao?.release();
    await banco.end();
}
