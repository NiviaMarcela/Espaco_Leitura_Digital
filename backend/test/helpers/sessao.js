import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hashToken } from '../../src/auth.js';

// Fixture exclusiva dos testes, sem qualquer desvio de autenticação na aplicação.
export async function sessaoAdmin(banco) {
    await banco.query(await readFile(new URL('../../database/006_usuarios.sql', import.meta.url), 'utf8'));
    await banco.query(await readFile(new URL('../../database/007_leitores_reservas.sql', import.meta.url), 'utf8'));
    const u=(await banco.query("INSERT INTO usuarios(nome,email,senha_hash,perfil) VALUES ('Admin teste','admin@teste.local','sem-login-por-senha','Administrador') RETURNING id")).rows[0];
    const token=randomBytes(32).toString('hex');
    await banco.query("INSERT INTO sessoes(token_hash,usuario_id,expira_em) VALUES ($1,$2,now()+interval '1 hour')",[hashToken(token),u.id]);
    return `eld_sessao=${token}`;
}
