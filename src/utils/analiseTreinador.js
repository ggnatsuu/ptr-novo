// 🎯 src/utils/analiseTreinador.js
// Contas da coluna de análise do painel do treinador
// (components/SecaoAnaliseTreinador.jsx): métricas tiradas do replay,
// o diagnóstico automático ("por que ganhou / por que perdeu") e o
// histórico do treinador nas outras corridas do PTR.

const kmh = (ms) => ms * 3.6;
const fmt = (n, casas = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

// ---------------------------------------------------------------------
// MÉTRICAS DO REPLAY
// ---------------------------------------------------------------------

export function metricasDoReplay(raceData, numero, distanciaCorrida) {
  const frames = raceData.frame;
  const indice = numero - 1;
  const resultados = raceData.horseResult;
  const resultado = resultados[indice];
  const chegada = resultado?.finishTimeRaw > 0 ? resultado.finishTimeRaw : frames[frames.length - 1].time;
  const quadros = frames.filter((f) => f.time <= chegada);

  // Distância de todos num instante (linear entre quadros).
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
    return ordem.indexOf(indice) + 1;
  };

  // Posição ao longo da corrida (a cada 0,5 s até a chegada).
  const posicoes = [];
  for (let t = 0; t <= chegada; t += 0.5) posicoes.push({ t, pos: posicaoEm(t) });
  const posFinal = (resultado?.finishOrder ?? -1) + 1;
  posicoes.push({ t: chegada, pos: posFinal });
  // "Largada" = logo depois de sair do portão, quando o pelotão já se ajeitou.
  const posInicio = posicoes.find((p) => p.t >= 5)?.pos ?? posicoes[0].pos;

  // Velocidade máxima e onde.
  let vMax = 0;
  let dVMax = 0;
  quadros.forEach((f) => {
    const h = f.horseFrame[indice];
    if (h.speed / 100 > vMax) {
      vMax = h.speed / 100;
      dVMax = h.distance;
    }
  });

  // Bloqueios: quantas vezes, quanto tempo (aprox., pela duração dos
  // quadros) e quantos na parte final da corrida.
  let vezes = 0;
  let segundos = 0;
  let naParteFinal = 0;
  let rushedSeg = 0;
  quadros.forEach((f, k) => {
    const h = f.horseFrame[indice];
    const dt = (quadros[k + 1]?.time ?? chegada) - f.time;
    const bloqueado = (h.blockFrontHorseIndex ?? -1) >= 0;
    const antes = k ? (quadros[k - 1].horseFrame[indice].blockFrontHorseIndex ?? -1) >= 0 : false;
    if (bloqueado) {
      segundos += dt;
      if (!antes) {
        vezes++;
        if (distanciaCorrida && h.distance >= (distanciaCorrida * 2) / 3) naParteFinal++;
      }
    }
    if ((h.temptationMode ?? 0) > 0) rushedSeg += dt;
  });

  // HP quando começou o last spurt.
  const hpInicial = frames[0].horseFrame[indice].hp || 1;
  let hpNoSpurt = null;
  const inicioSpurt = resultado?.lastSpurtStartDistance;
  if (inicioSpurt > 0) {
    for (let k = 1; k < quadros.length; k++) {
      const a = quadros[k - 1].horseFrame[indice];
      const b = quadros[k].horseFrame[indice];
      if (a.distance <= inicioSpurt && b.distance >= inicioSpurt) {
        const f = b.distance > a.distance ? (inicioSpurt - a.distance) / (b.distance - a.distance) : 0;
        hpNoSpurt = Math.max(0, a.hp + (b.hp - a.hp) * f);
        break;
      }
    }
  }

  return {
    posicoes,
    posInicio,
    posFinal,
    melhorPos: Math.min(...posicoes.map((p) => p.pos)),
    total: resultados.length,
    vMaxKmh: kmh(vMax),
    dVMax,
    bloqueios: { vezes, segundos, naParteFinal },
    rushedSeg,
    hpNoSpurt,
    hpNoSpurtPct: hpNoSpurt !== null ? (hpNoSpurt / hpInicial) * 100 : null,
  };
}

// ---------------------------------------------------------------------
// NÚMEROS SEM REPLAY (vêm da tabela / dos dados do treinador)
// ---------------------------------------------------------------------

