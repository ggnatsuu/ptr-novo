import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { bancoCorridas, bancoG1 } from "../data/bancos-corridas";
import { tracknames, courseData } from "../data/pistasCourseData";
import umasRaw from "../uma-skill-tools/data/umas.json";
import iconsRaw from "../uma-skill-tools/data/icons.json";
import recomendacoesPistasRaw from "../uma-skill-tools/data/recomendacoes-pistas.json";
import DiagramaPistaGuia from "../components/DiagramaPistaGuia";
import MinimapaPista from "../components/MinimapaPista";
import { portraitDaRoupa } from "../utils/iconeRoupa";
import { roupaUpcoming } from "../utils/roupasExtras";
import { formatarDuracaoBase } from "../utils/diagramaPista";
import { catalogoSkillsCompleto, catalogoSkills, MOSTRAR_UPCOMING, PALETA_SKILLS, caminhoIconeSkill, calcularRegioesSkill, partesDaCondicao, formatarEfeito, formatarDuracaoEfetiva } from "../utils/skillsPista";

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

// ID do percurso (chave do course_data) — pra quem só precisa do minimapa.
// eslint-disable-next-line react-refresh/only-export-components -- usado pela Agenda
export function courseIdDaPista(pista) {
  const curso = encontrarCourseData(pista);
  return curso ? Object.keys(courseData).find((id) => courseData[id] === curso) ?? null : null;
}

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

// Fita oficial da grade (a mesma dos cartões da Agenda).
const FITA_GRADE = { G1: "utx_txt_grade_ribbon_05.png", G2: "utx_txt_grade_ribbon_04.png", G3: "utx_txt_grade_ribbon_03.png" };

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
    epiteto: outfit.epithet?.replace(/^\[(.*)\]$/, "$1"), // o dado já vem entre colchetes
    strategy: outfit.strategy,
    rarity: outfit.rarity,
    upcoming: roupaUpcoming(outfitId), // ainda não lançada no Global
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


// Portrait quadrado da roupa (quando temos); senão o ícone redondo do jogo.
function fotoCavalinha(outfitId) {
  return portraitDaRoupa(outfitId) ?? caminhoIconeCavalinha(outfitId);
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
    { chave: "nige", label: "Front" },
    { chave: "senkou", label: "Pace" },
    { chave: "sasi", label: "Late" },
    { chave: "oikomi", label: "End" },
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
    { chave: "phase0", label: "Early" },
    { chave: "phase1", label: "Mid" },
    { chave: "phase2", label: "Late" },
    { chave: "phase3", label: "Spurt" },
    { chave: "finalcorner", label: "Final corner" },
    { chave: "finalstraight", label: "Final straight" },
  ],
};

const ROTULOS_GRUPO = {
  raridade: { nome: "Rarity", cor: "#a4b3c6" },
  estrategia: { nome: "Strategy", cor: "#7fd08a" },
  distancia: { nome: "Distance", cor: "#5fa8e8" },
  terreno: { nome: "Surface", cor: "#c5e05a" },
  fase: { nome: "Location", cor: "#f0a040" },
};

// Ordenação do catálogo: Raridade (evoluída > única > dourada > herdada > branca), A–Z ou ordem do jogo (id).
const PESO_RARIDADE = (s) => (s.rarity === 6 ? 0 : s.rarity >= 3 ? 1 : s.rarity === 2 ? 2 : s.herdada ? 3 : 4);
const ORDENACOES = {
  raridade: { nome: "Rarity", comparar: (a, b) => PESO_RARIDADE(a) - PESO_RARIDADE(b) || a.nome.localeCompare(b.nome) },
  az: { nome: "A–Z", comparar: (a, b) => a.nome.localeCompare(b.nome) },
  jogo: { nome: "Game", comparar: (a, b) => Number(a.id) - Number(b.id) },
};
const classeCartaoCatalogo = (s) => (s.herdada ? "herdada" : classeRaridade(s.rarity));

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


