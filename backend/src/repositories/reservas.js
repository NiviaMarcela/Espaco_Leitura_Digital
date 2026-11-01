import { erroHttp } from '../validation.js';
import { hojeCivil, somarDias } from '../../../js/datas.mjs';
import { PRAZO_DIAS, LIMITE_EXEMPLARES } from './emprestimos.js';

// Todas as alterações bloqueiam primeiro o leitor e depois o exemplar,
// como o empréstimo direto. Duas pessoas não conseguem reservar a mesma cópia.
export function criarRepositorioReservas(banco, usuario, hoje = hojeCivil) {
    const centroId = usuario.perfil === 'Administrador' ? null : usuario.centroId;
    const leitorId = usuario.perfil === 'Leitor' ? usuario.leitorId : null;
    async function transacao(operacao) {
        const c = await banco.connect();
        try {
            await c.query('BEGIN');
            const r = await operacao(c);
            await c.query('COMMIT');
            return r;
        } catch (erro) {
            await c.query('ROLLBACK').catch(() => {});
            if (erro.code === '23505') throw erroHttp(409, 'Este exemplar já está reservado ou emprestado.');
            throw erro;
        } finally { c.release(); }
    }
    async function quantidade(c, id, centro) {
        const { rows } = await c.query(`SELECT
            (SELECT count(*) FROM emprestimos p JOIN exemplares e ON e.id=p.exemplar_id
              WHERE p.leitor_id=$1 AND p.data_devolucao IS NULL AND e.centro_id=$2) +
            (SELECT count(*) FROM reservas WHERE leitor_id=$1 AND status='Pendente') AS total`, [id,centro]);
        return Number(rows[0].total);
    }
    return {
        async listar() {
            return (await banco.query(`SELECT r.id, r.status, r.criada_em AS "criadaEm", r.emprestimo_id AS "emprestimoId",
                l.nome AS leitor, b.titulo AS livro, e.codigo, c.nome AS centro
                FROM reservas r JOIN leitores l ON l.id=r.leitor_id JOIN exemplares e ON e.id=r.exemplar_id
                JOIN livros b ON b.id=e.livro_id JOIN centros c ON c.id=e.centro_id
                WHERE ($1::integer IS NULL OR e.centro_id=$1) AND ($2::integer IS NULL OR r.leitor_id=$2)
                ORDER BY (r.status='Pendente') DESC,r.id DESC`, [centroId,leitorId])).rows;
        },
        async criar(exemplarId) {
            if (!leitorId) throw erroHttp(403, 'Entre com uma conta de leitor para reservar.');
            return transacao(async c => {
                const l = (await c.query('SELECT status,centro_id FROM leitores WHERE id=$1 FOR UPDATE', [leitorId])).rows[0];
                if (l?.status !== 'Ativo') throw erroHttp(409, 'O cadastro do leitor deve estar ativo.');
                const e = (await c.query('SELECT status,centro_id FROM exemplares WHERE id=$1 FOR UPDATE', [exemplarId])).rows[0];
                if (!e || e.centro_id !== l.centro_id) throw erroHttp(403, 'Reserve apenas exemplares do seu centro.');
                if (e.status !== 'Disponível') throw erroHttp(409, 'Este exemplar não está mais disponível. Atualize o catálogo.');
                if (await quantidade(c,leitorId,l.centro_id) >= LIMITE_EXEMPLARES) throw erroHttp(409, 'Limite de 10 empréstimos e reservas pendentes atingido.');
                const r = (await c.query('INSERT INTO reservas(leitor_id,exemplar_id) VALUES ($1,$2) RETURNING id', [leitorId,exemplarId])).rows[0];
                await c.query("UPDATE exemplares SET status='Reservado' WHERE id=$1", [exemplarId]);
                return { ...r, mensagem: 'Reserva realizada. Aguarde a confirmação da retirada no seu centro.' };
            });
        },
        async encerrar(id, retirar) {
            if (retirar && leitorId) throw erroHttp(403, 'Somente a gestão pode confirmar a retirada.');
            return transacao(async c => {
                const antes = (await c.query(`SELECT r.leitor_id,r.exemplar_id FROM reservas r JOIN exemplares e ON e.id=r.exemplar_id
                    WHERE r.id=$1 AND ($2::integer IS NULL OR e.centro_id=$2) AND ($3::integer IS NULL OR r.leitor_id=$3)`, [id,centroId,leitorId])).rows[0];
                if (!antes) throw erroHttp(404, 'Reserva não encontrada.');
                const l = (await c.query('SELECT status,centro_id FROM leitores WHERE id=$1 FOR UPDATE', [antes.leitor_id])).rows[0];
                const e = (await c.query('SELECT status,centro_id FROM exemplares WHERE id=$1 FOR UPDATE', [antes.exemplar_id])).rows[0];
                const r = (await c.query('SELECT status FROM reservas WHERE id=$1 FOR UPDATE', [id])).rows[0];
                if (r.status !== 'Pendente' || e.status !== 'Reservado') throw erroHttp(409, 'Esta reserva já foi encerrada. Atualize a lista.');
                let emprestimoId = null;
                if (retirar) {
                    if (l.status !== 'Ativo' || l.centro_id !== e.centro_id) throw erroHttp(409, 'Confira a situação e o centro do leitor antes da retirada.');
                    if (await quantidade(c,antes.leitor_id,e.centro_id) > LIMITE_EXEMPLARES) throw erroHttp(409, 'Limite de exemplares atingido.');
                    const data = hoje();
                    emprestimoId = (await c.query(`INSERT INTO emprestimos(leitor_id,exemplar_id,data_emprestimo,data_prevista_devolucao)
                        VALUES ($1,$2,$3,$4) RETURNING id`, [antes.leitor_id,antes.exemplar_id,data,somarDias(data,PRAZO_DIAS)])).rows[0].id;
                }
                await c.query('UPDATE reservas SET status=$2,encerrada_em=now(),emprestimo_id=$3 WHERE id=$1', [id,retirar?'Retirada':'Cancelada',emprestimoId]);
                await c.query('UPDATE exemplares SET status=$2 WHERE id=$1', [antes.exemplar_id,retirar?'Emprestado':'Disponível']);
                return { mensagem: retirar ? 'Retirada confirmada. Prazo de 30 dias iniciado.' : 'Reserva cancelada. Exemplar liberado.', emprestimoId };
            });
        }
    };
}
