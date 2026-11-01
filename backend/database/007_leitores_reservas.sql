-- Preserva as contas existentes, alterando apenas o nome do perfil.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
ALTER TABLE usuarios DROP CONSTRAINT usuarios_check;
UPDATE usuarios SET perfil='Coordenador' WHERE perfil='Responsavel';
ALTER TABLE usuarios ADD COLUMN leitor_id integer UNIQUE REFERENCES leitores(id) ON DELETE RESTRICT;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('Administrador','Coordenador','Leitor'));
-- O centro do leitor vem do cadastro de leitores, evitando dois vínculos divergentes.
ALTER TABLE usuarios ADD CONSTRAINT usuarios_vinculo_check CHECK (
    (perfil='Administrador' AND centro_id IS NULL AND leitor_id IS NULL) OR
    (perfil='Coordenador' AND centro_id IS NOT NULL AND leitor_id IS NULL) OR
    (perfil='Leitor' AND centro_id IS NULL AND leitor_id IS NOT NULL)
);
CREATE TABLE reservas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    leitor_id integer NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
    exemplar_id integer NOT NULL REFERENCES exemplares(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente','Cancelada','Retirada')),
    criada_em timestamptz NOT NULL DEFAULT now(),
    encerrada_em timestamptz,
    emprestimo_id integer UNIQUE REFERENCES emprestimos(id) ON DELETE RESTRICT,
    CHECK ((status='Pendente' AND encerrada_em IS NULL AND emprestimo_id IS NULL) OR
           (status='Cancelada' AND encerrada_em IS NOT NULL AND emprestimo_id IS NULL) OR
           (status='Retirada' AND encerrada_em IS NOT NULL AND emprestimo_id IS NOT NULL))
);
CREATE UNIQUE INDEX reservas_exemplar_pendente_unico ON reservas(exemplar_id) WHERE status='Pendente';
CREATE INDEX reservas_leitor_idx ON reservas(leitor_id);
-- Transferências não podem separar o leitor dos exemplares ainda sob sua responsabilidade.
CREATE FUNCTION proteger_centro_leitor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.centro_id IS DISTINCT FROM OLD.centro_id AND (
        EXISTS(SELECT 1 FROM emprestimos WHERE leitor_id=OLD.id AND data_devolucao IS NULL) OR
        EXISTS(SELECT 1 FROM reservas WHERE leitor_id=OLD.id AND status='Pendente')
    ) THEN
        RAISE EXCEPTION 'Encerre empréstimos e reservas antes de transferir o leitor.' USING ERRCODE='P0001';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER leitores_proteger_centro BEFORE UPDATE OF centro_id ON leitores
FOR EACH ROW EXECUTE FUNCTION proteger_centro_leitor();
