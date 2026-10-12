import test from 'node:test';
import assert from 'node:assert/strict';
import { calcularIdade, dataCivilValida, hojeCivil } from '../src/utils/datas.js';
import { validarLeitor } from '../src/services/validation/index.js';

test('idade respeita aniversário, virada de ano e nascimento em 29/02', () => {
    assert.equal(calcularIdade('2016-10-07', '2026-10-06'), 9);
    assert.equal(calcularIdade('2016-10-07', '2026-10-07'), 10);
    assert.equal(calcularIdade('2016-12-31', '2027-01-01'), 10);
    assert.equal(calcularIdade('2026-10-07', '2026-10-07'), 0);
    assert.equal(calcularIdade('2020-02-29', '2025-02-28'), 4);
    assert.equal(calcularIdade('2020-02-29', '2025-03-01'), 5);
    assert.equal(calcularIdade('2030-01-01', '2026-10-07'), null);
    assert.equal(hojeCivil(new Date('2026-10-08T01:00:00Z')), '2026-10-07');
});

test('datas civis rejeitam normalização silenciosa, formato incorreto e valores inválidos', () => {
    assert.equal(dataCivilValida('2024-02-29'), true);
    for (const data of ['2025-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '07/10/2016', '', null, 2016]) {
        assert.equal(dataCivilValida(data), false);
    }
});

test('validação exige nascimento e ignora idade/faixa enviadas pelo navegador', () => {
    const base = { nome: ' Ana ', tipo: 'Aluno', dataNascimento: '2016-10-07', centroId: 1 };
    const validado = validarLeitor({ ...base, idade: 99, faixaEtaria: '18+', matriculaCodigo: '  ' });
    assert.equal(validado.nome, 'Ana');
    assert.equal(validado.matriculaCodigo, null);
    assert.equal(validado.status, 'Ativo');
    assert.equal('idade' in validado, false);
    assert.equal('faixaEtaria' in validado, false);
    for (const alteracao of [{ dataNascimento: '9999-01-01' }, { dataNascimento: '2025-02-29' },
        { dataNascimento: undefined }, { nome: ' ' }, { centroId: '1' }, { tipo: 'Outro' },
        { status: 'Bloqueado' }, { email: 'invalido' }]) {
        assert.throws(() => validarLeitor({ ...base, ...alteracao }), { status: 400 });
    }
});
