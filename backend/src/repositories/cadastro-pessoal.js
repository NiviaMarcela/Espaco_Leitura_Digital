import { erroHttp } from '../validation.js';

// Vincula os dados de circulação à conta autenticada, sem criar outro login ou trocar o perfil.
export async function completarCadastroPessoal(banco, usuario, dados) {
    const c = await banco.connect();
    try {
        await c.query('BEGIN');
        const conta = (await c.query('SELECT id, leitor_id, email, perfil, centro_id FROM usuarios WHERE id=$1 AND ativo=true FOR UPDATE', [usuario.id])).rows[0];
        if (!conta) throw erroHttp(401, 'Entre novamente para continuar.');
        if (conta.leitor_id) throw erroHttp(409, 'Seu cadastro pessoal já está completo. Atualize a Biblioteca.');
        if (!['admin','coordenador','professor'].includes(conta.perfil)) throw erroHttp(403, 'Seu perfil não permite esta operação.');
        if (conta.perfil !== 'admin' && conta.centro_id !== dados.centroId) throw erroHttp(403, 'Selecione o Centro da sua conta.');
        const leitor = await c.query(`INSERT INTO leitores(nome,tipo,data_nascimento,telefone,email,centro_id,status)
            VALUES ($1,$2,$3,$4,$5,$6,'Ativo') RETURNING id`,
        [dados.nome,dados.tipo,dados.dataNascimento,dados.telefone,conta.email,dados.centroId]);
        await c.query('UPDATE usuarios SET leitor_id=$2 WHERE id=$1', [usuario.id,leitor.rows[0].id]);
        await c.query('COMMIT');
        return leitor.rows[0].id;
    } catch (erro) {
        await c.query('ROLLBACK').catch(() => {});
        if (erro.code === '23503') throw erroHttp(400, 'Centro não encontrado.');
        throw erro;
    } finally { c.release(); }
}
