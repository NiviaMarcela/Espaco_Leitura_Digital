-- Evolui o banco deste clone sem apagar contas, leitores ou empréstimos existentes.
DROP INDEX usuarios_admin_unico;
ALTER TABLE usuarios ALTER COLUMN perfil TYPE varchar(20);
ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
ALTER TABLE usuarios DROP CONSTRAINT usuarios_check;
ALTER TABLE usuarios ADD COLUMN nome varchar(200);
ALTER TABLE usuarios ADD COLUMN centro_id integer REFERENCES centros(id) ON DELETE RESTRICT;
ALTER TABLE usuarios ADD COLUMN vaga_admin integer;
WITH vagas AS (SELECT id, row_number() OVER (ORDER BY id) AS vaga FROM usuarios WHERE perfil='admin')
UPDATE usuarios u SET vaga_admin=v.vaga FROM vagas v WHERE u.id=v.id;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('admin','coordenador','leitor'));
ALTER TABLE usuarios ADD CONSTRAINT usuarios_vinculo_check CHECK (
    (perfil='admin' AND leitor_id IS NULL AND centro_id IS NULL AND vaga_admin BETWEEN 1 AND 4 AND vaga_admin IS NOT NULL)
 OR (perfil='coordenador' AND leitor_id IS NULL AND centro_id IS NOT NULL AND vaga_admin IS NULL)
 OR (perfil='leitor' AND leitor_id IS NOT NULL AND centro_id IS NULL AND vaga_admin IS NULL));
-- Quatro vagas únicas garantem o limite inclusive com cadastros concorrentes.
ALTER TABLE usuarios ADD CONSTRAINT usuarios_vaga_admin_unica UNIQUE(vaga_admin);

CREATE TABLE reservas (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    leitor_id integer NOT NULL REFERENCES leitores(id) ON DELETE RESTRICT,
    exemplar_id integer NOT NULL REFERENCES exemplares(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente','Cancelada','Retirada')),
    criada_em timestamptz NOT NULL DEFAULT now(),
    encerrada_em timestamptz,
    emprestimo_id integer UNIQUE REFERENCES emprestimos(id) ON DELETE RESTRICT,
    CHECK ((status='Pendente' AND encerrada_em IS NULL AND emprestimo_id IS NULL)
        OR (status='Cancelada' AND encerrada_em IS NOT NULL AND emprestimo_id IS NULL)
        OR (status='Retirada' AND encerrada_em IS NOT NULL AND emprestimo_id IS NOT NULL))
);
CREATE UNIQUE INDEX reservas_exemplar_pendente_unico ON reservas(exemplar_id) WHERE status='Pendente';
CREATE INDEX reservas_leitor_pendente_idx ON reservas(leitor_id) WHERE status='Pendente';
