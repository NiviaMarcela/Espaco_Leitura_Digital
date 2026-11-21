// Datas civis (sem horário): evita mudar o aniversário ao converter fuso horário.
export function hojeCivil(agora = new Date()) {
    const partes = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(agora);
    const valor = tipo => partes.find(parte => parte.type === tipo).value;
    return `${valor('year')}-${valor('month')}-${valor('day')}`;
}

export function dataCivilValida(valor) {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor < '0001-01-01') return false;
    const data = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

export function calcularIdade(nascimento, hoje = hojeCivil()) {
    if (!dataCivilValida(nascimento) || !dataCivilValida(hoje) || nascimento > hoje) return null;
    // Só completa mais um ano quando o aniversário chega.
    return Number(hoje.slice(0, 4)) - Number(nascimento.slice(0, 4))
        - (hoje.slice(5) < nascimento.slice(5) ? 1 : 0);
}

export function somarDias(dataCivil, dias) {
    if (!dataCivilValida(dataCivil) || !Number.isInteger(dias)) throw new Error('Data ou quantidade de dias inválida.');
    const data = new Date(`${dataCivil}T00:00:00Z`);
    data.setUTCDate(data.getUTCDate() + dias);
    return data.toISOString().slice(0, 10);
}
