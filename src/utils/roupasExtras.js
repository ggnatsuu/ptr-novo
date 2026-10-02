// 🎯 src/utils/roupasExtras.js
// Roupas e skills que ainda não existem nos dados do alpha123
// (uma-skill-tools/data), geradas do GameTora por scripts/atualizar-dados.mjs
// em data/roupasExtras.json (já no formato do alpha123). Ao ser importado,
// injeta nos mesmos objetos que o motor de ativação lê — assim as uniques
// novas funcionam no diagrama sem mexer nos arquivos originais. O que já
// existe no alpha123 SEMPRE prevalece.
//
// Também expõe o status de lançamento de cada roupa no Global e quais
// skills só existem no Japão (pra esconder do diagrama).

import extras from "../data/roupasExtras.json";
import skillDataRaw from "../uma-skill-tools/data/skill_data.json";
import skillNamesRaw from "../uma-skill-tools/data/skillnames.json";
import skillMetaRaw from "../uma-skill-tools/data/skill_meta.json";
import umasRaw from "../uma-skill-tools/data/umas.json";

const ESTRATEGIA_NUMERO = { Front: 1, Pace: 2, Late: 3, End: 4 };

// IDs das skills que vieram daqui (pra marcar "efeito não simulado" etc.).
export const skillsExtras = new Map();

(extras.skills || []).forEach((s) => {
  if (skillDataRaw[s.id]) return; // o alpha123 já tem: prevalece
  skillDataRaw[s.id] = { alternatives: s.alternatives, rarity: s.rarity, wisdomCheck: 0 };
  skillNamesRaw[s.id] = [s.nome];
  skillMetaRaw[s.id] = { iconId: s.iconId, baseCost: 0, order: 10, score: 0 };
  skillsExtras.set(s.id, { noGlobal: s.noGlobal, naoSimulado: !!s.naoSimulado });
});

(extras.roupas || []).forEach((r) => {
  const idPersonagem = r.personagem.id;
  umasRaw[idPersonagem] = umasRaw[idPersonagem] ?? { name: [r.personagem.nomeJp, r.personagem.nome], outfits: {} };
  if (!umasRaw[idPersonagem].outfits[r.id]) {
    umasRaw[idPersonagem].outfits[r.id] = {
      epithet: `[${r.epitetoJp || r.epiteto || ""}]`,
      rarity: r.raridade,
      strategy: ESTRATEGIA_NUMERO[r.estrategia] ?? 2,
    };
  }
});

// Status de lançamento no Global: "lancado" | "anunciado" | "previsto" (ou null se desconhecido).
export const statusDaRoupa = (outfitId) => extras.status?.[String(outfitId)]?.status ?? null;
export const roupaUpcoming = (outfitId) => {
  const s = statusDaRoupa(outfitId);
  return s != null && s !== "lancado";
};

// Unique de roupa (id de 6 dígitos começando com 1 = base, 9 = herdada) -> id da roupa dona.
// Inverso da fórmula do Buscador: 1 V III 1 (V = versão-1, III = personagem) -> 1 III VV.
export function roupaDaUnique(skillId) {
  const id = String(skillId);
  if (id.length !== 6 || !(id[0] === "1" || id[0] === "9") || id[5] !== "1") return null;
  return `1${id.slice(2, 5)}${String(Number(id[1]) + 1).padStart(2, "0")}`;
}

const SO_JAPAO = new Set(extras.skillsSoJapao || []);

// Skill que ainda não saiu no Global: unique/herdada de roupa não lançada,
// ou skill comum que só existe no Japão.
export const skillUpcoming = (skillId) => {
  if (SO_JAPAO.has(String(skillId))) return true;
  const roupa = roupaDaUnique(skillId);
  return roupa != null && roupaUpcoming(roupa);
};
