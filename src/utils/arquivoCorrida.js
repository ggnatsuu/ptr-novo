// 🎯 src/utils/arquivoCorrida.js
// Lê o arquivo de corrida exportado do jogo (o mesmo .json que é enviado
// pro Hakuraku, ex: "Vodka-106.3471s-20260919.json") e monta tudo que o
// RankAdmin precisa: a classificação no mesmo formato das 22 colunas do
// CSV, as condições da corrida, os dados extras de cada treinador (deck,
// aptidões, stats, skills) e os dados brutos pro replay futuro.
//
// O decodificador do "simDataBase64" (a simulação compactada da corrida)
// foi adaptado do Hakuraku — src/data/RaceDataParser.ts:
//   https://github.com/SSHZ-ORG/hakuraku (MIT License)
//   Copyright (c) 2021 SSHZ.ORG
//
// Tudo roda no navegador: o arquivo não é enviado pra nenhum servidor.

const ESTILOS = { 1: "FRONT", 2: "PACE", 3: "LATE", 4: "END" };

// 🎯 O jogo usa nomes internos diferentes dos que aparecem na tela pro
// terreno (confirmado no Hakuraku: Good=1, Soft=2, Hard=3, Bad=4, e o
// código 1 é exibido como "Firm"). Convertido pro mesmo vocabulário que
// o Sorteio grava no Firestore (firm/good/soft/heavy).
const TERRENO_DO_JOGO = { Good: "firm", Soft: "good", Hard: "soft", Bad: "heavy" };

// 🎯 Mesma regra do Hakuraku pra "Late": a largada perde 1 frame de
// aceleração (aceleração zero entre o 1º e o 2º frame).
const LIMITE_ACELERACAO_LARGADA = 0.0001;

// Distância mínima até a linha de chegada pra considerar que o HP zerou
// antes do fim (mesma tolerância do Hakuraku).
const TOLERANCIA_MORTE_M = 0.1;

// ----------------------------------------------------------------------
// DECODIFICAÇÃO DO simDataBase64
// ----------------------------------------------------------------------

async function descompactar(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const formato = bytes[0] === 0x1f && bytes[1] === 0x8b ? "gzip" : "deflate";
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(formato));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

function garantirLeitura(view, offset, tamanho) {
  if (offset < 0 || tamanho < 0 || offset + tamanho > view.byteLength) {
    throw new Error("Dados da corrida corrompidos ou em formato desconhecido.");
  }
}

// Estrutura (little-endian): cabeçalho, bloco da corrida, frames (a cada
// ~1s, com distância/raia/velocidade/HP de cada cavalo) e o resultado de
// cada cavalo. Os eventos (skills, duelos) vêm depois e não são lidos aqui.
function decodificarSimulacao(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  garantirLeitura(view, 0, 8);
  let offset = 4 + view.getInt32(0, true);

  garantirLeitura(view, offset, 16);
  const numCavalos = view.getInt32(offset + 4, true);
  const tamanhoFrameCavalo = view.getInt32(offset + 8, true);
  const tamanhoResultado = view.getInt32(offset + 12, true);
  offset += 16;

  garantirLeitura(view, offset, 4);
  offset += 4 + view.getInt32(offset, true);

  garantirLeitura(view, offset, 8);
  const numFrames = view.getInt32(offset, true);
  const tamanhoFrame = view.getInt32(offset + 4, true);
  offset += 8;

  const frames = [];
  for (let f = 0; f < numFrames; f++) {
    garantirLeitura(view, offset, 4 + numCavalos * tamanhoFrameCavalo);
    const frame = { tempo: view.getFloat32(offset, true), cavalos: [] };
    let p = offset + 4;
    for (let i = 0; i < numCavalos; i++) {
      frame.cavalos.push({
        distancia: view.getFloat32(p, true),
        velocidade: view.getUint16(p + 6, true), // cm/s
        hp: view.getUint16(p + 8, true),
      });
      p += tamanhoFrameCavalo;
    }
    frames.push(frame);
    offset += tamanhoFrame;
  }

  garantirLeitura(view, offset, 4);
  offset += 4 + view.getInt32(offset, true);

  const resultados = [];
  for (let i = 0; i < numCavalos; i++) {
    garantirLeitura(view, offset, 31);
    resultados.push({
      ordemChegada: view.getInt32(offset, true), // 0 = 1º lugar
      atrasoLargada: view.getFloat32(offset + 12, true), // segundos
      inicioLastSpurt: view.getFloat32(offset + 18, true), // metros
      estilo: view.getUint8(offset + 22),
      tempoChegada: view.getFloat32(offset + 27, true), // segundos
    });
    offset += tamanhoResultado;
  }

  if (frames.length < 2 || resultados.length !== numCavalos) {
    throw new Error("Dados da corrida incompletos.");
  }
  return { frames, resultados };
}

