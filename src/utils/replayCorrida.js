// 🎯 src/utils/replayCorrida.js
// Parte "sem tela" do replay (components/ReplayCorrida.jsx): transforma a
// simulação decodificada pelo parser do Hakuraku em quadros, cavalos e
// rótulos, e calcula onde cada cavalo está num instante qualquer.

import skillNamesRaw from "../uma-skill-tools/data/skillnames.json";
import courseData from "../uma-skill-tools/data/course_data.json";
import { iconeDaRoupa } from "./iconeRoupa";

const DURACAO_ROTULO_SKILL = 2.5;
const DURACAO_ROTULO_EVENTO = 3;

const TIPO_SKILL = 3;
const TIPO_DISPUTA_PONTA = 4;
const TIPO_DUELO = 5;

function nomeDaSkill(id) {
  const nomes = skillNamesRaw[id] ?? (id >= 900000 && id < 1000000 ? skillNamesRaw[id - 800000] : null);
  return (nomes && (nomes[1] || nomes[0])) || `Skill ${id}`;
}

// ---------------------------------------------------------------------
// PREPARO DOS DADOS
// ---------------------------------------------------------------------

export function prepararCorrida(raceData, replay) {
  const frames = raceData.frame.map((f) => ({
    tempo: f.time,
    cavalos: f.horseFrame.map((h) => ({
      distancia: h.distance,
      raia: h.lanePosition,
      velocidade: h.speed / 100, // m/s
      hp: h.hp,
      rushed: (h.temptationMode ?? 0) > 0,
    })),
  }));
  const numCavalos = frames[0].cavalos.length;
  const hpInicial = frames[0].cavalos.map((c) => c.hp || 1);
  const resultados = raceData.horseResult.map((r) => ({
    posicaoFinal: r.finishOrder + 1,
    tempoChegada: r.finishTimeRaw,
    inicioSpurt: r.lastSpurtStartDistance,
  }));

  const infoPorNumero = new Map((replay.cavalos ?? []).map((c) => [c.numero, c]));
  const cavalos = Array.from({ length: numCavalos }, (_, i) => {
    const info = infoPorNumero.get(i + 1) ?? {};
    return {
      indice: i,
      numero: i + 1,
      personagem: info.personagem ?? `#${i + 1}`,
      treinador: info.treinador ?? null,
      npc: !info.treinador,
      icone: iconeDaRoupa(info.cardId),
      estilo: info.estilo ?? null,
    };
  });

  // Rótulos que aparecem em cima dos cavalos: skills, duelos, disputa de
  // ponta e o início do last spurt. As skills do tempo 0 são as passivas
  // (verdes) e ficariam todas empilhadas na largada — não entram.
  const rotulos = [];
  raceData.event.forEach(({ event }) => {
    if (!event) return;
    const indice = event.param?.[0];
    if (indice === undefined || indice < 0 || indice >= numCavalos) return;
    if (event.type === TIPO_SKILL && event.frameTime > 0.1) {
      rotulos.push({ indice, inicio: event.frameTime, fim: event.frameTime + DURACAO_ROTULO_SKILL, texto: nomeDaSkill(event.param[1]), tipo: "skill" });
    } else if (event.type === TIPO_DUELO) {
      rotulos.push({ indice, inicio: event.frameTime, fim: event.frameTime + DURACAO_ROTULO_EVENTO, texto: "Duel", tipo: "duelo" });
    } else if (event.type === TIPO_DISPUTA_PONTA) {
      rotulos.push({ indice, inicio: event.frameTime, fim: event.frameTime + DURACAO_ROTULO_EVENTO, texto: "Spot Struggle", tipo: "ponta" });
    }
  });
  resultados.forEach((r, indice) => {
    if (!(r.inicioSpurt > 0)) return;
    for (let k = 1; k < frames.length; k++) {
      const a = frames[k - 1].cavalos[indice];
      const b = frames[k].cavalos[indice];
      if (a.distancia <= r.inicioSpurt && b.distancia >= r.inicioSpurt) {
        const fracao = b.distancia > a.distancia ? (r.inicioSpurt - a.distancia) / (b.distancia - a.distancia) : 0;
        const t = frames[k - 1].tempo + fracao * (frames[k].tempo - frames[k - 1].tempo);
        rotulos.push({ indice, inicio: t, fim: t + DURACAO_ROTULO_EVENTO, texto: "Last Spurt", tipo: "spurt" });
        break;
      }
    }
  });

  const ultimaChegada = Math.max(...resultados.map((r) => r.tempoChegada || 0));
  const tempoFinal = Math.min(frames[frames.length - 1].tempo, ultimaChegada + 2);
  const distancia = replay.condicoes?.distancia ?? courseData[replay.courseId]?.distance ?? 2000;

  return { frames, hpInicial, resultados, cavalos, rotulos, tempoFinal, distancia };
}

// Posição de cada cavalo no instante t (Hermite com a velocidade como derivada).
export function estadoNoTempo(corrida, t) {
  const { frames } = corrida;
  let lo = 0;
  let hi = frames.length - 1;
  if (t <= frames[0].tempo) hi = 0;
  else if (t >= frames[hi].tempo) lo = hi;
  else {
    while (hi - lo > 1) {
      const meio = (lo + hi) >> 1;
      if (frames[meio].tempo <= t) lo = meio;
      else hi = meio;
    }
  }
  const fa = frames[lo];
  const fb = frames[hi];
  const dt = fb.tempo - fa.tempo;
  const s = dt > 0 ? Math.min(1, Math.max(0, (t - fa.tempo) / dt)) : 0;
  const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
  const h10 = s ** 3 - 2 * s ** 2 + s;
  const h01 = -2 * s ** 3 + 3 * s ** 2;
  const h11 = s ** 3 - s ** 2;

  return fa.cavalos.map((a, i) => {
    const b = fb.cavalos[i];
    let distancia = dt > 0
      ? h00 * a.distancia + h10 * dt * a.velocidade + h01 * b.distancia + h11 * dt * b.velocidade
      : a.distancia;
    distancia = Math.min(Math.max(distancia, Math.min(a.distancia, b.distancia)), Math.max(a.distancia, b.distancia));
    return {
      distancia,
      raia: a.raia + (b.raia - a.raia) * s,
      velocidade: a.velocidade + (b.velocidade - a.velocidade) * s,
      hp: a.hp + (b.hp - a.hp) * s,
      rushed: a.rushed,
    };
  });
}

