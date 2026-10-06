// 🎯 src/utils/simulador/resumoComparacao.js
// Transforma a telemetria bruta do motor (centenas de pontos por rodada)
// em números pequenos, e soma tudo no resumo que a tela mostra.
// Convenção da margem (igual ao torena-sim): negativa = A na frente,
// positiva = B na frente, em comprimentos ("L", 2,5 m).

const COMPRIMENTO = 2.5;

function metricasCorredora(r, distancia) {
  const pos = r.position;
  let fim = pos.findIndex((p) => p >= distancia);
  if (fim < 0) fim = pos.length - 1;
  let vmax = 0;
  for (const v of r.velocity) if (v > vmax) vmax = v;
  const skills = {};
  for (const [id, lista] of Object.entries(r.skillActivations ?? {})) {
    // 1ª ativação; o fim é o do efeito mais longo dela (cada efeito vem num log)
    if (lista?.length) skills[id] = { inicio: lista[0].start, fim: Math.max(...lista.filter((x) => Math.abs(x.start - lista[0].start) < 1).map((x) => x.end)) };
  }
  return {
    fim,
    tempo: r.time[fim],
    vmax,
    atraso: r.startDelay ?? 0,
    rushed: (r.rushed?.length ?? 0) > 0,
    // Início (em metros) de cada mecânica de corrida, ou null se não aconteceu
    posRushed: r.rushed?.[0]?.[0] ?? null,
    posSpot: r.spotStruggleRegion?.[0] ?? null,
    posDuelo: r.duelingRegion?.[0] ?? null,
    posCarregado: r.fullyChargedRegion?.[0] ?? null,
    spurt: !!r.hasAchievedFullSpurt,
    semHp: !!r.outOfHp,
    hp: r.hp[r.hp.length - 1],
    late: !!r.firstPositionInLateRace,
    ledger: r.staminaLedger ?? null,
    skills,
  };
}

// Uma rodada → { d (margem em L), a, b }
export function metricasRodada(rodada, distancia) {
  const ma = metricasCorredora(rodada.a, distancia);
  const mb = metricasCorredora(rodada.b, distancia);
  // Mede a distância entre as duas no instante em que a primeira cruza.
  const i = Math.min(ma.fim, mb.fim);
  const pa = rodada.a.position[Math.min(i, rodada.a.position.length - 1)];
  const pb = rodada.b.position[Math.min(i, rodada.b.position.length - 1)];
  return { d: (pb - pa) / COMPRIMENTO, a: ma, b: mb };
}

// Linhas do "livro de stamina" do motor (negativo = economizou, positivo = custou).
export const CHAVES_LEDGER = ["maxHp", "baselineSpent", "totalSpent", "downhill", "rushed", "spotStruggle", "paceUp", "paceDown", "dueling", "totalRecovered", "totalDrainedByEffects"];

const MECANICAS = ["Rushed", "Spot", "Duelo", "Carregado"];
const faixaVazia = () => Object.fromEntries(CHAVES_LEDGER.map((k) => [k, { min: Infinity, max: -Infinity }]));
const somaVazia = () => ({ faixaLedger: faixaVazia(), mec: Object.fromEntries(MECANICAS.map((k) => [k, { vezes: 0, somaPos: 0 }])), tempo: 0, vmax: 0, atraso: 0, rushed: 0, spurt: 0, semHp: 0, hp: 0, late: 0, skills: {}, hps: [], ledger: Object.fromEntries(CHAVES_LEDGER.map((k) => [k, 0])) });

const estatisticas = (lista) => {
  const o = [...lista].sort((x, y) => x - y);
  const n = o.length;
  if (!n) return { min: 0, max: 0, media: 0, mediana: 0 };
  return { min: o[0], max: o[n - 1], media: o.reduce((s, x) => s + x, 0) / n, mediana: n % 2 ? o[(n - 1) / 2] : (o[n / 2 - 1] + o[n / 2]) / 2 };
};

export function novoAcumulador() {
  return { margens: [], a: somaVazia(), b: somaVazia() };
}

export function acumular(acc, m) {
  acc.margens.push(m.d);
  for (const lado of ["a", "b"]) {
    const s = acc[lado];
    const x = m[lado];
    s.tempo += x.tempo;
    s.vmax += x.vmax;
    s.atraso += x.atraso;
    s.hp += x.hp;
    s.hps.push(x.hp);
    for (const k of MECANICAS) {
      const pos = x[`pos${k}`];
      if (pos != null) { s.mec[k].vezes += 1; s.mec[k].somaPos += pos; }
    }
    if (x.ledger) for (const k of CHAVES_LEDGER) {
      const v = x.ledger[k] ?? 0;
      s.ledger[k] += v;
      s.faixaLedger[k].min = Math.min(s.faixaLedger[k].min, v);
      s.faixaLedger[k].max = Math.max(s.faixaLedger[k].max, v);
    }
    if (x.rushed) s.rushed += 1;
    if (x.spurt) s.spurt += 1;
    if (x.semHp) s.semHp += 1;
    if (x.late) s.late += 1;
    for (const [id, { inicio, fim }] of Object.entries(x.skills)) {
      const k = (s.skills[id] ??= { vezes: 0, somaPos: 0, somaDur: 0, min: Infinity, max: -Infinity });
      k.vezes += 1;
      k.somaPos += inicio;
      k.somaDur += Math.max(0, fim - inicio);
      k.min = Math.min(k.min, inicio);
      k.max = Math.max(k.max, inicio);
    }
  }
}

