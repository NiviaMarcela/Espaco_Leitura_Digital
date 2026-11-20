CREATE TABLE categorias (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    centro_id integer NOT NULL REFERENCES centros(id),
    nome text NOT NULL CHECK (btrim(nome)<>''),
    UNIQUE(centro_id,nome)
);
CREATE UNIQUE INDEX categorias_nome_normalizado ON categorias(centro_id,lower(btrim(nome)));
ALTER TABLE livros ADD COLUMN centro_id integer REFERENCES centros(id);
-- Separa descrições compartilhadas, mantendo IDs dos exemplares e todo o histórico.
DO $$
DECLARE obra record; centro integer; primeiro boolean; novo integer;
BEGIN
    FOR obra IN SELECT * FROM livros ORDER BY id LOOP
        primeiro := true;
        FOR centro IN SELECT DISTINCT e.centro_id FROM exemplares e WHERE e.livro_id=obra.id ORDER BY e.centro_id LOOP
            IF primeiro THEN
                UPDATE livros SET centro_id=centro WHERE id=obra.id;
                primeiro := false;
            ELSE
                INSERT INTO livros(titulo,autor,isbn,editora,ano,categoria,faixa_etaria,capa_url,sinopse,centro_id)
                VALUES(obra.titulo,obra.autor,obra.isbn,obra.editora,obra.ano,obra.categoria,obra.faixa_etaria,obra.capa_url,obra.sinopse,centro) RETURNING id INTO novo;
                UPDATE exemplares SET livro_id=novo WHERE livro_id=obra.id AND centro_id=centro;
            END IF;
        END LOOP;
    END LOOP;
END $$;
INSERT INTO categorias(centro_id,nome)
SELECT centro_id,min(btrim(categoria)) FROM livros WHERE centro_id IS NOT NULL GROUP BY centro_id,lower(btrim(categoria));
UPDATE livros l SET categoria=c.nome FROM categorias c WHERE c.centro_id=l.centro_id AND lower(btrim(l.categoria))=lower(c.nome);
-- Nome e Centro formam a chave estrangeira; renomear propaga somente neste Centro.
ALTER TABLE livros ADD CONSTRAINT livros_categoria_fk FOREIGN KEY(centro_id,categoria)
    REFERENCES categorias(centro_id,nome) ON UPDATE CASCADE ON DELETE RESTRICT;
ALTER TABLE livros ADD CONSTRAINT livros_id_centro_unico UNIQUE(id,centro_id);
ALTER TABLE exemplares ADD CONSTRAINT exemplares_livro_centro_fk FOREIGN KEY(livro_id,centro_id) REFERENCES livros(id,centro_id);
