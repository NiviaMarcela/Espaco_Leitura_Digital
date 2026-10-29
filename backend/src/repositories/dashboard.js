import { hojeCivil } from '../../../js/datas.mjs';

export function criarRepositorioDashboard(banco, hoje = hojeCivil) {
    return {
        async consultar() {
            // Uma consulta mantém os cards e a lista na mesma fotografia dos dados.
            // O dia vem do relógio de Fortaleza, como no módulo de empréstimos.
            const { rows } = await banco.query(`SELECT
                (SELECT count(*)::integer FROM livros) AS "totalLivros",
                (SELECT count(*)::integer FROM leitores WHERE status='Ativo') AS "leitoresAtivos",
                (SELECT count(*)::integer FROM exemplares e WHERE e.status='Disponível'
                    AND NOT EXISTS (SELECT 1 FROM emprestimos p WHERE p.exemplar_id=e.id AND p.data_devolucao IS NULL)) AS "exemplaresDisponiveis",
                (SELECT count(*)::integer FROM emprestimos WHERE data_devolucao IS NULL) AS "emprestimosAbertos",
                (SELECT count(*)::integer FROM emprestimos WHERE data_devolucao IS NULL
                    AND data_prevista_devolucao < $1::date) AS "emprestimosAtrasados",
                COALESCE((SELECT jsonb_agg(recentes ORDER BY recentes."dataEmprestimo" DESC, recentes.id DESC) FROM (
                    SELECT p.id, l.nome AS leitor, b.titulo AS livro, e.codigo, c.nome AS centro,
                        to_char(p.data_emprestimo, 'YYYY-MM-DD') AS "dataEmprestimo",
                        to_char(p.data_prevista_devolucao, 'YYYY-MM-DD') AS "dataPrevistaDevolucao",
                        CASE WHEN p.data_devolucao IS NOT NULL THEN 'Devolvido'
                            WHEN p.data_prevista_devolucao < $1::date THEN 'Atrasado'
                            ELSE 'Emprestado' END AS status
                    FROM emprestimos p JOIN leitores l ON l.id=p.leitor_id
                    JOIN exemplares e ON e.id=p.exemplar_id JOIN livros b ON b.id=e.livro_id
                    JOIN centros c ON c.id=e.centro_id
                    ORDER BY p.data_emprestimo DESC, p.id DESC LIMIT 5
                ) recentes), '[]'::jsonb) AS recentes`, [hoje()]);
            return rows[0];
        }
    };
}
