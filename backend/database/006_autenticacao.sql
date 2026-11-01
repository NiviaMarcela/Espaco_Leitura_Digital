CREATE TABLE usuarios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email varchar(254) NOT NULL,
    senha_hash text NOT NULL,
    perfil varchar(10) NOT NULL CHECK (perfil IN ('admin', 'leitor')),
    leitor_id integer UNIQUE REFERENCES leitores(id) ON DELETE CASCADE,
    trocar_senha boolean NOT NULL DEFAULT true,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CHECK ((perfil = 'admin' AND leitor_id IS NULL) OR (perfil = 'leitor' AND leitor_id IS NOT NULL))
);
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios(lower(email));
CREATE UNIQUE INDEX usuarios_admin_unico ON usuarios(perfil) WHERE perfil = 'admin';

CREATE TABLE sessoes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expira_em timestamptz NOT NULL,
    criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_expira_em_idx ON sessoes(expira_em);
