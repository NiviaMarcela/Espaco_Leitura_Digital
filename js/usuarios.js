const el = id => document.getElementById(id);
const form = el('formUsuario');
async function api(caminho, dados) {
    const resposta = await fetch(`/api${caminho}`, { method: dados ? 'POST' : 'GET',
        headers: dados ? { 'Content-Type': 'application/json' } : {},
        body: dados ? JSON.stringify(dados) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível concluir a operação.');
    return resultado;
}
function atualizarPerfil() {
    const perfil = el('perfilUsuario').value;
    el('centroUsuario').disabled = perfil !== 'coordenador';
    el('centroUsuario').required = perfil === 'coordenador';
    el('grupoCentroUsuario').hidden = perfil !== 'coordenador';
    el('leitorUsuario').disabled = perfil !== 'leitor';
    el('leitorUsuario').required = perfil === 'leitor';
    el('grupoLeitorUsuario').hidden = perfil !== 'leitor';
}
let leitores = [];
async function carregar() {
    const usuarios = await api('/usuarios');
    el('tabelaUsuarios').replaceChildren();
    for (const usuario of usuarios) {
        const linha = el('tabelaUsuarios').insertRow();
        for (const valor of [usuario.nome, usuario.email,
            ({ admin:'Administrador', coordenador:'Coordenador', leitor:'Leitor' })[usuario.perfil],
            usuario.centro || 'Todos os Centros', usuario.ativo ? 'Ativo' : 'Inativo']) linha.insertCell().textContent = valor;
    }
    el('limiteAdministradores').textContent = `${usuarios.filter(u => u.perfil === 'admin').length}/4 contas de administrador. Coordenadores e leitores não têm limite de contas.`;
    leitores = await api('/leitores');
    el('leitorUsuario').replaceChildren(new Option('Selecione um leitor sem acesso', ''));
    leitores.filter(l => !l.temAcesso && l.status === 'Ativo' && l.email).forEach(l => el('leitorUsuario').add(new Option(`${l.nome} · ${l.centro}`,l.id)));
}
el('perfilUsuario').addEventListener('change', atualizarPerfil);
el('leitorUsuario').addEventListener('change', () => {
    const leitor = leitores.find(l => l.id === Number(el('leitorUsuario').value));
    if (leitor) { el('nomeUsuario').value = leitor.nome; el('emailUsuario').value = leitor.email; }
});
form.addEventListener('submit', async evento => {
    evento.preventDefault();
    if (!form.reportValidity() || el('salvarUsuario').disabled) return;
    const dados = Object.fromEntries(new FormData(form));
    dados.centroId = Number(dados.centroId);
    dados.leitorId = Number(dados.leitorId);
    el('salvarUsuario').disabled = true;
    el('avisoUsuarios').textContent = 'Cadastrando…';
    try {
        await api('/usuarios', dados);
        form.reset(); atualizarPerfil();
        el('avisoUsuarios').textContent = 'Usuário cadastrado. Ele deverá alterar a senha temporária no primeiro acesso.';
        await carregar();
    } catch (erro) { el('avisoUsuarios').textContent = erro.message; }
    finally { el('salvarUsuario').disabled = false; }
});
async function iniciar() {
    try {
        for (const c of await api('/centros')) el('centroUsuario').add(new Option(c.nome,c.id));
        await carregar(); atualizarPerfil(); el('salvarUsuario').disabled = false;
    } catch (erro) { el('avisoUsuarios').textContent = erro.message; }
}
iniciar();