// 🎯 Estratégia da corredora usada pro TESTE de ativação (diferente do
// filtro de busca "estrategia" que já existe — esse aqui afeta o
// cálculo, não a lista de skills mostradas).
const ESTRATEGIAS_TESTE = [
  { valor: 1, label: "Front", icone: "front" },
  { valor: 2, label: "Pace", icone: "pace" },
  { valor: 3, label: "Late", icone: "late" },
  { valor: 4, label: "End", icone: "end" },
];

// 🎯 Janela do catálogo de skills (busca, ordenação e filtros). Usada pelo
// teste de skills do Buscador e pelo Comparador.
export function CatalogoSkills({ idsAdicionados = [], aoAdicionar, aoFechar }) {
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState("raridade");
  const [filtrosAtivos, setFiltrosAtivos] = useState({
    raridade: new Set(), estrategia: new Set(), distancia: new Set(), terreno: new Set(), fase: new Set(), tipoEfeito: new Set(),
  });

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
    }).sort(ORDENACOES[ordenacao].comparar);
  }, [busca, filtrosAtivos, ordenacao]);

  // Portal: abre direto no <body>, por cima de tudo (inclusive do menu do
  // topo), mesmo quando quem chama está dentro de um painel fixo/sticky.
  return createPortal(
      <div className="bp-catalogo-overlay" onClick={() => aoFechar()}>
        <div className="bpx-catalogo" onClick={(e) => e.stopPropagation()}>
          {/* Busca + ordenação + fechar */}
          <div className="bpx-catalogo-topo">
            <label className="bpx-catalogo-busca">
              <i className="fa-solid fa-magnifying-glass"></i>
              <input type="text" placeholder="Buscar skill pelo nome..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
              {busca && <button type="button" onClick={() => setBusca("")} title="Limpar busca"><i className="fa-solid fa-xmark"></i></button>}
            </label>
            <div className="bpx-catalogo-ordem">
              <i className="fa-solid fa-arrow-down-wide-short"></i>
              {Object.entries(ORDENACOES).map(([chave, o]) => (
                <button key={chave} type="button" className={ordenacao === chave ? "ativo" : ""} onClick={() => setOrdenacao(chave)}>{o.nome}</button>
              ))}
            </div>
            <button type="button" className="bpx-catalogo-fechar" onClick={() => aoFechar()} title="Fechar"><i className="fa-solid fa-xmark"></i></button>
          </div>

          {/* Filtros agrupados */}
          <div className="bpx-catalogo-filtros">
            {Object.entries(GRUPOS_FILTRO).map(([grupo, opcoes]) => (
              <div key={grupo} className="bpx-filtro-grupo">
                <span className="bpx-filtro-rotulo" style={{ color: ROTULOS_GRUPO[grupo].cor }}>{ROTULOS_GRUPO[grupo].nome}</span>
                <div className="bpx-filtro-opcoes">
                  {opcoes.map((op) => (
                    <button key={op.chave} type="button" className={`bpx-filtro-btn ${filtrosAtivos[grupo].has(op.chave) ? "ativo" : ""}`} onClick={() => alternarFiltro(grupo, op.chave)}>{op.label}</button>
                  ))}
                </div>
              </div>
            ))}
            <div className="bpx-filtro-grupo bpx-filtro-grupo-largo">
              <span className="bpx-filtro-rotulo">Effect type</span>
              <div className="bpx-filtro-opcoes">
                {ICONES_FILTRO.map((op) => (
                  <button key={op.base} type="button" className={`bpx-filtro-icone ${filtrosAtivos.tipoEfeito.has(op.base) ? "ativo" : ""}`} onClick={() => alternarFiltro("tipoEfeito", op.base)}>
                    <img src={caminhoIconeSkill(op.iconId)} alt="" onError={(e) => { e.target.style.display = "none"; }} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bpx-catalogo-contagem">
            <span>{skillsFiltradas.length} skill{skillsFiltradas.length !== 1 ? "s" : ""}</span>
            {totalFiltrosAtivos > 0 && <button type="button" onClick={limparFiltros}><i className="fa-solid fa-filter-circle-xmark"></i> Limpar filtros ({totalFiltrosAtivos})</button>}
          </div>

          {/* Todas as skills numa rolagem só */}
          <div className="bpx-catalogo-grade">
            {skillsFiltradas.length === 0 && <p className="bpx-catalogo-vazio">Nenhuma skill com esses filtros.</p>}
            {skillsFiltradas.map((s) => {
              const jaAdicionada = idsAdicionados.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`bpx-skill-item bpx-raridade-${classeCartaoCatalogo(s)} ${jaAdicionada ? "adicionada" : ""}`}
                  onClick={() => aoAdicionar(s)}
                  disabled={jaAdicionada}
                  title={jaAdicionada ? `${s.nome} (já adicionada)` : s.nome}
                >
                  {s.iconId && <img src={caminhoIconeSkill(s.iconId)} alt="" loading="lazy" onError={(e) => { e.target.style.display = "none"; }} />}
                  <span>{s.nome}</span>
                  {jaAdicionada && <i className="fa-solid fa-check"></i>}
                </button>
              );
            })}
          </div>
        </div>
      </div>,
    document.body
  );
}

