// 🎯 src/utils/conquistas/motor.js
// Motor das conquistas: monta o histórico de cada treinador a partir dos
// resultados da liga e aplica a regra de cada conquista do catálogo
// (data/conquistas.js). Função pura — não lê nem grava nada no banco; quem
// chama passa os dados e recebe, por treinador, o que foi desbloqueado e
// QUANDO (edição e corrida).
//
// Treinadores são identificados pelo nome em minúsculas (igual ao Rank
// Geral), porque é assim que aparecem nos resultados.

import { CONQUISTAS } from "../../data/conquistas";
import { bancoCorridas, bancoG1 } from "../../data/bancos-corridas";

// Nomes antigos que ficaram gravados em resultados antes da correção do banco.
const APELIDOS_PISTA = { "Sprinter Stakes": "Sprinters Stakes" };

// Mesma pontuação do Rank Geral.
const PONTOS_POR_POSICAO = { 1: 12, 2: 10, 3: 9, 4: 8, 5: 7, 6: 6, 7: 5, 8: 4, 9: 3 };
const PONTOS_PARTICIPACAO = 300;
const pontosDaPosicao = (pos) => PONTOS_POR_POSICAO[pos] ?? (pos >= 10 && pos <= 18 ? 2 : 0);

const PAISES = ["Saudi Arabia Royal Cup", "New Zealand Trophy", "American Jockey Club Cup", "Copa Republica Argentina", "Japan Cup", "Japanese Oaks", "Japan Dirty Derby"];
const HIPODROMOS_SUBIDA = ["Nakayama", "Hanshin"];

// ---------------------------------------------------------------------
// PISTAS
// ---------------------------------------------------------------------

const PISTAS = new Map([...bancoCorridas, ...bancoG1].map((p) => [p.nome, p]));
const HIPODROMOS = [...new Set([...bancoCorridas, ...bancoG1].map((p) => p.hipodromo))];
const G1S = [...new Set(bancoG1.map((p) => p.nome))];

function categoriaPorMetros(m) {
  if (!m) return null;
  if (m <= 1400) return "Sprint";
  if (m <= 1800) return "Mile";
  if (m <= 2400) return "Medium";
  return "Long";
}

// Informações da pista (do banco, que é a fonte confiável).
function infoPista(nomeResultado, resultado) {
  const nome = APELIDOS_PISTA[nomeResultado] ?? nomeResultado;
  const banco = PISTAS.get(nome);
  const metros = Number(String(banco?.distancia ?? "").match(/(\d{3,4})/)?.[1]) || Number(String(resultado?.distancia ?? "").match(/(\d{3,4})/)?.[1]) || null;
  const terreno = /terra|dirt/i.test(banco?.terreno ?? resultado?.terreno ?? "") ? "dirt" : "turf";
  return {
    nome,
    grade: banco?.grade ?? resultado?.grade ?? null,
    hipodromo: banco?.hipodromo ?? resultado?.hipodromo ?? null,
    terreno,
    metros,
    categoria: categoriaPorMetros(metros),
  };
}

