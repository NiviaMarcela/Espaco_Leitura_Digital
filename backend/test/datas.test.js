import test from "node:test";
import assert from "node:assert/strict";
// O módulo do backend é a cópia usada pela API; js/datas.mjs é a usada pelo navegador.
// Este teste é o único lugar que importa os dois, para garantir que não divirjam.
import * as servidor from "../src/utils/datas.js";
import * as navegador from "../../js/datas.mjs";

test("as cópias de datas do backend e do navegador concordam", () => {
    const datas = ["0001-01-01", "2024-02-29", "2025-02-29", "2026-04-31", "2026-10-12", "9999-12-31",
        "0000-01-01", "07/10/2016", "", null, 2016, undefined];
    for (const valor of datas) {
        assert.equal(servidor.dataCivilValida(valor), navegador.dataCivilValida(valor), `dataCivilValida(${valor})`);
    }

    const instantes = ["2026-10-08T01:00:00Z", "2026-10-08T02:59:59Z", "2026-10-08T03:00:00Z", "2026-01-01T00:00:00Z"];
    for (const instante of instantes) {
        assert.equal(servidor.hojeCivil(new Date(instante)), navegador.hojeCivil(new Date(instante)), `hojeCivil(${instante})`);
    }

    for (const [nascimento, hoje] of [["2016-10-07", "2026-10-06"], ["2016-10-07", "2026-10-07"],
        ["2020-02-29", "2025-02-28"], ["2020-02-29", "2025-03-01"], ["2030-01-01", "2026-10-07"]]) {
        assert.equal(servidor.calcularIdade(nascimento, hoje), navegador.calcularIdade(nascimento, hoje),
            `calcularIdade(${nascimento}, ${hoje})`);
    }

    for (const [civil, dias] of [["2026-10-12", 15], ["2026-12-25", 15], ["2024-02-20", 15], ["2026-03-01", -1]]) {
        assert.equal(servidor.somarDias(civil, dias), navegador.somarDias(civil, dias), `somarDias(${civil}, ${dias})`);
    }
});
