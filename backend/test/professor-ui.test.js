import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

for(const perfil of ['professor','funcionario','coordenador']) test(perfil+' recebe os menus permitidos',async()=>{
    const admin={hidden:false},dashboard={hidden:false},gestao={hidden:true},usuarios={hidden:true},relatorios={hidden:true};
    const grupos={'[data-usuarios-only]':[usuarios],'[data-admin-only]':[admin],'[data-dashboard-only]':[dashboard],'[data-gestao-only]':[gestao],'[data-relatorios-only]':[relatorios],'[data-anonymous-only]':[]};
    const redirecionamentos=[];
    const contexto=vm.createContext({
        document:{body:{dataset:{authRole:'admin,coordenador,professor,funcionario,leitor'}},querySelectorAll:s=>grupos[s]||[],querySelector:()=>null},
        window:{},location:{pathname:'/biblioteca.html',replace:p=>redirecionamentos.push(p)},
        fetch:async()=>({ok:true,json:async()=>({perfil,nome:'Equipe teste',trocarSenha:false})})
    });
    vm.runInContext(readFileSync(new URL('../../js/auth-ui.js',import.meta.url),'utf8'),contexto);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(admin.hidden,true);assert.equal(dashboard.hidden,perfil!=='coordenador');assert.equal(usuarios.hidden,perfil!=='coordenador');assert.equal(gestao.hidden,false);assert.equal(relatorios.hidden,!['professor','coordenador'].includes(perfil));
    assert.deepEqual(redirecionamentos,[]);
});

test('login do professor tem Biblioteca como destino inicial',()=>{
    const contexto=vm.createContext({document:{getElementById:()=>({addEventListener(){}})},location:{search:''},URLSearchParams});
    vm.runInContext(readFileSync(new URL('../../js/login.js',import.meta.url),'utf8'),contexto);
    assert.equal(vm.runInContext("destino({perfil:'professor'})",contexto),'/biblioteca.html');
});
