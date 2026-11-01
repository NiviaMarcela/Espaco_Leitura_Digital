import { erroHttp } from '../validation.js';
import { calcularIdade } from '../../../js/datas.mjs';

const consulta = `SELECT l.id, l.nome, l.tipo, l.matricula_codigo AS "matriculaCodigo",
    l.turma, to_char(l.data_nascimento, 'YYYY-MM-DD') AS "dataNascimento",
    l.telefone, l.email, l.centro_id AS "centroId", c.nome AS centro,
    l.status, l.data_cadastro AS "dataCadastro"
    FROM leitores l JOIN centros c ON c.id = l.centro_id`;

export function criarRepositorioLeitores(banco, centroId = null) {
    // Idade é derivada a cada consulta; não armazenamos um número que envelhece.
    const comIdade = leitor => leitor ? { ...leitor, idade: calcularIdade(leitor.dataNascimento) } : null;
    async function buscar(id) {
        const { rows } = await banco.query(`${consulta} WHERE l.id = $1 AND ($2::integer IS NULL OR l.centro_id=$2)`, [id,centroId]);
        return comIdade(rows[0]);
    }
    async function salvar(dados, id = null) {
        if (centroId !== null && dados.centroId !== centroId) throw erroHttp(403, 'Use o seu centro.');
        const valores = [dados.nome, dados.tipo, dados.matriculaCodigo, dados.turma,
            dados.dataNascimento, dados.telefone, dados.email, dados.centroId, dados.status];
        let resultado;
        try {
            resultado = id === null
                ? await banco.query(`INSERT INTO leitores (nome, tipo, matricula_codigo, turma,
                    data_nascimento, telefone, email, centro_id, status)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, valores)
                : await banco.query(`UPDATE leitores SET nome=$1, tipo=$2, matricula_codigo=$3,
                    turma=$4, data_nascimento=$5, telefone=$6, email=$7, centro_id=$8, status=$9
                    WHERE id=$10 AND ($11::integer IS NULL OR centro_id=$11) RETURNING id`, [...valores, id, centroId]);
        } catch (erro) {
            if (erro.code === '23505' && erro.constraint === 'leitores_matricula_centro_unica') {
                throw erroHttp(409, 'Esta matrícula/código já está cadastrada neste Centro.');
            }
            if (erro.code === 'P0001') throw erroHttp(409, erro.message);
            if (erro.code === '23503') throw erroHttp(400, 'Centro não encontrado.');
            throw erro;
        }
        if (!resultado.rowCount) throw erroHttp(404, 'Leitor não encontrado.');
        return buscar(resultado.rows[0].id);
    }
    return {
        buscar, salvar,
        async listar() {
            const { rows } = await banco.query(`${consulta} WHERE ($1::integer IS NULL OR l.centro_id=$1) ORDER BY l.nome, l.id`, [centroId]);
            return rows.map(comIdade);
        }
    };
}
