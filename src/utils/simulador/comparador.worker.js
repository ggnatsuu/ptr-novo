// 🎯 src/utils/simulador/comparador.worker.js
// Roda a comparação A×B fora da página (não trava a tela), em lotes pra
// poder mostrar progresso e não segurar toda a telemetria na memória.

import { distanciaDaPista, loteComparacao, loteCorrida, rodadasSozinha, taxaFullSpurt } from "./motor";
import { acumular, finalizar, metricasRodada, novoAcumulador, telemetriaCompacta } from "./resumoComparacao";

const TAMANHO_LOTE = 50;

// Menor stamina (de 10 em 10) que atinge a taxa alvo de full spurt.
async function calcularStamina({ courseId, condicoes, corredora, alvo, semente, forcar }) {
  const taxa = (st) => taxaFullSpurt({ courseId, condicoes, corredora, stamina: st, semente, forcar });
  const passa = async (st) => (await taxa(st)) >= alvo - 1e-9;
  let lo = 100, hi = 2000, passos = 0;
  self.postMessage({ tipo: "progresso", feito: 0, total: 9 });
  if (!(await passa(hi))) return { necessaria: null, taxa: await taxa(hi) };
  while (hi - lo > 10) {
    const meio = Math.round((lo + hi) / 20) * 10;
    if (await passa(meio)) hi = meio; else lo = meio;
    passos += 1;
    self.postMessage({ tipo: "progresso", feito: Math.min(passos, 8), total: 9 });
  }
  return { necessaria: hi, taxa: await taxa(hi) };
}

// Corrida completa (replay): % de vitória, top 3, posição média e a
// distribuição de posições de cada corredora.
async function simularReplay({ courseId, condicoes, corredoras, vezes, semente }) {
  const n = corredoras.length;
  const est = corredoras.map(() => ({ vitorias: 0, top3: 0, somaPos: 0, posicoes: Array(n).fill(0) }));
  let skillsIgnoradas = {};
  let feitas = 0;
  for (let lote = 0; feitas < vezes; lote += 1) {
    const qtd = Math.min(TAMANHO_LOTE, vezes - feitas);
    const res = await loteCorrida({ courseId, condicoes, corredoras, vezes: qtd, semente: semente + lote * 7919 });
    skillsIgnoradas = { ...skillsIgnoradas, ...res.skillsIgnoradas };
    for (const ordem of res.ordens) {
      ordem.forEach((id, pos) => {
        const e = est[id];
        if (!e) return;
        e.somaPos += pos + 1;
        e.posicoes[pos] += 1;
        if (pos === 0) e.vitorias += 1;
        if (pos < 3) e.top3 += 1;
      });
    }
    feitas += qtd;
    self.postMessage({ tipo: "progresso", feito: feitas, total: vezes });
  }
  return {
    vezes: feitas,
    semente,
    skillsIgnoradas,
    corredoras: est.map((e) => ({ chance: e.vitorias / feitas, top3: e.top3 / feitas, posicaoMedia: e.somaPos / feitas, posicoes: e.posicoes.map((p) => p / feitas) })),
  };
}

// Quanto cada skill vale (em comprimentos): a build inteira contra a mesma
// build sem aquela skill, com a mesma sorte (modo vacuum, sem interação).
async function valorDasSkills({ courseId, condicoes, corredora, skills, vezes = 100, semente, ajustes }) {
  const distancia = distanciaDaPista(courseId);
  const resultado = {};
  for (let i = 0; i < skills.length; i += 1) {
    const id = skills[i];
    const sem = { ...corredora, skills: corredora.skills.filter((x) => x !== id) };
    let soma = 0, n = 0, ativou = 0;
    for (let feito = 0, lote = 0; feito < vezes; lote += 1) {
      const qtd = Math.min(TAMANHO_LOTE, vezes - feito);
      const res = await loteComparacao({ courseId, condicoes, a: corredora, b: sem, modo: "vacuo", vezes: qtd, semente: semente + lote * 7919, ajustes });
      for (const rodada of res.rodadas) {
        if (!rodada.a || !rodada.b) continue;
        const m = metricasRodada(rodada, distancia);
        soma += -m.d; // margem negativa = a build completa (A) na frente
        n += 1;
        if (m.a.skills[id]) ativou += 1;
      }
      feito += qtd;
    }
    resultado[id] = { valor: n ? soma / n : 0, taxa: n ? ativou / n : 0 };
    self.postMessage({ tipo: "progresso", feito: i + 1, total: skills.length });
  }
  return resultado;
}