const numeroEdicao = (id) => Number(String(id ?? "").replace(/\D/g, "")) || 0;
const chaveTreinador = (nome) => String(nome ?? "").toLowerCase().trim();
const segundos = (tempo) => {
  const m = String(tempo ?? "").match(/^(?:(\d+):)?(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
};

// ---------------------------------------------------------------------
// HISTÓRICO
// ---------------------------------------------------------------------

// resultados: docs de resultados_partidas (com id)
// pistasPorEdicao: { edicaoId: [nomes das pistas na ordem sorteada] }
// checkins: { edicaoId: [{ nome, confirmadoEm (segundos) }] }
// extras: { [idDoResultado]: { dadosTreinadores?, condicoes?, metricas?: { [numero]: {...} } } }
export function montarHistorico({ resultados, pistasPorEdicao = {}, checkins = {}, extras = {} }) {
  const treinadores = new Map();
  const corridasPorResultado = new Map();

  resultados.forEach((resultado) => {
    const edicaoId = resultado.edicaoId;
    const lista = pistasPorEdicao[edicaoId] ?? [];
    const ordemPista = lista.indexOf(resultado.pistaNome);
    const pista = infoPista(resultado.pistaNome, resultado);
    const extra = extras[resultado.id] ?? {};
    const condicoes = extra.condicoes ?? resultado.condicoesArquivo ?? null;
    const classificacao = resultado.classificacao ?? [];

    classificacao.forEach((linha) => {
      if (!linha.treinador) return;
      const chave = chaveTreinador(linha.treinador);
      if (!treinadores.has(chave)) treinadores.set(chave, { chave, nome: linha.treinador, corridas: [] });
      const t = treinadores.get(chave);
      const corrida = {
        resultadoId: resultado.id,
        edicaoId,
        edicao: numeroEdicao(edicaoId),
        ordem: ordemPista >= 0 ? ordemPista : 99,
        grupo: resultado.grupo ?? null,
        pista,
        linha,
        posicao: Number(linha.posicao),
        venceu: Number(linha.posicao) === 1,
        resultado,
        condicoes,
        dados: (extra.dadosTreinadores ?? resultado.dadosTreinadores ?? []).find((d) => d.numero === linha.numero) ?? null,
        metricas: linha.numero !== undefined ? extra.metricas?.[linha.numero] ?? null : null,
      };
      t.corridas.push(corrida);
      if (!corridasPorResultado.has(resultado.id)) corridasPorResultado.set(resultado.id, []);
      corridasPorResultado.get(resultado.id).push(corrida);
    });
  });

  treinadores.forEach((t) => {
    t.corridas.sort((a, b) => a.edicao - b.edicao || a.ordem - b.ordem || a.pista.nome.localeCompare(b.pista.nome));
    t.porEdicao = new Map();
    t.corridas.forEach((c) => {
      if (!t.porEdicao.has(c.edicaoId)) t.porEdicao.set(c.edicaoId, []);
      t.porEdicao.get(c.edicaoId).push(c);
    });
    t.edicoes = [...t.porEdicao.keys()].sort((a, b) => numeroEdicao(a) - numeroEdicao(b));
  });

  // Pontos de cada treinador por edição (pra "1º geral da semana" / pódio) e
  // líder do Rank Geral ANTES de cada edição (pra "Pesadelo do Líder").
  const edicoes = [...new Set(resultados.map((r) => r.edicaoId))].sort((a, b) => numeroEdicao(a) - numeroEdicao(b));
  const pontosPorEdicao = new Map();
  const liderAntes = new Map();
  const prestigio = new Map();
  edicoes.forEach((edicaoId) => {
    let lider = null;
    prestigio.forEach((p, chave) => { if (!lider || p > prestigio.get(lider)) lider = chave; });
    liderAntes.set(edicaoId, lider);
    const pontos = new Map();
    resultados.filter((r) => r.edicaoId === edicaoId).forEach((r) => {
      (r.classificacao ?? []).forEach((l) => {
        if (!l.treinador) return;
        const chave = chaveTreinador(l.treinador);
        const ganho = pontosDaPosicao(Number(l.posicao));
        pontos.set(chave, (pontos.get(chave) ?? 0) + ganho);
        prestigio.set(chave, (prestigio.get(chave) ?? 0) + PONTOS_PARTICIPACAO + ganho);
      });
    });
    pontosPorEdicao.set(edicaoId, pontos);
  });

  // Check-ins por treinador.
  const checkinsPorTreinador = new Map();
  Object.entries(checkins).forEach(([edicaoId, lista]) => {
    (lista ?? []).forEach((ck) => {
      const chave = chaveTreinador(ck.nome);
      if (!checkinsPorTreinador.has(chave)) checkinsPorTreinador.set(chave, []);
      checkinsPorTreinador.get(chave).push({ edicaoId, edicao: numeroEdicao(edicaoId), confirmadoEm: ck.confirmadoEm });
    });
  });

  return { treinadores, corridasPorResultado, pontosPorEdicao, liderAntes, prestigioFinal: prestigio, checkinsPorTreinador };
}

// ---------------------------------------------------------------------
// AJUDANTES DAS REGRAS (cada um devolve a corrida em que a condição se
// cumpriu pela primeira vez, ou null)
// ---------------------------------------------------------------------

const primeira = (t, pred) => t.corridas.find(pred) ?? null;

// N-ésima corrida que cumpre a condição.
function enesima(t, pred, n) {
  let conta = 0;
  for (const c of t.corridas) {
    if (pred(c) && ++conta >= n) return c;
  }
  return null;
}

// Primeira corrida em que o treinador completou vitórias em TODAS as pistas.
function venceuTodas(t, nomes) {
  const faltam = new Set(nomes);
  for (const c of t.corridas) {
    if (c.venceu && faltam.delete(c.pista.nome) && faltam.size === 0) return c;
  }
  return null;
}

// Vitórias em N valores diferentes de algo (estilo, pista, hipódromo...).
function venceuNDiferentes(t, valor, n, pred = () => true) {
  const vistos = new Set();
  for (const c of t.corridas) {
    if (!c.venceu || !pred(c)) continue;
    const v = valor(c);
    if (v === null || v === undefined) continue;
    vistos.add(v);
    if (vistos.size >= n) return c;
  }
  return null;
}

// Primeira edição em que a condição sobre as corridas DAQUELA edição vale.
function edicaoQue(t, pred) {
  for (const edicaoId of t.edicoes) {
    const corridas = t.porEdicao.get(edicaoId);
    if (pred(corridas, edicaoId)) return corridas[corridas.length - 1];
  }
  return null;
}

// Sequência de N edições seguidas (números consecutivos) que cumprem algo.
function edicoesSeguidas(edicoesOk, n) {
  const nums = [...new Set(edicoesOk.map(numeroEdicao))].sort((a, b) => a - b);
  let seguidas = 1;
  for (let i = 1; i < nums.length; i++) {
    seguidas = nums[i] === nums[i - 1] + 1 ? seguidas + 1 : 1;
    if (seguidas >= n) return nums[i];
  }
  return n <= 1 && nums.length ? nums[0] : null;
}

const linhaPos = (c, pos) => (c.resultado.classificacao ?? []).find((l) => Number(l.posicao) === pos) ?? null;
const letraOuPior = (nota, limite) => typeof nota === "number" && nota <= limite; // G=1 ... S=8
const ehSSR = (id) => id >= 30000 && id < 40000;
const ehR = (id) => id >= 10000 && id < 20000;

// ---------------------------------------------------------------------
// REGRAS (por tag)
// ---------------------------------------------------------------------

const REGRAS = {
  // 🏆 Desempenho & Pódio
  grand_slam_ptr: (t) => venceuTodas(t, G1S),
  triplice_coroa_semana: (t) => edicaoQue(t, (cs) => cs.length >= 3 && cs.every((c) => c.venceu)),
  rei_dos_g1: (t) => venceuNDiferentes(t, (c) => c.pista.nome, 5, (c) => c.pista.grade === "G1"),
  mestre_do_budget: (t, ctx) => edicaoQue(t, (cs, edicaoId) => {
    const pontos = ctx.pontosPorEdicao.get(edicaoId);
    const max = Math.max(...pontos.values());
    return pontos.get(t.chave) === max && cs.every((c) => c.dados?.deck?.length && !c.dados.deck.some((carta) => ehSSR(carta.id)));
  }),
  dono_do_podio: (t) => edicaoQue(t, (cs) => cs.length >= 3 && cs.every((c) => c.posicao <= 3)),
  vitoria_por_um_focinho: (t) => primeira(t, (c) => {
    if (!c.venceu) return false;
    const segundo = linhaPos(c, 2);
    const a = segundos(c.linha.tempo);
    const b = segundos(segundo?.tempo);
    return a !== null && b !== null && b - a <= 0.05 + 1e-9;
  }),
  massacre_do_turf: (t) => primeira(t, (c) => c.venceu && typeof linhaPos(c, 2)?.distancia_diff === "number" && linhaPos(c, 2).distancia_diff > 17.5),
  economia_extrema: (t, ctx) => edicaoQue(t, (cs, edicaoId) => {
    const pontos = [...ctx.pontosPorEdicao.get(edicaoId).entries()].sort((a, b) => b[1] - a[1]);
    const corte = pontos[Math.min(2, pontos.length - 1)]?.[1] ?? Infinity;
    const noPodio = (ctx.pontosPorEdicao.get(edicaoId).get(t.chave) ?? -1) >= corte;
    return noPodio && cs.every((c) => c.dados?.deck?.length && c.dados.deck.filter((carta) => ehR(carta.id)).length >= 2);
  }),
  batismo_de_fogo: (t) => primeira(t, (c) => c.venceu && c.pista.grade === "G1"),
  dobradinha_de_ouro: (t) => edicaoQue(t, (cs) => cs.filter((c) => c.venceu).length >= 2),
  senhor_da_regularidade: (t) => {
    let seguidas = 0;
    for (const c of t.corridas) {
      seguidas = c.posicao <= 5 ? seguidas + 1 : 0;
      if (seguidas >= 6) return c;
    }
    return null;
  },
  primeira_vitoria: (t) => primeira(t, (c) => c.venceu),
  primeiro_podio: (t) => primeira(t, (c) => c.posicao <= 3),
  estreante_veloz: (t) => (t.corridas[0] && t.corridas[0].posicao <= 9 ? t.corridas[0] : null),

  // 🧬 Adaptação & Desafio da Pista
  ousadia_e_gloria: (t) => primeira(t, (c) => c.venceu && letraOuPior(c.dados?.aptidoesCorrida?.distancia?.nota, 5)),
  milagre_terra_batida: (t) => primeira(t, (c) => c.venceu && c.pista.terreno === "dirt" && letraOuPior(c.dados?.aptidoesCorrida?.terreno?.nota, 3)),
  conquistador: (t) => venceuNDiferentes(t, (c) => c.pista.hipodromo, HIPODROMOS.length),
  rei_do_lamacal: (t) => primeira(t, (c) => c.venceu && c.condicoes?.clima === "rainy" && c.condicoes?.terreno === "heavy"),
  a_reta_e_nossa: (t) => primeira(t, (c) => c.venceu && c.pista.nome === "Ibis Summer Dash"),
  maratonista_incansavel: (t) => primeira(t, (c) => c.venceu && c.pista.metros >= 3000 && c.linha.hp_status === "Survived"),
  mestre_dos_estilos: (t) => venceuNDiferentes(t, (c) => c.linha.style, 4),
  polivalente_do_turf: (t) => edicaoQue(t, (cs) => {
    const podio = cs.filter((c) => c.posicao <= 3 && c.pista.metros);
    return podio.some((a) => podio.some((b) => Math.abs(a.pista.metros - b.pista.metros) >= 800));
  }),
  subida_sem_freio: (t) => primeira(t, (c) => c.venceu && HIPODROMOS_SUBIDA.includes(c.pista.hipodromo)),
  versatil: (t) => venceuNDiferentes(t, (c) => c.linha.style, 2),
  todo_terreno: (t) => venceuNDiferentes(t, (c) => c.pista.terreno, 2),
  apenas_corra: (t) => primeira(t, (c) => letraOuPior(c.dados?.aptidoesCorrida?.terreno?.nota, 3) || letraOuPior(c.dados?.aptidoesCorrida?.distancia?.nota, 3)),
  sob_o_sol_escaldante: (t) => primeira(t, (c) => c.condicoes?.clima === "sunny" && c.condicoes?.terreno === "firm"),
  turista: (t) => {
    const vistos = new Set();
    for (const c of t.corridas) {
      if (c.pista.hipodromo) vistos.add(c.pista.hipodromo);
      if (vistos.size >= 5) return c;
    }
    return null;
  },

  // ⏱️ Telemetria
  timing_cirurgico: (t) => primeira(t, (c) => c.linha.last_spurt_delay_m === 0),
  volta_por_cima: (t) => primeira(t, (c) => c.venceu && c.linha.start_delay_status === "Late"),
  coracao_valente: (t) => primeira(t, (c) => c.venceu && c.linha.hp_status === "Died"),
  combustivel_na_reserva: (t) => primeira(t, (c) => c.venceu && c.pista.categoria === "Long" && c.linha.hp_status === "Survived" && typeof c.linha.hp_pct === "number" && c.linha.hp_pct < 3),
  duelista: (t) => primeira(t, (c) => c.venceu && typeof c.linha.duel_s === "number" && c.linha.duel_s >= 5),
  rei_da_descida: (t) => primeira(t, (c) => typeof c.linha.downhill_s === "number" && c.linha.downhill_s >= 15),
  reflexo_de_lince: (t) => primeira(t, (c) => typeof c.linha.start_delay_ms === "number" && c.linha.start_delay_ms < 10),

  // 🎬 Leitura da Corrida (replay)
  arrancada_do_seculo: (t) => primeira(t, (c) => c.venceu && c.metricas?.posInicioRetaFinal >= 8),
  do_fundo_do_pelotao: (t) => primeira(t, (c) => c.metricas?.ganhoPosicoes >= 10),
  saida_de_emergencia: (t) => primeira(t, (c) => c.venceu && c.metricas?.bloqueadoNaParteFinal),
  muralha_intransponivel: (t) => primeira(t, (c) => c.metricas?.liderouPontaAPonta),
  especialista_em_heranca: (t) => primeira(t, (c) => c.metricas?.herdadasAtivadas >= 2),
  ouro_puro: (t) => primeira(t, (c) => c.venceu && c.metricas?.douradasAtivadas >= 3),
  wit_infalivel: (t) => primeira(t, (c) => {
    const skills = c.dados?.skillsCorrida;
    return Array.isArray(skills) && skills.length >= 12 && !skills.some((s) => s.status === "failed-wit");
  }),
  segundo_folego: (t) => primeira(t, (c) => c.metricas?.hpRecuperado >= 300),
  cabeca_fria: (t) => primeira(t, (c) => c.venceu && c.metricas && c.metricas.rushedSegundos === 0),
  cavalo_teimoso: (t) => primeira(t, (c) => c.metricas?.rushedNaPrimeiraCurva),

  // ⚔️ Rivalidade
  duelo_no_ultimo_metro: (t) => primeira(t, (c) => c.linha.tempo && (c.resultado.classificacao ?? []).some((l) => l !== c.linha && l.tempo === c.linha.tempo)),
  pesadelo_do_lider: (t, ctx) => edicaoQue(t, (cs, edicaoId) => {
    const lider = ctx.liderAntes.get(edicaoId);
    if (!lider || lider === t.chave) return false;
    const aFrente = cs.filter((c) => {
      const linhaLider = (c.resultado.classificacao ?? []).find((l) => chaveTreinador(l.treinador) === lider);
      return linhaLider && c.posicao < Number(linhaLider.posicao);
    });
    return cs.length >= 3 && aFrente.length === cs.length;
  }),
  guerra_de_estrategia: (t) => primeira(t, (c) => c.venceu && c.linha.style && (c.resultado.classificacao ?? []).filter((l) => l !== c.linha && l.style === c.linha.style).length >= 4),

  // 💬 Resenha
  cadeira_cativa: (t) => {
    const ultima = edicoesSeguidas(t.edicoes, 10);
    return ultima !== null ? t.corridas.find((c) => c.edicao === ultima) ?? null : null;
  },
  anfitriao_da_sexta: (t, ctx) => {
    const lista = ctx.checkinsPorTreinador.get(t.chave) ?? [];
    const naSexta = lista.filter((ck) => {
      if (!ck.confirmadoEm) return false;
      const brasilia = new Date((ck.confirmadoEm - 3 * 3600) * 1000);
      return brasilia.getUTCDay() === 5 && brasilia.getUTCHours() < 21;
    });
    const ultima = edicoesSeguidas(naSexta.map((ck) => ck.edicaoId), 3);
    if (ultima === null) return null;
    return t.corridas.find((c) => c.edicao === ultima) ?? { edicaoId: `edicao_${String(ultima).padStart(2, "0")}`, edicao: ultima, pista: { nome: "Check-in" } };
  },

  // 😂 Perdeu, Mas com Honra
  porteiro_do_podio: (t) => edicaoQue(t, (cs) => cs.filter((c) => c.posicao === 4).length >= 2),
  secador_involuntario: (t) => primeira(t, (c) => c.posicao === 2 && typeof c.linha.distancia_diff === "number" && c.linha.distancia_diff < 1),
  ficou_no_paddock: (t) => primeira(t, (c) => c.linha.start_delay_status === "Late"),
  ponto_de_participacao: (t) => edicaoQue(t, (cs) => cs.length >= 3 && cs.every((c) => c.posicao >= 10 && c.posicao <= 18)),
  esqueceu_a_estamina: (t) => primeira(t, (c) => c.linha.hp_status === "Died"),

  // 📅 Carreira
  lenda_viva_pocolords: (t) => (t.edicoes.length >= 25 ? t.porEdicao.get(t.edicoes[24]).at(-1) : null),
  veterano_de_guerra: (t) => (t.edicoes.length >= 15 ? t.porEdicao.get(t.edicoes[14]).at(-1) : null),
  clube_dos_15000: (t) => {
    let prestigio = 0;
    for (const c of t.corridas) {
      prestigio += PONTOS_PARTICIPACAO + pontosDaPosicao(c.posicao);
      if (prestigio > 15000) return c;
    }
    return null;
  },
  fidelidade_de_sangue: (t) => {
    const edicoesPorPersonagem = new Map();
    for (const c of t.corridas) {
      const p = c.linha.personagem;
      if (!p) continue;
      if (!edicoesPorPersonagem.has(p)) edicoesPorPersonagem.set(p, new Set());
      edicoesPorPersonagem.get(p).add(c.edicaoId);
      if (edicoesPorPersonagem.get(p).size >= 10) return c;
    }
    return null;
  },
  maestria: (t) => {
    const vitorias = new Map();
    for (const c of t.corridas) {
      if (!c.venceu || !c.linha.personagem) continue;
      vitorias.set(c.linha.personagem, (vitorias.get(c.linha.personagem) ?? 0) + 1);
      if (vitorias.get(c.linha.personagem) >= 5) return c;
    }
    return null;
  },
  retorno_triunfal: (t) => {
    for (let i = 1; i < t.edicoes.length; i++) {
      if (numeroEdicao(t.edicoes[i]) - numeroEdicao(t.edicoes[i - 1]) >= 3) {
        const vitoria = t.porEdicao.get(t.edicoes[i]).find((c) => c.venceu);
        if (vitoria) return vitoria;
      }
    }
    return null;
  },
  elenco_variado: (t) => {
    const vistos = new Set();
    for (const c of t.corridas) {
      if (c.linha.personagem) vistos.add(c.linha.personagem);
      if (vistos.size >= 10) return c;
    }
    return null;
  },

  // 🎖️ Epítetos
  triplice_coroa: (t) => venceuTodas(t, ["Satsuki Sho", "Tokyo Yushun", "Kikuka Sho"]),
  triplice_tiara: (t) => venceuTodas(t, ["Oka Sho", "Japanese Oaks", "Shuka Sho"]),
  spring_champion: (t) => venceuTodas(t, ["Osaka Hai", "Tenno Sho Spring", "Takarazuka Kinen"]),
  fall_champion: (t) => venceuTodas(t, ["Tenno Sho Autumn", "Japan Cup", "Arima Kinen"]),
  shield_bearer: (t) => venceuTodas(t, ["Tenno Sho Spring", "Tenno Sho Autumn"]),
  sprint_go_getter: (t) => venceuTodas(t, ["Takamatsunomiya Kinen", "Sprinters Stakes"]),
  kicking_up_dust: (t) => venceuTodas(t, ["Unicorn Stakes", "Leopard Stakes", "Japan Dirty Derby"]),
  breakneck_miler: (t) => venceuTodas(t, ["NHK Mile Cup", "Yasuda Kinen", "Mile Championship"]),
  sprint_speedster: (t) => venceuTodas(t, ["Takamatsunomiya Kinen", "Sprinters Stakes", "Yasuda Kinen", "Mile Championship"]),
  mile_a_minute: (t) => {
    const base = venceuTodas(t, ["NHK Mile Cup", "Oka Sho", "Yasuda Kinen", "Victoria Mile", "Mile Championship"]);
    const juvenil = primeira(t, (c) => c.venceu && ["Hanshin Juvenile", "Asahi Hai"].includes(c.pista.nome));
    return base && juvenil ? maisTarde(base, juvenil) : null;
  },
  dirt_sprinter: (t) => enesima(t, (c) => c.venceu && c.pista.nome === "JBC Sprint", 2),
  dirt_dancer: (t) => venceuNDiferentes(t, (c) => c.pista.categoria, 3, (c) => c.pista.terreno === "dirt" && ["Sprint", "Mile", "Medium"].includes(c.pista.categoria)),
  turf_tussler: (t) => venceuNDiferentes(t, (c) => c.pista.categoria, 4, (c) => c.pista.terreno === "turf"),
  pro_racer: (t) => enesima(t, (c) => c.venceu, 10),
  eat_my_dust: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt", 7),
  playing_dirty: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt", 4),
  dirty_work: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt", 2),
  dirt_g1_dominator: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt" && c.pista.grade === "G1", 5),
  dirt_g1_powerhouse: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt" && c.pista.grade === "G1", 3),
  dirt_g1_star: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt" && c.pista.grade === "G1", 2),
  dirt_g1_achiever: (t) => enesima(t, (c) => c.venceu && c.pista.terreno === "dirt" && c.pista.grade === "G1", 1),
  standard_distance_leader: (t) => enesima(t, (c) => c.venceu && c.pista.metros && c.pista.metros % 400 === 0, 3),
  non_standard_distance_leader: (t) => enesima(t, (c) => c.venceu && c.pista.metros && c.pista.metros % 400 !== 0, 3),
  kokura_constable: (t) => enesima(t, (c) => c.venceu && c.pista.hipodromo === "Kokura", 2),
  west_japan_whiz: (t) => enesima(t, (c) => c.venceu && ["Chukyo", "Hanshin", "Kyoto"].includes(c.pista.hipodromo), 3),
  kanto_conqueror: (t) => enesima(t, (c) => c.venceu && ["Tokyo", "Nakayama", "Ooi"].includes(c.pista.hipodromo), 3),
  tohoku_top_dog: (t) => enesima(t, (c) => c.venceu && ["Fukushima", "Niigata"].includes(c.pista.hipodromo), 3),
  hokkaido_hotshot: (t) => enesima(t, (c) => c.venceu && ["Sapporo", "Hakodate"].includes(c.pista.hipodromo), 3),
  junior_jewel: (t) => enesima(t, (c) => c.venceu && /junior|nisai/i.test(c.pista.nome), 3),
  umatastic: (t) => enesima(t, (c) => c.venceu && /himba stakes/i.test(c.pista.nome), 3),
  globe_trotter: (t) => enesima(t, (c) => c.venceu && PAISES.includes(c.pista.nome), 3),

  // Epítetos que dependem de outros (o "requer" do catálogo).
  goddess: (t, ctx, obtidas) => juntar(obtidas.get("triplice_tiara"), venceuTodas(t, ["Victoria Mile", "Hanshin Juvenile", "Queen Elizabeth II Cup"])),
  heroine: (t, ctx, obtidas) => juntar(obtidas.get("triplice_tiara"), primeira(t, (c) => c.venceu && c.pista.nome === "Queen Elizabeth II Cup")),
  incredible: (t, ctx, obtidas) => juntar(obtidas.get("triplice_coroa"), primeira(t, (c) => c.venceu && ["Japan Cup", "Arima Kinen"].includes(c.pista.nome))),
  phenomenal: (t, ctx, obtidas) => juntar(obtidas.get("triplice_coroa"), venceuNDiferentes(t, (c) => c.pista.nome, 2, (c) => ["Tenno Sho Spring", "Takarazuka Kinen", "Japan Cup", "Tenno Sho Autumn", "Osaka Hai", "Arima Kinen"].includes(c.pista.nome))),
  legendary: (t, ctx, obtidas) => {
    const coroaOuTiara = [obtidas.get("triplice_coroa"), obtidas.get("triplice_tiara")].filter(Boolean).sort((a, b) => ordemCorrida(a) - ordemCorrida(b))[0];
    return juntar(coroaOuTiara, juntar(obtidas.get("spring_champion"), obtidas.get("fall_champion")));
  },
};

// Ordem cronológica de uma corrida (pra saber qual aconteceu depois).
const ordemCorrida = (c) => (c?.edicao ?? 0) * 100 + (c?.ordem ?? 0);
const maisTarde = (a, b) => (ordemCorrida(a) >= ordemCorrida(b) ? a : b);
const juntar = (a, b) => (a && b ? maisTarde(a, b) : null);

// ---------------------------------------------------------------------
// CÁLCULO
// ---------------------------------------------------------------------

// Devolve Map(chave do treinador → { nome, conquistas: [{ tag, edicaoId, pista }] }).
// Conquistas manuais não entram (são concedidas pelo admin).
export function calcularConquistas(historico) {
  const resultado = new Map();
  const comDependencia = CONQUISTAS.filter((c) => c.requer);
  const semDependencia = CONQUISTAS.filter((c) => !c.requer);

  historico.treinadores.forEach((t) => {
    const obtidas = new Map();
    const aplicar = (conquista) => {
      const regra = REGRAS[conquista.tag];
      if (!regra) return;
      const corrida = regra(t, historico, obtidas);
      if (corrida) obtidas.set(conquista.tag, corrida);
    };
    semDependencia.forEach(aplicar);
    comDependencia.forEach(aplicar);

    resultado.set(t.chave, {
      nome: t.nome,
      conquistas: [...obtidas.entries()]
        .map(([tag, c]) => ({ tag, edicaoId: c.edicaoId, pista: c.pista?.nome ?? null, grupo: c.grupo ?? null }))
        .sort((a, b) => numeroEdicao(a.edicaoId) - numeroEdicao(b.edicaoId)),
    });
  });
  return resultado;
}

// Tags que o motor sabe calcular (pra conferir o catálogo).
export const TAGS_COM_REGRA = Object.keys(REGRAS);

// ---------------------------------------------------------------------
// TÍTULOS POR PERSONAGEM (contam EDIÇÕES com a mesma personagem)
// ---------------------------------------------------------------------

export const NIVEIS_PERSONAGEM = [
  { nivel: "oshi", edicoes: 10, titulo: (p) => `Oshi da ${p}` },
  { nivel: "especialista", edicoes: 7, titulo: (p) => `Especialista em ${p}` },
  { nivel: "entusiasta", edicoes: 4, titulo: (p) => `Entusiasta de ${p}` },
  { nivel: "iniciante", edicoes: 2, titulo: (p) => `Iniciante de ${p}` },
];

// Map(chave do treinador → [{ personagem, edicoes, nivel }]) — só quem já
// chegou ao menos no nível Iniciante.
export function calcularPersonagens(historico) {
  const resultado = new Map();
  historico.treinadores.forEach((t) => {
    const edicoesPorPersonagem = new Map();
    t.corridas.forEach((c) => {
      const p = c.linha.personagem;
      if (!p) return;
      if (!edicoesPorPersonagem.has(p)) edicoesPorPersonagem.set(p, new Set());
      edicoesPorPersonagem.get(p).add(c.edicaoId);
    });
    const lista = [...edicoesPorPersonagem.entries()]
      .map(([personagem, eds]) => ({ personagem, edicoes: eds.size, nivel: NIVEIS_PERSONAGEM.find((n) => eds.size >= n.edicoes)?.nivel ?? null }))
      .filter((x) => x.nivel)
      .sort((a, b) => b.edicoes - a.edicoes);
    resultado.set(t.chave, lista);
  });
  return resultado;
}
