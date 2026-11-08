-- A função administrativa e o cadastro pessoal de empréstimos são independentes.
-- Mantemos os quatro espaços únicos de administrador e o Centro obrigatório do coordenador.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_vinculo_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_vinculo_check CHECK (
    (perfil='admin' AND centro_id IS NULL AND vaga_admin BETWEEN 1 AND 4 AND vaga_admin IS NOT NULL)
 OR (perfil='coordenador' AND centro_id IS NOT NULL AND vaga_admin IS NULL)
 OR (perfil='leitor' AND leitor_id IS NOT NULL AND centro_id IS NULL AND vaga_admin IS NULL));

-- Excluir um cadastro de circulação nunca deve apagar a conta administrativa vinculada.
ALTER TABLE usuarios DROP CONSTRAINT usuarios_leitor_id_fkey;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_leitor_id_fkey FOREIGN KEY(leitor_id) REFERENCES leitores(id) ON DELETE RESTRICT;
