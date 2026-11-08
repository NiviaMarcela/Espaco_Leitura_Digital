const el = id => document.getElementById(id);
const form = el('formUsuario');
let editando = null;
let operando = false;
let usuarioAtual = null;
async function api(caminho, dados, metodo = dados ? 'POST' : 'GET') {
    const resposta = await fetch(`/api${caminho}`, { method: metodo,
        headers: dados ? { 'Content-Type': 'application/json' } : {},
        body: dados ? JSON.stringify(dados) : undefined, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const resultado = await resposta.json();
    if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível concluir a operação.');
    return resultado;
}
function atualizarPerfil() {
    const perfil = el('perfilUsuario').value;
    if (editando) {
        el('centroUsuario').disabled = perfil === 'admin';
        el('centroUsuario').required = perfil !== 'admin';
        el('grupoCentroUsuario').hidden = perfil === 'admin';
        el('leitorUsuario').disabled = true;
        el('grupoLeitorUsuario').hidden = true;
        return;
    }
    el('centroUsuario').disabled = !['coordenador','professor'].includes(perfil);
    el('centroUsuario').required = ['coordenador','professor'].includes(perfil);
    el('grupoCentroUsuario').hidden = !['coordenador','professor'].includes(perfil);
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
            ({ admin:'Administrador', coordenador:'Coordenador', professor:'Professor', leitor:'Leitor' })[usuario.perfil],
            usuario.centro || 'Todos os Centros', usuario.ativo ? 'Ativo' : 'Inativo']) linha.insertCell().textContent = valor;
        const acoes = linha.insertCell();
        for (const [texto, classe, acao] of [
            ['Editar','btn-primary',()=>editar(usuario)],
            ['Redefinir senha','btn-warning',()=>abrirSenha(usuario)],
            [usuario.ativo?'Inativar':'Ativar',usuario.ativo?'btn-outline-danger':'btn-success',()=>alterarSituacao(usuario)]
        ]) {
            const botao = document.createElement('button');
            botao.type='button';botao.className='btn btn-sm me-2 mb-1 '+classe;botao.textContent=texto;
            botao.disabled = texto==='Inativar' && usuario.id===usuarioAtual?.id;
            botao.addEventListener('click',acao);acoes.append(botao);
        }
    }
    el('limiteAdministradores').textContent = `${usuarios.filter(u => u.perfil === 'admin').length}/4 contas de administrador. Coordenadores, professores e leitores não têm limite de contas.`;
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
    if (operando) return;
    const dados = Object.fromEntries(new FormData(form));
    dados.centroId = Number(dados.centroId);
    if (!editando) dados.leitorId = Number(dados.leitorId);
    const idEditado = editando?.id;
    operando = true;
    el('salvarUsuario').disabled = true;
    el('avisoUsuarios').textContent = editando ? 'Salvando alterações…' : 'Cadastrando…';
    try {
        await api(idEditado ? '/usuarios/'+idEditado : '/usuarios', dados, idEditado ? 'PUT' : 'POST');
        if (idEditado === usuarioAtual?.id) { location.assign('/login.html'); return; }
        limparEdicao();
        el('avisoUsuarios').textContent = idEditado ? 'Usuário atualizado. Ele deverá entrar novamente.' : 'Usuário cadastrado. Ele deverá alterar a senha temporária no primeiro acesso.';
        await carregar();
    } catch (erro) { el('avisoUsuarios').textContent = erro.message; }
    finally { operando = false; el('salvarUsuario').disabled = false; }
});
async function iniciar() {
    try {
        usuarioAtual = await api('/auth/me');
        for (const c of await api('/centros')) el('centroUsuario').add(new Option(c.nome,c.id));
        await carregar(); atualizarPerfil(); el('salvarUsuario').disabled = false;
        await carregarRecuperacoes();
    } catch (erro) { el('avisoUsuarios').textContent = erro.message; }
}
iniciar();

