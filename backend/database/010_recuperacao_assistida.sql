CREATE TABLE recuperacoes_acesso (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    criada_em timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Atendida','Encerrada')),
    encerrada_em timestamptz,
    atendido_por integer REFERENCES usuarios(id) ON DELETE SET NULL,
    CHECK ((status='Pendente' AND encerrada_em IS NULL) OR (status<>'Pendente' AND encerrada_em IS NOT NULL))
);
CREATE UNIQUE INDEX recuperacoes_pendente_unica ON recuperacoes_acesso(usuario_id) WHERE status='Pendente';
