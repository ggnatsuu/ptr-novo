import { useEffect, useMemo, useRef, useState } from "react";
import { bancoCorridas, bancoG1 } from "../data/bancos-corridas";
import { tracknames, courseData } from "../data/pistasCourseData";
import {
  buildSkillData, CAVALO_NEUTRO, PARAMETROS_CORRIDA_NEUTROS, ConditionsAjustadas, getParser, Region, RegionList,
} from "../uma-skill-tools/buildSkillData";
import skillDataRaw from "../uma-skill-tools/data/skill_data.json";
import skillNamesRaw from "../uma-skill-tools/data/skillnames.json";
import skillMetaRaw from "../uma-skill-tools/data/skill_meta.json";
import umasRaw from "../uma-skill-tools/data/umas.json";
import iconsRaw from "../uma-skill-tools/data/icons.json";
import recomendacoesPistasRaw from "../uma-skill-tools/data/recomendacoes-pistas.json";

// ============================================================================
// PREPARAÇÃO DOS DADOS (fora do componente — roda uma vez só, no carregamento)
// ============================================================================

// 🎯 Puxa o texto de dentro dos parênteses: "1600 m (Mile)" → "Mile",
// "Grama (Turf)" → "Turf". Usado tanto pra exibir quanto pra filtrar.
function extrairParenteses(texto) {
  const encontrado = (texto || "").match(/\(([^)]+)\)/);
  return encontrado ? encontrado[1] : texto || "";
}

function extrairNumeroDistancia(texto) {
  const encontrado = (texto || "").match(/(\d+)/);
  return encontrado ? Number(encontrado[1]) : 0;
}

// 🎯 Direção tem 3 valores possíveis nos dados (Right/Left/Straight), não
// só 2 — um bug bobo seria tratar qualquer coisa que não é "Right" como
// "Esquerda", o que erraria toda pista de pista reta.
function traduzirDirecao(direcao) {
  if (direcao === "Right") return "Direita";
  if (direcao === "Left") return "Esquerda";
  return "Reta";
}

// 🎯 Mesma função de slug que o Sorteio.jsx já usa pra montar o caminho da
// imagem do hipódromo — reaproveitando pra manter as imagens consistentes
// em todo o site (public/assets/img/hipodromos/{slug}.png).
function slugHipodromo(nome) {
  return (nome || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// 🎯 O banco da PTR escreve "Chukyo", o dataset extraído do uma-tools
// escreve "Chuukyo" — mesmo hipódromo, grafia diferente. Sem esse apelido,
// a correspondência falharia silenciosamente pra esse hipódromo específico.
const APELIDOS_HIPODROMO = { Chukyo: "Chuukyo" };

// 🎯 Acha a entrada de courseData (curvas/retas reais) que corresponde a
// uma pista da PTR, cruzando hipódromo + distância + terreno + direção.
// Retorna null se não achar (hipódromo fora do dataset, ex: Urawa — ou
// combinação que não existe) — tratado com uma mensagem amigável na tela,
// nunca quebrando a página.
// 🎯 Quando a mesma combinação hipódromo+distância+terreno tem mais de
// uma variante (interna/externa), por padrão a gente pega a de menor
// "course" — mas isso está ERRADO especificamente pra Kyoto: lá,
// course=2 é Inner e course=3 é Outer, e o certo (confirmado comparando
// com a ferramenta de referência) é preferir Outer quando ambas
// existem. Chave é o nome do hipódromo, valor é o "course" preferido
// nesse caso — só ambiguidade real em 1400m/1600m Turf, as outras
// distâncias de Kyoto só têm 1 variante mesmo (e já vinham certas).
const PREFERENCIA_COURSE_HIPODROMO = { Kyoto: 3 };

// 🎯 Nome da corrida → ID exato do percurso no jogo (campo courseId do
// bancos-corridas.js, cruzado com os dados do jogo). Serve pras pistas
// que chegam sem o ID (ex: salvas no Firestore antes do campo existir).
const COURSE_ID_POR_NOME = Object.fromEntries(
  [...bancoCorridas, ...bancoG1].filter((p) => p.courseId).map((p) => [p.nome, p.courseId])
);

function encontrarCourseData(pista) {
  // 🎯 Caminho principal: o ID exato do percurso. Só cai no cruzamento
  // hipódromo+distância+terreno+direção abaixo se a pista não tiver ID
  // nem estiver no banco — ele erra quando há 2 traçados (ex: Niigata).
  const courseIdExato = pista.courseId ?? pista.course_id ?? COURSE_ID_POR_NOME[pista.nome];
  if (courseIdExato != null && courseData[courseIdExato]) return courseData[courseIdExato];

  const nomeParaComparar = APELIDOS_HIPODROMO[pista.hipodromo] || pista.hipodromo;
  const raceTrackId = Object.keys(tracknames).find(
    (id) => tracknames[id][1].toLowerCase() === nomeParaComparar.toLowerCase()
  );
  if (!raceTrackId) return null;

  const surfaceAlvo = pista.terrenoCurto === "Dirt" ? 2 : 1;
  const turnAlvo = pista.direcao === "Right" ? 1 : pista.direcao === "Left" ? 2 : 4;

  const candidatos = Object.values(courseData).filter(
    (c) =>
      c.raceTrackId === Number(raceTrackId) &&
      c.distance === pista.distanciaNumero &&
      c.surface === surfaceAlvo &&
      c.turn === turnAlvo
  );
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  const coursePreferido = PREFERENCIA_COURSE_HIPODROMO[pista.hipodromo];
  if (coursePreferido != null) {
    const preferido = candidatos.find((c) => c.course === coursePreferido);
    if (preferido) return preferido;
  }

  // 🎯 Sem preferência específica cadastrada: mantém o comportamento
  // antigo (menor "course") — não queremos mudar isso globalmente sem
  // confirmar cada hipódromo, já que a convenção numérica não é
  // universal entre eles.
  return [...candidatos].sort((a, b) => a.course - b.course)[0];
}

// 🎯 Divide a distância nas 4 fases clássicas da corrida (Abertura 1/6,
// Meio 1/2, Final 1/6, Último Sprint 1/6) — fórmula confirmada batendo
// contra os diagramas reais de Sapporo 1200 (Turf) e Sapporo 1000 (Dirt)
// que vieram como referência.
function calcularFases(distancia) {
  const abertura = distancia / 6;
  const meio = distancia / 2;
  const final = distancia / 6;
  return {
    abertura: { inicio: 0, fim: abertura },
    meio: { inicio: abertura, fim: abertura + meio },
    final: { inicio: abertura + meio, fim: abertura + meio + final },
    ultimoSprint: { inicio: abertura + meio + final, fim: distancia },
  };
}

// 🎯 Monta a lista de retas/curvas usando os dois arrays reais (straights +
// corners). Qualquer trecho que não aparece em NENHUM dos dois arrays —
// seja no início, no meio ou no fim da pista — não é considerado nem
// curva nem reta dentro do próprio jogo, então fica sem cor/borda/rótulo
// nenhum (só os números de metragem nas pontas, pra referência).
function montarSegmentosPista(dados) {
  const zonasConhecidas = [
    ...dados.corners.map((c) => ({ tipo: "curva", inicio: c.start, fim: c.start + c.length })),
    ...dados.straights.map((s) => ({ tipo: "reta", inicio: s.start, fim: s.end })),
  ].sort((a, b) => a.inicio - b.inicio);

  const segmentos = [];
  let cursor = 0;
  let numeroCurva = 0;
  zonasConhecidas.forEach((zona) => {
    if (zona.inicio > cursor) {
      segmentos.push({ tipo: "indefinido", inicio: cursor, fim: zona.inicio });
    }
    if (zona.inicio < cursor) return; // zona já coberta (sobreposição rara), ignora
    if (zona.tipo === "curva") numeroCurva += 1;
    segmentos.push({ ...zona, numero: zona.tipo === "curva" ? numeroCurva : undefined });
    cursor = zona.fim;
  });
  if (cursor < dados.distance) {
    segmentos.push({ tipo: "indefinido", inicio: cursor, fim: dados.distance });
  }
  return segmentos;
}

// 🎯 Segmentos de subida/descida — direto do array "slopes" (slope > 0 =
// subida, slope < 0 = descida). Confirmado batendo com a Nakayama 2500m
// inner (os 4 trechos: 621-731 subida, 825-1025 subida, 1125-1525 descida,
// 2325-2435 subida — todos exatamente nos metros da imagem de referência).
function montarSegmentosDeclive(dados) {
  return [...(dados.slopes || [])]
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ tipo: s.slope > 0 ? "subida" : "descida", inicio: s.start, fim: s.start + s.length, slope: s.slope }));
}

