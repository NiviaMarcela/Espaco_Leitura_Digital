import pg from "pg";

// Pool reutiliza conexões, em vez de abrir uma nova em cada consulta.
export function criarBanco(connectionString = process.env.DATABASE_URL) {
    // Também aceita campos separados, evitando codificar a senha em uma URL.
    const configurado = Boolean(connectionString || (process.env.PGDATABASE && process.env.PGUSER));
    const pool = configurado ? new pg.Pool({
        ...(connectionString ? { connectionString } : {}),
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        max: 5
    }) : null;

    pool?.on("error", () => {
        console.error("Uma conexão ociosa com o PostgreSQL foi interrompida.");
    });

    function verificarConfiguracao() {
        if (!pool) {
            const erro = new Error("Configure DATABASE_URL ou os campos PG no arquivo backend/.env.");
            erro.code = "BANCO_NAO_CONFIGURADO";
            throw erro;
        }
    }

    return {
        query(texto, valores) {
            verificarConfiguracao();
            return pool.query(texto, valores);
        },
        connect() {
            verificarConfiguracao();
            return pool.connect();
        },
        async end() {
            if (pool) await pool.end();
        }
    };
}
