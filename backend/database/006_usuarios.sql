CREATE TABLE usuarios (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome varchar(200) NOT NULL CHECK (btrim(nome) <> ''),
    email varchar(254) NOT NULL UNIQUE CHECK (email=lower(email)),
    senha_hash text NOT NULL,
    perfil text NOT NULL CHECK (perfil IN ('Administrador','Responsavel')),
    centro_id integer REFERENCES centros(id) ON DELETE RESTRICT,
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    CHECK ((perfil='Administrador' AND centro_id IS NULL) OR (perfil='Responsavel' AND centro_id IS NOT NULL))
);
CREATE TABLE sessoes (
    token_hash text PRIMARY KEY,
    usuario_id integer NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    expira_em timestamptz NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_usuario_idx ON sessoes(usuario_id);
CREATE INDEX sessoes_expiracao_idx ON sessoes(expira_em);
CREATE TABLE tentativas_login (
    chave text PRIMARY KEY,
    quantidade integer NOT NULL,
    inicio timestamptz NOT NULL DEFAULT now()
);
