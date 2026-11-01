import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { erroHttp, validarLeitor } from './validation.js';

const derivar = promisify(scrypt);
const parametros = { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
export const hashToken = token => createHash('sha256').update(token).digest('hex');
export function validarSenha(senha) {
    if (typeof senha !== 'string' || senha.length < 8 || senha.length > 128) throw erroHttp(400, 'Use uma senha com 8 a 128 caracteres. Pode ser uma frase.');
    return senha;
}
export async function criarHash(senha) {
    validarSenha(senha);
    const sal = randomBytes(16).toString('hex');
    const hash = await derivar(senha, sal, 64, parametros);
    return `scrypt$${sal}$${hash.toString('hex')}`;
}
export async function conferirSenha(senha, hash) {
    const [, sal, valor] = (hash || '').split('$');
    const valido = /^[a-f0-9]{32}$/.test(sal || '') && /^[a-f0-9]{128}$/.test(valor || '');
    // Mesmo custo para usuário inexistente, sem revelar se o email está cadastrado.
    const obtido = await derivar(senha, valido ? sal : '0'.repeat(32), 64, parametros);
    return timingSafeEqual(obtido, Buffer.from(valido ? valor : '0'.repeat(128), 'hex')) && valido;
}
export function validarUsuario(body, novo = true) {
    const nome = typeof body?.nome === 'string' ? body.nome.trim() : '';
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!nome || nome.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw erroHttp(400, 'Informe nome e email válidos.');
    if (!['Administrador','Coordenador','Leitor'].includes(body.perfil)) throw erroHttp(400, 'Perfil inválido.');
    const centroId = body.perfil === 'Administrador' ? null : body.centroId;
    if (centroId !== null && (!Number.isInteger(centroId) || centroId < 1 || centroId > 2147483647)) throw erroHttp(400, 'Selecione um centro válido.');
    if (body.ativo !== undefined && typeof body.ativo !== 'boolean') throw erroHttp(400, 'Situação inválida.');
    if (novo) validarSenha(body.senha);
    return { nome, email, perfil: body.perfil, centroId, ativo: body.ativo ?? true };
}
const campos = `u.id, u.nome, u.email, u.perfil, COALESCE(l.centro_id,u.centro_id) AS "centroId", u.leitor_id AS "leitorId", u.ativo, c.nome AS centro`;
export function criarAuth(banco) {
    const cookieNome = process.env.NODE_ENV === 'production' ? '__Host-eld_sessao' : 'eld_sessao';
    const cookieOpcoes = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/' };
    function token(req) {
        const valor = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${cookieNome}=`))?.slice(cookieNome.length + 1);
        return /^[a-f0-9]{64}$/.test(valor || '') ? valor : null;
    }
    async function identificar(req) {
        const valor = token(req);
        if (!valor) return null;
        return (await banco.query(`SELECT ${campos} FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
            LEFT JOIN leitores l ON l.id=u.leitor_id LEFT JOIN centros c ON c.id=COALESCE(l.centro_id,u.centro_id) WHERE s.token_hash=$1 AND s.expira_em>now() AND u.ativo AND (u.leitor_id IS NULL OR l.status='Ativo')`, [hashToken(valor)])).rows[0] || null;
    }
    async function limitar(chave, maximo) {
        const { rows } = await banco.query(`INSERT INTO tentativas_login(chave,quantidade) VALUES ($1,1)
            ON CONFLICT (chave) DO UPDATE SET
                quantidade=CASE WHEN tentativas_login.inicio < now()-interval '15 minutes' THEN 1 ELSE tentativas_login.quantidade+1 END,
                inicio=CASE WHEN tentativas_login.inicio < now()-interval '15 minutes' THEN now() ELSE tentativas_login.inicio END
            RETURNING quantidade`, [hashToken(chave)]);
        if (rows[0].quantidade > maximo) throw erroHttp(429, 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.');
    }
    async function transacao(operacao) {
        const c = await banco.connect();
        try {
            await c.query('BEGIN');
            // Serializa mudanças de contas para preservar ao menos um administrador ativo.
            await c.query('SELECT pg_advisory_xact_lock(20261018)');
            const resultado = await operacao(c);
            await c.query('COMMIT');
            return resultado;
        } catch (erro) {
            await c.query('ROLLBACK').catch(() => {});
            if (erro.code === '23505') throw erroHttp(409, 'Este email já está cadastrado.');
            throw erro;
        } finally { c.release(); }
    }
    return {
        identificar, limitar,
        async exigir(req, res, next) {
            req.usuario = await identificar(req);
            if (!req.usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
            next();
        },
        async pagina(req, res, next) {
            req.usuario = await identificar(req);
            res.set('Cache-Control', 'no-store');
            if (!req.usuario) return res.redirect('/login.html');
            next();
        },
        async entrar(req, res) {
            const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
            const senha = req.body?.senha;
            if (!email || email.length > 254 || typeof senha !== 'string' || senha.length > 128 || !senha.length) throw erroHttp(400, 'Informe email e senha.');
            await limitar(`ip:${req.ip}`, 60);
            await limitar(`email:${email}`, 10);
            const u = (await banco.query('SELECT id, senha_hash, ativo, perfil FROM usuarios WHERE email=$1', [email])).rows[0];
            if (!(await conferirSenha(senha, u?.senha_hash)) || !u?.ativo) throw erroHttp(401, 'Email ou senha inválidos.');
            const novo = randomBytes(32).toString('hex');
            await transacao(async c => {
                const atual = (await c.query('SELECT ativo, senha_hash FROM usuarios WHERE id=$1 FOR UPDATE', [u.id])).rows[0];
                if (!atual?.ativo || atual.senha_hash !== u.senha_hash) throw erroHttp(401, 'Email ou senha inválidos.');
                if (token(req)) await c.query('DELETE FROM sessoes WHERE token_hash=$1', [hashToken(token(req))]);
                await c.query("DELETE FROM sessoes WHERE expira_em <= now()");
                await c.query("DELETE FROM tentativas_login WHERE inicio < now()-interval '1 day'");
                await c.query("INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES ($1,$2,now()+interval '8 hours')", [hashToken(novo),u.id]);
            });
            res.cookie(cookieNome, novo, { ...cookieOpcoes, maxAge: 8*60*60*1000 });
            res.json({ mensagem: 'Login realizado.', perfil: u.perfil });
        },
        async sair(req, res) {
            if (token(req)) await banco.query('DELETE FROM sessoes WHERE token_hash=$1', [hashToken(token(req))]);
            res.clearCookie(cookieNome, cookieOpcoes);
            res.json({ mensagem: 'Sessão encerrada.' });
        },
        async listar() {
            return (await banco.query(`SELECT ${campos} FROM usuarios u LEFT JOIN leitores l ON l.id=u.leitor_id LEFT JOIN centros c ON c.id=COALESCE(l.centro_id,u.centro_id) ORDER BY u.nome,u.id`)).rows;
        },
        async criar(body) {
            const d = validarUsuario(body);
            const leitor = d.perfil === 'Leitor' ? validarLeitor({ ...body, tipo: body.tipo || 'Comunidade', status: 'Ativo' }) : null;
            const hash = await criarHash(body.senha);
            return transacao(async c => {
                let leitorId = null;
                if (leitor) {
                    // Cadastro público nunca assume a identidade de um leitor já existente.
                    leitorId = (await c.query(`INSERT INTO leitores(nome,email,tipo,data_nascimento,centro_id,telefone,status)
                        VALUES ($1,$2,$3,$4,$5,$6,'Ativo') RETURNING id`,
                        [d.nome,d.email,leitor.tipo,leitor.dataNascimento,d.centroId,leitor.telefone])).rows[0].id;
                }
                return (await c.query(`INSERT INTO usuarios(nome,email,perfil,centro_id,ativo,senha_hash,leitor_id)
                    VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                    [d.nome,d.email,d.perfil,leitor ? null : d.centroId,d.ativo,hash,leitorId])).rows[0];
            });
        },
        async editar(id, body, ator) {
            const d = validarUsuario(body, false);
            if (id === ator.id && (!d.ativo || d.perfil !== 'Administrador')) throw erroHttp(409, 'Você não pode desativar ou retirar seu próprio perfil de administrador.');
            return transacao(async c => {
                const antes = (await c.query('SELECT perfil,ativo,leitor_id FROM usuarios WHERE id=$1 FOR UPDATE', [id])).rows[0];
                if (!antes) throw erroHttp(404, 'Usuário não encontrado.');
                if ((antes.perfil === 'Leitor') !== (d.perfil === 'Leitor')) throw erroHttp(400, 'Para mudar entre leitor e gestão, crie outra conta. O histórico do leitor será preservado.');
                if (antes.leitor_id) await c.query('UPDATE leitores SET centro_id=$2 WHERE id=$1', [antes.leitor_id,d.centroId]);
                if (antes.perfil === 'Administrador' && antes.ativo && (!d.ativo || d.perfil !== 'Administrador')) {
                    const { rows } = await c.query("SELECT count(*)::int AS total FROM usuarios WHERE perfil='Administrador' AND ativo");
                    if (rows[0].total <= 1) throw erroHttp(409, 'Mantenha pelo menos um administrador ativo.');
                }
                await c.query('UPDATE usuarios SET nome=$2,email=$3,perfil=$4,centro_id=$5,ativo=$6 WHERE id=$1', [id,d.nome,d.email,d.perfil,d.perfil==='Leitor'?null:d.centroId,d.ativo]);
                await c.query('DELETE FROM sessoes WHERE usuario_id=$1', [id]);
                return { mensagem: 'Usuário atualizado. As sessões anteriores foram encerradas.' };
            });
        },
        async trocarSenha(req, res) {
            const { senhaAtual, novaSenha } = req.body || {};
            validarSenha(novaSenha);
            if (typeof senhaAtual !== 'string' || senhaAtual.length > 128) throw erroHttp(400, 'Informe a senha atual.');
            await limitar(`senha:${req.usuario.id}`, 10);
            const antes = (await banco.query('SELECT senha_hash FROM usuarios WHERE id=$1', [req.usuario.id])).rows[0];
            if (!(await conferirSenha(senhaAtual, antes.senha_hash))) throw erroHttp(401, 'Senha atual inválida.');
            const hash = await criarHash(novaSenha);
            await transacao(async c => {
                const r = await c.query('UPDATE usuarios SET senha_hash=$2 WHERE id=$1 AND senha_hash=$3 RETURNING id', [req.usuario.id,hash,antes.senha_hash]);
                if (!r.rowCount) throw erroHttp(409, 'A conta foi alterada. Entre novamente.');
                await c.query('DELETE FROM sessoes WHERE usuario_id=$1', [req.usuario.id]);
            });
            res.clearCookie(cookieNome, cookieOpcoes);
            res.json({ mensagem: 'Senha alterada. Entre novamente.' });
        }
    };
}
export function exigirAdministrador(req, res, next) {
    if (req.usuario?.perfil !== 'Administrador') return res.status(403).json({ erro: 'Esta operação exige perfil de administrador.' });
    next();
}
