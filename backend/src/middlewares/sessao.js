import { criarRepositorioAcervo } from '../repositories/acervo.js';
import { criarRepositorioCategorias } from '../repositories/categorias.js';
import { criarRepositorioLeitores } from '../repositories/leitores.js';
import { criarRepositorioEmprestimos } from '../repositories/emprestimos.js';
import { criarRepositorioDashboard } from '../repositories/dashboard.js';

export const COOKIE_SESSAO = 'espaco_sessao';
export const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60;

export function tokenDaRequisicao(req) {
    const cookie = req.headers.cookie?.split(';').map(parte => parte.trim())
        .find(parte => parte.startsWith(`${COOKIE_SESSAO}=`));
    return cookie?.slice(COOKIE_SESSAO.length + 1);
}

export function cookieSessao(token, maxAge = DURACAO_SESSAO_SEGUNDOS) {
    return `${COOKIE_SESSAO}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function criarGuardas({ banco, autenticacao }) {
    async function carregarSessao(req) {
        if (!Object.hasOwn(req, 'usuario')) {
            req.tokenSessao = tokenDaRequisicao(req);
            req.usuario = await autenticacao.autenticar(req.tokenSessao);
        }
        return req.usuario;
    }

    function exigirPerfil(...perfis) {
        return async (req, res, next) => {
            try {
                const usuario = await carregarSessao(req);
                if (!usuario) return res.status(401).json({ erro: 'Faça login para continuar.' });
                if (usuario.trocarSenha && req.path !== '/api/auth/change-password') {
                    return res.status(403).json({ erro: 'Altere sua senha temporária antes de continuar.', trocarSenha: true });
                }
                if (!perfis.includes(usuario.perfil)) {
                    return res.status(403).json({ erro: 'Você não tem permissão para esta operação.' });
                }
                if (usuario.perfil !== 'admin' && !Number.isInteger(usuario.centroId)) {
                    return res.status(403).json({ erro: 'Conta sem Centro válido. Procure o administrador.' });
                }
                const centroId = usuario.perfil === 'admin' ? null : usuario.centroId;
                // Escopo por requisição: nunca compartilhar repositórios de um Centro com outro.
                req.repos = {
                    acervo: criarRepositorioAcervo(banco, centroId),
                    categorias: criarRepositorioCategorias(banco, centroId),
                    leitores: criarRepositorioLeitores(banco, centroId),
                    emprestimos: criarRepositorioEmprestimos(banco, undefined, centroId),
                    dashboard: criarRepositorioDashboard(banco, undefined, centroId)
                };
                next();
            } catch (erro) { next(erro); }
        };
    }

    return {
        carregarSessao,
        exigirPerfil,
        exigirResponsavel: exigirPerfil('admin', 'coordenador'),
        exigirGestao: exigirPerfil('admin', 'coordenador', 'professor', 'funcionario'),
        exigirConta: exigirPerfil('admin', 'coordenador', 'professor', 'funcionario', 'leitor')
    };
}
