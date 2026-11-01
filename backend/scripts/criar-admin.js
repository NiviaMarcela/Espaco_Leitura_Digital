import { createInterface } from 'node:readline/promises';
import { criarBanco } from '../src/database.js';
import { criarRepositorioAutenticacao } from '../src/repositories/autenticacao.js';

// Senhas são digitadas sem eco e não aparecem nos argumentos/histórico do terminal.
async function senhaOculta(rotulo) {
    if (!process.stdin.isTTY) throw new Error('Use um terminal interativo para informar a senha.');
    process.stdout.write(rotulo);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    return new Promise((resolve, reject) => {
        let senha = '';
        function terminar(erro) {
            process.stdin.removeListener('data', receber);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write('\n');
            if (erro) reject(erro); else resolve(senha);
        }
        function receber(buffer) {
            for (const char of buffer.toString('utf8')) {
                if (char === '\u0003') return terminar(new Error('Operação cancelada.'));
                if (char === '\r' || char === '\n') return terminar();
                if (char === '\u007f' || char === '\b') senha = senha.slice(0,-1);
                else if (char >= ' ' && senha.length < 129) senha += char;
            }
        }
        process.stdin.on('data', receber);
    });
}
const banco = criarBanco();
try {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const email = await rl.question('Email de acesso: ');
    rl.close();
    const senha = await senhaOculta('Senha (12 a 128 caracteres; não será exibida): ');
    const confirmacao = await senhaOculta('Repita a senha: ');
    if (senha !== confirmacao) throw new Error('As senhas não coincidem.');
    const autenticacao = criarRepositorioAutenticacao(banco);
    const criado = await autenticacao.inicializarAdministrador(email, senha);
    if (!criado) throw new Error('Já existe um administrador. Entre com a conta existente.');
    console.log('Administrador criado. Abra http://127.0.0.1:3001/login.html para entrar.');
} catch (erro) {
    console.error(erro.code ? `Não foi possível criar o administrador. Confira as migrações e a conexão. Código: ${erro.code}` : erro.message);
    process.exitCode = 1;
} finally { await banco.end(); }