export function metricasDaTabela(linha, dados, classificacao) {
  const skills = dados?.skillsCorrida ?? [];
  const comSpurt = classificacao.filter((l) => typeof l.last_spurt_speed === "number");
  const rankSpurt = typeof linha.last_spurt_speed === "number"
    ? [...comSpurt].sort((a, b) => b.last_spurt_speed - a.last_spurt_speed).findIndex((l) => l.numero === linha.numero) + 1
    : null;
  return {
    skillsTotal: skills.length,
    skillsUsadas: skills.filter((s) => s.status === "activated").length,
    skillsFalhaWit: skills.filter((s) => s.status === "failed-wit").length,
    spurtKmh: typeof linha.last_spurt_speed === "number" ? kmh(linha.last_spurt_speed) : null,
    rankSpurt,
    totalSpurt: comSpurt.length,
  };
}

// ---------------------------------------------------------------------
// DIAGNÓSTICO
// ---------------------------------------------------------------------

const LETRA = ["", "G", "F", "E", "D", "C", "B", "A", "S"];

// Frases curtas sobre o que decidiu a corrida. "tom": "bom" | "ruim" | "neutro".
export function montarDiagnostico({ linha, dados, distancia, tabela, replay }) {
  const itens = [];
  const stats = dados?.stats ?? {};

  // HP / fôlego
  if (linha.hp_status === "Died" && typeof linha.hp_m_diff === "number") {
    itens.push({
      peso: 10, tom: "ruim", icone: "⚠️",
      texto: `Ficou sem HP ${fmt(Math.abs(linha.hp_m_diff))} m antes da chegada${stats.stamina ? ` — com ${fmt(stats.stamina)} de Stamina${distancia ? ` para ${fmt(distancia)} m` : ""}, faltou fôlego` : ""}.`,
    });
  } else if (linha.hp_status === "Survived" && typeof linha.hp_val === "number") {
    if (linha.hp_val > 300) {
      itens.push({ peso: 6, tom: "neutro", icone: "🔋", texto: `Sobraram ${fmt(linha.hp_val)} HP na chegada — dava para gastar mais (mais Speed/Power ou skills de velocidade).` });
    } else {
      itens.push({ peso: 6, tom: "bom", icone: "✅", texto: `Gestão de HP quase perfeita: cruzou a linha com só ${fmt(linha.hp_val)} HP sobrando.` });
    }
  }

  // Last spurt
  if (typeof linha.last_spurt_delay_m === "number") {
    if (linha.last_spurt_delay_m <= 5) {
      itens.push({ peso: 4, tom: "bom", icone: "✅", texto: `Last spurt começou no ponto ideal (atraso de só ${fmt(linha.last_spurt_delay_m, 1)} m).` });
    } else {
      itens.push({ peso: 8, tom: "ruim", icone: "⏱️", texto: `Last spurt começou ${fmt(linha.last_spurt_delay_m, 1)} m atrasado — não tinha HP para acelerar desde o início da fase final.` });
    }
  }
  if (tabela.rankSpurt === 1 && tabela.totalSpurt > 1) {
    itens.push({ peso: 5, tom: "bom", icone: "⚡", texto: "Last spurt mais rápido entre os treinadores." });
  }

  // Largada
  if (linha.start_delay_status === "Late") {
    itens.push({ peso: 5, tom: "ruim", icone: "🐢", texto: `Largada lenta (${fmt(linha.start_delay_ms, 1)} ms de atraso).` });
  } else if (typeof linha.start_delay_ms === "number" && linha.start_delay_ms <= 20) {
    itens.push({ peso: 2, tom: "bom", icone: "🚀", texto: `Ótima largada (${fmt(linha.start_delay_ms, 1)} ms).` });
  }

  // Bloqueios, rushed e posições (precisam do replay)
  if (replay) {
    const { vezes, segundos, naParteFinal } = replay.bloqueios;
    if (vezes > 0) {
      itens.push({
        peso: naParteFinal > 0 ? 9 : 5, tom: "ruim", icone: "⛔",
        texto: `Foi bloqueado ${vezes} ${vezes === 1 ? "vez" : "vezes"} (≈${fmt(segundos, 1)} s)${naParteFinal > 0 ? `, ${naParteFinal === vezes ? "" : `${naParteFinal} `}na parte final da corrida` : ""}.`,
      });
    }
    if (replay.rushedSeg >= 1) {
      itens.push({ peso: 6, tom: "ruim", icone: "🔴", texto: `Ficou Rushed por ≈${fmt(replay.rushedSeg, 1)} s — gasta HP mais rápido.` });
    }
    const ganho = replay.posInicio - replay.posFinal;
    if (ganho >= 4) itens.push({ peso: 7, tom: "bom", icone: "📈", texto: `Ganhou ${ganho} posições desde a largada (${replay.posInicio}º → ${replay.posFinal}º).` });
    if (ganho <= -4) itens.push({ peso: 7, tom: "ruim", icone: "📉", texto: `Perdeu ${-ganho} posições desde a largada (${replay.posInicio}º → ${replay.posFinal}º).` });
    if (replay.melhorPos === 1 && replay.posFinal > 1) itens.push({ peso: 5, tom: "neutro", icone: "👑", texto: `Chegou a liderar a corrida, mas terminou em ${replay.posFinal}º.` });
  }

  // Wit
  if (tabela.skillsFalhaWit >= 2) {
    itens.push({ peso: 4, tom: "ruim", icone: "🎲", texto: `${tabela.skillsFalhaWit} skills falharam no Wit check${stats.wiz ? ` (Wit ${fmt(stats.wiz)})` : ""}.` });
  }

  // Duelo
  if (typeof linha.duel_s === "number" && linha.duel_s >= 3) {
    itens.push({ peso: 3, tom: "neutro", icone: "⚔️", texto: `Duelou por ${fmt(linha.duel_s, 1)} s na reta final.` });
  }

  // Aptidões abaixo de A
  const aptidoes = dados?.aptidoesCorrida ?? {};
  [aptidoes.terreno, aptidoes.distancia, aptidoes.estilo].filter(Boolean).forEach((a) => {
    if (a.nota && a.nota < 7) {
      itens.push({ peso: 6, tom: "ruim", icone: "📉", texto: `Aptidão ${LETRA[a.nota]} em ${a.nome} — penaliza a corrida.` });
    }
  });

  return itens.sort((a, b) => b.peso - a.peso).slice(0, 5);
}

