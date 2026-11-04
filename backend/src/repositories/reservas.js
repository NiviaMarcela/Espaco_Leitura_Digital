import { erroHttp } from '../validation.js';
import { hojeCivil, somarDias } from '../../../js/datas.mjs';
import { LIMITE_EXEMPLARES, PRAZO_DIAS } from './emprestimos.js';

const consulta = `SELECT r.id, r.leitor_id AS "leitorId", l.nome AS leitor,
    r.exemplar_id AS "exemplarId", e.codigo, b.titulo AS livro, c.nome AS centro,
    r.status, r.criada_em AS "criadaEm", r.encerrada_em AS "encerradaEm",
    r.emprestimo_id AS "emprestimoId"
    FROM reservas r JOIN leitores l ON l.id=r.leitor_id
    JOIN exemplares e ON e.id=r.exemplar_id JOIN livros b ON b.id=e.livro_id
    JOIN centros c ON c.id=e.centro_id`;

export function criarRepositorioReservas(banco, usuario, hoje = hojeCivil) {
    const centroId = usuario.perfil === 'admin' ? null : usuario.centroId;
    const leitorId = usuario.perfil === 'leitor' ? usuario.leitorId : null;
    if (usuario.perfil !== 'admin' && !Number.isInteger(centroId)) throw erroHttp(403, 'Conta sem Centro válido.');
    if (usuario.perfil === 'leitor' && !Number.isInteger(leitorId)) throw erroHttp(403, 'Conta sem leitor válido.');
    const escopo = `($2::integer IS NULL OR e.centro_id=$2) AND ($3::integer IS NULL OR r.leitor_id=$3)`;
    async function buscar(c, id) {
        return (await c.query(`${consulta} WHERE r.id=$1 AND ${escopo}`, [id, centroId, leitorId])).rows[0];
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
            if (erro.code === '23505') throw erroHttp(409, 'Este exemplar já foi reservado ou retirado. Atualize a lista.');
            throw erro;
        } finally { c.release(); }
    }
    async function bloquearReserva(c, id) {
        const visivel = await buscar(c, id);
        if (!visivel) throw erroHttp(404, 'Reserva não encontrada.');
        // Todas as operações usam leitor -> exemplar -> reserva para serializar a circulação.
        const leitor = (await c.query('SELECT status, centro_id FROM leitores WHERE id=$1 FOR UPDATE', [visivel.leitorId])).rows[0];
        const exemplar = (await c.query('SELECT status, centro_id FROM exemplares WHERE id=$1 FOR UPDATE', [visivel.exemplarId])).rows[0];
        const reserva = (await c.query('SELECT status FROM reservas WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (reserva.status !== 'Pendente') throw erroHttp(409, 'Esta reserva já foi encerrada. Atualize a lista.');
        if (exemplar.status !== 'Reservado') throw erroHttp(409, 'A situação do exemplar não corresponde à reserva.');
        if (centroId !== null && exemplar.centro_id !== centroId) throw erroHttp(404, 'Reserva não encontrada.');
        return { ...visivel, leitor, exemplar };
    }
    return {
        async listar() {
            return (await banco.query(`${consulta} WHERE ($1::integer IS NULL OR e.centro_id=$1)
                AND ($2::integer IS NULL OR r.leitor_id=$2)
                ${usuario.perfil === 'leitor' ? '' : "AND r.status='Pendente'"}
                ORDER BY r.criada_em DESC, r.id DESC`, [centroId, leitorId])).rows;
        },
        async criar(exemplarId) {
            if (usuario.perfil !== 'leitor') throw erroHttp(403, 'Reservas são feitas pela conta do leitor.');
            return transacao(async c => {
                const leitor = (await c.query('SELECT status, centro_id FROM leitores WHERE id=$1 FOR UPDATE', [leitorId])).rows[0];
                if (!leitor || leitor.status !== 'Ativo') throw erroHttp(409, 'O leitor precisa estar ativo.');
                const exemplar = (await c.query('SELECT status, centro_id FROM exemplares WHERE id=$1 FOR UPDATE', [exemplarId])).rows[0];
                if (!exemplar || exemplar.centro_id !== leitor.centro_id) throw erroHttp(404, 'Exemplar não encontrado no seu Centro.');
                if (exemplar.status !== 'Disponível') throw erroHttp(409, 'Este exemplar não está disponível.');
                const { rows } = await c.query(`SELECT
                    (SELECT count(*) FROM reservas WHERE leitor_id=$1 AND status='Pendente') +
                    (SELECT count(*) FROM emprestimos WHERE leitor_id=$1 AND data_devolucao IS NULL) AS total`, [leitorId]);
                if (Number(rows[0].total) >= LIMITE_EXEMPLARES) throw erroHttp(409, 'Limite de 10 exemplares entre reservas e empréstimos atingido.');
                const reserva = await c.query('INSERT INTO reservas(leitor_id, exemplar_id) VALUES ($1,$2) RETURNING id', [leitorId, exemplarId]);
                await c.query("UPDATE exemplares SET status='Reservado' WHERE id=$1", [exemplarId]);
                return buscar(c, reserva.rows[0].id);
            });
        },
        async cancelar(id) {
            return transacao(async c => {
                const r = await bloquearReserva(c, id);
                await c.query("UPDATE reservas SET status='Cancelada', encerrada_em=now() WHERE id=$1", [id]);
                await c.query("UPDATE exemplares SET status='Disponível' WHERE id=$1", [r.exemplarId]);
                return buscar(c, id);
            });
        },
        async retirar(id) {
            if (!['admin', 'coordenador'].includes(usuario.perfil)) throw erroHttp(403, 'Somente a gestão confirma a retirada.');
            return transacao(async c => {
                const r = await bloquearReserva(c, id);
                if (r.leitor.status !== 'Ativo') throw erroHttp(409, 'Ative o leitor antes de confirmar a retirada.');
                if (r.leitor.centro_id !== r.exemplar.centro_id) throw erroHttp(409, 'Leitor e exemplar precisam pertencer ao mesmo Centro.');
                const data = hoje();
                const prazo = somarDias(data, PRAZO_DIAS);
                // A reserva já ocupa uma vaga: convertê-la não aumenta o total de 10.
                const p = await c.query(`INSERT INTO emprestimos(leitor_id, exemplar_id, data_emprestimo, data_prevista_devolucao)
                    VALUES ($1,$2,$3,$4) RETURNING id`, [r.leitorId, r.exemplarId, data, prazo]);
                await c.query("UPDATE reservas SET status='Retirada', encerrada_em=now(), emprestimo_id=$2 WHERE id=$1", [id, p.rows[0].id]);
                await c.query("UPDATE exemplares SET status='Emprestado' WHERE id=$1", [r.exemplarId]);
                return { ...await buscar(c, id), dataEmprestimo: data, dataPrevistaDevolucao: prazo };
            });
        }
    };
}
