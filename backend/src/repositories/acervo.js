import { erroHttp, erroNaoEncontrado, erroConflito } from "../errors/index.js";

// O banco usa snake_case; a resposta mantém os nomes usados no frontend atual.
export function criarRepositorioAcervo(banco) {
    const consultaLivros = `
        SELECT l.id, l.titulo, l.autor, l.isbn, l.editora, l.ano, l.categoria,
               l.faixa_etaria AS "faixaEtaria", l.capa_url AS "capaUrl", l.sinopse,
               COALESCE(
                   jsonb_agg(jsonb_build_object(
                       'id', e.id, 'codigo', e.codigo,
                       'centroId', c.id, 'centro', c.nome,
                       'localizacao', e.localizacao, 'status', e.status,
                       'baixaMotivo', e.baixa_motivo, 'baixaObservacao', e.baixa_observacao, 'baixaEm', e.baixa_em
                   ) ORDER BY e.id) FILTER (WHERE e.id IS NOT NULL),
                   '[]'::jsonb
               ) AS exemplares
        FROM livros l
        LEFT JOIN exemplares e ON e.livro_id = l.id
        LEFT JOIN centros c ON c.id = e.centro_id
    `;

    async function transacao(operacao) {
        const conexao = await banco.connect();
        try {
            await conexao.query("BEGIN");
            const resultado = await operacao(conexao);
            await conexao.query("COMMIT");
            return resultado;
        } catch (erro) {
            await conexao.query("ROLLBACK").catch(() => {});
            throw erro;
        } finally {
            conexao.release();
        }
    }

    async function inserirExemplares(conexao, livroId, dados) {
        const centro = await conexao.query("SELECT id FROM centros WHERE id = $1", [dados.centroId]);
        if (!centro.rowCount) throw erroHttp(400, "Centro não encontrado.");
        await conexao.query(`INSERT INTO exemplares(livro_id, centro_id, localizacao)
            SELECT $1, $2, $3 FROM generate_series(1, $4::integer)`,
            [livroId, dados.centroId, dados.localizacao, dados.quantidade]);
    }

    const valoresObra = d => [d.titulo, d.autor, d.isbn, d.editora, d.ano, d.categoria, d.faixaEtaria, d.capaUrl, d.sinopse];

    return {
        async baixarExemplar(id, dados) {
            return transacao(async conexao => {
                // O bloqueio impede duas baixas simultâneas de sobrescreverem o motivo.
                const resultado = await conexao.query('SELECT livro_id, status FROM exemplares WHERE id=$1 FOR UPDATE', [id]);
                const exemplar = resultado.rows[0];
                if (!exemplar) throw erroNaoEncontrado('Exemplar não encontrado.');
                if (exemplar.status === 'Baixado') throw erroConflito('Este exemplar já recebeu baixa.');
                if (['Emprestado', 'Reservado'].includes(exemplar.status)) {
                    throw erroConflito('Encerre o empréstimo ou a reserva antes de dar baixa neste exemplar.');
                }
                await conexao.query(`UPDATE exemplares SET status='Baixado', baixa_motivo=$2,
                    baixa_observacao=$3, baixa_em=now() WHERE id=$1`, [id, dados.motivo, dados.observacao]);
                return criarRepositorioAcervo(conexao).buscarLivro(exemplar.livro_id);
            });
        },
        async criarLivro(dados, exemplares) {
            return transacao(async conexao => {
                const resultado = await conexao.query(`INSERT INTO livros
                    (titulo, autor, isbn, editora, ano, categoria, faixa_etaria, capa_url, sinopse)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, valoresObra(dados));
                const id = resultado.rows[0].id;
                await inserirExemplares(conexao, id, exemplares);
                return criarRepositorioAcervo(conexao).buscarLivro(id);
            });
        },
        async editarLivro(id, dados) {
            return transacao(async conexao => {
                const resultado = await conexao.query(`UPDATE livros SET
                    titulo=$1, autor=$2, isbn=$3, editora=$4, ano=$5, categoria=$6,
                    faixa_etaria=$7, capa_url=$8, sinopse=$9 WHERE id=$10 RETURNING id`,
                    [...valoresObra(dados), id]);
                if (!resultado.rowCount) throw erroNaoEncontrado("Livro não encontrado.");
                return criarRepositorioAcervo(conexao).buscarLivro(id);
            });
        },
        async adicionarExemplares(id, dados) {
            return transacao(async conexao => {
                const livro = await conexao.query("SELECT id FROM livros WHERE id=$1 FOR UPDATE", [id]);
                if (!livro.rowCount) throw erroNaoEncontrado("Livro não encontrado.");
                await inserirExemplares(conexao, id, dados);
                return criarRepositorioAcervo(conexao).buscarLivro(id);
            });
        },
        async listarLivros() {
            const resultado = await banco.query(`${consultaLivros} GROUP BY l.id ORDER BY l.id`);
            return resultado.rows;
        },
        async buscarLivro(id) {
            // $1 recebe o valor separadamente do SQL, evitando concatenar entrada do usuário.
            const resultado = await banco.query(
                `${consultaLivros} WHERE l.id = $1 GROUP BY l.id`, [id]
            );
            return resultado.rows[0] ?? null;
        },
        async listarCentros() {
            const resultado = await banco.query("SELECT id, nome FROM centros ORDER BY nome");
            return resultado.rows;
        }
    };
}