// ---------------------------------------------------------------------
// HISTÓRICO
// ---------------------------------------------------------------------

const numeroEdicao = (id) => Number(String(id ?? "").replace(/\D/g, "")) || 0;
const dataParaNumero = (d) => {
  const [dia, mes, ano] = String(d ?? "").split("/").map(Number);
  return ano ? ano * 10000 + mes * 100 + dia : 0;
};

export function historicoDoTreinador(todasCorridas, treinador, corridaAtualId) {
  if (!treinador) return null;
  const nome = treinador.trim().toLowerCase();
  const corridas = [];
  (todasCorridas ?? []).forEach((c) => {
    const linha = (c.classificacao ?? []).find((l) => String(l.treinador ?? "").trim().toLowerCase() === nome);
    if (!linha) return;
    corridas.push({
      id: c.id,
      atual: c.id === corridaAtualId,
      edicao: numeroEdicao(c.edicaoId),
      pista: c.pistaNome,
      grade: c.grade,
      grupo: c.grupo ?? null,
      posicao: linha.posicao,
      personagem: linha.personagem,
      total: (c.classificacao ?? []).length,
      data: c.dataRegistro,
    });
  });
  corridas.sort((a, b) => b.edicao - a.edicao || dataParaNumero(b.data) - dataParaNumero(a.data));
  const posicoes = corridas.map((c) => c.posicao).filter((p) => typeof p === "number");
  return {
    corridas: corridas.length,
    vitorias: posicoes.filter((p) => p === 1).length,
    top3: posicoes.filter((p) => p <= 3).length,
    media: posicoes.length ? posicoes.reduce((a, b) => a + b, 0) / posicoes.length : null,
    melhor: posicoes.length ? Math.min(...posicoes) : null,
    ultimas: corridas.filter((c) => !c.atual).slice(0, 5),
  };
}
