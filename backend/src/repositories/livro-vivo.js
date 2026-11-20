import { erroHttp } from '../validation.js';

function escopo(usuario) {
    if (usuario?.perfil === 'admin') return null;
    if (usuario?.perfil === 'coordenador' && Number.isInteger(usuario.centroId)) return usuario.centroId;
    throw erroHttp(403, 'Somente administrador e coordenador podem operar o Livro Vivo.');
}
function validarIds(ids) {
    if (!Array.isArray(ids) || ids.length<1 || ids.length>1000 || ids.some(id=>!Number.isInteger(id)||id<1||id>2147483647)
        || new Set(ids).size!==ids.length) throw erroHttp(400,'Selecione de 1 a 1000 exemplares distintos.');
    return [...ids].sort((a,b)=>a-b);
}
export function criarRepositorioLivroVivo(banco, usuario) {
    const centroId=escopo(usuario);
    async function transacao(operacao) {
        const c=await banco.connect();
        try {
            await c.query('BEGIN');
            // Mesma trava da gestão de usuários: perfil e Centro não mudam durante a operação.
            await c.query('SELECT pg_advisory_xact_lock(20261102)');
            const autor=(await c.query('SELECT id,nome,perfil,centro_id AS "centroId",ativo FROM usuarios WHERE id=$1 FOR SHARE',[usuario.id])).rows[0];
            if (!autor?.ativo) throw erroHttp(403,'Conta inativa ou inexistente.');
            const centroAtual=escopo(autor);
            const resultado=await operacao(c,autor,centroAtual);
            await c.query('COMMIT');return resultado;
        } catch(erro) {await c.query('ROLLBACK').catch(()=>{});throw erro;}
        finally {c.release();}
    }
    return {
        async disponiveis() {
            return (await banco.query(`SELECT e.id,e.codigo,e.centro_id AS "centroId",c.nome AS centro,l.titulo,l.autor
                FROM exemplares e JOIN livros l ON l.id=e.livro_id JOIN centros c ON c.id=e.centro_id
                WHERE e.status='Disponível' AND ($1::integer IS NULL OR e.centro_id=$1)
                AND NOT EXISTS(SELECT 1 FROM emprestimos p WHERE p.exemplar_id=e.id AND p.data_devolucao IS NULL)
                AND NOT EXISTS(SELECT 1 FROM reservas r WHERE r.exemplar_id=e.id AND r.status='Pendente')
                AND NOT EXISTS(SELECT 1 FROM livro_vivo_itens i WHERE i.exemplar_id=e.id AND i.retornado_em IS NULL)
                ORDER BY l.titulo,e.id`,[centroId])).rows;
        },
        async listar() {
            return (await banco.query(`SELECT t.id,t.localidade,t.modalidade,t.centro_id AS "centroId",c.nome AS centro,
                t.autorizador_nome AS "autorizadorNome",t.criada_em AS "criadaEm",count(i.id)::integer AS quantidade,
                count(i.retornado_em)::integer AS retornados,
                jsonb_agg(jsonb_build_object('id',i.id,'exemplarId',i.exemplar_id,'titulo',i.titulo,'codigo',i.codigo,
                    'retornadoEm',i.retornado_em,'recebedorNome',i.recebedor_nome) ORDER BY i.id) AS itens
                FROM livro_vivo_transferencias t JOIN centros c ON c.id=t.centro_id
                JOIN livro_vivo_itens i ON i.transferencia_id=t.id
                WHERE ($1::integer IS NULL OR t.centro_id=$1)
                GROUP BY t.id,c.nome ORDER BY t.criada_em DESC,t.id DESC`,[centroId])).rows;
        },
        async transferir(dados) {
            const ids=validarIds(dados?.exemplarIds);
            if (typeof dados.localidade!=='string'||!dados.localidade.trim()||dados.localidade.trim().length>200) throw erroHttp(400,'Informe a localidade de destino (até 200 caracteres).');
            if (dados.modalidade!==undefined && dados.modalidade!=='doacao') throw erroHttp(400,'A modalidade agora é Doação. Atualize a página.');
            return transacao(async(c,autor,centroAtual)=>{
                const exemplares=(await c.query(`SELECT e.id,e.codigo,e.status,e.centro_id,l.titulo FROM exemplares e
                    JOIN livros l ON l.id=e.livro_id WHERE e.id=ANY($1::integer[]) AND ($2::integer IS NULL OR e.centro_id=$2)
                    ORDER BY e.id FOR UPDATE OF e`,[ids,centroAtual])).rows;
                if(exemplares.length!==ids.length) throw erroHttp(404,'Exemplar não encontrado no seu Centro.');
                if(new Set(exemplares.map(e=>e.centro_id)).size!==1) throw erroHttp(400,'Faça uma transferência separada para cada Centro.');
                const ocupados=await c.query(`SELECT id FROM emprestimos WHERE exemplar_id=ANY($1::integer[]) AND data_devolucao IS NULL
                    UNION ALL SELECT id FROM reservas WHERE exemplar_id=ANY($1::integer[]) AND status='Pendente'
                    UNION ALL SELECT id FROM livro_vivo_itens WHERE exemplar_id=ANY($1::integer[]) AND retornado_em IS NULL`,[ids]);
                if(exemplares.some(e=>e.status!=='Disponível')||ocupados.rowCount) throw erroHttp(409,'Um exemplar selecionado não está mais disponível. Atualize a lista. Nenhum exemplar foi transferido.');
                const t=(await c.query(`INSERT INTO livro_vivo_transferencias(centro_id,localidade,modalidade,autorizado_por,autorizador_nome)
                    VALUES($1,$2,$3,$4,$5) RETURNING id`,[exemplares[0].centro_id,dados.localidade.trim(),'doacao',autor.id,autor.nome||'Administrador'])).rows[0];
                for(const e of exemplares) await c.query('INSERT INTO livro_vivo_itens(transferencia_id,exemplar_id,titulo,codigo) VALUES($1,$2,$3,$4)',[t.id,e.id,e.titulo,e.codigo]);
                await c.query(`UPDATE exemplares SET status='Baixado',baixa_motivo='doação livro vivo',baixa_em=now(),baixa_observacao=$2
                    WHERE id=ANY($1::integer[])`,[ids,`Livro Vivo #${t.id} · ${dados.localidade.trim()}`]);
                return {id:t.id,quantidade:ids.length};
            });
        },
        async retornar(id,dados) {
            if(!Number.isInteger(id)||id<1||id>2147483647) throw erroHttp(400,'Transferência inválida.');
            const ids=validarIds(dados?.exemplarIds);
            return transacao(async(c,autor,centroAtual)=>{
                const t=(await c.query('SELECT * FROM livro_vivo_transferencias WHERE id=$1 AND ($2::integer IS NULL OR centro_id=$2) FOR UPDATE',[id,centroAtual])).rows[0];
                if(!t) throw erroHttp(404,'Transferência não encontrada no seu Centro.');
                const itens=(await c.query(`SELECT i.id,i.retornado_em,e.status,e.baixa_motivo FROM livro_vivo_itens i JOIN exemplares e ON e.id=i.exemplar_id
                    WHERE i.transferencia_id=$1 AND i.exemplar_id=ANY($2::integer[]) ORDER BY e.id FOR UPDATE OF e,i`,[id,ids])).rows;
                if(itens.length!==ids.length) throw erroHttp(404,'Exemplar não pertence à transferência.');
                if(itens.some(i=>i.retornado_em||i.status!=='Baixado'||i.baixa_motivo!=='doação livro vivo')) throw erroHttp(409,'Exemplar já retornou ou não está mais em doação.');
                await c.query(`UPDATE livro_vivo_itens SET retornado_em=now(),recebido_por=$3,recebedor_nome=$4 WHERE transferencia_id=$1 AND exemplar_id=ANY($2::integer[])`,[id,ids,autor.id,autor.nome||'Administrador']);
                await c.query(`UPDATE exemplares SET status='Disponível',baixa_em=NULL,baixa_motivo=NULL,baixa_observacao=NULL WHERE id=ANY($1::integer[])`,[ids]);
                return {sucesso:true,quantidade:ids.length};
            });
        }
    };
}
