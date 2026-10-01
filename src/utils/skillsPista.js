// 🎯 src/utils/skillsPista.js
// Catálogo de skills e motor de ativação (uma-skill-tools), usados pelo
// Buscador de Pistas e pelo Guia do Meta.

import {
  buildSkillData, CAVALO_NEUTRO, PARAMETROS_CORRIDA_NEUTROS, ConditionsAjustadas, getParser, Region, RegionList,
} from "../uma-skill-tools/buildSkillData";
import skillDataRaw from "../uma-skill-tools/data/skill_data.json";
import skillNamesRaw from "../uma-skill-tools/data/skillnames.json";
import skillMetaRaw from "../uma-skill-tools/data/skill_meta.json";

// 🎯 Só as skills que têm dado de condição de verdade (algumas entradas em
// skillnames.json não têm skill_data correspondente — são nomes órfãos).
// Já vem com raridade e "é herdada" pra alimentar os filtros.
// 🎯 Caso bem específico: a Seirios (100701) e a versão herdada dela
// (900701) têm a segunda condição guardada num ID separado com sufixo
// "-1" (100701-1 / 900701-1) — o próprio gerador de dados do jogo separa
// assim, em vez de deixar como 2 alternativas de uma skill só. Sem esse
// ajuste, a busca mostraria "Seirios" com só metade das condições dela.
// Confirmado que só existem esses 2 casos no banco inteiro.
// 🎯 Catálogo completo — usado quando a pessoa SELECIONA uma cavalinha
// (precisa achar a unique dela, mesmo que seja base, não herdada).
export const catalogoSkillsCompleto = Object.keys(skillDataRaw)
  .filter((id) => skillNamesRaw[id] && !id.includes("-")) // esconde os fragmentos da busca própria
  .map((id) => {
    const alternativasIrmãs = Object.keys(skillDataRaw)
      .filter((outroId) => outroId.startsWith(`${id}-`))
      .flatMap((outroId) => skillDataRaw[outroId].alternatives);
    return {
      id,
      nome: skillNamesRaw[id][1] || skillNamesRaw[id][0],
      rarity: skillDataRaw[id].rarity,
      herdada: id[0] === "9",
      alternatives: [...skillDataRaw[id].alternatives, ...alternativasIrmãs],
      iconId: skillMetaRaw[id]?.iconId || null,
    };
  })
  .sort((a, b) => {
    // 🎯 Gold primeiro, depois White, depois o resto (Unique/Evoluída/
    // Herdada) — dentro de cada grupo, ordem alfabética. Antes era
    // tudo alfabético misturado; agora agrupa por raridade primeiro.
    const prioridade = (s) => {
      if (s.rarity === 2) return 0; // Gold
      if (s.rarity === 1 && !s.herdada) return 1; // White
      return 2; // resto (Unique/Evoluída/Herdada)
    };
    const diff = prioridade(a) - prioridade(b);
    if (diff !== 0) return diff;
    return a.nome.localeCompare(b.nome);
  });

// 🎯 Catálogo da BUSCA geral (grade/janela flutuante) — sem as uniques
// base (raridade 3/4/5, não herdadas). Uma cavalinha "neutra" de teste
// não devia conseguir simplesmente equipar a unique de outra personagem
// do nada — isso só existe de verdade via herança (versão "inherited")
// ou sendo a própria dona dela (que já aparece automaticamente ao
// selecionar a cavalinha, via catalogoSkillsCompleto acima).
//
// 🎯 EVOLUIDAS_DISPONIVEIS_NO_GLOBAL: o Global ainda não tem skills
// evoluídas (raridade 6) liberadas no jogo real — escondidas da busca
// por enquanto. Quando o Global liberar essa mecânica, é só trocar
// esse valor pra true (uma linha só) que elas voltam a aparecer.
export const EVOLUIDAS_DISPONIVEIS_NO_GLOBAL = false;

export const catalogoSkills = catalogoSkillsCompleto.filter((s) => {
  if (!s.herdada && [3, 4, 5].includes(s.rarity)) return false; // unique base
  if (!EVOLUIDAS_DISPONIVEIS_NO_GLOBAL && s.rarity === 6) return false; // evoluída
  return true;
});