// ----------------------------------------------------------------------
// CÁLCULO DAS COLUNAS
// ----------------------------------------------------------------------

function distanciaNoTempo(frames, indice, tempo) {
  if (tempo <= frames[0].tempo) return frames[0].cavalos[indice].distancia;
  for (let k = 1; k < frames.length; k++) {
    if (frames[k].tempo >= tempo) {
      const a = frames[k - 1];
      const b = frames[k];
      const da = a.cavalos[indice].distancia;
      const db = b.cavalos[indice].distancia;
      return da + (db - da) * ((tempo - a.tempo) / (b.tempo - a.tempo));
    }
  }
  return frames[frames.length - 1].cavalos[indice].distancia;
}

function formatarTempo(segundos) {
  const minutos = Math.floor(segundos / 60);
  return `${minutos}:${(segundos % 60).toFixed(4).padStart(7, "0")}`;
}

const umaCasa = (valor) => Number(valor.toFixed(1));

function calcularHp(frames, indice, distanciaPista) {
  const hpInicial = frames[0].cavalos[indice].hp;
  const frameMorte = frames.find((f) => f.cavalos[indice].hp === 0);
  if (frameMorte && frameMorte.cavalos[indice].distancia < distanciaPista - TOLERANCIA_MORTE_M) {
    // 🎯 O "HP que faltou" (hp_val/hp_pct) é uma estimativa que depende do
    // motor de velocidade — preenchido depois por hakuraku/colunasPesadas.
    return {
      hp_status: "Died",
      hp_m_diff: -Math.round(distanciaPista - frameMorte.cavalos[indice].distancia),
      hp_val: null,
      hp_pct: null,
    };
  }
  const hpFinal = frames[frames.length - 1].cavalos[indice].hp;
  return {
    hp_status: "Survived",
    hp_m_diff: 0,
    hp_val: Math.round(hpFinal),
    hp_pct: hpInicial > 0 ? umaCasa((hpFinal / hpInicial) * 100) : null,
  };
}

// 🎯 Aptidões na escala do jogo (1 = G ... 8 = S), só as que valem na corrida.
const NOMES_TERRENO = { 1: "Turf", 2: "Dirt" };
const NOMES_DISTANCIA = { 1: "Sprint", 2: "Mile", 3: "Medium", 4: "Long" };
const NOMES_ESTILO = { 1: "Front Runner", 2: "Pace Chaser", 3: "Late Surger", 4: "End Closer" };
const CAMPO_TERRENO = { 1: "proper_ground_turf", 2: "proper_ground_dirt" };
const CAMPO_DISTANCIA = { 1: "proper_distance_short", 2: "proper_distance_mile", 3: "proper_distance_middle", 4: "proper_distance_long" };
const CAMPO_ESTILO = { 1: "proper_running_style_nige", 2: "proper_running_style_senko", 3: "proper_running_style_sashi", 4: "proper_running_style_oikomi" };

// Mesmas faixas usadas pelo Hakuraku (RaceJsonParser.getCourseAptitudeFilters).
function categoriaDistancia(metros) {
  if (metros <= 1400) return 1;
  if (metros <= 1800) return 2;
  if (metros <= 2400) return 3;
  return 4;
}

function aptidoesDaCorrida(dados, terreno, distancia) {
  const estilo = dados.running_style;
  const aptidao = (nome, campo) => (nome && campo ? { nome, nota: dados[campo] ?? null } : null);
  return {
    terreno: aptidao(NOMES_TERRENO[terreno], CAMPO_TERRENO[terreno]),
    distancia: aptidao(NOMES_DISTANCIA[distancia], CAMPO_DISTANCIA[distancia]),
    estilo: aptidao(NOMES_ESTILO[estilo], CAMPO_ESTILO[estilo]),
  };
}

