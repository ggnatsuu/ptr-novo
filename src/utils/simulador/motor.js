// 🎯 src/utils/simulador/motor.js
// Carrega o honse-sim (WebAssembly) só quando alguém usa o simulador e
// liga ele aos dados do site. Simulação: honse-sim, de jalbarrang
// (github.com/jalbarrang/torena-sim), GPL-3.0.

import iniciarMotor, { runCompare, runContestedCompare, runRaceSim, skillSupportReport } from "honse-sim";
import urlWasm from "honse-sim/uma_sim_wasm_bg.wasm?url";
import courseData from "../../uma-skill-tools/data/course_data.json";
import skillData from "../../uma-skill-tools/data/skill_data.json";
import "../roupasExtras"; // injeta no skill_data as skills que só o GameTora tem
import { condicoesParaMotor, corredoraParaMotor, cursoParaMotor, indexarFragmentos, skillParaMotor } from "./adaptador";

const fragmentos = indexarFragmentos(skillData);

// Ajustes da tela → settings do motor. `ordem` diz quem é cada runner
// ("a", "b" ou "pacer"); o pacemaker segue sempre o padrão do jogo.
//   ajustes = { variacaoWit, rushed: {a,b}, downhill: {a,b}, testeSkills: {a,b},
//               conservarPower: {a,b}, spot, duelo, taxasDuelo }
export function settingsDoMotor(ajustes, ordem) {
  if (!ajustes) return {};
  const porRunner = (chave, dependeDoWit) => ordem.map((q) => (q === "pacer" ? true : (!dependeDoWit || ajustes.variacaoWit) && ajustes[chave]?.[q] !== false));
  return {
    rushedRunners: porRunner("rushed", true),
    downhillRunners: porRunner("downhill", true),
    witChecksRunners: porRunner("testeSkills", true),
    conservePowerRunners: porRunner("conservarPower", false),
    spotStruggle: ajustes.spot !== false,
    dueling: ajustes.duelo !== false,
  };
}

let carregando = null;
export function carregarMotor() {
  carregando ??= iniciarMotor({ module_or_path: urlWasm });
  return carregando;
}

function montarCorredoras(corredoras) {
  const ignoradas = {};
  const runners = corredoras.map((c, i) => {
    const { runner, skillsIgnoradas } = corredoraParaMotor(c, skillData, fragmentos);
    if (skillsIgnoradas.length) ignoradas[c.nome || `#${i + 1}`] = skillsIgnoradas;
    return runner;
  });
  return { runners, ignoradas };
}

export const sementeAleatoria = () => Math.floor(Math.random() * 2 ** 31);
export const distanciaDaPista = (courseId) => courseData[courseId]?.distance ?? 0;

// Corrida completa (2 a 12 corredoras interagindo) repetida `vezes` vezes.
// Devolve as vitórias e a posição média de cada corredora (na ordem recebida).
export async function simularCorrida({ courseId, condicoes, corredoras, vezes = 100, semente = sementeAleatoria() }) {
  await carregarMotor();
  const { runners, ignoradas } = montarCorredoras(corredoras);
  const resultado = runRaceSim({
    course: cursoParaMotor(courseId, courseData),
    parameters: condicoesParaMotor(condicoes),
    settings: {},
    runners,
    nsamples: vezes,
    masterSeed: semente,
    focusRunnerIds: [],
  });

  const estat = runners.map(() => ({ vitorias: 0, somaPosicao: 0, top3: 0 }));
  for (const ordem of resultado.finishOrders) {
    ordem.forEach((e, pos) => {
      const s = estat[e.runnerId];
      if (!s) return;
      s.somaPosicao += pos + 1;
      if (pos === 0) s.vitorias += 1;
      if (pos < 3) s.top3 += 1;
    });
  }
  const n = resultado.finishOrders.length;
  return {
    vezes: n,
    semente,
    skillsIgnoradas: ignoradas,
    corredoras: estat.map((s, i) => ({
      nome: corredoras[i].nome,
      chanceVitoria: s.vitorias / n,
      chanceTop3: s.top3 / n,
      posicaoMedia: s.somaPosicao / n,
    })),
  };
}

// Um lote da corrida completa: devolve só a ordem de chegada de cada rodada
// (índices na ordem das corredoras recebidas) e as skills sem dados.
export async function loteCorrida({ courseId, condicoes, corredoras, vezes, semente }) {
  await carregarMotor();
  const { runners, ignoradas } = montarCorredoras(corredoras);
  const res = runRaceSim({
    course: cursoParaMotor(courseId, courseData),
    parameters: condicoesParaMotor(condicoes),
    settings: {},
    runners,
    nsamples: vezes,
    masterSeed: semente,
    focusRunnerIds: [],
  });
  return { skillsIgnoradas: ignoradas, ordens: res.finishOrders.map((ordem) => ordem.map((e) => e.runnerId)) };
}

// Uma corredora sozinha (vacuum): devolve a telemetria de cada rodada. Com a
// mesma semente, a rodada i de duas builds diferentes teve a mesma sorte.
export async function rodadasSozinha({ courseId, condicoes, corredora, vezes, semente, ajustes }) {
  await carregarMotor();
  const { runners } = montarCorredoras([corredora]);
  const res = runCompare({
    course: cursoParaMotor(courseId, courseData),
    parameters: condicoesParaMotor(condicoes),
    settings: settingsDoMotor(ajustes, ["a"]),
    runners,
    nsamples: vezes,
    masterSeed: semente,
  });
  return res.rounds.map((r) => r.runners[0]);
}

