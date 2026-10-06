// 🎯 src/utils/simulador/adaptador.js
// Tradutor dos dados do PTR (alpha123 + extras do GameTora) para a entrada
// do motor honse-sim (torena-sim, GPL-3.0). Só funções puras: recebem os
// dados prontos, então dá pra testar no Node sem o navegador.
//
// Os códigos numéricos são os do próprio motor (honse-sim-wasm/src/dto.rs),
// que por sorte são os mesmos do alpha123.

export const ESTRATEGIA = { Front: 1, Pace: 2, Late: 3, End: 4, Runaway: 5 };
export const APTIDAO = { S: 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 };
export const HUMOR = { Awful: -2, Bad: -1, Normal: 0, Good: 1, Great: 2 };
export const TERRENO = { Firm: 1, Good: 2, Soft: 3, Heavy: 4 };
export const CLIMA = { Sunny: 1, Cloudy: 2, Rainy: 3, Snowy: 4 };
export const ESTACAO = { Spring: 1, Summer: 2, Fall: 3, Autumn: 3, Winter: 4, Sakura: 5 };
export const GRADE = { G1: 100, G2: 200, G3: 300, OP: 400 };

const codigo = (tabela, valor, padrao, nome) => {
  const c = tabela[valor];
  if (c !== undefined) return c;
  if (padrao !== undefined) return padrao;
  throw new Error(`Simulador: ${nome} inválido ("${valor}")`);
};

// Pista do course_data + as constantes de raia que o motor exige (mesmos
// valores do CourseService do torena-sim).
export function cursoParaMotor(courseId, courseData) {
  const c = courseData[courseId];
  if (!c) throw new Error(`Simulador: pista ${courseId} não existe no course_data`);
  return {
    courseId: Number(courseId),
    ...c,
    slopes: [...c.slopes].sort((a, b) => a.start - b.start),
    courseWidth: 11.25,
    horseLane: 0.625,
    laneChangeAcceleration: 0.03,
    laneChangeAccelerationPerFrame: 0.002,
    maxLaneDistance: (11.25 * c.laneMax) / 1e4,
    moveLanePoint: c.corners[0] ? c.corners[0].start : 30,
  };
}

// Algumas skills vêm divididas no alpha123 ("200331" + "200331-1"): junta
// as alternativas dos pedaços na skill base, igual o catálogo do Buscador.
export function indexarFragmentos(skillData) {
  const fragmentos = new Map();
  for (const id of Object.keys(skillData)) {
    const i = id.indexOf("-");
    if (i < 0) continue;
    const base = id.slice(0, i);
    fragmentos.set(base, [...(fragmentos.get(base) ?? []), ...skillData[id].alternatives]);
  }
  return fragmentos;
}

// Skill no formato do motor; null se o id não existe nos nossos dados.
export function skillParaMotor(id, skillData, fragmentos) {
  const s = skillData[id];
  if (!s) return null;
  const extras = fragmentos?.get(String(id)) ?? [];
  return { skillId: String(id), rarity: s.rarity, alternatives: [...s.alternatives, ...extras] };
}

// Corredora no formato do PTR → runner do motor. As skills que não
// existem nos dados voltam em `skillsIgnoradas` pra tela poder avisar.
//   { outfitId, nome, humor: "Great", estrategia: "Pace",
//     aptidoes: { distancia: "S", estrategia: "A", terreno: "A" },
//     status: { speed, stamina, power, guts, wit }, skills: [ids] }
export function corredoraParaMotor(corredora, skillData, fragmentos) {
  const skills = [];
  const skillsIgnoradas = [];
  for (const id of corredora.skills ?? []) {
    const s = skillParaMotor(id, skillData, fragmentos);
    if (s) skills.push(s);
    else skillsIgnoradas.push(String(id));
  }
  const apt = corredora.aptidoes ?? {};
  const st = corredora.status;
  return {
    runner: {
      outfitId: String(corredora.outfitId ?? ""),
      name: corredora.nome ?? "",
      mood: codigo(HUMOR, corredora.humor ?? "Normal", undefined, "humor"),
      strategy: codigo(ESTRATEGIA, corredora.estrategia, undefined, "estratégia"),
      aptitudes: {
        distance: codigo(APTIDAO, apt.distancia ?? "A", undefined, "aptidão de distância"),
        strategy: codigo(APTIDAO, apt.estrategia ?? "A", undefined, "aptidão de estratégia"),
        surface: codigo(APTIDAO, apt.terreno ?? "A", undefined, "aptidão de terreno"),
      },
      stats: { speed: st.speed, stamina: st.stamina, power: st.power, guts: st.guts, wit: st.wit },
      skills,
    },
    skillsIgnoradas,
  };
}

// Condições da corrida: { terreno: "Good", clima: "Sunny", estacao: "Spring", grade: "G1" }
export function condicoesParaMotor({ terreno = "Firm", clima = "Sunny", estacao = "Spring", grade = "G1" } = {}) {
  return {
    ground: codigo(TERRENO, terreno, undefined, "terreno"),
    weather: codigo(CLIMA, clima, undefined, "clima"),
    season: codigo(ESTACAO, estacao, undefined, "estação"),
    timeOfDay: 2, // Midday: o PTR não sorteia horário
    grade: codigo(GRADE, grade, 100, "grade"),
  };
}