function limparEdicao() {
    editando=null;form.reset();el('perfilUsuario').disabled=false;
    el('grupoSenhaUsuario').hidden=false;el('senhaUsuario').disabled=false;el('senhaUsuario').required=true;
    el('tituloFormUsuario').textContent='Cadastrar usuário';el('salvarUsuario').textContent='Cadastrar usuário';
    el('cancelarEdicaoUsuario').hidden=true;el('avisoEdicaoUsuario').hidden=true;atualizarPerfil();
}
function editar(usuario) {
    if (operando) return;
    form.reset();editando=usuario;
    el('nomeUsuario').value=usuario.nome;el('emailUsuario').value=usuario.email;
    el('perfilUsuario').value=usuario.perfil;el('perfilUsuario').disabled=true;
    el('centroUsuario').value=usuario.centroId || '';
    el('grupoSenhaUsuario').hidden=true;el('senhaUsuario').disabled=true;el('senhaUsuario').required=false;
    el('tituloFormUsuario').textContent='Editar usuário';el('salvarUsuario').textContent='Salvar alterações';
    el('cancelarEdicaoUsuario').hidden=false;el('avisoEdicaoUsuario').hidden=false;atualizarPerfil();
    el('nomeUsuario').focus();form.scrollIntoView({behavior:'smooth',block:'center'});
}
el('cancelarEdicaoUsuario').addEventListener('click',()=>{if(!operando)limparEdicao();});
async function alterarSituacao(usuario) {
    if (operando || !confirm((usuario.ativo?'Inativar':'Ativar')+' a conta de '+usuario.nome+'?'+(usuario.ativo?' O acesso será encerrado. O histórico será preservado.':''))) return;
    operando=true;
    try {
        await api('/usuarios/'+usuario.id+'/status',{ativo:!usuario.ativo},'PATCH');
        el('avisoUsuarios').textContent='Situação da conta atualizada.';await carregar();
    } catch(erro) {el('avisoUsuarios').textContent=erro.message;}
    finally {operando=false;}
}
let usuarioSenha=null;
let pedidoSenha=null;
function abrirSenha(usuario, pedido = null) {
    if(operando)return;
    pedidoSenha=pedido;
    el('grupoConfirmarIdentidade').hidden=!pedido;el('confirmarIdentidade').required=Boolean(pedido);
    usuarioSenha=usuario;el('formSenhaUsuario').reset();el('erroSenhaUsuario').textContent='';
    el('nomeSenhaUsuario').textContent='Redefinir senha de '+usuario.nome;
    bootstrap.Modal.getOrCreateInstance(el('modalSenhaUsuario')).show();
}
el('formSenhaUsuario').addEventListener('submit',async evento=>{
    evento.preventDefault();
    if(operando || !usuarioSenha || !evento.target.reportValidity())return;
    const senha=el('novaSenhaUsuario').value;
    if(senha!==el('confirmarSenhaUsuario').value){el('erroSenhaUsuario').textContent='As senhas não coincidem.';return;}
    operando=true;el('salvarSenhaUsuario').disabled=true;
    try {
        if (pedidoSenha) {
            if (!el('confirmarIdentidade').checked) throw new Error('Confirme a identidade antes de atender.');
            await api('/recuperacoes/'+pedidoSenha.id+'/concluir',{acao:'atender',senha,identidadeConfirmada:true});
        } else await api('/usuarios/'+usuarioSenha.id+'/senha',{senha});
        if(usuarioSenha.id===usuarioAtual?.id){location.assign('/login.html');return;}
        operando=false;bootstrap.Modal.getOrCreateInstance(el('modalSenhaUsuario')).hide();
        el('formSenhaUsuario').reset();el('avisoUsuarios').textContent='Senha temporária redefinida. A pessoa deverá entrar novamente e trocar a senha.';
        if(pedidoSenha) await carregarRecuperacoes();
    } catch(erro){el('erroSenhaUsuario').textContent=erro.message;}
    finally{operando=false;el('salvarSenhaUsuario').disabled=false;}
});
el('modalSenhaUsuario').addEventListener('hide.bs.modal',evento=>{if(operando)evento.preventDefault();});

async function carregarRecuperacoes() {
    el('atualizarRecuperacoes').disabled=true;
    try {
        const pedidos=await api('/recuperacoes');el('tabelaRecuperacoes').replaceChildren();
        el('avisoFilaRecuperacao').textContent=pedidos.length?pedidos.length+' solicitação(ões) pendente(s).':'Nenhuma solicitação pendente.';
        for(const pedido of pedidos) {
            const linha=el('tabelaRecuperacoes').insertRow();
            for(const texto of [new Date(pedido.criadaEm).toLocaleString('pt-BR'),pedido.nome,pedido.email,pedido.perfil+' / '+(pedido.centro || 'Todos os Centros')])linha.insertCell().textContent=texto;
            const acoes=linha.insertCell();
            const atender=document.createElement('button');atender.type='button';atender.className='btn btn-warning btn-sm me-2';atender.textContent='Verificar e atender';atender.disabled=!pedido.ativo;
            atender.addEventListener('click',()=>abrirSenha({id:pedido.usuarioId,nome:pedido.nome},pedido));acoes.append(atender);
            const encerrar=document.createElement('button');encerrar.type='button';encerrar.className='btn btn-outline-secondary btn-sm';encerrar.textContent='Encerrar sem alterar senha';
            encerrar.addEventListener('click',async()=>{
                if(operando || !confirm('Encerrar a solicitação de '+pedido.nome+' sem alterar a senha?'))return;
                operando=true;
                try {await api('/recuperacoes/'+pedido.id+'/concluir',{acao:'encerrar'});await carregarRecuperacoes();}
                catch(erro){el('avisoFilaRecuperacao').textContent=erro.message;}
                finally{operando=false;}
            });acoes.append(encerrar);
        }
    }catch(erro){el('avisoFilaRecuperacao').textContent=erro.message;}
    finally{el('atualizarRecuperacoes').disabled=false;}
}
el('atualizarRecuperacoes').addEventListener('click',carregarRecuperacoes);