// ----------------------------------------------------------------------
// LEITURA DO ARQUIVO
// ----------------------------------------------------------------------

function campo(obj, nome) {
  return obj?.[nome] ?? obj?.[`<${nome.charAt(0).toUpperCase()}${nome.slice(1)}>k__BackingField`];
}

export async function lerArquivoCorrida(textoArquivo) {
  let json;
  try {
    json = JSON.parse(textoArquivo);
  } catch {
    throw new Error("O arquivo não é um JSON válido.");
  }

  const cavalos = campo(json, "raceHorse");
  const simDataBase64 = campo(json, "simDataBase64");
  const pistaDoArquivo = campo(json, "raceCourseSet");
  if (!Array.isArray(cavalos) || typeof simDataBase64 !== "string" || !pistaDoArquivo) {
    throw new Error("Esse não parece ser o arquivo de corrida exportado do jogo (o mesmo enviado pro Hakuraku).");
  }

  let simulacao;
  try {
    simulacao = decodificarSimulacao(await descompactar(simDataBase64));
  } catch (erro) {
    throw new Error(`Não foi possível ler a simulação da corrida: ${erro.message}`, { cause: erro });
  }
  const { frames, resultados } = simulacao;
  if (resultados.length !== cavalos.length) {
    throw new Error("O número de cavalos da simulação não bate com o do arquivo.");
  }

  const distanciaPista = pistaDoArquivo.distance;
  const inicioFaseFinal = json.phaseCalculator?.phaseEndStartDistance ?? (distanciaPista * 2) / 3;

  const cavaloPorIndice = new Map(cavalos.map((c) => [c.horseIndex, c]));
  const ordem = [...resultados.keys()].sort((a, b) => resultados[a].ordemChegada - resultados[b].ordemChegada);

  const todasAsLinhas = ordem.map((indice, posicaoNaOrdem) => {
    const resultado = resultados[indice];
    const cavalo = cavaloPorIndice.get(indice);

    let distancia_diff = null;
    if (posicaoNaOrdem > 0) {
      const anterior = resultados[ordem[posicaoNaOrdem - 1]];
      const diferenca = Math.max(0, distanciaPista - distanciaNoTempo(frames, indice, anterior.tempoChegada));
      distancia_diff = diferenca > 0 ? umaCasa(diferenca) : null;
    }

    const f0 = frames[0].cavalos[indice];
    const f1 = frames[1].cavalos[indice];
    const aceleracao = (f1.velocidade - f0.velocidade) / 100 / (frames[1].tempo - frames[0].tempo);

    return {
      posicao: resultado.ordemChegada + 1,
      numero: indice + 1,
      personagem: cavalo?.charaName ?? "?",
      treinador: cavalo?.trainerName ?? null,
      tempo: formatarTempo(resultado.tempoChegada),
      distancia_diff,
      style: ESTILOS[resultado.estilo] ?? "",
      start_delay_ms: umaCasa(resultado.atrasoLargada * 1000),
      start_delay_status: aceleracao < LIMITE_ACELERACAO_LARGADA ? "Late" : "Normal",
      last_spurt_delay_m: resultado.inicioLastSpurt > 0 ? umaCasa(resultado.inicioLastSpurt - inicioFaseFinal) : null,
      // 🎯 Colunas que dependem do motor de velocidade — preenchidas depois por hakuraku/colunasPesadas.
      last_spurt_speed: null,
      last_spurt_speed_diff: null,
      ...calcularHp(frames, indice, distanciaPista),
      duel_s: null,
      downhill_s: null,
      downhill_detail: "",
      pace_up_s: null,
      pace_down_s: null,
      wt_s: null,
    };
  });

  // 🎯 Colunas pesadas (last spurt speed, HP que faltou, duelo, downhill,
  // pace, WT): calculadas pelo código portado do Hakuraku, carregado só
  // aqui (import dinâmico) pra não pesar o resto do site. Se falhar, o
  // resto da classificação continua valendo e essas colunas ficam "-".
  let avisoCalculo = null;
  const skillsPorNumero = new Map();
  const modosPorNumero = new Map();
  try {
    const { calcularColunasPesadas } = await import("./hakuraku/colunasPesadas");
    const pesadas = await calcularColunasPesadas(json);
    todasAsLinhas.forEach((linha) => {
      const extra = pesadas.get(linha.numero);
      if (!extra) return;
      Object.assign(linha, extra.colunas);
      skillsPorNumero.set(linha.numero, extra.skills);
      modosPorNumero.set(linha.numero, extra.modos);
    });
  } catch (erro) {
    console.error("Erro ao calcular as colunas pesadas:", erro);
    avisoCalculo = "Não foi possível calcular last spurt speed, HP que faltou, duelo, downhill, pace e WT — essas colunas vão ficar com \"-\".";
  }

  // 🎯 NPCs vêm sem treinador no arquivo. Ficam fora da classificação
  // (senão entrariam no Rank de Personagens), mas as posições dos
  // treinadores continuam as reais da corrida.
  const classificacao = todasAsLinhas.filter((l) => l.treinador);
  const npcsIgnorados = todasAsLinhas.length - classificacao.length;

  const posicaoPorIndice = new Map(todasAsLinhas.map((l) => [l.numero - 1, l.posicao]));
  const terrenoDaPista = pistaDoArquivo.ground === 2 ? 2 : 1;
  const categoriaDaPista = categoriaDistancia(distanciaPista);
  const dadosTreinadores = cavalos
    .filter((c) => c.trainerName)
    .map((c) => {
      const dados = c.responseHorseData ?? {};
      const deck = c.trainedCharaData?.supportCardArray ?? [];
      return {
        treinador: c.trainerName,
        personagem: c.charaName,
        charaId: c.charaId,
        cardId: dados.card_id ?? null,
        numero: c.horseIndex + 1,
        posicao: posicaoPorIndice.get(c.horseIndex) ?? null,
        estilo: ESTILOS[dados.running_style] ?? null,
        estiloEspecial: c.runningStyleEx && c.runningStyleEx !== "None" ? c.runningStyleEx : null,
        humor: dados.motivation ?? null,
        stats: {
          speed: dados.speed ?? null,
          stamina: dados.stamina ?? null,
          power: dados.pow ?? null,
          guts: dados.guts ?? null,
          wiz: dados.wiz ?? null,
        },
        aptidaoDistancia: c.activeProperDistance ?? null,
        aptidaoTerreno: c.activeProperGroundType ?? null,
        deck: deck.map((carta) => ({ id: carta.supportCardId, lb: carta.limitBreakCount })),
        skills: (dados.skill_array ?? []).map((s) => s.skill_id),
        // 🎯 Pro painel de detalhes na página de Resultados: status de cada
        // skill na corrida e as 3 aptidões que importam nela (terreno da
        // pista, distância da pista e estilo usado) — mesmo recorte do Hakuraku.
        skillsCorrida: skillsPorNumero.get(c.horseIndex + 1) ?? null,
        aptidoesCorrida: aptidoesDaCorrida(dados, terrenoDaPista, categoriaDaPista),
      };
    });

  const condicoes = {
    courseId: pistaDoArquivo.id ?? null,
    distancia: distanciaPista,
    clima: (campo(json, "weather") ?? "").toLowerCase() || null,
    terreno: TERRENO_DO_JOGO[campo(json, "groundCondition")] ?? null,
    estacao: (campo(json, "season") ?? "").toLowerCase() || null,
  };

  // 🎯 Tudo que a tela de replay precisa (components/ReplayCorrida.jsx):
  // a simulação compactada + quem é cada cavalo + as condições da corrida.
  const replay = {
    simDataBase64,
    courseId: condicoes.courseId,
    condicoes,
    inicioFaseFinal,
    cavalos: cavalos.map((c) => ({
      numero: c.horseIndex + 1,
      personagem: c.charaName ?? "?",
      treinador: c.trainerName ?? null,
      cardId: c.responseHorseData?.card_id || null,
      estilo: ESTILOS[c.responseHorseData?.running_style] ?? null,
      posicao: posicaoPorIndice.get(c.horseIndex) ?? null,
      // Trechos de pace up / pace down / downhill, em metros.
      modos: modosPorNumero.get(c.horseIndex + 1) ?? [],
    })),
  };

  return { classificacao, npcsIgnorados, dadosTreinadores, condicoes, replay, avisoCalculo };
}
