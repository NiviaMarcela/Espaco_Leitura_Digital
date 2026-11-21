import { setTimeout as aguardar } from 'node:timers/promises';
import { MENSAGEM_RECUPERACAO } from '../repositories/recuperacao.js';

export function registrar(app, ctx) {
    const { recuperacao, guardas, limitadores } = ctx;
    const { exigirResponsavel, exigirPerfil } = guardas;

    app.post('/api/auth/recuperacao', async (req, res) => {
        const inicio=Date.now();
        const pedidosRecuperacao = limitadores.pedidosRecuperacao;
        for (const [ip, entrada] of pedidosRecuperacao) if(entrada.ate<=inicio) pedidosRecuperacao.delete(ip);
        const entrada=pedidosRecuperacao.get(req.ip) || {total:0,ate:inicio+15*60*1000};
        if(entrada.total>=5 || (!pedidosRecuperacao.has(req.ip) && pedidosRecuperacao.size>=10000)) {
            res.set('Retry-After','900');
            return res.status(429).json({erro:'Muitas solicitações. Aguarde 15 minutos e tente novamente.'});
        }
        entrada.total++;pedidosRecuperacao.set(req.ip,entrada);
        try { await recuperacao.solicitar(req.body); }
        finally { await aguardar(Math.max(0,300-(Date.now()-inicio))); }
        res.status(202).json({mensagem:MENSAGEM_RECUPERACAO});
    });
    app.get('/api/recuperacoes', exigirResponsavel, async (req,res)=>res.json(await recuperacao.listar(req.usuario)));
    app.get('/api/recuperacoes/contagem', exigirPerfil('admin', 'coordenador'), async (req,res) => {
        res.json({ quantidade: await recuperacao.contarPendentes(req.usuario) });
    });
    app.post('/api/recuperacoes/:id/concluir', exigirResponsavel, async (req,res)=>res.json(await recuperacao.concluir(Number(req.params.id),req.body,req.usuario.id)));
}