// "Quais skills comprar": a base roda uma vez; cada candidata roda base+skill
// com a mesma semente, e o ganho (em L) de cada rodada vira mín/máx/média/
// mediana. Manda o resultado de cada skill assim que fica pronto.
async function tabelaSkills({ courseId, condicoes, corredora, candidatos, vezes, semente, ajustes }) {
  const distancia = distanciaDaPista(courseId);
  const base = await rodadasSozinha({ courseId, condicoes, corredora, vezes, semente, ajustes });
  for (const id of candidatos) {
    const com = await rodadasSozinha({ courseId, condicoes, corredora: { ...corredora, skills: [...corredora.skills, id] }, vezes, semente, ajustes });
    const ganhos = [];
    let ativou = 0;
    com.forEach((r, i) => {
      if (!r || !base[i]) return;
      const m = metricasRodada({ a: r, b: base[i] }, distancia);
      ganhos.push(-m.d); // margem negativa = a build com a skill (A) na frente
      if (m.a.skills[id]) ativou += 1;
    });
    ganhos.sort((x, y) => x - y);
    const n = ganhos.length || 1;
    self.postMessage({
      tipo: "skill",
      id,
      min: ganhos[0] ?? 0,
      max: ganhos[ganhos.length - 1] ?? 0,
      media: ganhos.reduce((s, x) => s + x, 0) / n,
      mediana: ganhos.length % 2 ? ganhos[(ganhos.length - 1) / 2] : ((ganhos[ganhos.length / 2 - 1] ?? 0) + (ganhos[ganhos.length / 2] ?? 0)) / 2,
      taxa: ativou / n,
    });
  }
}

self.onmessage = async ({ data }) => {
  if (data.tipo === "tabelaSkills") {
    try {
      await tabelaSkills(data);
      self.postMessage({ tipo: "fim" });
    } catch (erro) {
      self.postMessage({ tipo: "erro", mensagem: String(erro?.message ?? erro) });
    }
    return;
  }
  if (data.tipo === "valorSkills") {
    try {
      self.postMessage({ tipo: "fim", resultado: await valorDasSkills(data) });
    } catch (erro) {
      self.postMessage({ tipo: "erro", mensagem: String(erro?.message ?? erro) });
    }
    return;
  }
  if (data.tipo === "corrida") {
    try {
      self.postMessage({ tipo: "fim", resultado: await simularReplay(data) });
    } catch (erro) {
      self.postMessage({ tipo: "erro", mensagem: String(erro?.message ?? erro) });
    }
    return;
  }
  if (data.tipo === "stamina") {
    try {
      self.postMessage({ tipo: "fim", resultado: await calcularStamina(data) });
    } catch (erro) {
      self.postMessage({ tipo: "erro", mensagem: String(erro?.message ?? erro) });
    }
    return;
  }
  const { courseId, condicoes, a, b, modo, vezes, semente, campo, forcaCampo, ajustes } = data;
  try {
    const distancia = distanciaDaPista(courseId);
    const acc = novoAcumulador();
    let skillsIgnoradas = {};
    // Uma corrida "típica" por lote (a mais perto da mediana do lote); no fim
    // fica a mais perto da mediana geral, pro gráfico de velocidade/HP.
    const candidatas = [];
    for (let feito = 0, lote = 0; feito < vezes; lote += 1) {
      const n = Math.min(TAMANHO_LOTE, vezes - feito);
      const res = await loteComparacao({ courseId, condicoes, a, b, modo, vezes: n, semente: semente + lote * 7919, campo, forcaCampo, ajustes });
      skillsIgnoradas = { ...skillsIgnoradas, ...res.skillsIgnoradas };
      const doLote = [];
      for (const rodada of res.rodadas) {
        if (!rodada.a || !rodada.b) continue;
        const m = metricasRodada(rodada, distancia);
        acumular(acc, m);
        doLote.push({ d: m.d, rodada });
      }
      if (doLote.length) {
        const ord = doLote.map((x) => x.d).sort((x, y) => x - y);
        const med = ord[Math.floor(ord.length / 2)];
        const tipica = doLote.reduce((m, x) => (Math.abs(x.d - med) < Math.abs(m.d - med) ? x : m));
        candidatas.push({ d: tipica.d, a: telemetriaCompacta(tipica.rodada.a, distancia), b: telemetriaCompacta(tipica.rodada.b, distancia) });
      }
      feito += n;
      self.postMessage({ tipo: "progresso", feito, total: vezes });
    }
    const resumo = finalizar(acc);
    const amostra = candidatas.reduce((m, x) => (!m || Math.abs(x.d - resumo.mediana) < Math.abs(m.d - resumo.mediana) ? x : m), null);
    self.postMessage({ tipo: "fim", resumo: { ...resumo, amostra, semente, modo, campo, forcaCampo, ajustes, skillsIgnoradas } });
  } catch (erro) {
    self.postMessage({ tipo: "erro", mensagem: String(erro?.message ?? erro) });
  }
};
