import { erroHttp } from '../validation.js';
function nomeValido(nome){
    if(typeof nome!=='string'||!nome.trim()||nome.trim().length>100)throw erroHttp(400,'Informe um nome de categoria de até 100 caracteres.');
    return nome.trim();
}
export function criarRepositorioCategorias(banco,centroId=null){
    async function executar(sql,args){
        try{return await banco.query(sql,args);}catch(erro){
            if(erro.code==='23505')throw erroHttp(409,'Já existe uma categoria com esse nome neste Centro.');
            if(['23503','23001'].includes(erro.code))throw erroHttp(409,'Categoria em uso por livros. Reclassifique os livros antes de excluir.');
            throw erro;
        }
    }
    return {
        async listar(){return (await banco.query(`SELECT c.id,c.nome,c.centro_id AS "centroId",ce.nome AS centro,count(l.id)::integer AS livros
            FROM categorias c JOIN centros ce ON ce.id=c.centro_id LEFT JOIN livros l ON l.centro_id=c.centro_id AND l.categoria=c.nome
            WHERE ($1::integer IS NULL OR c.centro_id=$1) GROUP BY c.id,ce.nome ORDER BY ce.nome,c.nome`,[centroId])).rows;},
        async criar(dados){
            const nome=nomeValido(dados?.nome),centro=dados?.centroId;
            if(!Number.isInteger(centro)||centro<1)throw erroHttp(400,'Selecione o Centro da categoria.');
            if(centroId!==null&&centro!==centroId)throw erroHttp(403,'Use o seu Centro.');
            return (await executar('INSERT INTO categorias(nome,centro_id) VALUES($1,$2) RETURNING id,nome,centro_id AS "centroId"',[nome,centro])).rows[0];
        },
        async editar(id,dados){
            if(!Number.isInteger(id)||id<1||id>2147483647)throw erroHttp(400,'Categoria inválida.');
            const nome=nomeValido(dados?.nome);
            const r=await executar('UPDATE categorias SET nome=$2 WHERE id=$1 AND ($3::integer IS NULL OR centro_id=$3) RETURNING id,nome,centro_id AS "centroId"',[id,nome,centroId]);
            if(!r.rowCount)throw erroHttp(404,'Categoria não encontrada no seu Centro.');return r.rows[0];
        },
        async excluir(id){
            if(!Number.isInteger(id)||id<1||id>2147483647)throw erroHttp(400,'Categoria inválida.');
            const r=await executar('DELETE FROM categorias WHERE id=$1 AND ($2::integer IS NULL OR centro_id=$2) RETURNING id',[id,centroId]);
            if(!r.rowCount)throw erroHttp(404,'Categoria não encontrada no seu Centro.');return {sucesso:true};
        }
    };
}
