import { erroHttp } from '../validation.js';
import { calcularIdade } from '../../../js/datas.mjs';

const consulta = `SELECT l.id, l.nome, l.tipo, l.matricula_codigo AS "matriculaCodigo",
    l.turma, to_char(l.data_nascimento, 'YYYY-MM-DD') AS "dataNascimento",
    l.telefone, l.email, l.centro_id AS "centroId", c.nome AS centro,
    l.status, l.data_cadastro AS "dataCadastro",
    EXISTS (SELECT 1 FROM usuarios u WHERE u.leitor_id=l.id) AS "temAcesso"
    FROM leitores l JOIN centros c ON c.id = l.centro_id`;

export function criarRepositorioLeitores(banco) {
    // Idade é derivada a cada consulta; não armazenamos um número que envelhece.
    const comIdade = leitor => leitor ? { ...leitor, idade: calcularIdade(leitor.dataNascimento) } : null;
    async function buscar(id) {
        const { rows } = await banco.query(`${consulta} WHERE l.id = $1`, [id]);
        return comIdade(rows[0]);
    }
    async function salvar(dados, id = null) {
        const valores = [dados.nome, dados.tipo, dados.matriculaCodigo, dados.turma,
            dados.dataNascimento, dados.telefone, dados.email, dados.centroId, dados.status];
        const conexao = await banco.connect();
        try {
            await conexao.query('BEGIN');
            const resultado = id === null
                ? await conexao.query(`INSERT INTO leitores (nome, tipo, matricula_codigo, turma,
                    data_nascimento, telefone, email, centro_id, status)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, valores)
                : await conexao.query(`UPDATE leitores SET nome=$1, tipo=$2, matricula_codigo=$3,
                    turma=$4, data_nascimento=$5, telefone=$6, email=$7, centro_id=$8, status=$9
                    WHERE id=$10 RETURNING id`, [...valores, id]);
            if (!resultado.rowCount) throw erroHttp(404, 'Leitor não encontrado.');
            if (id !== null) {
                const conta = await conexao.query('SELECT id FROM usuarios WHERE leitor_id=$1 FOR UPDATE', [id]);
                if (conta.rowCount) {
                    if (!dados.email) throw erroHttp(409, 'Um e-mail é obrigatório enquanto o leitor tiver acesso ao sistema.');
                    await conexao.query('UPDATE usuarios SET email=$2 WHERE leitor_id=$1', [id, dados.email.toLowerCase()]);
                }
            }
            await conexao.query('COMMIT');
            return buscar(resultado.rows[0].id);
        } catch (erro) {
            await conexao.query('ROLLBACK').catch(() => {});
            if (erro.code === '23505' && erro.constraint === 'leitores_matricula_centro_unica') {
                throw erroHttp(409, 'Esta matrícula/código já está cadastrada neste Centro.');
            }
            if (erro.code === '23505' && erro.constraint === 'usuarios_email_unico') {
                throw erroHttp(409, 'Este e-mail já está associado a outra conta.');
            }
            if (erro.code === '23503') throw erroHttp(400, 'Centro não encontrado.');
            throw erro;
        } finally { conexao.release(); }
    }
    return {
        buscar, salvar,
        async listar() {
            const { rows } = await banco.query(`${consulta} ORDER BY l.nome, l.id`);
            return rows.map(comIdade);
        }
    };
}
