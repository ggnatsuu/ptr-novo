// 🎯 src/utils/conquistas/metricasArquivo.js
// Números de uma cavalinha numa corrida enviada por arquivo, tirados do
// replay (simulação decodificada), que as conquistas de "Leitura da
// Corrida" usam. Função pura: recebe a simulação e devolve os números.

import courseData from "../../uma-skill-tools/data/course_data.json";
import skillData from "../../uma-skill-tools/data/skill_data.json";

const TIPO_SKILL = 3;
const RARIDADE_DOURADA = 2;

export function metricasConquistas(raceData, numero, courseId) {
  const frames = raceData.frame;
  const indice = numero - 1;
  const resultados = raceData.horseResult;
  const curso = courseData[courseId] ?? null;
  const distancia = curso?.distance ?? null;
  const chegada = resultados[indice]?.finishTimeRaw > 0 ? resultados[indice].finishTimeRaw : frames[frames.length - 1].time;
  const posFinal = (resultados[indice]?.finishOrder ?? -1) + 1;

  // Distância de todos num instante (linear entre quadros) e posição.
  const distanciasEm = (t) => {
    let lo = 0;
    let hi = frames.length - 1;
    while (hi - lo > 1) {
      const meio = (lo + hi) >> 1;
      if (frames[meio].time <= t) lo = meio;
      else hi = meio;
    }
    const f = frames[hi].time > frames[lo].time ? Math.min(1, Math.max(0, (t - frames[lo].time) / (frames[hi].time - frames[lo].time))) : 0;
    return frames[lo].horseFrame.map((h, i) => h.distance + (frames[hi].horseFrame[i].distance - h.distance) * f);
  };
  const posicaoEm = (t) => {
    const d = distanciasEm(t);
    const chegou = (i) => resultados[i].finishTimeRaw > 0 && t >= resultados[i].finishTimeRaw;
    const ordem = d.map((_, i) => i).sort((a, b) => {
      if (chegou(a) && chegou(b)) return resultados[a].finishOrder - resultados[b].finishOrder;
      if (chegou(a) !== chegou(b)) return chegou(a) ? -1 : 1;
      return d[b] - d[a];
    });
    return { posicao: ordem.indexOf(indice) + 1, minhaDistancia: d[indice] };
  };

  // Posições ao longo da corrida (a cada 0,5 s até a chegada).
  const amostras = [];
  for (let t = 0; t < chegada; t += 0.5) amostras.push({ t, ...posicaoEm(t) });
  const posInicio = amostras.find((a) => a.t >= 5)?.posicao ?? amostras[0]?.posicao ?? posFinal;

  // Liderou do fim da largada (200 m) até a chegada.
  const depoisDaLargada = amostras.filter((a) => a.minhaDistancia >= 200);
  const liderouPontaAPonta = posFinal === 1 && depoisDaLargada.length > 0 && depoisDaLargada.every((a) => a.posicao === 1);

  // Posição no início da reta final (a reta que termina na chegada).
  let posInicioRetaFinal = null;
  const retaFinal = distancia ? (curso.straights ?? []).find((s) => s.end >= distancia - 1) : null;
  if (retaFinal) {
    const amostra = amostras.find((a) => a.minhaDistancia >= retaFinal.start);
    posInicioRetaFinal = amostra?.posicao ?? null;
  }

  // Rushed, bloqueio e HP, quadro a quadro (até a chegada).
  const primeiraCurva = curso?.corners?.[0] ?? null;
  let rushedSegundos = 0;
  let rushedNaPrimeiraCurva = false;
  let bloqueadoNaParteFinal = false;
  let hpRecuperado = 0;
  const quadros = frames.filter((f) => f.time <= chegada);
  quadros.forEach((f, k) => {
    const h = f.horseFrame[indice];
    const dt = (quadros[k + 1]?.time ?? chegada) - f.time;
    if ((h.temptationMode ?? 0) > 0) {
      rushedSegundos += dt;
      if (primeiraCurva && h.distance >= primeiraCurva.start && h.distance <= primeiraCurva.start + primeiraCurva.length) rushedNaPrimeiraCurva = true;
    }
    if ((h.blockFrontHorseIndex ?? -1) >= 0 && distancia && h.distance >= (distancia * 2) / 3) bloqueadoNaParteFinal = true;
    if (k > 0) {
      const ganho = h.hp - quadros[k - 1].horseFrame[indice].hp;
      if (ganho > 0) hpRecuperado += ganho;
    }
  });

  // Skills ativadas (sem repetir): únicas herdadas (9xxxxx) e douradas.
  const ativadas = new Set(
    raceData.event
      .map(({ event }) => event)
      .filter((ev) => ev && ev.type === TIPO_SKILL && ev.param?.[0] === indice)
      .map((ev) => ev.param[1]),
  );
  const herdadasAtivadas = [...ativadas].filter((id) => id >= 900000 && id < 1000000).length;
  const douradasAtivadas = [...ativadas].filter((id) => skillData[id]?.rarity === RARIDADE_DOURADA).length;

  return {
    posInicio,
    posFinal,
    ganhoPosicoes: posInicio - posFinal,
    posInicioRetaFinal,
    liderouPontaAPonta,
    rushedSegundos,
    rushedNaPrimeiraCurva,
    bloqueadoNaParteFinal,
    hpRecuperado: Math.round(hpRecuperado),
    herdadasAtivadas,
    douradasAtivadas,
  };
}
