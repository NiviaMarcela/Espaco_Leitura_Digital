import { erroNaoEncontrado, erroConflito } from '../errors/index.js';
import { hojeCivil, somarDias } from '../../../js/datas.mjs';

export const PRAZO_DIAS = 15;
export const LIMITE_EXEMPLARES = 5;

const consulta = `SELECT p.id, p.leitor_id AS "leitorId", l.nome AS leitor,
    l.status AS "statusLeitor", l.matricula_codigo AS "matriculaCodigo",
    p.exemplar_id AS "exemplarId", e.codigo, b.titulo AS livro, c.nome AS centro,
    to_char(p.data_emprestimo, 'YYYY-MM-DD') AS "dataEmprestimo",
    to_char(p.data_prevista_devolucao, 'YYYY-MM-DD') AS "dataPrevistaDevolucao",
    to_char(p.data_devolucao, 'YYYY-MM-DD') AS "dataDevolucao", p.observacao, p.versao,
    CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object('condicao', d.condicao,
        'observacao', d.observacao, 'diasAtraso', d.dias_atraso, 'registradoEm', d.registrado_em) END AS devolucao,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('dataAnterior', to_char(r.data_anterior, 'YYYY-MM-DD'),
        'novaData', to_char(r.nova_data, 'YYYY-MM-DD'), 'renovadoEm', r.renovado_em) ORDER BY r.id)
        FROM renovacoes_emprestimo r WHERE r.emprestimo_id=p.id), '[]'::jsonb) AS renovacoes
    FROM emprestimos p JOIN leitores l ON l.id=p.leitor_id
    JOIN exemplares e ON e.id=p.exemplar_id JOIN livros b ON b.id=e.livro_id
    JOIN centros c ON c.id=e.centro_id
    LEFT JOIN devolucoes d ON d.emprestimo_id=p.id`;

