ALTER TABLE emprestimos
    ADD COLUMN aprovado_por integer REFERENCES usuarios(id) ON DELETE SET NULL;
