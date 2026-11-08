import { erroHttp, validarCredenciais } from '../validation.js';
import { hashSenha, validarSenha } from './autenticacao.js';

export const MENSAGEM_RECUPERACAO = 'Se houver uma conta ativa com este e-mail, a solicitação ficará disponível para o administrador. Procure a equipe do seu Centro para confirmar sua identidade. Nenhum e-mail será enviado.';

export function criarRepositorioRecuperacao(banco) {
    return {
        async solicitar(dados) {
            const { email } = validarCredenciais({email:dados?.email,senha:'validacao'});
            // Mesma consulta e resposta para contas existentes, inexistentes ou inativas.
            await banco.query(`INSERT INTO recuperacoes_acesso(usuario_id)
                SELECT id FROM usuarios WHERE lower(email)=$1 AND ativo=true
                ON CONFLICT (usuario_id) WHERE status='Pendente' DO NOTHING`, [email]);
        },
        async listar() {
            return (await banco.query(`SELECT r.id,r.criada_em AS "criadaEm",u.id AS "usuarioId",
                COALESCE(u.nome,l.nome,'Administrador') AS nome,u.email,u.perfil,u.ativo,c.nome AS centro
                FROM recuperacoes_acesso r JOIN usuarios u ON u.id=r.usuario_id
                LEFT JOIN leitores l ON l.id=u.leitor_id
                LEFT JOIN centros c ON c.id=COALESCE(u.centro_id,l.centro_id)
                WHERE r.status='Pendente' ORDER BY r.criada_em,r.id`)).rows;
        },
        async concluir(id, dados, autorId) {
            if (!Number.isInteger(id) || id<1) throw erroHttp(400,'Solicitação inválida.');
            if (!['atender','encerrar'].includes(dados?.acao)) throw erroHttp(400,'Selecione a ação.');
            const atender=dados.acao==='atender';
            if (atender && dados.identidadeConfirmada!==true) throw erroHttp(400,'Confirme a identidade por um contato já conhecido ou presencialmente.');
            const senhaHash=atender?await hashSenha(validarSenha(dados.senha,'Senha temporária')):null;
            const c=await banco.connect();
            try {
                await c.query('BEGIN');
                await c.query('SELECT pg_advisory_xact_lock(20261102)');
                const pedido=(await c.query('SELECT usuario_id FROM recuperacoes_acesso WHERE id=$1',[id])).rows[0];
                if(!pedido) throw erroHttp(404,'Solicitação não encontrada.');
                const u=(await c.query('SELECT id,ativo FROM usuarios WHERE id=$1 FOR UPDATE',[pedido.usuario_id])).rows[0];
                const r=(await c.query('SELECT status FROM recuperacoes_acesso WHERE id=$1 FOR UPDATE',[id])).rows[0];
                if(r.status!=='Pendente') throw erroHttp(409,'Esta solicitação já foi encerrada. Atualize a lista.');
                if(atender) {
                    if(!u.ativo) throw erroHttp(409,'A conta está inativa. A recuperação não reativa contas.');
                    await c.query('UPDATE usuarios SET senha_hash=$2,trocar_senha=true WHERE id=$1',[u.id,senhaHash]);
                    await c.query('DELETE FROM sessoes WHERE usuario_id=$1',[u.id]);
                }
                await c.query('UPDATE recuperacoes_acesso SET status=$2,encerrada_em=now(),atendido_por=$3 WHERE id=$1',[id,atender?'Atendida':'Encerrada',autorId]);
                await c.query('COMMIT');
                return {sucesso:true};
            } catch(erro) {await c.query('ROLLBACK').catch(()=>{});throw erro;}
            finally {c.release();}
        }
    };
}