export function finalizar(acc) {
  const n = acc.margens.length;
  const ordenadas = [...acc.margens].sort((x, y) => x - y);
  const media = n ? acc.margens.reduce((s, x) => s + x, 0) / n : 0;
  const mediana = n ? (n % 2 ? ordenadas[(n - 1) / 2] : (ordenadas[n / 2 - 1] + ordenadas[n / 2]) / 2) : 0;
  const lado = (s) => ({
    tempo: s.tempo / n,
    vmax: s.vmax / n,
    atraso: s.atraso / n,
    hp: s.hp / n,
    rushed: s.rushed / n,
    spurt: s.spurt / n,
    semHp: s.semHp / n,
    late: s.late / n,
    hpFim: estatisticas(s.hps),
    // { taxa, posicaoMedia } por mecânica (Rushed, Spot, Duelo, Carregado)
    mecanicas: Object.fromEntries(MECANICAS.map((k) => [k, { taxa: s.mec[k].vezes / n, posicaoMedia: s.mec[k].vezes ? s.mec[k].somaPos / s.mec[k].vezes : null }])),
    hps: s.hps.map((x) => Math.round(x)),
    ledger: Object.fromEntries(CHAVES_LEDGER.map((k) => [k, s.ledger[k] / n])),
    faixaLedger: s.faixaLedger,
    skills: Object.fromEntries(Object.entries(s.skills).map(([id, k]) => [id, { taxa: k.vezes / n, posicaoMedia: k.somaPos / k.vezes, duracaoMedia: k.somaDur / k.vezes, min: k.min, max: k.max }])),
  });
  return {
    n,
    margens: acc.margens.map((x) => Math.round(x * 100) / 100),
    min: ordenadas[0] ?? 0,
    max: ordenadas[n - 1] ?? 0,
    media,
    mediana,
    aFrente: acc.margens.filter((x) => x < 0).length,
    bFrente: acc.margens.filter((x) => x > 0).length,
    a: lado(acc.a),
    b: lado(acc.b),
  };
}

// Telemetria enxuta de uma corrida (≈400 pontos) pro gráfico de velocidade/HP
// e as skills que ativaram nela.
export function telemetriaCompacta(r, distancia) {
  const n = r.position.length;
  const passo = Math.max(1, Math.ceil(n / 400));
  const vel = [];
  const hp = [];
  for (let i = 0; i < n; i += passo) {
    const pos = Math.min(r.position[i], distancia);
    if (pos < 0) continue;
    vel.push([Math.round(pos * 10) / 10, Math.round(r.velocity[i] * 100) / 100]);
    hp.push([Math.round(pos * 10) / 10, Math.round(r.hp[i])]);
  }
  const skills = [];
  // O motor loga cada EFEITO da skill (uma unique com 2 efeitos = 2 logs com o
  // mesmo início): junta os da mesma ativação numa etiqueta só.
  for (const [id, lista] of Object.entries(r.skillActivations ?? {})) {
    for (const at of lista ?? []) {
      const fim = Math.min(at.end, distancia);
      const mesma = skills.find((s) => s.id === id && Math.abs(s.inicio - at.start) < 1);
      if (mesma) mesma.fim = Math.max(mesma.fim, fim);
      else skills.push({ id, inicio: at.start, fim });
    }
  }
  const eventos = [];
  (r.rushed ?? []).forEach(([ini, fim]) => eventos.push({ tipo: "Rushed", inicio: ini, fim }));
  if (r.spotStruggleRegion) eventos.push({ tipo: "Spot struggle", inicio: r.spotStruggleRegion[0], fim: r.spotStruggleRegion[1] });
  if (r.duelingRegion) eventos.push({ tipo: "Duelo", inicio: r.duelingRegion[0], fim: r.duelingRegion[1] });
  if (r.fullyChargedRegion) eventos.push({ tipo: "Fully Charged", inicio: r.fullyChargedRegion[0], fim: r.fullyChargedRegion[1] });
  return { vel, hp, skills, eventos: eventos.map((e) => ({ ...e, fim: Math.min(Math.max(e.fim, e.inicio), distancia) })), maxHp: r.staminaLedger?.maxHp ?? Math.max(...r.hp) };
}
