import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { erroHttp } from '../validation.js';

const scrypt = promisify(scryptCallback);
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;
const TAMANHO_HASH = 64;
const HASH_DUMMY = `scrypt$16384$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;

export function validarSenha(senha, nome = 'Senha') {
    if (typeof senha !== 'string' || senha.length < 8 || senha.length > 128) {
        throw erroHttp(400, `${nome}: use de 8 a 128 caracteres.`);
    }
    return senha;
}

export async function hashSenha(senha) {
    const salt = randomBytes(16);
    const derivada = await scrypt(senha, salt, TAMANHO_HASH, {
        N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    });
    return `scrypt$16384$8$1$${salt.toString('hex')}$${derivada.toString('hex')}`;
}

async function verificarSenha(senha, armazenada) {
    const [algoritmo, n, r, p, saltHex, hashHex] = String(armazenada).split('$');
    if (algoritmo !== 'scrypt' || n !== '16384' || r !== '8' || p !== '1'
        || !/^[a-f\d]{32}$/i.test(saltHex) || !/^[a-f\d]{128}$/i.test(hashHex)) return false;
    const calculada = await scrypt(senha, Buffer.from(saltHex, 'hex'), TAMANHO_HASH, {
        N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024
    });
    return timingSafeEqual(calculada, Buffer.from(hashHex, 'hex'));
}

const hashToken = token => createHash('sha256').update(token).digest('hex');
const normalizarEmail = email => String(email ?? '').trim().toLowerCase();

export function criarRepositorioAutenticacao(banco) {
    function usuarioPublico(usuario) {
        return {
            id: usuario.id,
            email: usuario.email,
            perfil: usuario.perfil,
            leitorId: usuario.leitor_id ?? null,
            centroId: usuario.centro_id ?? null,
            nome: usuario.nome ?? 'Administrador',
            trocarSenha: usuario.trocar_senha
        };
    }

    async function criarSessao(usuario) {
        const token = randomBytes(32).toString('base64url');
        const expira = new Date(Date.now() + DURACAO_SESSAO_MS);
        await banco.query('INSERT INTO sessoes(usuario_id, token_hash, expira_em) VALUES ($1,$2,$3)',
            [usuario.id, hashToken(token), expira]);
        return { token, usuario: usuarioPublico(usuario), expira };
    }

    return {
        async cadastrarLeitor(dados, senha) {
            validarSenha(senha);
            const email = normalizarEmail(dados.email);
            const senhaHash = await hashSenha(senha);
            const conexao = await banco.connect();
            try {
                await conexao.query('BEGIN');
                const resultado = await conexao.query(`INSERT INTO leitores (nome, tipo, matricula_codigo, turma,
                    data_nascimento, telefone, email, centro_id, status)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Ativo') RETURNING id`,
                [dados.nome, dados.tipo, dados.matriculaCodigo, dados.turma,
                    dados.dataNascimento, dados.telefone, email, dados.centroId]);
                const leitorId = resultado.rows[0].id;
                await conexao.query(`INSERT INTO usuarios(email, senha_hash, perfil, leitor_id, trocar_senha)
                    VALUES ($1,$2,'leitor',$3,false)`, [email, senhaHash, leitorId]);
                await conexao.query('COMMIT');
            } catch (erro) {
                await conexao.query('ROLLBACK').catch(() => {});
                if (erro.code === '23505' && erro.constraint === 'usuarios_email_unico') {
                    throw erroHttp(409, 'Este e-mail já possui uma conta. Entre com sua senha ou use outro e-mail.');
                }
                if (erro.code === '23505' && erro.constraint === 'leitores_matricula_centro_unica') {
                    throw erroHttp(409, 'Esta matrícula/código já está cadastrada neste Centro.');
                }
                if (erro.code === '23503') throw erroHttp(400, 'Centro não encontrado.');
                throw erro;
            } finally {
                conexao.release();
            }
        },

        async inicializarAdministrador(email, senha) {
            const emailNormalizado = normalizarEmail(email);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
                throw erroHttp(400, 'Informe um e-mail válido para o administrador.');
            }
            validarSenha(senha, 'Senha do administrador');
            const existente = await banco.query("SELECT id FROM usuarios WHERE perfil='admin' LIMIT 1");
            if (existente.rowCount) return false;
            const criado = await banco.query(`INSERT INTO usuarios(email, senha_hash, perfil, trocar_senha, vaga_admin)
                VALUES ($1,$2,'admin',false,1) ON CONFLICT DO NOTHING RETURNING id`,
            [emailNormalizado, await hashSenha(senha)]);
            if (criado.rowCount) return true;
            const administrador = await banco.query("SELECT id FROM usuarios WHERE perfil='admin' LIMIT 1");
            if (administrador.rowCount) return false;
            throw erroHttp(409, 'Este e-mail já pertence a outra conta.');
        },

        async entrar(email, senha) {
            const resultado = await banco.query(`SELECT u.id, u.email, u.senha_hash, u.perfil,
                    u.leitor_id, u.trocar_senha, COALESCE(u.nome,l.nome) AS nome,
                    COALESCE(u.centro_id,l.centro_id) AS centro_id
                FROM usuarios u LEFT JOIN leitores l ON l.id=u.leitor_id
                WHERE lower(u.email)=$1 AND u.ativo=true AND (u.perfil IN ('admin','coordenador','professor') OR l.status='Ativo')`,
            [normalizarEmail(email)]);
            const usuario = resultado.rows[0];
            if (!usuario) {
                if (typeof senha === 'string') await verificarSenha(senha, HASH_DUMMY);
                throw erroHttp(401, 'E-mail ou senha inválidos.');
            }
            if (typeof senha !== 'string' || !await verificarSenha(senha, usuario.senha_hash)) {
                throw erroHttp(401, 'E-mail ou senha inválidos.');
            }
            return criarSessao(usuario);
        },

        async autenticar(token) {
            if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
            const resultado = await banco.query(`SELECT u.id, u.email, u.perfil, u.leitor_id,
                    u.trocar_senha, COALESCE(u.nome,l.nome) AS nome,
                    COALESCE(u.centro_id,l.centro_id) AS centro_id
                FROM sessoes s JOIN usuarios u ON u.id=s.usuario_id
                LEFT JOIN leitores l ON l.id=u.leitor_id
                WHERE s.token_hash=$1 AND s.expira_em>now() AND u.ativo=true
                    AND (u.perfil IN ('admin','coordenador','professor') OR l.status='Ativo')`,
            [hashToken(token)]);
            return resultado.rows[0] ? usuarioPublico(resultado.rows[0]) : null;
        },

        async encerrar(token) {
            if (token) await banco.query('DELETE FROM sessoes WHERE token_hash=$1', [hashToken(token)]);
        },

        async alterarSenha(usuarioId, token, senhaAtual, novaSenha) {
            validarSenha(novaSenha, 'Nova senha');
            if (senhaAtual === novaSenha) throw erroHttp(400, 'A nova senha precisa ser diferente da senha atual.');
            const resultado = await banco.query('SELECT senha_hash FROM usuarios WHERE id=$1 AND ativo=true', [usuarioId]);
            if (!resultado.rows[0] || !await verificarSenha(senhaAtual, resultado.rows[0].senha_hash)) {
                throw erroHttp(400, 'A senha atual está incorreta.');
            }
            const atualizada = await banco.query(`UPDATE usuarios SET senha_hash=$2, trocar_senha=false
                WHERE id=$1 RETURNING id`, [usuarioId, await hashSenha(novaSenha)]);
            if (!atualizada.rowCount) throw erroHttp(401, 'Faça login novamente para trocar a senha.');
            await banco.query(`DELETE FROM sessoes WHERE usuario_id=$1 AND token_hash<>$2`,
                [usuarioId, hashToken(token)]);
            return true;
        },

        async definirAcessoLeitor(leitorId, senhaInicial, centroId = null) {
            validarSenha(senhaInicial, 'Senha inicial');
            const resultado = await banco.query(`SELECT id, email, nome, status
                FROM leitores WHERE id=$1 AND ($2::integer IS NULL OR centro_id=$2)`, [leitorId, centroId]);
            const leitor = resultado.rows[0];
            if (!leitor) throw erroHttp(404, 'Leitor não encontrado.');
            if (leitor.status !== 'Ativo') throw erroHttp(409, 'Ative o cadastro do leitor antes de criar o acesso.');
            const email = normalizarEmail(leitor.email);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw erroHttp(400, 'Cadastre um e-mail válido no perfil do leitor antes de criar o acesso.');
            }
            try {
                const acesso = await banco.query(`INSERT INTO usuarios(email, senha_hash, perfil, leitor_id, trocar_senha)
                    VALUES ($1,$2,'leitor',$3,true)
                    ON CONFLICT (leitor_id) DO UPDATE SET email=EXCLUDED.email,
                        senha_hash=EXCLUDED.senha_hash, trocar_senha=true
                    WHERE usuarios.perfil='leitor' RETURNING id`,
                [email, await hashSenha(senhaInicial), leitorId]);
                if (!acesso.rowCount) throw erroHttp(403, 'Não é permitido redefinir senhas da equipe pela gestão de leitores.');
            } catch (erro) {
                if (erro.code === '23505') throw erroHttp(409, 'Este e-mail já está associado a outra conta.');
                throw erro;
            }
            await banco.query('DELETE FROM sessoes WHERE usuario_id=(SELECT id FROM usuarios WHERE leitor_id=$1)', [leitorId]);
        }
    };
}
