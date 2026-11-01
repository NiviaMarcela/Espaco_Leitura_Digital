const el=id=>document.getElementById(id);
const form=el('formUsuario');let usuarios=[];
async function api(url,method='GET',dados){
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:dados?JSON.stringify(dados):undefined});
    const d=await r.json();if(!r.ok)throw new Error(d.erro||'Não foi possível concluir.');return d;
}
function centro(){const novoLeitor=form.perfil.value==='Leitor'&&!form.idUsuario.value;el('nascimentoUsuarioBloco').hidden=!novoLeitor;form.dataNascimento.required=novoLeitor;el('centroUsuario').disabled=form.perfil.value==='Administrador';el('centroUsuario').required=!el('centroUsuario').disabled;}
function novo(){form.reset();form.perfil.disabled=false;form.idUsuario.value='';form.senha.required=true;form.senha.disabled=false;el('tituloFormulario').textContent='Novo usuário';centro();}
async function carregar(){
    usuarios=await api('/api/usuarios');el('listaUsuarios').replaceChildren();
    for(const u of usuarios){const tr=el('listaUsuarios').insertRow();
        for(const texto of [u.nome,u.email,u.perfil,u.centro||'Todos',u.ativo?'Ativo':'Inativo'])tr.insertCell().textContent=texto;
        const b=document.createElement('button');b.type='button';b.className='btn btn-sm btn-primary-custom';b.textContent='Editar';
        b.onclick=()=>{form.idUsuario.value=u.id;form.nome.value=u.nome;form.email.value=u.email;form.perfil.value=u.perfil;form.perfil.disabled=u.perfil==='Leitor';form.centroId.value=u.centroId||'';form.ativo.checked=u.ativo;form.senha.value='';form.senha.required=false;form.senha.disabled=true;centro();el('tituloFormulario').textContent='Editar usuário';form.nome.focus();};tr.insertCell().append(b);
    }
}
form.perfil.addEventListener('change',centro);el('novoUsuario').onclick=novo;
form.addEventListener('submit',async e=>{
    e.preventDefault();const b=el('salvarUsuario');b.disabled=true;el('avisoUsuarios').textContent='Salvando…';
    const id=form.idUsuario.value;
    try{
        await api('/api/usuarios'+(id?'/'+id:''),id?'PUT':'POST',{nome:form.nome.value,email:form.email.value,perfil:form.perfil.value,centroId:Number(form.centroId.value),ativo:form.ativo.checked,dataNascimento:form.dataNascimento.value,...(!id?{senha:form.senha.value}:{})});
        form.senha.value='';novo();el('avisoUsuarios').textContent='Usuário salvo. Alterações encerram as sessões anteriores da conta.';await carregar();
    }catch(erro){el('avisoUsuarios').textContent=erro.message;}finally{b.disabled=false;}
});
try{
    const u=await window.sessaoPronta;if(u?.perfil!=='Administrador')throw new Error('Acesso restrito ao administrador.');
    for(const c of await api('/api/centros'))form.centroId.add(new Option(c.nome,c.id));await carregar();novo();
}catch(erro){el('avisoUsuarios').textContent=erro.message;el('salvarUsuario').disabled=true;}
