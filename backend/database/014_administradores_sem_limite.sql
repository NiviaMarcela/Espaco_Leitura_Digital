-- Remove apenas o controle de vagas; contas e históricos são preservados.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_vinculo_check;
ALTER TABLE usuarios DROP CONSTRAINT usuarios_vaga_admin_unica;
ALTER TABLE usuarios DROP COLUMN vaga_admin;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_vinculo_check CHECK (
    (perfil='admin' AND centro_id IS NULL)
 OR (perfil IN ('coordenador','professor','funcionario') AND centro_id IS NOT NULL)
 OR (perfil='leitor' AND leitor_id IS NOT NULL AND centro_id IS NULL)
);
