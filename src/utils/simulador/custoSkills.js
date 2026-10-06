// 🎯 src/utils/simulador/custoSkills.js
// Custo em SP de uma build, como no jogo:
//  • desconto por nível de dica (Lv1 10% · Lv2 20% · Lv3 30% · Lv4 35% · Lv5 40%)
//    + 10% da condição Fast Learner (切れ者), somados;
//  • dourada exige a branca do grupo (◎ se existir, senão ○) e ◎ exige ○ —
//    se a pré-requisito não estiver na build, entra no custo junto;
//  • unique e evoluída não se compram (custo 0).

import skillMeta from "../../uma-skill-tools/data/skill_meta.json";
import skillData from "../../uma-skill-tools/data/skill_data.json";
import skillNames from "../../uma-skill-tools/data/skillnames.json";

export const DESCONTO_DICA = [0, 0.1, 0.2, 0.3, 0.35, 0.4];

const nome = (id) => skillNames[id]?.[1] || skillNames[id]?.[0] || "";

// Brancas (não negativas) de cada grupo, pra achar as pré-requisitos.
const brancasPorGrupo = new Map();
for (const id of Object.keys(skillData)) {
  const g = skillMeta[id]?.groupId;
  if (!g || id.includes("-") || id[0] === "9" || skillData[id].rarity !== 1 || nome(id).includes("×")) continue;
  brancasPorGrupo.set(g, [...(brancasPorGrupo.get(g) ?? []), id]);
}

export function preRequisito(id) {
  const s = skillData[id];
  const g = skillMeta[id]?.groupId;
  if (!s || !g || id[0] === "9") return null;
  const brancas = (brancasPorGrupo.get(g) ?? []).filter((b) => b !== id);
  if (s.rarity === 2) {
    return brancas.find((b) => nome(b).includes("◎")) ?? brancas.find((b) => nome(b).includes("○")) ?? brancas[0] ?? null;
  }
  if (s.rarity === 1 && nome(id).includes("◎")) return brancas.find((b) => nome(b).includes("○")) ?? null;
  return null;
}

export function custoUnitario(id, nivelDica = 0, kiremono = false) {
  const base = skillMeta[id]?.baseCost ?? 0;
  const desconto = (DESCONTO_DICA[nivelDica] ?? 0) + (kiremono ? 0.1 : 0);
  return Math.floor(base * (1 - desconto) + 1e-9); // 170 × 0,7 = 118,99999 no float
}

// { total, itens: [{ id, custo, inclui: [{ id, nome, custo }] }] }
export function custoBuild({ skills = [], dicas = {}, kiremono = false }) {
  const naBuild = new Set(skills.map(String));
  const itens = [...naBuild].map((id) => {
    let custo = custoUnitario(id, dicas[id] ?? 0, kiremono);
    const inclui = [];
    // sobe a cadeia de pré-requisitos que não estão na build
    let atual = preRequisito(id);
    const vistos = new Set([id]);
    while (atual && !naBuild.has(atual) && !vistos.has(atual)) {
      vistos.add(atual);
      const c = custoUnitario(atual, dicas[atual] ?? 0, kiremono);
      inclui.push({ id: atual, nome: nome(atual), custo: c });
      custo += c;
      atual = preRequisito(atual);
    }
    return { id, custo, inclui };
  });
  return { total: itens.reduce((s, i) => s + i.custo, 0), itens };
}

// Grupo da skill (branca ○/◎ e dourada da mesma família têm o mesmo grupo).
export const grupoDaSkill = (id) => skillMeta[id]?.groupId ?? String(id);

// Planejador: melhor combinação dentro do orçamento de SP (mochila por grupo —
// no máximo uma opção de cada família, já que a dourada inclui a branca).
// opcoes: [{ id, grupo, custo, ganho }] → { escolhidas: [id], custo, ganho }
export function planejarSkills(opcoes, orcamento) {
  const B = Math.max(0, Math.floor(orcamento));
  const porGrupo = new Map();
  opcoes.filter((o) => o.ganho > 0 && o.custo > 0 && o.custo <= B).forEach((o) => {
    porGrupo.set(o.grupo, [...(porGrupo.get(o.grupo) ?? []), o]);
  });
  const grupos = [...porGrupo.values()];
  let dp = new Float64Array(B + 1);
  const escolha = grupos.map(() => new Int16Array(B + 1).fill(-1));
  grupos.forEach((ops, g) => {
    const novo = Float64Array.from(dp);
    ops.forEach((o, k) => {
      for (let b = B; b >= o.custo; b -= 1) {
        const v = dp[b - o.custo] + o.ganho;
        if (v > novo[b]) { novo[b] = v; escolha[g][b] = k; }
      }
    });
    dp = novo;
  });
  // reconstrói de trás pra frente
  const escolhidas = [];
  let b = B;
  for (let g = grupos.length - 1; g >= 0; g -= 1) {
    const k = escolha[g][b];
    if (k >= 0) { escolhidas.push(grupos[g][k]); b -= grupos[g][k].custo; }
  }
  return { escolhidas: escolhidas.map((o) => o.id), custo: escolhidas.reduce((s, o) => s + o.custo, 0), ganho: escolhidas.reduce((s, o) => s + o.ganho, 0) };
}
