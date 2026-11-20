-- Preserva a classificação anterior para auditoria, sem apagar transferências ou retornos.
ALTER TABLE livro_vivo_transferencias ADD COLUMN modalidade_anterior text;
UPDATE livro_vivo_transferencias SET modalidade_anterior=modalidade;
ALTER TABLE livro_vivo_transferencias DROP CONSTRAINT livro_vivo_transferencias_modalidade_check;
UPDATE livro_vivo_transferencias SET modalidade='doacao';
ALTER TABLE livro_vivo_transferencias ALTER COLUMN modalidade SET DEFAULT 'doacao';
ALTER TABLE livro_vivo_transferencias ADD CONSTRAINT livro_vivo_transferencias_modalidade_check CHECK(modalidade='doacao');