const parserSkills = getParser(ConditionsAjustadas);

export const PALETA_SKILLS = [
  { stroke: "rgb(205,11,11)", fill: "rgba(247,115,115,0.35)" },
  { stroke: "rgb(28,61,106)", fill: "rgba(47,103,177,0.35)" },
  { stroke: "rgb(114,76,132)", fill: "rgba(182,153,196,0.35)" },
  { stroke: "rgb(36,106,99)", fill: "rgba(61,177,166,0.35)" },
];

// 🎯 Nem toda skill tem ícone mapeado (o skill_meta.json cobre ~1714 de
// 1716) — retorna null quando não tem, pra quem for usar decidir o que
// mostrar no lugar (não quebrar, não mostrar imagem furada).
export function caminhoIconeSkill(iconId) {
  return iconId ? `/assets/img/skills/utx_ico_skill_${iconId}.png` : null;
}

// 🎯 Roda o motor de condições de verdade contra a pista aberta no momento.
// Usa o mesmo objeto de curso que já usamos pro diagrama (não precisa
// buscar de novo em outro banco de dados). A estratégia (Front Runner/Pace
// Chaser/Late Surger/End Closer) entra aqui porque muitas skills têm
// condição de "running_style" — sem isso, essas skills sempre dariam
// "não ativa" mesmo quando a pista em si suportaria, só porque o cavalo
// de teste fixo não bate com a estratégia exigida.
export function calcularRegioesSkill(dadosCorrida, skillId, estrategia) {
  const wholeCourse = new RegionList();
  wholeCourse.push(new Region(0, dadosCorrida.distance));
  try {
    const cavalo = { ...CAVALO_NEUTRO, strategy: estrategia };
    const gatilhos = buildSkillData(cavalo, PARAMETROS_CORRIDA_NEUTROS, dadosCorrida, wholeCourse, parserSkills, skillId);
    return { erro: false, gatilhos };
  } catch (e) {
    console.error("Erro ao calcular ativação da skill:", skillId, e);
    return { erro: true, gatilhos: [] };
  }
}

export const catalogoSkillsPorId = new Map(catalogoSkillsCompleto.map((s) => [s.id, s]));

// Cor do nome da skill por raridade (1 branca, 2 dourada, 3-5 única, 6 evoluída).
export const COR_RARIDADE_SKILL = { 1: "#c9d2dc", 2: "#f3c75a", 3: "#c58bff", 4: "#c58bff", 5: "#c58bff", 6: "#ff8ad8" };
// Estilo do Guia do Meta -> running_style do motor de skills.
export const ESTRATEGIA_POR_ESTILO = { Front: 1, Pace: 2, Late: 3, End: 4 };

// ---------------------------------------------------------------------
// Formatação dos detalhes da skill (condições, efeitos, duração)
// ---------------------------------------------------------------------

// 🎯 Só traduzo valores de condição que têm enum CONFIRMADO nos arquivos
// fonte reais (CourseData.ts / HorseTypes.ts) — nada de chute. Chaves não
// listadas aqui ficam com o valor numérico bruto mesmo.
const VALORES_CONDICAO = {
  distance_type: { 1: "Sprint", 2: "Mile", 3: "Medium", 4: "Long" },
  ground_type: { 1: "Turf", 2: "Dirt" },
  running_style: { 1: "Front Runner", 2: "Pace Chaser", 3: "Late Surger", 4: "End Closer", 5: "Oonige" },
  phase: { 0: "Early-race", 1: "Mid-race", 2: "Late-race", 3: "Last spurt" },
};

// 🎯 Chaves terminadas em "_per" ou "_rate" são percentuais por natureza
// (hp_per, order_rate etc) — confirmado batendo "hp_per<=30" contra "≤30%"
// na referência.
function formatarValorCondicao(chave, valor) {
  if (VALORES_CONDICAO[chave] && VALORES_CONDICAO[chave][valor] !== undefined) {
    return VALORES_CONDICAO[chave][valor];
  }
  if (/_per$|_rate$/.test(chave)) {
    return `${valor}%`;
  }
  return valor;
}

