const el = id => document.getElementById(id);
const gestao = document.body.hasAttribute('data-reservas-gestao');
const formatarData = data => data
    ? String(data).slice(0, 10).split('-').reverse().join('/')
    : '—';
let ocupado = false;

// Cor, ícone e texto juntos identificam a situação sem depender apenas da cor.
function seloReserva(status) {
    const estilos = {
        Pendente: ['pendente', 'bi-clock-history', 'Aguardando retirada'],
        Retirada: ['retirada', 'bi-check-circle', 'Retirada confirmada'],
        Cancelada: ['cancelada', 'bi-x-circle', 'Cancelada']
    };
    const [classe, icone, texto] = estilos[status] || ['neutra', 'bi-info-circle', status];
    const selo = document.createElement('span');
    selo.className = `reserva-status reserva-status-${classe}`;
    const simbolo = document.createElement('i');
    simbolo.className = `bi ${icone}`;
    simbolo.setAttribute('aria-hidden', 'true');
    selo.append(simbolo, document.createTextNode(texto));
    return selo;
}

async function api(caminho, gravar = false) {
    const resposta = await fetch(`/api${caminho}`, {
        method: gravar ? 'POST' : 'GET', cache: 'no-store',
        headers: gravar ? { 'Content-Type': 'application/json' } : {},
        body: gravar ? '{}' : undefined, signal: AbortSignal.timeout(15000)
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível consultar as reservas.');
    return dados;
}

async function carregar() {
    el('atualizarReservas').disabled = true;
    try {
        const reservas = await api(gestao ? '/reservas' : '/minhas-reservas');
        const tabela = el('tabelaReservas');
        tabela.replaceChildren();
        if (!reservas.length) {
            const celula = tabela.insertRow().insertCell();
            celula.colSpan = 7;
            celula.textContent = 'Nenhuma reserva encontrada.';
        }
        for (const reserva of reservas) {
            const linha = tabela.insertRow();
            for (const valor of [reserva.leitor, `${reserva.livro} · ${reserva.codigo} · ${reserva.centro}`,
                formatarData(reserva.dataReserva),
                formatarData(reserva.dataLimiteRetirada),
                formatarData(reserva.dataPrevistaDevolucao)]) linha.insertCell().textContent = valor;
            linha.insertCell().append(seloReserva(reserva.status));
            const acoes = linha.insertCell();
            const grupoAcoes = document.createElement('div');
            grupoAcoes.className = 'reserva-acoes';
            acoes.append(grupoAcoes);
            if (reserva.status === 'Pendente') {
                for (const [acao, texto] of gestao ? [['retirar','Confirmar retirada'],['cancelar','Cancelar']] : [['cancelar','Cancelar reserva']]) {
                    const botao = document.createElement('button');
                    botao.type = 'button';
                    botao.className = `btn btn-sm ${acao === 'retirar' ? 'btn-success' : 'btn-outline-danger'}`;
                    const icone = document.createElement('i');
                    icone.className = `bi ${acao === 'retirar' ? 'bi-check2-circle' : 'bi-x-circle'}`;
                    icone.setAttribute('aria-hidden', 'true');
                    botao.append(icone, document.createTextNode(` ${texto}`));
                    botao.setAttribute('aria-label', `${texto}: ${reserva.livro}, ${reserva.codigo}`);
                    botao.addEventListener('click', async () => {
                        if (ocupado) return;
                        if (!confirm(acao === 'retirar'
                            ? 'Confirma que o leitor está recebendo esta cópia? A devolução vence 30 dias após a reserva.'
                            : 'Cancelar esta reserva e liberar a cópia?')) return;
                        ocupado = true;
                        tabela.querySelectorAll('button').forEach(b => { b.disabled = true; });
                        try {
                            await api(`/reservas/${reserva.id}/${acao}`, true);
                            await carregar();
                            document.dispatchEvent(new Event('reservas-atualizadas'));
                        } catch (erro) {
                            el('avisoReservas').textContent = `${erro.message} Atualize a lista antes de tentar novamente.`;
                        } finally {
                            ocupado = false;
                            tabela.querySelectorAll('button').forEach(b => { b.disabled = false; });
                        }
                    });
                    grupoAcoes.append(botao);
                }
            }
        }
        el('avisoReservas').textContent = `${reservas.filter(r => r.status === 'Pendente').length} reserva(s) aguardando retirada. Reservas não retiradas em 7 dias são canceladas e liberam o exemplar; a devolução vence 30 dias após a reserva.`;
    } catch (erro) {
        el('avisoReservas').textContent = erro.message || 'Não foi possível carregar as reservas.';
    } finally { el('atualizarReservas').disabled = false; }
}
el('atualizarReservas').addEventListener('click', () => { if (!ocupado) carregar(); });
carregar();