function SeletorDeSkills({ dadosCorrida, skillsDestacadas, setSkillsDestacadas, skillHerdadaParaAdicionar, aoConsumirSkillHerdadaParaAdicionar }) {
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

  const resultadosCavalinha = useMemo(() => {
    const termo = buscaCavalinha.trim().toLowerCase();
    // Só corredoras já lançadas no Global (as futuras ficam pras anotações do Guia).
    // Campo vazio = lista todas (o dropdown rola).
    return catalogoCavalinhas.filter((c) => (MOSTRAR_UPCOMING || !c.upcoming) && `${c.nomeBase} ${c.epiteto ?? ""}`.toLowerCase().includes(termo));
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
    // Tirar a unique da corredora selecionada tira a corredora junto.
    if (cavalinhaSelecionada && id === idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3)) setCavalinhaSelecionada(null);
  }

  return (
    <div className="bp-skill-seletor bp-skill-seletor-scrollavel">
      <div className="bpx-secao-titulo"><i className="fa-solid fa-horse-head"></i> Corredora</div>
      <div className="bp-skill-cavalinha-wrap">
        <div className="bp-cavalinha-identidade">
          <div className="bp-cavalinha-avatar">
            {cavalinhaSelecionada && fotoCavalinha(cavalinhaSelecionada.outfitId) ? (
              <img
                src={fotoCavalinha(cavalinhaSelecionada.outfitId)}
                className={portraitDaRoupa(cavalinhaSelecionada.outfitId) ? "bpx-portrait" : undefined}
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
                    {(caminhoIconeCavalinha(c.outfitId) || portraitDaRoupa(c.outfitId)) && (
                      <img
                        src={caminhoIconeCavalinha(c.outfitId) || portraitDaRoupa(c.outfitId)}
                        alt=""
                        className="bp-skill-opcao-icone"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    )}
                    <span>{c.nomeBase} <span className="bp-skill-opcao-epiteto">{c.epiteto}</span></span>
                    {c.upcoming && <span className="bpx-selo-upcoming">Upcoming</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bpx-secao-titulo"><i className="fa-solid fa-flag-checkered"></i> Estratégia</div>
      <div className="bpx-segmentado">
        {ESTRATEGIAS_TESTE.map((e) => (
          <button
            key={e.valor}
            type="button"
            className={estrategiaCavalo === e.valor ? "ativo" : ""}
            onClick={() => mudarEstrategiaCavalo(e.valor)}
          >
            <img src={`/assets/img/textures/${e.icone}.webp`} alt="" />
            {e.label}
          </button>
        ))}
      </div>

      <div className="bpx-secao-titulo bpx-secao-com-acao">
        <span><i className="fa-solid fa-bolt"></i> Skills testadas <span className="bpx-contador">{skillsDestacadas.length}</span></span>
        <button type="button" className="bpx-botao-adicionar" onClick={() => setCatalogoAberto(true)}>
          <i className="fa-solid fa-plus"></i> Adicionar skill
        </button>
      </div>
      {skillsDestacadas.length === 0 && (
        <button type="button" className="bpx-vazio" onClick={() => setCatalogoAberto(true)}>
          <i className="fa-solid fa-wand-magic-sparkles"></i>
          Escolha uma corredora ou adicione skills para ver onde elas ativam nesta pista.
        </button>
      )}

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
              <div key={sk.id} className={`bp-skill-selecionada-card bp-skill-card-${classeRaridade(sk.rarity)} ${minimizada ? "bp-skill-selecionada-minimizada" : ""}`} style={{ borderLeftColor: sk.cor.stroke }}>
                <div className="bp-skill-selecionada-topo" onClick={() => alternarMinimizada(sk.id)} role="button" tabIndex={0}>
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
                  {!sk.erro && (
                    <span className={`bpx-ativacao ${sk.gatilhos.length ? "" : "bpx-ativacao-nao"}`} style={sk.gatilhos.length ? { color: sk.cor.stroke } : undefined}>
                      {sk.gatilhos.length ? `${Math.round(sk.gatilhos[0].regions[0].start)}m` : "não ativa"}
                    </span>
                  )}
                  <i className={`fa-solid fa-chevron-${minimizada ? "down" : "up"} bpx-seta`}></i>
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

      {catalogoAberto && (
        <CatalogoSkills idsAdicionados={skillsDestacadas.map((sk) => sk.id)} aoAdicionar={adicionarSkill} aoFechar={() => setCatalogoAberto(false)} />
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
      icone: fotoCavalinha(dona.outfitId),
      portrait: !!portraitDaRoupa(dona.outfitId),
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

// Carrossel infinito com setas: cada clique anda 1 item e a lista dá a
// volta (o último encosta no primeiro). Setas só aparecem se não couber tudo.
function CarrosselInfinito({ itens, renderizar }) {
  const caixaRef = useRef(null);
  const faixaRef = useRef(null);
  const direcaoRef = useRef(null); // "proximo" | "anterior" durante a animação
  const [cabe, setCabe] = useState(true);
  const [inicio, setInicio] = useState(0);
  const [deslocamento, setDeslocamento] = useState({ x: 0, animar: false });
  const total = itens.length;

  useEffect(() => {
    const caixa = caixaRef.current;
    const faixa = faixaRef.current;
    if (!caixa || !faixa) return undefined;
    const observador = new ResizeObserver(() => setCabe(faixa.scrollWidth <= caixa.clientWidth + 1));
    observador.observe(caixa);
    return () => observador.disconnect();
  }, [total]);

  const passo = () => (faixaRef.current?.firstElementChild?.offsetWidth ?? 0) + 12;
  const proximo = () => {
    if (direcaoRef.current) return;
    direcaoRef.current = "proximo";
    setDeslocamento({ x: -passo(), animar: true });
  };
  const anterior = () => {
    if (direcaoRef.current) return;
    direcaoRef.current = "anterior";
    setInicio((i) => (i - 1 + total) % total);
    setDeslocamento({ x: -passo(), animar: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setDeslocamento({ x: 0, animar: true })));
  };
  const aoTerminar = (e) => {
    if (e.target !== e.currentTarget) return; // ignora transições dos botões (hover)
    if (direcaoRef.current === "proximo") {
      setInicio((i) => (i + 1) % total);
      setDeslocamento({ x: 0, animar: false });
    }
    direcaoRef.current = null;
  };

  const ordem = itens.map((_, i) => itens[(i + inicio) % total]);
  return (
    <div className="bpx-carrossel-wrap">
      {!cabe && <button type="button" className="bpx-seta-carrossel" onClick={anterior} title="Anterior"><i className="fa-solid fa-chevron-left"></i></button>}
      <div ref={caixaRef} className={`bpx-carrossel ${cabe ? "" : "cortado"}`}>
        <div
          ref={faixaRef}
          className="bpx-carrossel-faixa"
          style={{ transform: `translateX(${deslocamento.x}px)`, transition: deslocamento.animar ? "transform 0.35s ease" : "none" }}
          onTransitionEnd={aoTerminar}
        >
          {ordem.map((item) => renderizar(item, ""))}
        </div>
      </div>
      {!cabe && <button type="button" className="bpx-seta-carrossel" onClick={proximo} title="Próximo"><i className="fa-solid fa-chevron-right"></i></button>}
    </div>
  );
}

function RecomendacoesUniques({ pistaDiagramaAberta, skillsDestacadas, aoClicarSkillHerdada }) {
  if (!pistaDiagramaAberta) return null;

  const chave = `${pistaDiagramaAberta.hipodromo}-${pistaDiagramaAberta.distanciaNumero}-${pistaDiagramaAberta.terrenoCurto}`;
  const itensRecomendados = recomendacoesPistasRaw[chave];
  if (!itensRecomendados || itensRecomendados.length === 0) return null;

  const recomendacoes = itensRecomendados.map(resolverRecomendacao).filter(Boolean);
  if (recomendacoes.length === 0) return null;

  return (
    <div className="bpx-cartao bp-recomendadas-wrap">
      <div className="bpx-secao-titulo"><i className="fa-solid fa-star"></i> Uniques recomendadas <span className="bpx-dica">clique para testar</span></div>
      <CarrosselInfinito
        itens={recomendacoes}
        renderizar={({ chave, icone, portrait, label, titulo, tipo, skill }, sufixo) => {
          const ativa = skillsDestacadas.some((sk) => sk.id === skill.id);
          return (
            <button
              key={chave + sufixo}
              type="button"
              className={`bp-recomendada-btn bp-recomendada-btn-${tipo} ${ativa ? "ativo" : ""}`}
              title={titulo}
              onClick={() => aoClicarSkillHerdada(skill)}
            >
              {icone && (
                <img src={icone} alt={label} className={portrait ? "bpx-portrait" : undefined} onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <span>{label}</span>
            </button>
          );
        }}
      />
    </div>
  );
}

function SeletorAmbiente() {
  const [clima, setClima] = useState("sol");
  const [terreno, setTerreno] = useState("firme");
  const [estacao, setEstacao] = useState("primavera");

  return (
    <div className="bpx-cartao bp-ambiente-wrap">
      <div className="bpx-secao-titulo"><i className="fa-solid fa-cloud-sun"></i> Condições da corrida <span className="bpx-selo-aviso" title="Ainda não afeta o cálculo de ativação">só visual</span></div>

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
              className={`bpx-pilula ${terreno === op.valor ? "ativo" : ""}`}
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

// 🎯 Modal do diagrama + teste de skills de uma pista. Exportado pra ser
// reaproveitado fora do Buscador (ex.: Agenda). "pista" no formato do
// Buscador: { nome, hipodromo, distanciaNumero, distanciaCategoria,
// terrenoCurto, direcao, courseId|course_id }.
export function ModalDiagramaPista({ pista, aoFechar }) {
  const [skillHerdadaParaAdicionar, setSkillHerdadaParaAdicionar] = useState(null);
  const [skillsDestacadas, setSkillsDestacadas] = useState([]);
    const dadosCorrida = encontrarCourseData(pista);
    return (
      <div className="bp-modal-overlay">
        <div className="bp-modal-box bp-modal-box-split" onClick={(e) => e.stopPropagation()}>
          <div className="bp-modal-header">
            <div style={{ minWidth: 0 }}>
              <div className="bpx-sobretitulo"><i className="fa-solid fa-chart-area"></i> Diagrama e teste de skills</div>
              <h3>{pista.nome}</h3>
              <div className="bpx-chips">
                <span><i className="fa-solid fa-location-dot"></i> {pista.hipodromo}</span>
                <span><i className="fa-solid fa-ruler-horizontal"></i> {pista.distanciaNumero}m <em>{pista.distanciaCategoria}</em></span>
                <span><i className="fa-solid fa-seedling"></i> {pista.terrenoCurto}</span>
                <span><i className="fa-solid fa-rotate"></i> {traduzirDirecao(pista.direcao)}</span>
              </div>
            </div>
            {dadosCorrida && (
              <div className="bpx-minimapa-cabecalho">
                <MinimapaPista courseId={Object.keys(courseData).find((id) => courseData[id] === dadosCorrida)} marcadores={[]} />
              </div>
            )}
            <button type="button" className="bp-modal-fechar" onClick={aoFechar}>&times;</button>
          </div>

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
                <div className="bpx-cartao">
                  <div className="bpx-secao-titulo"><i className="fa-solid fa-chart-area"></i> Diagrama da pista <span className="bpx-dica">passe o mouse para ver trecho, fase e inclinação</span></div>
                  <DiagramaPistaGuia dadosCorrida={dadosCorrida} skills={skillsDestacadas} numerar={false} />
                </div>
                <div className="bpx-linha-cartoes">
                  <SeletorAmbiente />
                  <RecomendacoesUniques pistaDiagramaAberta={pista} skillsDestacadas={skillsDestacadas} aoClicarSkillHerdada={setSkillHerdadaParaAdicionar} />
                </div>
                <p className="bpx-creditos">
                  Simulação feita com o <a href="https://github.com/alpha123/uma-skill-tools" target="_blank" rel="noopener noreferrer">uma-skill-tools</a>, de alpha123 · <a href="/creditos">créditos</a>
                </p>
              </div>
            </div>
          ) : (
            <div className="bp-modal-sem-diagrama">
              <p>📊 Ainda não temos o traçado dessa pista no nosso dataset.</p>
              <p className="bp-modal-sem-diagrama-hint">
                O hipódromo "{pista.hipodromo}" não está coberto pelos dados que temos disponíveis.
              </p>
            </div>
          )}
        </div>
      </div>
    );
}

function MinimapaQuandoVisivel({ courseId }) {
  const ref = useRef(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisivel(true); obs.disconnect(); } }, { rootMargin: "200px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return <div ref={ref} className="bp-card-minimapa">{visivel && <MinimapaPista courseId={String(courseId)} marcadores={[]} />}</div>;
}

function BuscadorPistas() {
  const [busca, setBusca] = useState("");
  const [filtroGrade, setFiltroGrade] = useState("Todas");
  const [filtroHipodromo, setFiltroHipodromo] = useState("Todos");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [filtroTerreno, setFiltroTerreno] = useState("Todos");
  const [filtroDirecao, setFiltroDirecao] = useState("Todas");
  const [pistaDiagramaAberta, setPistaDiagramaAberta] = useState(null);
  const [nomesNaRodada, setNomesNaRodada] = useState(() => new Set());
  useEffect(() => onSnapshot(
    doc(db, "pistas_sorteadas", "atual"),
    (snap) => setNomesNaRodada(new Set((snap.exists() ? snap.data().pistas || [] : []).map((p) => p.nome))),
    () => setNomesNaRodada(new Set()),
  ), []);

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
    }).sort((a, b) => nomesNaRodada.has(b.nome) - nomesNaRodada.has(a.nome)); // rodada atual primeiro
  }, [busca, filtroGrade, filtroHipodromo, filtroCategoria, filtroTerreno, filtroDirecao, nomesNaRodada]);

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
        <div className="bp-sobretitulo"><i className="fa-solid fa-screwdriver-wrench"></i> Ferramentas</div>
        <h1 className="bp-title">Buscador de Pistas</h1>
        <p className="bp-subtitle">Filtre as corridas do calendário da PTR e abra o diagrama para testar skills.</p>
      </div>

      <div className="bp-filtros">
        <div className="bp-busca">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            type="text"
            className="bp-busca-input"
            placeholder="Buscar pelo nome da corrida..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="bp-filtros-botoes">
          {[
            { rotulo: "Grade", valor: filtroGrade, set: setFiltroGrade, todos: "Todas", opcoes: OPCOES_GRADE },
            { rotulo: "Terreno", valor: filtroTerreno, set: setFiltroTerreno, todos: "Todos", opcoes: OPCOES_TERRENO },
            { rotulo: "Direção", valor: filtroDirecao, set: setFiltroDirecao, todos: "Todas", opcoes: OPCOES_DIRECAO, nome: traduzirDirecao },
          ].map((f) => (
            <div key={f.rotulo} className="bp-grupo-botoes">
              <span className="bp-grupo-rotulo">{f.rotulo}</span>
              {[f.todos, ...f.opcoes].map((o) => (
                <button key={o} type="button" className={`bp-filtro-botao${f.valor === o ? " ativo" : ""}`} onClick={() => f.set(o)}>
                  {o === f.todos ? f.todos : f.nome ? f.nome(o) : o}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="bp-filtros-grid">
          {[
            { rotulo: "Categoria", icone: "fa-ruler-horizontal", valor: filtroCategoria, set: setFiltroCategoria, todos: "Todas", opcoes: OPCOES_CATEGORIA },
            { rotulo: "Hipódromo", icone: "fa-location-dot", valor: filtroHipodromo, set: setFiltroHipodromo, todos: "Todos", opcoes: OPCOES_HIPODROMO },
          ].map((f) => (
            <div key={f.rotulo} className={`bp-filtro-campo${f.valor !== f.todos ? " ativo" : ""}`}>
              <label><i className={`fa-solid ${f.icone}`}></i> {f.rotulo}</label>
              <select value={f.valor} onChange={(e) => f.set(e.target.value)}>
                <option value={f.todos}>{f.todos}</option>
                {f.opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>

        <div className="bp-filtros-rodape">
          <span className="bp-contagem"><strong>{pistasFiltradas.length}</strong> de {todasAsPistas.length} pistas</span>
          {filtrosAtivos && (
            <button type="button" className="bp-btn-limpar" onClick={limparFiltros}><i className="fa-solid fa-xmark"></i> Limpar filtros</button>
          )}
        </div>
      </div>

      {pistasFiltradas.length === 0 ? (
        <div className="bp-vazio">
          <i className="fa-solid fa-flag-checkered"></i>
          <p>Nenhuma pista encontrada com esses filtros.</p>
        </div>
      ) : (
        <div className="bp-grid">
          {pistasFiltradas.map((p) => {
            const infoGrade = GRADE_INFO[p.grade] || GRADE_INFO.G3;
            const corCategoria = CATEGORIA_DISTANCIA_INFO[p.distanciaCategoria]?.cor || "#8193a8";
            const naRodada = nomesNaRodada.has(p.nome);
            const courseId = courseIdDaPista(p);
            return (
              <div key={p.nome} className={`bp-card${p.grade === "G1" ? " g1" : ""}${naRodada ? " na-rodada" : ""}`}>
                <div className="bp-card-img-wrap">
                  <img
                    src={`/assets/img/hipodromos/${slugHipodromo(p.hipodromo)}.png`}
                    alt={p.hipodromo}
                    className="bp-card-img"
                    loading="lazy"
                    onError={(e) => { e.target.style.display = "none"; }}
                  />
                  {FITA_GRADE[p.grade]
                    ? <img src={`/assets/img/${FITA_GRADE[p.grade]}`} alt={p.grade} className="bp-card-fita" />
                    : <span className="bp-card-grade-badge" style={{ color: infoGrade.cor, background: infoGrade.bg }}>{p.grade}</span>}
                  {naRodada && <span className="bp-selo-rodada"><i className="fa-solid fa-calendar-check"></i> Na rodada</span>}
                  <h3 className="bp-card-nome">{p.nome}</h3>
                </div>
                <div className="bp-card-body">
                  <div className="bp-card-info">
                  <div className="bp-card-chips">
                    <span className="bp-chip"><i className="fa-solid fa-location-dot"></i> {p.hipodromo}</span>
                    <span className="bp-chip"><i className="fa-solid fa-ruler-horizontal"></i> {p.distanciaNumero}m <em style={{ color: corCategoria }}>{p.distanciaCategoria}</em></span>
                    <span className="bp-chip"><i className="fa-solid fa-seedling"></i> {p.terrenoCurto}</span>
                    <span className="bp-chip"><i className="fa-solid fa-rotate"></i> {traduzirDirecao(p.direcao)}</span>
                  </div>
                  {courseId && <MinimapaQuandoVisivel courseId={courseId} />}
                  </div>
                  <button type="button" className="bp-btn-diagrama" onClick={() => setPistaDiagramaAberta(p)}>
                    <i className="fa-solid fa-chart-area"></i> Diagrama da Pista
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
      {pistaDiagramaAberta && <ModalDiagramaPista pista={pistaDiagramaAberta} aoFechar={() => setPistaDiagramaAberta(null)} />}
    </div>
  );
}

export default BuscadorPistas;