export function formatarCondicaoTexto(condStr) {
  if (!condStr) return "";
  return condStr.replace(/([a-z_]+)(==|!=|>=|<=|>|<)(\d+)/gi, (match, chave, op, valorStr) => {
    return `${chave}${op}${formatarValorCondicao(chave, Number(valorStr))}`;
  });
}

// 🎯 Quebra a condição em partes por &/@ (mantendo o operador colado no
// início do trecho seguinte), pra não ficar tudo espremido numa linha só
// quando a skill tem várias condições combinadas.
export function partesDaCondicao(condStr) {
  if (!condStr) return [];
  return condStr.split(/(?=[&@])/).map((parte) => formatarCondicaoTexto(parte));
}

// 🎯 Confirmado batendo baseDuration:18000 contra "Base duration: 1.8s" na
// referência (18000 ÷ 10000 = 1.8).
// 🎯 Função extraída direto do bundle.js oficial da ferramenta (função
// "Hn" no código minificado) — formata um número com até 4 casas
// decimais, corta zeros à direita, e prefixa "+" quando positivo.
function formatarHn(valor) {
  const texto = valor.toFixed(4).replace(/\.?0+$/, "");
  return valor <= 0 ? texto : `+${texto}`;
}

// 🎯 Tabela COMPLETA de tipos de efeito (15 tipos) — não é mais
// aproximação: nomes e fórmulas de exibição decompilados direto do
// bundle.js oficial (funções "Bm"/"Zc"/"Hn"/"Jc" no código minificado).
// Reconfirmado batendo com a referência (Recovery +5.5%, Target speed
// +0.35m/s) depois da extração.
const TIPOS_EFEITO_CONFIRMADOS = {
  1: { nome: "Speed up", formatar: (m) => formatarHn(m / 10000) },
  2: { nome: "Stamina up", formatar: (m) => formatarHn(m / 10000) },
  3: { nome: "Power up", formatar: (m) => formatarHn(m / 10000) },
  4: { nome: "Guts up", formatar: (m) => formatarHn(m / 10000) },
  5: { nome: "Wisdom up", formatar: (m) => formatarHn(m / 10000) },
  9: { nome: "Recovery", formatar: (m) => `${((m / 10000) * 100).toFixed(1)}%` },
  13: { nome: "Rushed duration", formatar: (m) => `${formatarHn(m / 10000)}s` },
  21: { nome: "Current speed", formatar: (m) => `${formatarHn(m / 10000)}m/s` },
  22: { nome: "Current speed with natural deceleration", formatar: (m) => `${formatarHn(m / 10000)}m/s` },
  27: { nome: "Target speed", formatar: (m) => `${formatarHn(m / 10000)}m/s` },
  28: { nome: "Lane movement speed", formatar: (m) => formatarHn(m / 10000) },
  29: { nome: "Rushed chance", formatar: (m) => `${formatarHn(m / 10000)}%` },
  31: { nome: "Acceleration", formatar: (m) => `${formatarHn(m / 10000)}m/s²` },
  37: { nome: "Activate random gold skill", formatar: (m) => formatarHn(m / 10000) },
  42: { nome: "Increase skill duration", formatar: (m) => `${(m / 10000).toFixed(2)}×` },
};

export function formatarEfeito(efeito) {
  const info = TIPOS_EFEITO_CONFIRMADOS[efeito.type];
  if (info) return { nome: info.nome, valor: info.formatar(efeito.modifier) };
  return { nome: `Effect type ${efeito.type}`, valor: String(efeito.modifier) };
}

// 🎯 Fórmula extraída do bundle.js oficial, testada e batendo exatamente
// com a referência: baseDuration(s) × (distância da pista ÷ 1000).
// Pra Adrenaline Rush numa pista de 2500m: 1.8 × 2.5 = 4.5s ✓
export function formatarDuracaoEfetiva(baseDuration, distancia) {
  const valor = (baseDuration / 10000) * (distancia / 1000);
  return `${valor.toFixed(4).replace(/\.?0+$/, "")}s`;
}
