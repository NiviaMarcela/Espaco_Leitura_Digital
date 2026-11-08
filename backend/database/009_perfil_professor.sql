-- Professor administra a circulação apenas no Centro vinculado.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_perfil_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_perfil_check CHECK (perfil IN ('admin','coordenador','professor','leitor'));
ALTER TABLE usuarios DROP CONSTRAINT usuarios_vinculo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_vinculo_check CHECK (
    (perfil='admin' AND centro_id IS NULL AND vaga_admin BETWEEN 1 AND 4 AND vaga_admin IS NOT NULL)
 OR (perfil IN ('coordenador','professor') AND centro_id IS NOT NULL AND vaga_admin IS NULL)
 OR (perfil='leitor' AND leitor_id IS NOT NULL AND centro_id IS NULL AND vaga_admin IS NULL));
