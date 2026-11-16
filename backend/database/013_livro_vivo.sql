ALTER TABLE exemplares DROP CONSTRAINT exemplares_baixa_check;
ALTER TABLE exemplares ADD CONSTRAINT exemplares_baixa_check CHECK (
    (status='Baixado' AND baixa_em IS NOT NULL AND baixa_motivo IS NOT NULL
        AND baixa_motivo IN ('Perda','Dano/rasuras','Doação','Outro','doação livro vivo')
        AND (baixa_motivo<>'Outro' OR length(btrim(coalesce(baixa_observacao,'')))>0))
    OR (status<>'Baixado' AND baixa_motivo IS NULL AND baixa_em IS NULL AND baixa_observacao IS NULL)
);

CREATE TABLE livro_vivo_transferencias (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    centro_id integer NOT NULL REFERENCES centros(id) ON DELETE RESTRICT,
    localidade varchar(200) NOT NULL CHECK (btrim(localidade)<>''),
    modalidade text NOT NULL CHECK (modalidade IN ('definitiva','possivel_devolucao')),
    autorizado_por integer NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    autorizador_nome text NOT NULL,
    criada_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE livro_vivo_itens (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transferencia_id integer NOT NULL REFERENCES livro_vivo_transferencias(id) ON DELETE RESTRICT,
    exemplar_id integer NOT NULL REFERENCES exemplares(id) ON DELETE RESTRICT,
    titulo text NOT NULL,
    codigo text NOT NULL,
    retornado_em timestamptz,
    recebido_por integer REFERENCES usuarios(id) ON DELETE RESTRICT,
    recebedor_nome text,
    CHECK ((retornado_em IS NULL AND recebido_por IS NULL AND recebedor_nome IS NULL)
        OR (retornado_em IS NOT NULL AND recebido_por IS NOT NULL AND recebedor_nome IS NOT NULL)),
    UNIQUE(transferencia_id,exemplar_id)
);
CREATE UNIQUE INDEX livro_vivo_exemplar_em_destino ON livro_vivo_itens(exemplar_id) WHERE retornado_em IS NULL;
CREATE INDEX livro_vivo_centro ON livro_vivo_transferencias(centro_id);
CREATE INDEX livro_vivo_itens_transferencia ON livro_vivo_itens(transferencia_id);
