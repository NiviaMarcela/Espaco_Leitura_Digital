import { erroHttp, validarCredenciais } from '../validation.js';
import { hashSenha, validarSenha } from './autenticacao.js';

export function criarRepositorioUsuarios(banco, autor = null) {
    async function alterar(id, operacao) {
        if (!Number.isInteger(id) || id < 1) throw erroHttp(400, 'Usuário inválido.');
        const c = await banco.connect();
        try {
            await c.query('BEGIN');
            await c.query('SELECT pg_advisory_xact_lock(20261102)');
            const responsavel = autor ? (await c.query('SELECT id,perfil,centro_id,ativo FROM usuarios WHERE id=$1', [autor.id])).rows[0] : null;
            if (autor && (!responsavel?.ativo || !['admin','coordenador'].includes(responsavel.perfil))) throw erroHttp(403, 'Sua conta não permite gerenciar usuários.');
            const usuario = (await c.query('SELECT * FROM usuarios WHERE id=$1', [id])).rows[0];
            if (!usuario) throw erroHttp(404, 'Usuário não encontrado.');
            if (responsavel?.perfil === 'coordenador' && (!Number.isInteger(responsavel.centro_id) || usuario.centro_id !== responsavel.centro_id || !['coordenador','professor','funcionario'].includes(usuario.perfil))) throw erroHttp(404, 'Usuário não encontrado no seu Centro.');
            // A circulação e a edição de leitores também bloqueiam primeiro o leitor.
            if (usuario.leitor_id) await c.query('SELECT id FROM leitores WHERE id=$1 FOR UPDATE', [usuario.leitor_id]);
            await c.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE', [id]);
            await operacao(c, usuario, responsavel);
            await c.query('DELETE FROM sessoes WHERE usuario_id=$1', [id]);
            await c.query('COMMIT');
            return { id, sucesso: true };
        } catch (erro) {
            await c.query('ROLLBACK').catch(() => {});
            if (erro.code === '23505') throw erroHttp(409, 'Este e-mail ou matrícula já está em uso.');
            if (erro.code === '23503') throw erroHttp(400, 'Centro não encontrado.');
            throw erro;
        } finally { c.release(); }
    }
    return {
        async editar(id, dados) {
            const { email } = validarCredenciais({ email: dados?.email, senha: 'validacao' });
            if (typeof dados?.nome !== 'string' || !dados.nome.trim() || dados.nome.trim().length > 200) throw erroHttp(400, 'Informe um nome de até 200 caracteres.');
            return alterar(id, async (c, u, responsavel) => {
                if (responsavel?.perfil === 'coordenador' && dados.centroId !== responsavel.centro_id) throw erroHttp(403, 'Mantenha o usuário no seu Centro.');
                if (dados.perfil !== undefined && dados.perfil !== u.perfil) throw erroHttp(400, 'A edição mantém o perfil de acesso atual.');
                if (dados.leitorId !== undefined && dados.leitorId !== u.leitor_id) throw erroHttp(400, 'Não é permitido trocar o vínculo pessoal da conta.');
                if (u.perfil !== 'admin') {
                    if (!Number.isInteger(dados.centroId) || dados.centroId < 1) throw erroHttp(400, 'Selecione o Centro do usuário.');
                    if (u.leitor_id) {
                        const leitor = (await c.query('SELECT centro_id FROM leitores WHERE id=$1', [u.leitor_id])).rows[0];
                        if (leitor.centro_id !== dados.centroId) {
                            const pendencias = await c.query("SELECT 1 FROM reservas WHERE leitor_id=$1 AND status='Pendente' UNION ALL SELECT 1 FROM emprestimos WHERE leitor_id=$1 AND data_devolucao IS NULL LIMIT 1", [u.leitor_id]);
                            if (pendencias.rowCount) throw erroHttp(409, 'Encerre reservas e empréstimos antes de mudar o Centro.');
                        }
                        await c.query('UPDATE leitores SET centro_id=$2 WHERE id=$1', [u.leitor_id, dados.centroId]);
                    }
                }
                if (u.leitor_id) await c.query('UPDATE leitores SET nome=$2,email=$3 WHERE id=$1', [u.leitor_id,dados.nome.trim(),email]);
                await c.query('UPDATE usuarios SET nome=$2,email=$3,centro_id=$4 WHERE id=$1',
                    [id,dados.nome.trim(),email,['coordenador','professor','funcionario'].includes(u.perfil)?dados.centroId:null]);
            });
        },
        async definirAtivo(id, ativo, autorId) {
            if (typeof ativo !== 'boolean') throw erroHttp(400, 'Informe a situação do usuário.');
            if (id === autorId && !ativo) throw erroHttp(409, 'Você não pode inativar sua própria conta.');
            return alterar(id, async (c, u) => {
                if (!ativo && u.perfil === 'admin' && u.ativo) {
                    const outros = await c.query("SELECT id FROM usuarios WHERE perfil='admin' AND ativo=true AND id<>$1", [id]);
                    if (!outros.rowCount) throw erroHttp(409, 'Mantenha pelo menos um administrador ativo.');
                }
                await c.query('UPDATE usuarios SET ativo=$2 WHERE id=$1',[id,ativo]);
            });
        },
        async redefinirSenha(id, senha) {
            const senhaHash = await hashSenha(validarSenha(senha, 'Senha temporária'));
            return alterar(id, async c => {
                await c.query('UPDATE usuarios SET senha_hash=$2,trocar_senha=true WHERE id=$1',[id,senhaHash]);
            });
        },
        async listar(autor = null) {
            const centro = autor?.perfil === 'coordenador' ? autor.centroId : null;
            if (autor?.perfil === 'coordenador' && !Number.isInteger(centro)) throw erroHttp(403, 'Conta sem Centro válido.');
            return (await banco.query(`SELECT u.id, COALESCE(u.nome,l.nome,'Administrador') AS nome,
                u.email, u.perfil, u.ativo, u.leitor_id AS "leitorId", COALESCE(u.centro_id,l.centro_id) AS "centroId", c.nome AS centro
                FROM usuarios u LEFT JOIN leitores l ON l.id=u.leitor_id
                LEFT JOIN centros c ON c.id=COALESCE(u.centro_id,l.centro_id) WHERE ($1::integer IS NULL OR (u.centro_id=$1 AND u.perfil IN ('coordenador','professor','funcionario'))) ORDER BY u.id`, [centro])).rows;
        },
        async criar(dados, autor = null) {
            if (autor?.perfil === 'coordenador' && (!['coordenador','professor','funcionario'].includes(dados?.perfil) || !Number.isInteger(autor.centroId) || dados.centroId !== autor.centroId)) throw erroHttp(403, 'Cadastre coordenadores, professores ou funcionários somente no seu Centro.');
            const { email, senha } = validarCredenciais(dados);
            validarSenha(senha);
            if (!['admin','coordenador','professor','funcionario','leitor'].includes(dados.perfil)) throw erroHttp(400, 'Perfil inválido.');
            if (typeof dados.nome !== 'string' || !dados.nome.trim() || dados.nome.trim().length > 200) throw erroHttp(400, 'Informe um nome de até 200 caracteres.');
            if (['coordenador','professor','funcionario'].includes(dados.perfil) && (!Number.isInteger(dados.centroId) || dados.centroId < 1)) throw erroHttp(400, 'Selecione o Centro do usuário.');
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
                    ['coordenador','professor','funcionario'].includes(dados.perfil) ? dados.centroId : null,
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