// Um lote da comparação A×B. Devolve, por rodada, a telemetria de A e B.
//   modo "classico": A, B e um pacemaker (Front, clone de A sem skills) na
//                    mesma corrida, como o Umalator. Usa o motor de campo (sem
//                    completar com outras), então Rushed, Spot Struggle e Duelo
//                    saem da posição real das três.
//   modo "vacuo":    A e B correm separadas com a mesma semente.
//   modo "contestado": A e B num campo de verdade (bloqueio, duelo, posição),
//                    completado até `campo` com cavalinhas genéricas de
//                    status `forcaCampo` em tudo.
//   ajustes: ver settingsDoMotor (aba Ajustes do Comparador).
export async function loteComparacao({ courseId, condicoes, a, b, modo = "classico", vezes, semente, campo = 9, forcaCampo = 600, ajustes }) {
  await carregarMotor();
  const course = cursoParaMotor(courseId, courseData);
  const parameters = condicoesParaMotor(condicoes);
  const base = { course, parameters, settings: settingsDoMotor(ajustes, ["a", "b", "pacer"]), nsamples: vezes, masterSeed: semente };

  if (modo === "contestado") {
    const { runners, ignoradas } = montarCorredoras([a, b]);
    const res = runContestedCompare({ ...base, runners, fillTo: Math.max(2, Math.min(12, campo)), mobStats: forcaCampo });
    return {
      skillsIgnoradas: ignoradas,
      rodadas: res.rounds.map((r) => ({
        a: r.runners.find((x) => x.runnerId === 0),
        b: r.runners.find((x) => x.runnerId === 1),
      })),
    };
  }

  if (modo === "vacuo") {
    const { runners: [ra], ignoradas: ia } = montarCorredoras([a]);
    const { runners: [rb], ignoradas: ib } = montarCorredoras([b]);
    const duelingRates = ajustes?.taxasDuelo;
    const resA = runCompare({ ...base, settings: settingsDoMotor(ajustes, ["a"]), duelingRates, runners: [ra] });
    const resB = runCompare({ ...base, settings: settingsDoMotor(ajustes, ["b"]), duelingRates, runners: [rb] });
    return {
      skillsIgnoradas: { ...ia, ...ib },
      rodadas: resA.rounds.map((r, i) => ({ a: r.runners[0], b: resB.rounds[i]?.runners[0] })),
    };
  }

  const pacer = { ...a, nome: "Pacemaker", estrategia: "Front", skills: [] };
  const { runners, ignoradas } = montarCorredoras([a, b, pacer]);
  const res = runContestedCompare({ ...base, runners });
  return {
    skillsIgnoradas: ignoradas,
    rodadas: res.rounds.map((r) => ({
      a: r.runners.find((x) => x.runnerId === 0),
      b: r.runners.find((x) => x.runnerId === 1),
    })),
  };
}

// % de corridas em que a corredora chega com full spurt e sem zerar o HP,
// com uma stamina específica. Checagens de Wit das skills sempre passam
// (igual à calculadora do torena-sim), pra medir só a stamina.
// forcar: { rushed, spot, duelo } liga o trecho padrão de cada mecânica (o
// downhill é sempre garantido nas descidas, como na calculadora do torena).
export function trechosForcados(courseId, forcar = {}) {
  const c = courseData[courseId];
  const secao = c.distance / 24;
  const retas = [...(c.straights ?? [])].sort((x, y) => x.start - y.start);
  const ultimaReta = retas.at(-1)?.start ?? c.distance - 400;
  return {
    forcedDownhillRegions: (c.slopes ?? []).filter((sl) => sl.slope < 0).map((sl) => ({ start: sl.start, end: sl.start + sl.length })),
    ...(forcar.rushed ? { forcedRushedRegions: [{ start: secao * 2, end: Math.min(secao * 2 + 250, c.distance) }] } : {}),
    ...(forcar.spot ? { forcedSpotStruggleRegions: [{ start: 150, end: secao * 6 }] } : {}),
    ...(forcar.duelo ? { forcedDuelingRegions: [{ start: ultimaReta, end: c.distance }] } : {}),
  };
}

export async function taxaFullSpurt({ courseId, condicoes, corredora, stamina, vezes = 60, semente, forcar }) {
  await carregarMotor();
  const { runners: base } = montarCorredoras([{ ...corredora, status: { ...corredora.status, stamina } }]);
  const runners = [{ ...base[0], ...trechosForcados(courseId, forcar) }];
  const res = runCompare({
    course: cursoParaMotor(courseId, courseData),
    parameters: condicoesParaMotor(condicoes),
    settings: { witChecks: false },
    runners,
    nsamples: vezes,
    masterSeed: semente,
  });
  const ok = res.rounds.filter((r) => r.runners[0]?.hasAchievedFullSpurt && !r.runners[0]?.outOfHp).length;
  return ok / res.rounds.length;
}

// Quais skills o motor só simula em parte (pra avisar na tela).
export async function skillsParciais(ids) {
  await carregarMotor();
  const lista = ids.map((id) => skillParaMotor(id, skillData, fragmentos)).filter(Boolean);
  return skillSupportReport(lista);
}
