// Middleware de parâmetro (Router.param): roda antes de qualquer rota que tenha :id.
// Precisa ser registrado no mesmo router que declara a rota.
export function validarId(req, res, next, id) {
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) {
        return res.status(400).json({ erro: "O ID deve ser um inteiro positivo válido." });
    }
    req.params.id = Number(id); // as rotas recebem o ID já convertido
    next();
}