// 🎯 Junta os dois bancos (G1 + G2/G3/L), tira duplicatas pelo nome da
// corrida (a mesma corrida pode aparecer em mais de um mês/semana no banco
// original) e já deixa os campos derivados prontos pra filtrar/exibir.
const todasAsPistas = [...bancoCorridas, ...bancoG1]
  .filter((p, idx, self) => p?.nome && self.findIndex((t) => t.nome === p.nome) === idx)
  .map((p) => ({
    ...p,
    distanciaNumero: extrairNumeroDistancia(p.distancia),
    distanciaCategoria: extrairParenteses(p.distancia),
    terrenoCurto: extrairParenteses(p.terreno),
  }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

const CATEGORIA_DISTANCIA_INFO = {
  Sprint: { cor: "#ff6fa5" },
  Mile: { cor: "#e8c547" },
  Medium: { cor: "#4dd68c" },
  Long: { cor: "#5b9dff" },
};

const GRADE_INFO = {
  G1: { cor: "#c5a059", bg: "rgba(197,160,89,0.15)" },
  G2: { cor: "#a4b3c6", bg: "rgba(164,179,198,0.12)" },
  G3: { cor: "#8fa3bd", bg: "rgba(143,163,189,0.1)" },
  L: { cor: "#8fa3bd", bg: "rgba(143,163,189,0.1)" },
};

// 🎯 Listas únicas pros seletores de filtro, derivadas do próprio banco de
// dados (não fixas na mão) — se um hipódromo novo entrar no banco algum
// dia, o filtro já aparece sozinho, sem precisar mexer aqui.
const OPCOES_GRADE = [...new Set(todasAsPistas.map((p) => p.grade))].sort();
const OPCOES_HIPODROMO = [...new Set(todasAsPistas.map((p) => p.hipodromo))].sort();
const OPCOES_CATEGORIA = ["Sprint", "Mile", "Medium", "Long"].filter((cat) =>
  todasAsPistas.some((p) => p.distanciaCategoria === cat)
);
const OPCOES_TERRENO = [...new Set(todasAsPistas.map((p) => p.terrenoCurto))].sort();
const OPCOES_DIRECAO = [...new Set(todasAsPistas.map((p) => p.direcao))].sort();

// ============================================================================
// SISTEMA DE SKILLS (motor portado do uma-skill-tools, validado antes)
// ============================================================================

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
const catalogoSkillsCompleto = Object.keys(skillDataRaw)
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
const EVOLUIDAS_DISPONIVEIS_NO_GLOBAL = false;

const catalogoSkills = catalogoSkillsCompleto.filter((s) => {
  if (!s.herdada && [3, 4, 5].includes(s.rarity)) return false; // unique base
  if (!EVOLUIDAS_DISPONIVEIS_NO_GLOBAL && s.rarity === 6) return false; // evoluída
  return true;
});

const parserSkills = getParser(ConditionsAjustadas);

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

function formatarCondicaoTexto(condStr) {
  if (!condStr) return "";
  return condStr.replace(/([a-z_]+)(==|!=|>=|<=|>|<)(\d+)/gi, (match, chave, op, valorStr) => {
    return `${chave}${op}${formatarValorCondicao(chave, Number(valorStr))}`;
  });
}

// 🎯 Quebra a condição em partes por &/@ (mantendo o operador colado no
// início do trecho seguinte), pra não ficar tudo espremido numa linha só
// quando a skill tem várias condições combinadas.
function partesDaCondicao(condStr) {
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

function formatarEfeito(efeito) {
  const info = TIPOS_EFEITO_CONFIRMADOS[efeito.type];
  if (info) return { nome: info.nome, valor: info.formatar(efeito.modifier) };
  return { nome: `Effect type ${efeito.type}`, valor: String(efeito.modifier) };
}

// 🎯 Fórmula extraída do bundle.js oficial, testada e batendo exatamente
// com a referência: baseDuration(s) × (distância da pista ÷ 1000).
// Pra Adrenaline Rush numa pista de 2500m: 1.8 × 2.5 = 4.5s ✓
function formatarDuracaoEfetiva(baseDuration, distancia) {
  const valor = (baseDuration / 10000) * (distancia / 1000);
  return `${valor.toFixed(4).replace(/\.?0+$/, "")}s`;
}

// 🎯 Velocidade base da pista (m/s) — fórmula extraída do app.tsx original
// (function baseSpeed). Uso ela só pra converter "quanto tempo a skill
// fica ativa" em "quantos metros isso representa no desenho" — é uma
// estimativa (a velocidade real varia com estratégia/stats/skills), não
// um cálculo exato de física de corrida completo.
function velocidadeBaseDaPista(distancia) {
  return 20.0 - (distancia - 2000) / 1000.0;
}

function formatarDuracaoBase(baseDuration) {
  return (baseDuration / 10000).toFixed(1) + "s";
}

const PALETA_SKILLS = [
  { stroke: "rgb(205,11,11)", fill: "rgba(247,115,115,0.35)" },
  { stroke: "rgb(28,61,106)", fill: "rgba(47,103,177,0.35)" },
  { stroke: "rgb(114,76,132)", fill: "rgba(182,153,196,0.35)" },
  { stroke: "rgb(36,106,99)", fill: "rgba(61,177,166,0.35)" },
];

// 🎯 rarity 1=Branca, 2=Dourada, 3/4/5=Única, 6=Evoluída — mapeamento
// exato tirado do SkillList.tsx original (classnames[rarity]), não é
// chute.
function classeRaridade(rarity) {
  if (rarity === 1) return "branca";
  if (rarity === 2) return "dourada";
  if (rarity === 6) return "evoluida";
  return "unica"; // 3, 4, 5
}

// 🎯 Fórmula de ID de unique skill — extraída do HorseDefTypes.ts
// original. Testada e batendo com dado real: outfit 100101 (Special
// Week) + 3 estrelas → skill 100011 → "Shooting Star", igual o jogo.
function idDaUniqueSkill(outfitId, starCount) {
  const oid = String(outfitId);
  const i = Number(oid.slice(1, -2));
  const v = Number(oid.slice(-2));
  const sid = 10000 * (1 + 9 * (starCount > 2 ? 1 : 0)) + 10000 * (v - 1) + i * 10 + 1;
  return String(sid);
}

// 🎯 Achata personagem + variações (outfits/cards) numa lista só pra
// busca — cada carta tem sua PRÓPRIA unique (mesmo personagem, cartas
// diferentes = uniques diferentes), por isso a busca já é por carta, não
// só por personagem.
const catalogoCavalinhas = Object.entries(umasRaw).flatMap(([baseId, uma]) =>
  Object.entries(uma.outfits).map(([outfitId, outfit]) => ({
    outfitId,
    nomeBase: uma.name[1],
    epiteto: outfit.epithet,
    strategy: outfit.strategy,
    rarity: outfit.rarity,
  }))
).sort((a, b) => a.nomeBase.localeCompare(b.nomeBase));

// 🎯 Converte o ID de uma unique BASE pro ID da versão HERDADA (troca o
// primeiro dígito por "9" — mesma regra do gerador de nomes original,
// testada e batendo com dado real: 100271 -> 900271, etc). Não é mais
// usada diretamente na resolução de recomendação (formato mudou pra
// nome da skill), mas mantida por documentar a regra caso precise de
// novo — é fácil de esquecer essa conversão.
function idDaVersaoHerdada(idBase) {
  return "9" + idBase.slice(1);
}

// 🎯 Mapa reverso: dado o ID de uma unique BASE (3★, qualquer carta —
// não só a OG), acha qual cavalinha/carta é a dona dela. Construído uma
// vez só (não em cada render), varrendo todas as cartas e calculando a
// unique de cada uma — permite ir do NOME da skill até o ícone da
// personagem certa, sem precisar saber de antemão qual carta é.
const donoDaUniqueBase = new Map();
catalogoCavalinhas.forEach((c) => {
  donoDaUniqueBase.set(idDaUniqueSkill(c.outfitId, 3), c);
});

// 🎯 Nem toda skill tem ícone mapeado (o skill_meta.json cobre ~1714 de
// 1716) — retorna null quando não tem, pra quem for usar decidir o que
// mostrar no lugar (não quebrar, não mostrar imagem furada).
function caminhoIconeSkill(iconId) {
  return iconId ? `/assets/img/skills/utx_ico_skill_${iconId}.png` : null;
}

function caminhoIconeCavalinha(outfitId) {
  const entrada = iconsRaw[outfitId];
  if (!entrada) return null;
  const arquivo = Array.isArray(entrada) ? entrada[1] : entrada;
  return `/assets/img/chara/${arquivo}.png`;
}

const RARIDADE_INFO = {
  branca: { label: "Branca" },
  dourada: { label: "Dourada" },
  unica: { label: "Única" },
  evoluida: { label: "Evoluída" },
};

// 🎯 Trechos de condição que cada filtro procura — mesmos usados no
// SkillList.tsx original (filterOps). A comparação aqui é por texto (a
// condição CONTÉM esse trecho), uma aproximação do "treeMatch" original
// (que eu não tenho o código-fonte) — funciona certo pra praticamente
// todo caso real, só não é garantidamente idêntico em casos muito
// específicos de condição reformulada de forma equivalente.
const FILTROS_CONDICAO = {
  nige: ["running_style==1"],
  senkou: ["running_style==2"],
  sasi: ["running_style==3"],
  oikomi: ["running_style==4"],
  short: ["distance_type==1"],
  mile: ["distance_type==2"],
  medium: ["distance_type==3"],
  long: ["distance_type==4"],
  turf: ["ground_type==1"],
  dirt: ["ground_type==2"],
  phase0: ["phase==0", "phase_random==0", "phase_firsthalf_random==0", "phase_laterhalf_random==0"],
  phase1: ["phase==1", "phase>=1", "phase_random==1", "phase_firsthalf_random==1", "phase_laterhalf_random==1"],
  phase2: ["phase==2", "phase>=2", "phase_random==2", "phase_firsthalf_random==2", "phase_laterhalf_random==2", "phase_firstquarter_random==2", "is_lastspurt==1"],
  phase3: ["phase==3", "phase_random==3", "phase_firsthalf_random==3", "phase_laterhalf_random==3"],
  finalcorner: ["is_finalcorner==1", "is_finalcorner_laterhalf==1", "is_finalcorner_random==1"],
  finalstraight: ["is_last_straight==1", "is_last_straight_onetime==1"],
};

function skillPassaNoFiltro(skill, chaveFiltro) {
  const trechos = FILTROS_CONDICAO[chaveFiltro];
  return skill.alternatives.some((alt) =>
    trechos.some((t) => alt.condition.includes(t) || (alt.precondition && alt.precondition.includes(t)))
  );
}

// 🎯 Roda o motor de condições de verdade contra a pista aberta no momento.
// Usa o mesmo objeto de curso que já usamos pro diagrama (não precisa
// buscar de novo em outro banco de dados). A estratégia (Front Runner/Pace
// Chaser/Late Surger/End Closer) entra aqui porque muitas skills têm
// condição de "running_style" — sem isso, essas skills sempre dariam
// "não ativa" mesmo quando a pista em si suportaria, só porque o cavalo
// de teste fixo não bate com a estratégia exigida.
function calcularRegioesSkill(dadosCorrida, skillId, estrategia) {
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

// ============================================================================
// COMPONENTE DO DIAGRAMA (SVG desenhado a partir dos dados reais)
// ============================================================================

// 🎯 Cores copiadas direto da imagem de referência (uma-tools), sem
// adaptar pro tema escuro do site — só o diagrama em si fica com fundo
// claro, o resto do modal (título, botão de fechar) continua no estilo
// da PTR.
const CORES = {
  fundo: "#fdf9f0",
  skyline: "#c5e05a",
  faixaDeclive: "#ecdcea",
  subida: "#f0c890",
  subidaBorda: "#c98a3e",
  descida: "#4a9ea3",
  descidaBorda: "#2f7a7f",
  faixaSecao: "#bfe0f5",
  curva: "#f0c890",
  curvaBorda: "#c98a3e",
  reguaFundo: "#dbe6ef",
  textoEscuro: "#5a3018",
  textoClaro: "#ffffff",
};

const CORES_FASE = {
  abertura: "#1f7a54",
  meio: "#d9b03c",
  final: "#a8447a",
  ultimoSprint: "#7a2f56",
};

// 🎯 Calcula a altura acumulada ao longo da pista, ponto a ponto, a partir
// dos trechos de inclinação (slope/1000000 = fração de subida por metro
// percorrido). Testado contra a Nakayama 2500 inner: bateu exatamente com
// os percentuais esperados (2%, 1.5%, -1.5%, 2%) e deu um pico de ~5.2m,
// fisicamente plausível pra um hipódromo real.
function calcularPerfilElevacao(dados) {
  const pontos = [{ pos: 0, altura: 0 }];
  let alturaAtual = 0;
  let posAtual = 0;
  const slopesOrdenados = [...(dados.slopes || [])].sort((a, b) => a.start - b.start);
  slopesOrdenados.forEach((s) => {
    if (s.start > posAtual) pontos.push({ pos: s.start, altura: alturaAtual });
    const alturaFinal = alturaAtual + s.length * (s.slope / 1000000);
    pontos.push({ pos: s.start, altura: alturaAtual });
    pontos.push({ pos: s.start + s.length, altura: alturaFinal });
    alturaAtual = alturaFinal;
    posAtual = s.start + s.length;
  });
  if (posAtual < dados.distance) pontos.push({ pos: dados.distance, altura: alturaAtual });
  return pontos;
}

// 🎯 Seta desenhada em linha+ponta, em vez de usar caractere Unicode (↗/↘)
// dentro do texto — algumas fontes não têm esse glifo específico e o
// navegador troca por um símbolo genérico qualquer, dando a impressão de
// que a seta "sumiu". Desenhando manualmente, funciona igual em qualquer
// navegador/fonte.
function SetaDireção({ x, y, tamanho = 9, subindo, cor }) {
  const pontos = subindo
    ? `M0,${tamanho} L${tamanho},0 M${tamanho * 0.5},0 L${tamanho},0 L${tamanho},${tamanho * 0.5}`
    : `M0,0 L${tamanho},${tamanho} M${tamanho * 0.5},${tamanho} L${tamanho},${tamanho} L${tamanho},${tamanho * 0.5}`;
  return (
    <path
      d={pontos}
      transform={`translate(${x},${y})`}
      stroke={cor}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

function DiagramaPistaSVG({ dadosCorrida, skillsDestacadas }) {
  const largura = 900;
  const distancia = dadosCorrida.distance;
  const escala = largura / distancia;

  const segmentosPista = useMemo(() => montarSegmentosPista(dadosCorrida), [dadosCorrida]);
  const segmentosDeclive = useMemo(() => montarSegmentosDeclive(dadosCorrida), [dadosCorrida]);
  const fases = useMemo(() => calcularFases(distancia), [distancia]);
  const perfilElevacao = useMemo(() => calcularPerfilElevacao(dadosCorrida), [dadosCorrida]);

  const alturas = perfilElevacao.map((p) => p.altura);
  const alturaMaxima = Math.max(...alturas, 0);
  const alturaMinima = Math.min(...alturas, 0);
  const amplitude = alturaMaxima - alturaMinima || 1; // evita divisão por 0 numa pista 100% plana

  const svgRef = useRef(null);
  const [metragemMouse, setMetragemMouse] = useState(null);

  // 🎯 Converte a posição do mouse na tela (pixels reais) pra metros da
  // pista, usando o tamanho renderizado do SVG (não o viewBox) — assim
  // funciona certo independente de quanto o diagrama está esticado/
  // encolhido na tela do usuário.
  function aoMoverMouse(e) {
    if (!svgRef.current) return;
    const retangulo = svgRef.current.getBoundingClientRect();
    const proporcaoX = (e.clientX - retangulo.left) / retangulo.width;
    const metros = proporcaoX * distancia;
    setMetragemMouse(Math.max(0, Math.min(distancia, Math.round(metros))));
  }

  function aoSairMouse() {
    setMetragemMouse(null);
  }

  const alturaSkyline = 28;
  const alturaDeclive = 34;
  const alturaSecao = 36;
  const alturaFase = 36;
  const alturaRegua = 26;
  const alturaTrilhoSkill = 26;
  const espacoTrilho = 4;

  // 🎯 Uma "linha de trilha" por alternativa da skill, não por skill —
  // uma skill com 2 condições diferentes (tipo Sunny Breeze) ganha 2
  // linhas, uma pra cada. Skill sem nenhuma alternativa válida ainda
  // ganha 1 linha (mostrando "não ativa").
  const linhasDeTrilha = useMemo(
    () =>
      skillsDestacadas.flatMap((sk) =>
        sk.gatilhos.length > 0
          ? sk.gatilhos.map((gatilho, gi) => ({ sk, gatilho, numero: gi + 1, chave: `${sk.id}-${gi}` }))
          : [{ sk, gatilho: null, numero: 1, chave: `${sk.id}-vazio` }]
      ),
    [skillsDestacadas]
  );

  const ySkyline = 20;
  const yDeclive = ySkyline + alturaSkyline;
  const ySecao = yDeclive + alturaDeclive;
  const yFase = ySecao + alturaSecao;
  const yRegua = yFase + alturaFase;
  const yTrilhosSkills = yRegua + alturaRegua + 8;
  const alturaTotal = yTrilhosSkills + linhasDeTrilha.length * (alturaTrilhoSkill + espacoTrilho);

  return (
    <svg
      viewBox={`0 0 ${largura} ${alturaTotal}`}
      className="bp-diagrama-svg"
      xmlns="http://www.w3.org/2000/svg"
      ref={svgRef}
      onMouseMove={aoMoverMouse}
      onMouseLeave={aoSairMouse}
    >
      <rect x={0} y={0} width={largura} height={alturaTotal} fill={CORES.fundo} />

      {/* Faixa decorativa (skyline) — agora com o relevo real, calculado a
          partir da elevação acumulada. Sobe onde tem subida, desce onde
          tem descida, física de verdade, não é só estética. */}
      <rect x={0} y={ySkyline} width={largura} height={alturaSkyline} fill="#fdf9f0" />
      <polygon
        points={
          `0,${ySkyline + alturaSkyline} ` +
          perfilElevacao.map((p) => `${p.pos * escala},${ySkyline + alturaSkyline - 3 - ((p.altura - alturaMinima) / amplitude) * (alturaSkyline - 6)}`).join(" ") +
          ` ${largura},${ySkyline + alturaSkyline}`
        }
        fill={CORES.skyline}
      />
      {segmentosDeclive.map((s, idx) => {
        const meio = (s.inicio + s.fim) / 2;
        const alturaNoMeio = perfilElevacao.reduce((maisProximo, p) => (Math.abs(p.pos - meio) < Math.abs(maisProximo.pos - meio) ? p : maisProximo)).altura;
        const yPercentual = ySkyline + alturaSkyline - 3 - ((alturaNoMeio - alturaMinima) / amplitude) * (alturaSkyline - 6) - 4;
        const percentual = Math.abs(s.slope) / 10000;
        return (
          <text key={`pct-${idx}`} x={meio * escala} y={Math.max(yPercentual, 9)} textAnchor="middle" className="bp-diagrama-texto-marca" fill="#5a6b1a">
            {percentual > 0 ? `${percentual}%` : ""}
          </text>
        );
      })}

      {/* Faixa de declive — fundo cobrindo a linha toda + caixas de subida/descida por cima */}
      <rect x={0} y={yDeclive} width={largura} height={alturaDeclive} fill={CORES.faixaDeclive} />
      {segmentosDeclive.map((s, idx) => {
        const larguraPx = (s.fim - s.inicio) * escala;
        const mostrarTexto = larguraPx > 55;
        return (
          <g key={`declive-${idx}`}>
            <rect
              x={s.inicio * escala}
              y={yDeclive}
              width={larguraPx}
              height={alturaDeclive}
              fill={s.tipo === "subida" ? CORES.subida : CORES.descida}
              stroke={s.tipo === "subida" ? CORES.subidaBorda : CORES.descidaBorda}
              strokeWidth={1}
            />
            {mostrarTexto ? (
              <>
                <text
                  x={(s.inicio + s.fim) / 2 * escala - 8}
                  y={yDeclive + alturaDeclive / 2 + 4}
                  textAnchor="end"
                  className="bp-diagrama-texto-segmento"
                  fill={s.tipo === "subida" ? CORES.textoEscuro : CORES.textoClaro}
                >
                  {s.tipo === "subida" ? "Uphill" : "Downhill"}
                </text>
                <SetaDireção
                  x={(s.inicio + s.fim) / 2 * escala}
                  y={yDeclive + alturaDeclive / 2 - 6}
                  tamanho={11}
                  subindo={s.tipo === "subida"}
                  cor={s.tipo === "subida" ? CORES.textoEscuro : CORES.textoClaro}
                />
              </>
            ) : (
              <SetaDireção
                x={(s.inicio + s.fim) / 2 * escala - 5}
                y={yDeclive + alturaDeclive / 2 - 5}
                tamanho={10}
                subindo={s.tipo === "subida"}
                cor={s.tipo === "subida" ? CORES.textoEscuro : CORES.textoClaro}
              />
            )}
          </g>
        );
      })}

      {/* 🎯 Rótulos de metragem da faixa de declive, um por limite ÚNICO —
          em vez de cada trecho desenhar seu próprio início/fim (o que
          duplicava o número quando um trecho terminava exatamente onde o
          próximo começava, tipo dois "1600m" empilhados). */}
      {[...new Set(segmentosDeclive.flatMap((s) => [s.inicio, s.fim]))]
        .sort((a, b) => a - b)
        .map((m) => (
          <text key={`declive-marca-${m}`} x={m * escala} y={yDeclive - 3} textAnchor="middle" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
            {Math.round(m)}m
          </text>
        ))}

      {/* Retas e curvas — indefinido (nem um nem outro) fica sem cor/borda,
          só com a metragem nas pontas pra referência */}
      {segmentosPista.map((s, idx) => {
        const larguraPx = (s.fim - s.inicio) * escala;

        if (s.tipo === "indefinido") {
          return (
            <g key={`seg-${idx}`}>
              <text x={s.inicio * escala + 3} y={ySecao + 30} className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
                {s.inicio > 0 ? `${Math.round(s.inicio)}m` : ""}
              </text>
              <text x={s.fim * escala - 3} y={ySecao + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
                {s.fim < distancia ? `${Math.round(s.fim)}m` : ""}
              </text>
            </g>
          );
        }

        if (s.tipo === "curva") {
          return (
            <g key={`seg-${idx}`}>
              <rect x={s.inicio * escala} y={ySecao} width={larguraPx} height={alturaSecao} fill={CORES.curva} />
              <line x1={s.inicio * escala} y1={ySecao} x2={s.inicio * escala} y2={ySecao + alturaSecao} stroke={CORES.curvaBorda} strokeWidth={1} />
              <line x1={s.fim * escala} y1={ySecao} x2={s.fim * escala} y2={ySecao + alturaSecao} stroke={CORES.curvaBorda} strokeWidth={1} />
              <text x={(s.inicio + s.fim) / 2 * escala} y={ySecao + 16} textAnchor="middle" className="bp-diagrama-texto-segmento" fill={CORES.textoEscuro}>
                {`Corner ${s.numero}`}
              </text>
              <text x={s.fim * escala - 4} y={ySecao + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
                {larguraPx > 30 && s.fim < distancia ? `${Math.round(s.fim)}m` : ""}
              </text>
            </g>
          );
        }

        // reta
        return (
          <g key={`seg-${idx}`}>
            <rect x={s.inicio * escala} y={ySecao} width={larguraPx} height={alturaSecao} fill={CORES.faixaSecao} />
            <text x={(s.inicio + s.fim) / 2 * escala} y={ySecao + 16} textAnchor="middle" className="bp-diagrama-texto-segmento" fill={CORES.textoEscuro}>
              Straight
            </text>
            <text x={s.fim * escala - 4} y={ySecao + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
              {larguraPx > 30 && s.fim < distancia ? `${Math.round(s.fim)}m` : ""}
            </text>
          </g>
        );
      })}

      {/* Fases da corrida */}
      {Object.entries(fases).map(([nome, f]) => (
        <g key={nome}>
          <rect x={f.inicio * escala} y={yFase} width={(f.fim - f.inicio) * escala} height={alturaFase} fill={CORES_FASE[nome]} />
          <text x={(f.inicio + f.fim) / 2 * escala} y={yFase + 16} textAnchor="middle" className="bp-diagrama-texto-segmento" fill={CORES.textoClaro}>
            {nome === "abertura" && "Early-race"}
            {nome === "meio" && "Mid-race"}
            {nome === "final" && "Late-race"}
            {nome === "ultimoSprint" && "Last spurt"}
          </text>
          <text x={f.fim * escala - 4} y={yFase + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill="rgba(255,255,255,0.85)">
            {f.fim < distancia ? `${Math.round(f.fim)}m` : ""}
          </text>
        </g>
      ))}

      {/* Régua */}
      <rect x={0} y={yFase + alturaFase} width={largura} height={alturaRegua} fill={CORES.reguaFundo} />
      <line x1={0} y1={yRegua} x2={largura} y2={yRegua} stroke="rgba(90,48,24,0.3)" strokeWidth={1} />
      {Array.from({ length: Math.floor(distancia / 200) + 1 }, (_, i) => i * 200).map((m) => (
        <g key={`regua-${m}`}>
          <line x1={m * escala} y1={yRegua - 4} x2={m * escala} y2={yRegua + 4} stroke="rgba(90,48,24,0.4)" strokeWidth={1} />
          <text x={m * escala} y={yRegua + 19} textAnchor="middle" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>{m}m</text>
        </g>
      ))}
      <text x={largura - 2} y={yRegua + 19} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>{distancia}m</text>

      {/* 🎯 Destaques de skill selecionada — linha fina quando a ativação é
          "imediata" (dispara no primeiro instante possível), zona colorida
          translúcida quando é aleatória (pode disparar em qualquer ponto
          daquela faixa). Mesma lógica visual do RaceTrack.tsx original. */}
      {skillsDestacadas.map((sk) =>
        sk.gatilhos.flatMap((gatilho, gi) =>
          gatilho.isImmediate ? (
            <line
              key={`skill-${sk.id}-${gi}-imediata`}
              x1={gatilho.regions[0].start * escala}
              y1={0}
              x2={gatilho.regions[0].start * escala}
              y2={yRegua + alturaRegua}
              stroke={sk.cor.stroke}
              strokeWidth={2.5}
            />
          ) : (
            gatilho.regions.map((r, ri) => (
              <rect
                key={`skill-${sk.id}-${gi}-${ri}`}
                x={r.start * escala}
                y={0}
                width={(r.end - r.start) * escala}
                height={yRegua + alturaRegua}
                fill={sk.cor.fill}
                stroke={sk.cor.stroke}
                strokeWidth={1}
              />
            ))
          )
        )
      )}

      {/* 🎯 Trilha dedicada por ALTERNATIVA da skill — uma skill com 2
          condições diferentes (tipo Sunny Breeze) ganha 2 linhas, uma pra
          cada, já que cada alternativa pode ativar em lugar/efeito
          diferente. Duas camadas por linha: um contorno fraco mostrando o
          RANGE onde pode começar a ativar, e uma barra sólida do tamanho
          real — em metros — de quanto tempo fica ativa depois de disparar. */}
      {linhasDeTrilha.map((linha, idx) => {
        const y = yTrilhosSkills + idx * (alturaTrilhoSkill + espacoTrilho);
        const { sk, gatilho, numero } = linha;
        const regiao = gatilho && gatilho.regions[0];
        const larguraDuracaoMetros = gatilho && gatilho.baseDuration != null
          ? (gatilho.baseDuration / 10000) * velocidadeBaseDaPista(distancia)
          : 0;
        const numeroAlternativa = sk.gatilhos.length > 1 ? ` [${numero}]` : "";
        return (
          <g key={`trilho-${linha.chave}`}>
            <rect x={0} y={y} width={largura} height={alturaTrilhoSkill} fill="rgba(0,0,0,0.15)" rx={4} />
            {regiao && (
              <>
                {/* Range onde pode começar a ativar — contorno fraco, sem preenchimento sólido */}
                <rect
                  x={regiao.start * escala}
                  y={y + 3}
                  width={Math.max((regiao.end - regiao.start) * escala, 5)}
                  height={alturaTrilhoSkill - 6}
                  fill={sk.cor.fill}
                  fillOpacity={0.25}
                  stroke={sk.cor.stroke}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  rx={4}
                />
                {/* Duração real, em metros — a barra sólida de verdade */}
                <rect
                  x={regiao.start * escala}
                  y={y + 3}
                  width={Math.max(larguraDuracaoMetros * escala, 4)}
                  height={alturaTrilhoSkill - 6}
                  fill={sk.cor.fill}
                  stroke={sk.cor.stroke}
                  strokeWidth={1.5}
                  rx={4}
                />
                <text
                  x={Math.min(regiao.start * escala + 8, largura - 8)}
                  y={y + alturaTrilhoSkill / 2 + 4}
                  className="bp-diagrama-texto-marca"
                  fill={CORES.textoEscuro}
                  fontWeight="700"
                >
                  {sk.nome}{numeroAlternativa}
                  {gatilho.baseDuration != null && ` (${formatarDuracaoBase(gatilho.baseDuration)})`}
                </text>
              </>
            )}
            {!regiao && (
              <text x={8} y={y + alturaTrilhoSkill / 2 + 4} className="bp-diagrama-texto-marca" fill={CORES.textoEscuro} fontWeight="700" opacity={0.5}>
                {sk.nome} — não ativa nessa pista
              </text>
            )}
          </g>
        );
      })}

      {/* 🎯 Linha de acompanhamento do mouse — desenhada por último de
          propósito, pra ficar sempre por cima de todas as outras faixas.
          Só aparece enquanto o mouse está em cima do diagrama. */}
      {metragemMouse !== null && (
        <g pointerEvents="none">
          <line x1={metragemMouse * escala} y1={0} x2={metragemMouse * escala} y2={alturaTotal} stroke="#8b2635" strokeWidth={1.5} />
          <rect
            x={Math.min(Math.max(metragemMouse * escala - 22, 0), largura - 44)}
            y={2}
            width={44}
            height={16}
            fill="#fdf9f0"
            stroke="#8b2635"
            strokeWidth={1}
            rx={3}
          />
          <text
            x={Math.min(Math.max(metragemMouse * escala, 22), largura - 22)}
            y={14}
            textAnchor="middle"
            className="bp-diagrama-texto-marca"
            fill="#8b2635"
            fontWeight="700"
          >
            {metragemMouse}m
          </text>
        </g>
      )}
    </svg>
  );
}

// ============================================================================
// SELETOR DE SKILLS (busca + chips removíveis, roda o motor ao selecionar)
// ============================================================================

const GRUPOS_FILTRO = {
  raridade: [
    { chave: "branca", label: "White" },
    { chave: "dourada", label: "Gold" },
    { chave: "unica", label: "Unique" },
    { chave: "evoluida", label: "Evolved" },
    { chave: "herdada", label: "Inherited" },
  ],
  estrategia: [
    { chave: "nige", label: "Front Runner" },
    { chave: "senkou", label: "Pace Chaser" },
    { chave: "sasi", label: "Late Surger" },
    { chave: "oikomi", label: "End Closer" },
  ],
  distancia: [
    { chave: "short", label: "Sprint" },
    { chave: "mile", label: "Mile" },
    { chave: "medium", label: "Medium" },
    { chave: "long", label: "Long" },
  ],
  terreno: [
    { chave: "turf", label: "Turf" },
    { chave: "dirt", label: "Dirt" },
  ],
  fase: [
    { chave: "phase0", label: "Early-race" },
    { chave: "phase1", label: "Mid-race" },
    { chave: "phase2", label: "Late-race" },
    { chave: "phase3", label: "Last spurt" },
    { chave: "finalcorner", label: "Final corner" },
    { chave: "finalstraight", label: "Final straight" },
  ],
};

function passaFiltroRaridade(skill, chave) {
  if (chave === "branca") return skill.rarity === 1 && !skill.herdada;
  if (chave === "dourada") return skill.rarity === 2;
  if (chave === "unica") return skill.rarity >= 3 && skill.rarity <= 5;
  if (chave === "evoluida") return skill.rarity === 6;
  if (chave === "herdada") return skill.herdada;
  return true;
}

// 🎯 Filtro por ÍCONE, direto dos dados reais (skill_meta.json). Cada
// skill tem um iconId tipo "10011", onde o último dígito é a variação
// de raridade (1/2/4/6) e o resto é o "grupo" do ícone em si (aqui,
// "1001"). Existem 47 grupos distintos nos dados no total, mas o
// usuário confirmou visualmente (comparando com o site de referência)
// que só esses 17 são os que devem aparecer como filtro — os outros 30
// não são usados nessa tela.
const ICONES_FILTRO = [
  { base: "1001", iconId: "10011" },
  { base: "1002", iconId: "10021" },
  { base: "1003", iconId: "10031" },
  { base: "1004", iconId: "10041" },
  { base: "1005", iconId: "10051" },
  { base: "1006", iconId: "10061" },
  { base: "2001", iconId: "20011" },
  { base: "2002", iconId: "20021" },
  { base: "2004", iconId: "20041" },
  { base: "2005", iconId: "20051" },
  { base: "2006", iconId: "20061" },
  { base: "2009", iconId: "20091" },
  { base: "3001", iconId: "30011" },
  { base: "3002", iconId: "30021" },
  { base: "3004", iconId: "30041" },
  { base: "3005", iconId: "30051" },
  { base: "3007", iconId: "30071" },
];

function passaFiltroIcone(skill, baseGrupo) {
  return !!skill.iconId && skill.iconId.slice(0, -1) === baseGrupo;
}

const LIMITE_CARDS_EXIBIDOS = 60;

// 🎯 Estratégia da corredora usada pro TESTE de ativação (diferente do
// filtro de busca "estrategia" que já existe — esse aqui afeta o
// cálculo, não a lista de skills mostradas).
const ESTRATEGIAS_TESTE = [
  { valor: 1, label: "Front Runner" },
  { valor: 2, label: "Pace Chaser" },
  { valor: 3, label: "Late Surger" },
  { valor: 4, label: "End Closer" },
];

function SeletorDeSkills({ dadosCorrida, skillsDestacadas, setSkillsDestacadas, skillHerdadaParaAdicionar, aoConsumirSkillHerdadaParaAdicionar }) {
  const [busca, setBusca] = useState("");
  const [buscaCavalinha, setBuscaCavalinha] = useState("");
  const [cavalinhaAberta, setCavalinhaAberta] = useState(false);
  const [cavalinhaSelecionada, setCavalinhaSelecionada] = useState(null);
  // 🎯 Controla a janela flutuante de seleção de skills — separada do
  // fluxo principal (split-view), abre por cima com vidro fosco.
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  // 🎯 IDs das skills selecionadas que estão minimizadas (só ícone+nome,
  // sem condições/efeitos) — clicar no card alterna.
  const [skillsMinimizadas, setSkillsMinimizadas] = useState(new Set());

  function alternarMinimizada(id) {
    setSkillsMinimizadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  const [estrategiaCavalo, setEstrategiaCavalo] = useState(2); // Pace Chaser como padrão
  const [filtrosAtivos, setFiltrosAtivos] = useState({
    raridade: new Set(), estrategia: new Set(), distancia: new Set(), terreno: new Set(), fase: new Set(), tipoEfeito: new Set(),
  });

  const resultadosCavalinha = useMemo(() => {
    const termo = buscaCavalinha.trim().toLowerCase();
    if (termo.length === 0) return [];
    return catalogoCavalinhas.filter((c) => c.nomeBase.toLowerCase().includes(termo)).slice(0, 8);
  }, [buscaCavalinha]);

  // 🎯 Trocar a estratégia recalcula TODAS as skills já selecionadas —
  // o resultado (ativa/não ativa, e onde) pode mudar dependendo dela.
  function mudarEstrategiaCavalo(novaEstrategia) {
    setEstrategiaCavalo(novaEstrategia);
    setSkillsDestacadas((atuais) =>
      atuais.map((sk) => {
        const { erro, gatilhos } = calcularRegioesSkill(dadosCorrida, sk.id, novaEstrategia);
        return { ...sk, erro, gatilhos };
      })
    );
  }

  // 🎯 Ao escolher uma carta (outfit) de cavalinha: acha a unique dela
  // (3 estrelas, versão base) no catálogo de skills e já adiciona, igual
  // se tivesse buscado pelo nome à mão. Também ajusta a estratégia pro
  // padrão daquela carta.
  function selecionarCavalinha(cavalinha) {
    // 🎯 Se já tinha uma cavalinha selecionada antes, remove a unique DELA
    // primeiro — senão a unique da anterior ficava esquecida na lista ao
    // trocar de personagem.
    if (cavalinhaSelecionada) {
      const idUnicaAnterior = idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3);
      removerSkill(idUnicaAnterior);
    }
    const idUnica = idDaUniqueSkill(cavalinha.outfitId, 3);
    const skillUnica = catalogoSkillsCompleto.find((s) => s.id === idUnica);
    mudarEstrategiaCavalo(cavalinha.strategy);
    if (skillUnica) adicionarSkill(skillUnica);
    setCavalinhaSelecionada(cavalinha);
    setBuscaCavalinha("");
    setCavalinhaAberta(false);
  }

  // 🎯 Ponte com a coluna da direita (RecomendacoesUniques): quando a
  // pessoa clica num ícone recomendado lá, o BuscadorPistas manda a
  // skill aqui via prop. É um TOGGLE: se já estava na lista, remove; se
  // não estava, adiciona. NUNCA troca quem está selecionada (herdada é
  // "emprestar" a unique de outra pra sua corredora atual, não virar ela).
  useEffect(() => {
    if (skillHerdadaParaAdicionar) {
      const jaEstava = skillsDestacadas.some((sk) => sk.id === skillHerdadaParaAdicionar.id);
      if (jaEstava) {
        removerSkill(skillHerdadaParaAdicionar.id);
      } else {
        adicionarSkill(skillHerdadaParaAdicionar);
      }
      aoConsumirSkillHerdadaParaAdicionar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillHerdadaParaAdicionar]);

  function alternarFiltro(grupo, chave) {
    setFiltrosAtivos((prev) => {
      const novoSet = new Set(prev[grupo]);
      if (novoSet.has(chave)) novoSet.delete(chave); else novoSet.add(chave);
      return { ...prev, [grupo]: novoSet };
    });
  }

  const totalFiltrosAtivos = Object.values(filtrosAtivos).reduce((s, set) => s + set.size, 0);

  function limparFiltros() {
    setFiltrosAtivos({ raridade: new Set(), estrategia: new Set(), distancia: new Set(), terreno: new Set(), fase: new Set(), tipoEfeito: new Set() });
    setBusca("");
  }

  const skillsFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return catalogoSkills.filter((s) => {
      if (termo && !s.nome.toLowerCase().includes(termo)) return false;
      if (filtrosAtivos.raridade.size > 0 && ![...filtrosAtivos.raridade].some((f) => passaFiltroRaridade(s, f))) return false;
      if (filtrosAtivos.tipoEfeito.size > 0 && ![...filtrosAtivos.tipoEfeito].some((f) => passaFiltroIcone(s, f))) return false;
      for (const grupo of ["estrategia", "distancia", "terreno", "fase"]) {
        const ativos = filtrosAtivos[grupo];
        if (ativos.size > 0 && ![...ativos].some((chave) => skillPassaNoFiltro(s, chave))) return false;
      }
      return true;
    });
  }, [busca, filtrosAtivos]);

  function adicionarSkill(skill) {
    setSkillsDestacadas((atuais) => {
      if (atuais.some((sk) => sk.id === skill.id)) return atuais;
      const { erro, gatilhos } = calcularRegioesSkill(dadosCorrida, skill.id, estrategiaCavalo);
      const cor = PALETA_SKILLS[atuais.length % PALETA_SKILLS.length];
      return [...atuais, { id: skill.id, nome: skill.nome, iconId: skill.iconId, rarity: skill.rarity, alternatives: skill.alternatives, erro, gatilhos, cor }];
    });
    // 🎯 Toda skill nova já entra minimizada — só ícone+nome, precisa
    // clicar pra ver condições/efeitos.
    setSkillsMinimizadas((atual) => new Set(atual).add(skill.id));
  }

  function removerSkill(id) {
    setSkillsDestacadas((atuais) => atuais.filter((sk) => sk.id !== id));
  }

  return (
    <div className="bp-skill-seletor bp-skill-seletor-scrollavel">
      <p className="bp-skill-titulo">🎯 Testar skill nessa pista</p>

      <div className="bp-skill-cavalinha-wrap">
        <div className="bp-cavalinha-identidade">
          <div className="bp-cavalinha-avatar">
            {cavalinhaSelecionada && caminhoIconeCavalinha(cavalinhaSelecionada.outfitId) ? (
              <img
                src={caminhoIconeCavalinha(cavalinhaSelecionada.outfitId)}
                alt=""
                onError={(e) => { e.target.style.display = "none"; }}
              />
            ) : (
              <span className="bp-cavalinha-avatar-vazio">🐴</span>
            )}
          </div>
          <div className="bp-skill-busca-wrap bp-cavalinha-campo-nome">
            <input
              type="text"
              className="bp-cavalinha-input-nome"
              placeholder={
                cavalinhaSelecionada
                  ? `${cavalinhaSelecionada.nomeBase} [${cavalinhaSelecionada.epiteto}]`
                  : "Digite o nome da cavalinha..."
              }
              value={buscaCavalinha}
              onFocus={() => setCavalinhaAberta(true)}
              onBlur={() => setTimeout(() => setCavalinhaAberta(false), 150)}
              onChange={(e) => { setBuscaCavalinha(e.target.value); setCavalinhaAberta(true); }}
            />
            {cavalinhaSelecionada && !buscaCavalinha && (
              <button
                type="button"
                className="bp-cavalinha-limpar"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  // 🎯 Remove a unique DELA junto — senão a skill ficava
                  // esquecida na lista mesmo depois de tirar a cavalinha.
                  removerSkill(idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3));
                  setCavalinhaSelecionada(null);
                }}
                title="Remover cavalinha"
              >
                &times;
              </button>
            )}
            {cavalinhaAberta && resultadosCavalinha.length > 0 && (
              <div className="bp-skill-dropdown">
                {resultadosCavalinha.map((c) => (
                  <div
                    key={c.outfitId}
                    className="bp-skill-opcao"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionarCavalinha(c)}
                  >
                    {caminhoIconeCavalinha(c.outfitId) && (
                      <img
                        src={caminhoIconeCavalinha(c.outfitId)}
                        alt=""
                        className="bp-skill-opcao-icone"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    )}
                    <span>{c.nomeBase} <span className="bp-skill-opcao-epiteto">{c.epiteto}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bp-skill-estrategia-wrap">
        <span className="bp-skill-estrategia-label">Estratégia da corredora testada:</span>
        <div className="bp-skill-estrategia-botoes">
          {ESTRATEGIAS_TESTE.map((e) => (
            <button
              key={e.valor}
              type="button"
              className={`bp-skill-filtro-btn ${estrategiaCavalo === e.valor ? "ativo" : ""}`}
              onClick={() => mudarEstrategiaCavalo(e.valor)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* 🎯 Algumas roupas novas já vêm nos dados de personagem, mas a
          unique delas ainda não tem dados de ativação no uma-skill-tools. */}
      {cavalinhaSelecionada && !catalogoSkillsCompleto.some((s) => s.id === idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3)) && (
        <div className="bp-ambiente-aviso">
          ⚠️ Unique ainda sem dados de ativação — será adicionada quando a fonte for atualizada.
        </div>
      )}

      {skillsDestacadas.length > 0 && (() => {
        // 🎯 A unique da cavalinha atualmente selecionada sempre vem
        // primeiro na lista, igual no site de referência — o resto
        // mantém a ordem em que foi adicionado.
        const idUniqueAtual = cavalinhaSelecionada ? idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3) : null;
        const skillsOrdenadas = idUniqueAtual
          ? [...skillsDestacadas].sort((a, b) => (a.id === idUniqueAtual ? -1 : b.id === idUniqueAtual ? 1 : 0))
          : skillsDestacadas;
        return (
        <div className="bp-skill-selecionadas-area-scroll">
        <div className="bp-skill-selecionadas">
          {skillsOrdenadas.map((sk) => {
            // Quando ativa, mostra a condição que "ganhou" (gatilhos); quando não
            // ativa nessa pista, mostra as condições originais da skill como
            // referência (pra dar pra entender o motivo).
            // 🎯 Sempre mostra TODAS as condições possíveis da skill no
            // card (não só a que "ganhou" no diagrama) — assim dá pra ver
            // a outra forma de ativar mesmo que ela não seja a exibida na
            // barra do gráfico.
            const condicoesParaMostrar = sk.alternatives;
            const minimizada = skillsMinimizadas.has(sk.id);
            return (
              <div key={sk.id} className={`bp-skill-selecionada-card bp-skill-card-${classeRaridade(sk.rarity)} ${minimizada ? "bp-skill-selecionada-minimizada" : ""}`}>
                <div className="bp-skill-selecionada-topo" onClick={() => alternarMinimizada(sk.id)} role="button" tabIndex={0}>
                  <span className="bp-skill-chip-cor" style={{ background: sk.cor.stroke }}></span>
                  {sk.iconId && (
                    <img
                      src={caminhoIconeSkill(sk.iconId)}
                      alt=""
                      className="bp-skill-chip-icone"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  <span className="bp-skill-chip-nome">{sk.nome}</span>
                  {sk.erro && <span className="bp-skill-chip-aviso">⚠️ erro ao calcular</span>}
                  <button type="button" className="bp-skill-chip-remover" onClick={(e) => { e.stopPropagation(); removerSkill(sk.id); }}>&times;</button>
                </div>
                {!minimizada && !sk.erro && condicoesParaMostrar.length > 0 && (
                  <div className="bp-skill-condicoes">
                    <div className="bp-skill-condicao-id">ID: {sk.id}</div>
                    {condicoesParaMostrar.map((c, i) => (
                      <div key={i} className="bp-skill-condicao-bloco">
                        <div className="bp-skill-secao">
                          <p className="bp-skill-secao-titulo">Conditions:</p>
                          {c.precondition && (
                            <div className="bp-skill-secao-grupo">
                              <span className="bp-skill-secao-subtitulo">Preconditions:</span>
                              {partesDaCondicao(c.precondition).map((parte, pi) => (
                                <code key={pi} className="bp-skill-secao-linha">{parte}</code>
                              ))}
                            </div>
                          )}
                          <div className="bp-skill-secao-grupo">
                            {partesDaCondicao(c.condition).map((parte, pi) => (
                              <code key={pi} className="bp-skill-secao-linha">{parte}</code>
                            ))}
                          </div>
                        </div>

                        {c.effects && c.effects.length > 0 && (
                          <div className="bp-skill-secao">
                            <p className="bp-skill-secao-titulo">Effects:</p>
                            {c.effects.map((ef, ei) => {
                              const { nome, valor } = formatarEfeito(ef);
                              return (
                                <div key={ei} className="bp-skill-efeito-linha">
                                  <span className="bp-skill-efeito-nome">{nome}</span>
                                  <span className="bp-skill-efeito-valor">{valor}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {c.baseDuration != null && (
                          <div className="bp-skill-secao">
                            <p className="bp-skill-secao-titulo">Base duration: <span className="bp-skill-secao-valor-inline">{formatarDuracaoBase(c.baseDuration)}</span></p>
                            {c.baseDuration > 0 && (
                              <p className="bp-skill-secao-titulo">
                                Effective duration ({dadosCorrida.distance}m): <span className="bp-skill-secao-valor-inline">{formatarDuracaoEfetiva(c.baseDuration, dadosCorrida.distance)}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        );
      })()}

      <button type="button" className="bp-skill-adicionar-btn" onClick={() => setCatalogoAberto(true)}>
        + Adicionar outra skill
      </button>

      {catalogoAberto && (
        <div className="bp-catalogo-overlay" onClick={() => setCatalogoAberto(false)}>
          <div className="bp-catalogo-janela" onClick={(e) => e.stopPropagation()}>
            <div className="bp-catalogo-topo">
              <span className="bp-catalogo-titulo">Escolher skill</span>
              <button type="button" className="bp-catalogo-fechar" onClick={() => setCatalogoAberto(false)}>&times;</button>
            </div>

            <input
              type="text"
              className="bp-skill-busca-input"
              placeholder="Buscar skill pelo nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />

            <div className="bp-skill-filtros">
              {Object.entries(GRUPOS_FILTRO).map(([grupo, opcoes]) => (
                <div key={grupo} className="bp-skill-filtro-grupo">
                  {opcoes.map((op) => (
                    <button
                      key={op.chave}
                      type="button"
                      className={`bp-skill-filtro-btn ${filtrosAtivos[grupo].has(op.chave) ? "ativo" : ""}`}
                      onClick={() => alternarFiltro(grupo, op.chave)}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="bp-skill-filtro-grupo bp-skill-filtro-tipoefeito">
                {ICONES_FILTRO.map((op) => (
                  <button
                    key={op.base}
                    type="button"
                    className={`bp-tipoefeito-btn ${filtrosAtivos.tipoEfeito.has(op.base) ? "ativo" : ""}`}
                    onClick={() => alternarFiltro("tipoEfeito", op.base)}
                  >
                    <img
                      src={caminhoIconeSkill(op.iconId)}
                      alt=""
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  </button>
                ))}
              </div>
              {totalFiltrosAtivos > 0 && (
                <button type="button" className="bp-skill-filtro-limpar" onClick={limparFiltros}>Limpar filtros</button>
              )}
            </div>

            <p className="bp-skill-contagem">
              {skillsFiltradas.length} skill{skillsFiltradas.length !== 1 ? "s" : ""} encontrada{skillsFiltradas.length !== 1 ? "s" : ""}
              {skillsFiltradas.length > LIMITE_CARDS_EXIBIDOS && ` (mostrando as primeiras ${LIMITE_CARDS_EXIBIDOS} — refine a busca)`}
            </p>

            <div className="bp-skill-grid bp-skill-grid-flutuante">
              {skillsFiltradas.slice(0, LIMITE_CARDS_EXIBIDOS).map((s) => {
                const jaAdicionada = skillsDestacadas.some((sk) => sk.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`bp-skill-card bp-skill-card-${classeRaridade(s.rarity)} ${jaAdicionada ? "bp-skill-card-selecionada" : ""}`}
                    onClick={() => adicionarSkill(s)}
                    disabled={jaAdicionada}
                    title={s.nome}
                  >
                    {s.iconId && (
                      <img
                        src={caminhoIconeSkill(s.iconId)}
                        alt=""
                        className="bp-skill-card-icone"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    )}
                    <span className="bp-skill-card-texto">{s.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 🎯 Seletor de condições ambientais (clima, condição do terreno, estação).
// IMPORTANTE: por enquanto é só visual/informativo — o motor de cálculo
// não usa esses valores ainda (ConditionsAjustadas trata weather/season
// como "sempre passa", de propósito, porque não temos como simular o
// efeito real deles sem simulação completa). Fica pronto pra quando
// quisermos ligar de verdade.
const OPCOES_CLIMA = [
  { valor: "sol", label: "Sol", icone: "/assets/img/utx_ico_weather_00.png" },
  { valor: "nublado", label: "Nublado", icone: "/assets/img/utx_ico_weather_01.png" },
  { valor: "chuva", label: "Chuva", icone: "/assets/img/utx_ico_weather_02.png" },
  { valor: "neve", label: "Neve", icone: "/assets/img/utx_ico_weather_03.png" },
];
const OPCOES_TERRENO_CONDICAO = [
  { valor: "firme", label: "Firm" },
  { valor: "bom", label: "Good" },
  { valor: "leve", label: "Yielding" },
  { valor: "pesado", label: "Heavy" },
];
const OPCOES_ESTACAO = [
  { valor: "primavera", label: "Spring", icone: "/assets/img/global/utx_txt_season_00.png" },
  { valor: "verao", label: "Summer", icone: "/assets/img/global/utx_txt_season_01.png" },
  { valor: "outono", label: "Fall", icone: "/assets/img/global/utx_txt_season_02.png" },
  { valor: "inverno", label: "Winter", icone: "/assets/img/global/utx_txt_season_03.png" },
];

// 🎯 Recomendações de unique por pista, curadas à mão pelo usuário no
// recomendacoes-pistas.json (chave "Hipódromo-Distância-Terreno"). Cada
// ícone, ao clicar, dispara aoClicarCavalinha (que o BuscadorPistas
// repassa pra dentro do SeletorDeSkills — as duas colunas do modal são
// componentes separados, essa é a "ponte" entre elas).
// 🎯 Formato unificado no JSON: { "nome": "Nome da Skill", "herdada": true|false }.
// Sempre é o NOME DA PRÓPRIA SKILL (não da cavalinha) — isso já
// identifica ela sem ambiguidade nenhuma, mesmo entre skins diferentes
// da mesma cavalinha (cada skin tem uma unique com nome próprio). Se a
// skill for de alguma cavalinha (unique ou a versão herdada dela), acha
// a dona automaticamente (via donoDaUniqueBase) só pra mostrar o ícone
// dela — skills genéricas (White/Gold) não têm dona, mostra o ícone da
// própria skill nesse caso.
function resolverRecomendacao({ nome, herdada }) {
  if (!nome) return null;
  const termo = nome.trim().toLowerCase();
  const skill = catalogoSkillsCompleto.find(
    (s) => s.nome.toLowerCase().includes(termo) && s.herdada === !!herdada
  );
  if (!skill) return null;

  // Acha a dona: se herdada, converte de volta pro ID base (troca "9"
  // por "1") antes de procurar no mapa reverso.
  const idBase = herdada ? "1" + skill.id.slice(1) : skill.id;
  const dona = donoDaUniqueBase.get(idBase);

  if (dona) {
    return {
      chave: skill.id,
      icone: caminhoIconeCavalinha(dona.outfitId),
      label: dona.nomeBase,
      titulo: `${skill.nome} (${herdada ? "herdada de " : ""}${dona.nomeBase} [${dona.epiteto}])`,
      tipo: "cavalinha",
      skill,
    };
  }
  // Sem dona = skill genérica (White/Gold) — mostra o ícone dela mesma.
  return {
    chave: skill.id,
    icone: caminhoIconeSkill(skill.iconId),
    label: skill.nome,
    titulo: skill.nome,
    tipo: "skill",
    skill,
  };
}

function RecomendacoesUniques({ pistaDiagramaAberta, skillsDestacadas, aoClicarSkillHerdada }) {
  if (!pistaDiagramaAberta) return null;

  const chave = `${pistaDiagramaAberta.hipodromo}-${pistaDiagramaAberta.distanciaNumero}-${pistaDiagramaAberta.terrenoCurto}`;
  const itensRecomendados = recomendacoesPistasRaw[chave];
  if (!itensRecomendados || itensRecomendados.length === 0) return null;

  const recomendacoes = itensRecomendados.map(resolverRecomendacao).filter(Boolean);
  if (recomendacoes.length === 0) return null;

  return (
    <div className="bp-recomendadas-wrap">
      <span className="bp-ambiente-label">Skills recomendadas nessa pista:</span>
      <div className="bp-recomendadas-icones">
        {recomendacoes.map(({ chave, icone, label, titulo, tipo, skill }) => {
          const ativa = skillsDestacadas.some((sk) => sk.id === skill.id);
          return (
            <button
              key={chave}
              type="button"
              className={`bp-recomendada-btn bp-recomendada-btn-${tipo} ${ativa ? "ativo" : ""}`}
              title={titulo}
              onClick={() => aoClicarSkillHerdada(skill)}
            >
              {icone && (
                <img src={icone} alt={label} onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeletorAmbiente() {
  const [clima, setClima] = useState("sol");
  const [terreno, setTerreno] = useState("firme");
  const [estacao, setEstacao] = useState("primavera");

  return (
    <div className="bp-ambiente-wrap">
      <div className="bp-ambiente-aviso">
        ⚠️ Visual por enquanto — ainda não afeta o cálculo de ativação.
      </div>

      <div className="bp-ambiente-linha">
        <span className="bp-ambiente-label">Clima:</span>
        <div className="bp-ambiente-botoes">
          {OPCOES_CLIMA.map((op) => (
            <button
              key={op.valor}
              type="button"
              title={op.label}
              className={`bp-ambiente-icone-btn ${clima === op.valor ? "ativo" : ""}`}
              onClick={() => setClima(op.valor)}
            >
              <img src={op.icone} alt={op.label} onError={(e) => { e.target.style.display = "none"; }} />
            </button>
          ))}
        </div>
      </div>

      <div className="bp-ambiente-linha">
        <span className="bp-ambiente-label">Terreno:</span>
        <div className="bp-ambiente-botoes">
          {OPCOES_TERRENO_CONDICAO.map((op) => (
            <button
              key={op.valor}
              type="button"
              className={`bp-skill-filtro-btn ${terreno === op.valor ? "ativo" : ""}`}
              onClick={() => setTerreno(op.valor)}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bp-ambiente-linha">
        <span className="bp-ambiente-label">Estação:</span>
        <div className="bp-ambiente-botoes">
          {OPCOES_ESTACAO.map((op) => (
            <button
              key={op.valor}
              type="button"
              title={op.label}
              className={`bp-ambiente-icone-btn bp-ambiente-icone-estacao ${estacao === op.valor ? "ativo" : ""}`}
              onClick={() => setEstacao(op.valor)}
            >
              <img src={op.icone} alt={op.label} onError={(e) => { e.target.style.display = "none"; }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

function BuscadorPistas() {
  const [busca, setBusca] = useState("");
  const [filtroGrade, setFiltroGrade] = useState("Todas");
  const [filtroHipodromo, setFiltroHipodromo] = useState("Todos");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [filtroTerreno, setFiltroTerreno] = useState("Todos");
  const [filtroDirecao, setFiltroDirecao] = useState("Todas");
  const [pistaDiagramaAberta, setPistaDiagramaAberta] = useState(null);
  const [skillHerdadaParaAdicionar, setSkillHerdadaParaAdicionar] = useState(null);
  const [skillsDestacadas, setSkillsDestacadas] = useState([]);

  const pistasFiltradas = useMemo(() => {
    const termoBusca = busca.trim().toLowerCase();
    return todasAsPistas.filter((p) => {
      if (termoBusca && !p.nome.toLowerCase().includes(termoBusca)) return false;
      if (filtroGrade !== "Todas" && p.grade !== filtroGrade) return false;
      if (filtroHipodromo !== "Todos" && p.hipodromo !== filtroHipodromo) return false;
      if (filtroCategoria !== "Todas" && p.distanciaCategoria !== filtroCategoria) return false;
      if (filtroTerreno !== "Todos" && p.terrenoCurto !== filtroTerreno) return false;
      if (filtroDirecao !== "Todas" && p.direcao !== filtroDirecao) return false;
      return true;
    });
  }, [busca, filtroGrade, filtroHipodromo, filtroCategoria, filtroTerreno, filtroDirecao]);

  function limparFiltros() {
    setBusca("");
    setFiltroGrade("Todas");
    setFiltroHipodromo("Todos");
    setFiltroCategoria("Todas");
    setFiltroTerreno("Todos");
    setFiltroDirecao("Todas");
  }

  const filtrosAtivos =
    filtroGrade !== "Todas" || filtroHipodromo !== "Todos" || filtroCategoria !== "Todas" ||
    filtroTerreno !== "Todos" || filtroDirecao !== "Todas" || busca.trim() !== "";

  return (
    <div className="hero-container bp-page">
      <div className="bp-header">
        <h1 className="bp-title">🔍 Buscador de Pistas</h1>
        <p className="bp-subtitle">
          Filtre as corridas do calendário oficial da PTR por grade, hipódromo, distância, terreno e direção.
        </p>
      </div>

      <div className="bp-filtros">
        <input
          type="text"
          className="bp-busca-input"
          placeholder="Buscar pelo nome da corrida..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div className="bp-filtros-grid">
          <div className="bp-filtro-campo">
            <label>Grade</label>
            <select value={filtroGrade} onChange={(e) => setFiltroGrade(e.target.value)}>
              <option value="Todas">— Todas —</option>
              {OPCOES_GRADE.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div className="bp-filtro-campo">
            <label>Categoria</label>
            <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="Todas">— Todas —</option>
              {OPCOES_CATEGORIA.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="bp-filtro-campo">
            <label>Terreno</label>
            <select value={filtroTerreno} onChange={(e) => setFiltroTerreno(e.target.value)}>
              <option value="Todos">— Todos —</option>
              {OPCOES_TERRENO.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="bp-filtro-campo">
            <label>Direção</label>
            <select value={filtroDirecao} onChange={(e) => setFiltroDirecao(e.target.value)}>
              <option value="Todas">— Todas —</option>
              {OPCOES_DIRECAO.map((d) => <option key={d} value={d}>{traduzirDirecao(d)}</option>)}
            </select>
          </div>

          <div className="bp-filtro-campo">
            <label>Hipódromo</label>
            <select value={filtroHipodromo} onChange={(e) => setFiltroHipodromo(e.target.value)}>
              <option value="Todos">— Todos —</option>
              {OPCOES_HIPODROMO.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        <div className="bp-filtros-rodape">
          <span className="bp-contagem">{pistasFiltradas.length} de {todasAsPistas.length} pistas</span>
          {filtrosAtivos && (
            <button type="button" className="bp-btn-limpar" onClick={limparFiltros}>Limpar filtros</button>
          )}
        </div>
      </div>

      {pistasFiltradas.length === 0 ? (
        <div className="bp-vazio">
          <p>Nenhuma pista encontrada com esses filtros.</p>
        </div>
      ) : (
        <div className="bp-grid">
          {pistasFiltradas.map((p) => {
            const infoGrade = GRADE_INFO[p.grade] || GRADE_INFO.G3;
            const corCategoria = CATEGORIA_DISTANCIA_INFO[p.distanciaCategoria]?.cor || "#a4b3c6";
            return (
              <div key={p.nome} className="bp-card">
                <div className="bp-card-img-wrap">
                  <img
                    src={`/assets/img/hipodromos/${slugHipodromo(p.hipodromo)}.png`}
                    alt={p.hipodromo}
                    className="bp-card-img"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  <span className="bp-card-grade-badge" style={{ color: infoGrade.cor, background: infoGrade.bg }}>
                    {p.grade}
                  </span>
                </div>
                <div className="bp-card-body">
                  <h3 className="bp-card-nome">{p.nome}</h3>
                  <div className="bp-card-chips">
                    <span className="bp-chip">📍 {p.hipodromo}</span>
                    <span className="bp-chip" style={{ color: corCategoria }}>
                      📏 {p.distanciaNumero}m ({p.distanciaCategoria})
                    </span>
                    <span className="bp-chip">🌿 {p.terrenoCurto}</span>
                    <span className="bp-chip">🧭 {traduzirDirecao(p.direcao)}</span>
                  </div>
                  <button type="button" className="bp-btn-diagrama" onClick={() => { setSkillsDestacadas([]); setPistaDiagramaAberta(p); }}>
                    📊 Ver Diagrama da Pista
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 🎯 Modal do diagrama — desenha o traçado real (curvas/retas/fases)
          a partir dos dados extraídos. Se a combinação hipódromo+distância+
          terreno+direção não existir no dataset (ex: Urawa, que não é
          coberto), mostra um aviso em vez de tentar desenhar algo errado. */}
      {pistaDiagramaAberta && (() => {
        const dadosCorrida = encontrarCourseData(pistaDiagramaAberta);
        return (
          <div className="bp-modal-overlay">
            <div className="bp-modal-box bp-modal-box-split" onClick={(e) => e.stopPropagation()}>
              <div className="bp-modal-header">
                <h3>{pistaDiagramaAberta.nome}</h3>
                <button type="button" className="bp-modal-fechar" onClick={() => setPistaDiagramaAberta(null)}>&times;</button>
              </div>
              <p className="bp-modal-subtitulo">
                {pistaDiagramaAberta.hipodromo} · {pistaDiagramaAberta.distanciaNumero}m ({pistaDiagramaAberta.distanciaCategoria}) · {pistaDiagramaAberta.terrenoCurto} · {traduzirDirecao(pistaDiagramaAberta.direcao)}
              </p>

              {dadosCorrida ? (
                <div className="bp-modal-split">
                  <div className="bp-modal-coluna-esquerda">
                    <SeletorDeSkills
                      dadosCorrida={dadosCorrida}
                      skillsDestacadas={skillsDestacadas}
                      setSkillsDestacadas={setSkillsDestacadas}
                      skillHerdadaParaAdicionar={skillHerdadaParaAdicionar}
                      aoConsumirSkillHerdadaParaAdicionar={() => setSkillHerdadaParaAdicionar(null)}
                    />
                  </div>
                  <div className="bp-modal-coluna-direita">
                    <DiagramaPistaSVG dadosCorrida={dadosCorrida} skillsDestacadas={skillsDestacadas} />
                    <SeletorAmbiente />
                    <RecomendacoesUniques pistaDiagramaAberta={pistaDiagramaAberta} skillsDestacadas={skillsDestacadas} aoClicarSkillHerdada={setSkillHerdadaParaAdicionar} />
                  </div>
                </div>
              ) : (
                <div className="bp-modal-sem-diagrama">
                  <p>📊 Ainda não temos o traçado dessa pista no nosso dataset.</p>
                  <p className="bp-modal-sem-diagrama-hint">
                    O hipódromo "{pistaDiagramaAberta.hipodromo}" não está coberto pelos dados que temos disponíveis.
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default BuscadorPistas;