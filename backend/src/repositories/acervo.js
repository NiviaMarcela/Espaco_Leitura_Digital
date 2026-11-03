import { erroHttp } from "../validation.js";

// O banco usa snake_case; a resposta mantém os nomes usados no frontend atual.
export function criarRepositorioAcervo(banco, centroId = null) {
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
        LEFT JOIN exemplares e ON e.livro_id = l.id AND ($1::integer IS NULL OR e.centro_id=$1)
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
        if (centroId !== null && dados.centroId !== centroId) throw erroHttp(403, 'Use o seu centro.');
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
                const resultado = await conexao.query('SELECT livro_id, status FROM exemplares WHERE id=$1 AND ($2::integer IS NULL OR centro_id=$2) FOR UPDATE', [id, centroId]);
                const exemplar = resultado.rows[0];
                if (!exemplar) throw erroHttp(404, 'Exemplar não encontrado.');
                if (exemplar.status === 'Baixado') throw erroHttp(409, 'Este exemplar já recebeu baixa.');
                if (['Emprestado', 'Reservado'].includes(exemplar.status)) {
                    throw erroHttp(409, 'Encerre o empréstimo ou a reserva antes de dar baixa neste exemplar.');
                }
                await conexao.query(`UPDATE exemplares SET status='Baixado', baixa_motivo=$2,
                    baixa_observacao=$3, baixa_em=now() WHERE id=$1`, [id, dados.motivo, dados.observacao]);
                return criarRepositorioAcervo(conexao, centroId).buscarLivro(exemplar.livro_id);
            });
        },
        async criarLivro(dados, exemplares) {
            return transacao(async conexao => {
                const resultado = await conexao.query(`INSERT INTO livros
                    (titulo, autor, isbn, editora, ano, categoria, faixa_etaria, capa_url, sinopse)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, valoresObra(dados));
                const id = resultado.rows[0].id;
                await inserirExemplares(conexao, id, exemplares);
                return criarRepositorioAcervo(conexao, centroId).buscarLivro(id);
            });
        },
        async editarLivro(id, dados) {
            return transacao(async conexao => {
                if (centroId !== null) {
                    await conexao.query('SELECT id FROM livros WHERE id=$1 FOR UPDATE', [id]);
                    const copia = await conexao.query('SELECT id FROM exemplares WHERE livro_id=$1 AND centro_id=$2 LIMIT 1', [id, centroId]);
                    if (!copia.rowCount) throw erroHttp(404, 'Livro não encontrado no seu Centro.');
                    const compartilhada = await conexao.query('SELECT id FROM exemplares WHERE livro_id=$1 AND centro_id<>$2 LIMIT 1', [id, centroId]);
                    if (compartilhada.rowCount) {
                        // Se a obra é compartilhada, a edição cria uma descrição própria para este Centro.
                        const nova = await conexao.query(`INSERT INTO livros(titulo,autor,isbn,editora,ano,categoria,faixa_etaria,capa_url,sinopse)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, valoresObra(dados));
                        await conexao.query('UPDATE exemplares SET livro_id=$3 WHERE livro_id=$1 AND centro_id=$2', [id, centroId, nova.rows[0].id]);
                        return criarRepositorioAcervo(conexao, centroId).buscarLivro(nova.rows[0].id);
                    }
                }
                const resultado = await conexao.query(`UPDATE livros SET
                    titulo=$1, autor=$2, isbn=$3, editora=$4, ano=$5, categoria=$6,
                    faixa_etaria=$7, capa_url=$8, sinopse=$9 WHERE id=$10 RETURNING id`,
                    [...valoresObra(dados), id]);
                if (!resultado.rowCount) throw erroHttp(404, "Livro não encontrado.");
                return criarRepositorioAcervo(conexao, centroId).buscarLivro(id);
            });
        },
        async adicionarExemplares(id, dados) {
            return transacao(async conexao => {
                const livro = await conexao.query("SELECT id FROM livros WHERE id=$1 FOR UPDATE", [id]);
                if (!livro.rowCount) throw erroHttp(404, "Livro não encontrado.");
                if (centroId !== null) {
                    const pertence = await conexao.query('SELECT id FROM exemplares WHERE livro_id=$1 AND centro_id=$2 LIMIT 1', [id, centroId]);
                    if (!pertence.rowCount) throw erroHttp(404, 'Livro não encontrado no seu Centro.');
                }
                await inserirExemplares(conexao, id, dados);
                return criarRepositorioAcervo(conexao, centroId).buscarLivro(id);
            });
        },
        async listarLivros() {
            const resultado = await banco.query(`${consultaLivros} WHERE ($1::integer IS NULL OR e.id IS NOT NULL) GROUP BY l.id ORDER BY l.id`, [centroId]);
            return resultado.rows;
        },
        async listarDestaques() {
            const resultado = await banco.query(`SELECT id, titulo, autor, categoria,
                capa_url AS "capaUrl", sinopse FROM livros ORDER BY id DESC LIMIT 12`);
            return resultado.rows;
        },
        async buscarLivro(id) {
            // $1 recebe o valor separadamente do SQL, evitando concatenar entrada do usuário.
            const resultado = await banco.query(
                `${consultaLivros} WHERE l.id = $2 AND ($1::integer IS NULL OR e.id IS NOT NULL) GROUP BY l.id`, [centroId, id]
            );
            return resultado.rows[0] ?? null;
        },
        async listarCentros() {
            const resultado = await banco.query("SELECT id, nome FROM centros WHERE ($1::integer IS NULL OR id=$1) ORDER BY nome", [centroId]);
            return resultado.rows;
        }
    };
}