// Receber um relógio permite testar viradas de mês e atrasos sem alterar a data do computador.
export function criarRepositorioEmprestimos(banco, hoje = hojeCivil) {
    const comStatus = (item, dataHoje) => item ? { ...item,
        status: item.dataDevolucao ? 'Devolvido' : item.dataPrevistaDevolucao < dataHoje ? 'Atrasado' : 'Emprestado'
    } : null;
    async function buscar(id, conexao = banco, dataHoje = hoje()) {
        const { rows } = await conexao.query(`${consulta} WHERE p.id=$1`, [id]);
        return comStatus(rows[0], dataHoje);
    }
    async function transacao(operacao) {
        const c = await banco.connect();
        try {
            await c.query('BEGIN');
            const resultado = await operacao(c);
            await c.query('COMMIT');
            return resultado;
        } catch (erro) {
            await c.query('ROLLBACK').catch(() => {});
            if (erro.code === '23505' && erro.constraint === 'emprestimos_exemplar_aberto_unico') {
                throw erroConflito('Este exemplar já possui um empréstimo em aberto.');
            }
            throw erro;
        } finally { c.release(); }
    }
    return {
        buscar,
        async devolver(id, dados) {
            return transacao(async c => {
                // Mesma ordem de bloqueios da renovação: empréstimo, leitor e exemplar.
                const p = (await c.query(`SELECT leitor_id, exemplar_id, data_devolucao, versao,
                    to_char(data_emprestimo, 'YYYY-MM-DD') AS retirada FROM emprestimos WHERE id=$1 FOR UPDATE`, [id])).rows[0];
                if (!p) throw erroNaoEncontrado('Empréstimo não encontrado.');
                if (p.data_devolucao) throw erroConflito('A devolução deste empréstimo já foi registrada.');
                if (p.versao !== dados.versao) throw erroConflito('Este empréstimo foi alterado. Atualize os dados antes de devolver.');
                // Leitor inativo também pode devolver. O bloqueio coordena a liberação da vaga.
                await c.query('SELECT id FROM leitores WHERE id=$1 FOR UPDATE', [p.leitor_id]);
                const e = (await c.query('SELECT status FROM exemplares WHERE id=$1 FOR UPDATE', [p.exemplar_id])).rows[0];
                if (e.status !== 'Emprestado') throw erroConflito('A situação do exemplar não corresponde a um empréstimo em aberto.');
                const dataHoje = hoje();
                if (dataHoje < p.retirada) throw erroConflito('A devolução não pode ser anterior à retirada. Verifique a data do servidor.');
                await c.query(`INSERT INTO devolucoes(emprestimo_id, condicao, observacao, dias_atraso)
                    SELECT id, $2, $3, greatest(0, $4::date - data_prevista_devolucao) FROM emprestimos WHERE id=$1`,
                    [id, dados.condicao, dados.observacao, dataHoje]);
                await c.query('UPDATE emprestimos SET data_devolucao=$2, versao=versao+1 WHERE id=$1', [id, dataHoje]);
                await c.query('UPDATE exemplares SET status=$2 WHERE id=$1', [p.exemplar_id, dados.condicao]);
                return buscar(id, c, dataHoje);
            });
        },
        async listar() {
            const dataHoje = hoje();
            return (await banco.query(`${consulta} ORDER BY p.data_devolucao NULLS FIRST, p.data_prevista_devolucao, p.id`)).rows.map(p => comStatus(p, dataHoje));
        },
        async opcoes() {
            const leitores = (await banco.query(`SELECT l.id, l.nome, l.matricula_codigo AS "matriculaCodigo", c.nome AS centro,
                (SELECT count(*)::integer FROM emprestimos p WHERE p.leitor_id=l.id AND p.data_devolucao IS NULL) AS abertos
                FROM leitores l JOIN centros c ON c.id=l.centro_id WHERE l.status='Ativo' ORDER BY l.nome, l.id`)).rows;
            const exemplares = (await banco.query(`SELECT e.id, e.codigo, b.titulo, c.nome AS centro FROM exemplares e
                JOIN livros b ON b.id=e.livro_id JOIN centros c ON c.id=e.centro_id
                WHERE e.status='Disponível' AND NOT EXISTS (SELECT 1 FROM emprestimos p WHERE p.exemplar_id=e.id AND p.data_devolucao IS NULL)
                ORDER BY b.titulo, e.id`)).rows;
            const dataHoje = hoje();
            return { leitores, exemplares, hoje: dataHoje, prazoDias: PRAZO_DIAS, limite: LIMITE_EXEMPLARES,
                dataPrevistaDevolucao: somarDias(dataHoje, PRAZO_DIAS) };
        },
        async criar(dados) {
            return transacao(async c => {
                // Serializa retiradas do mesmo leitor, inclusive de cópias diferentes.
                const leitor = (await c.query('SELECT status FROM leitores WHERE id=$1 FOR UPDATE', [dados.leitorId])).rows[0];
                if (!leitor) throw erroNaoEncontrado('Leitor não encontrado.');
                if (leitor.status !== 'Ativo') throw erroConflito('Somente leitores ativos podem realizar empréstimos.');
                const { rows } = await c.query('SELECT count(*)::integer AS total FROM emprestimos WHERE leitor_id=$1 AND data_devolucao IS NULL', [dados.leitorId]);
                if (rows[0].total >= LIMITE_EXEMPLARES) throw erroConflito('Este leitor já tem 5 exemplares emprestados.');
                const exemplar = (await c.query('SELECT status FROM exemplares WHERE id=$1 FOR UPDATE', [dados.exemplarId])).rows[0];
                if (!exemplar) throw erroNaoEncontrado('Exemplar não encontrado.');
                if (exemplar.status !== 'Disponível') throw erroConflito('Este exemplar não está disponível para empréstimo.');
                const dataHoje = hoje();
                const inserido = await c.query(`INSERT INTO emprestimos(leitor_id, exemplar_id, data_emprestimo, data_prevista_devolucao, observacao)
                    VALUES ($1,$2,$3,$4,$5) RETURNING id`, [dados.leitorId, dados.exemplarId, dataHoje, somarDias(dataHoje, PRAZO_DIAS), dados.observacao]);
                await c.query("UPDATE exemplares SET status='Emprestado' WHERE id=$1", [dados.exemplarId]);
                return buscar(inserido.rows[0].id, c, dataHoje);
            });
        },
        async renovar(id, dados) {
            return transacao(async c => {
                const emprestimo = (await c.query(`SELECT leitor_id, exemplar_id, data_devolucao,
                    to_char(data_prevista_devolucao, 'YYYY-MM-DD') AS prazo, versao FROM emprestimos WHERE id=$1 FOR UPDATE`, [id])).rows[0];
                if (!emprestimo) throw erroNaoEncontrado('Empréstimo não encontrado.');
                if (emprestimo.data_devolucao) throw erroConflito('Este empréstimo já foi encerrado.');
                if (emprestimo.versao !== dados.versao) throw erroConflito('Este empréstimo foi alterado. Atualize a lista antes de renovar.');
                const leitor = (await c.query('SELECT status FROM leitores WHERE id=$1 FOR UPDATE', [emprestimo.leitor_id])).rows[0];
                if (leitor.status !== 'Ativo') throw erroConflito('O leitor está inativo. Regularize o cadastro antes de renovar.');
                const exemplar = (await c.query('SELECT status FROM exemplares WHERE id=$1 FOR UPDATE', [emprestimo.exemplar_id])).rows[0];
                if (exemplar.status !== 'Emprestado') throw erroConflito('A situação do exemplar não permite renovar este empréstimo.');
                const dataHoje = hoje();
                const novaData = somarDias(dataHoje, PRAZO_DIAS);
                if (novaData <= emprestimo.prazo) throw erroConflito('O prazo atual já cobre os próximos 15 dias. Ainda não é necessário renovar.');
                await c.query('INSERT INTO renovacoes_emprestimo(emprestimo_id, data_anterior, nova_data) VALUES ($1,$2,$3)', [id, emprestimo.prazo, novaData]);
                await c.query('UPDATE emprestimos SET data_prevista_devolucao=$2, versao=versao+1 WHERE id=$1', [id, novaData]);
                return buscar(id, c, dataHoje);
            });
        }
    };
}
