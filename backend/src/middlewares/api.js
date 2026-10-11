// Política aplicada a tudo que está sob /api: sem cache, gravação só da própria
// origem e corpo em JSON nas escritas.
export function protegerApi(req, res, next) {
    res.set("Cache-Control", "no-store");
    if (["POST", "PUT"].includes(req.method)) {
        if (req.get("origin") && req.get("origin") !== `${req.protocol}://${req.get("host")}`) {
            return res.status(403).json({ erro: "Use o acervo no mesmo endereço da API." });
        }
        if (!req.is("application/json")) return res.status(415).json({ erro: "Envie os dados em JSON." });
    }
    next();
}
