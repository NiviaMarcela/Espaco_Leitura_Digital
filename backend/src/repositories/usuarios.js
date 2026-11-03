import { erroHttp, validarCredenciais } from '../validation.js';
import { hashSenha, validarSenha } from './autenticacao.js';

export function criarRepositorioUsuarios(banco) {
    return {
        async listar() {
            return (await banco.query(`SELECT u.id, COALESCE(u.nome,l.nome,'Administrador') AS nome,
                u.email, u.perfil, u.ativo, COALESCE(u.centro_id,l.centro_id) AS "centroId", c.nome AS centro
                FROM usuarios u LEFT JOIN leitores l ON l.id=u.leitor_id
                LEFT JOIN centros c ON c.id=COALESCE(u.centro_id,l.centro_id) ORDER BY u.id`)).rows;
        },
        async criar(dados) {
            const { email, senha } = validarCredenciais(dados);
            validarSenha(senha);
            if (!['admin','coordenador','leitor'].includes(dados.perfil)) throw erroHttp(400, 'Perfil inválido.');
            if (typeof dados.nome !== 'string' || !dados.nome.trim() || dados.nome.trim().length > 200) throw erroHttp(400, 'Informe um nome de até 200 caracteres.');
            if (dados.perfil === 'coordenador' && (!Number.isInteger(dados.centroId) || dados.centroId < 1)) throw erroHttp(400, 'Selecione o Centro do coordenador.');
            if (dados.perfil === 'leitor' && (!Number.isInteger(dados.leitorId) || dados.leitorId < 1)) throw erroHttp(400, 'Selecione um leitor cadastrado.');
            const senhaHash = await hashSenha(senha);
            const c = await banco.connect();
            try {
                await c.query('BEGIN');
                let vaga = null;
                if (dados.perfil === 'admin') {
                    await c.query('SELECT pg_advisory_xact_lock(20261102)');
                    const livre = await c.query(`SELECT n FROM generate_series(1,4) n
                        WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE vaga_admin=n) ORDER BY n LIMIT 1`);
                    if (!livre.rowCount) throw erroHttp(409, 'O sistema permite no máximo 4 administradores.');
                    vaga = livre.rows[0].n;
                }
                if (dados.perfil === 'leitor') {
                    const leitor = (await c.query('SELECT email, status FROM leitores WHERE id=$1 FOR UPDATE', [dados.leitorId])).rows[0];
                    if (!leitor) throw erroHttp(404, 'Leitor não encontrado.');
                    if (leitor.status !== 'Ativo') throw erroHttp(409, 'Ative o leitor antes de criar o acesso.');
                    if (leitor.email?.toLowerCase() !== email) throw erroHttp(400, 'Use o e-mail do cadastro do leitor.');
                }
                const resultado = await c.query(`INSERT INTO usuarios(nome,email,senha_hash,perfil,centro_id,leitor_id,vaga_admin,trocar_senha)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,true) RETURNING id, nome, email, perfil`,
                [dados.nome.trim(), email, senhaHash, dados.perfil,
                    dados.perfil === 'coordenador' ? dados.centroId : null,
                    dados.perfil === 'leitor' ? dados.leitorId : null, vaga]);
                await c.query('COMMIT');
                return resultado.rows[0];
            } catch (erro) {
                await c.query('ROLLBACK').catch(() => {});
                if (erro.code === '23505') throw erroHttp(409, 'Este e-mail ou leitor já possui uma conta, ou as vagas de administrador foram preenchidas.');
                if (erro.code === '23503') throw erroHttp(400, 'Centro ou leitor não encontrado.');
                throw erro;
            } finally { c.release(); }
        }
    };
}
