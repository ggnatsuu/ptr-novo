// 🎯 src/utils/simulador/corredoras.js
// Lista de corredoras (cada roupa = uma carta com unique própria) e pistas
// do calendário, prontas pros seletores do Comparador.

import "../roupasExtras"; // injeta as roupas que só o GameTora tem
import { roupaUpcoming } from "../roupasExtras";
import umasRaw from "../../uma-skill-tools/data/umas.json";
import iconsRaw from "../../uma-skill-tools/data/icons.json";
import { portraitDaRoupa } from "../iconeRoupa";
import { MOSTRAR_UPCOMING } from "../skillsPista";
import { bancoCorridas, bancoG1 } from "../../data/bancos-corridas";
import courseData from "../../uma-skill-tools/data/course_data.json";
import { tracknames } from "../../data/pistasCourseData";
import aptidoesCartas from "../../data/aptidoesCartas.json";

const NOME_ESTRATEGIA = { 1: "Front", 2: "Pace", 3: "Late", 4: "End", 5: "Runaway" };

// Unique da carta (fórmula do HorseDefTypes.ts do alpha123; 3★+ = versão completa).
export function idDaUnique(outfitId, estrelas = 3) {
  const oid = String(outfitId);
  const i = Number(oid.slice(1, -2));
  const v = Number(oid.slice(-2));
  return String(10000 * (1 + 9 * (estrelas > 2 ? 1 : 0)) + 10000 * (v - 1) + i * 10 + 1);
}

export function fotoCorredora(outfitId) {
  const portrait = portraitDaRoupa(outfitId);
  if (portrait) return portrait;
  const entrada = iconsRaw[outfitId];
  if (!entrada) return null;
  return `/assets/img/chara/${Array.isArray(entrada) ? entrada[1] : entrada}.png`;
}

export const catalogoCorredoras = Object.values(umasRaw)
  .flatMap((uma) =>
    Object.entries(uma.outfits).map(([outfitId, roupa]) => ({
      outfitId,
      nome: uma.name[1] || uma.name[0],
      epiteto: roupa.epithet?.replace(/^\[(.*)\]$/, "$1") ?? "",
      estrategia: NOME_ESTRATEGIA[roupa.strategy] ?? "Pace",
      upcoming: roupaUpcoming(outfitId),
    }))
  )
  .filter((c) => MOSTRAR_UPCOMING || !c.upcoming)
  .sort((a, b) => a.nome.localeCompare(b.nome) || a.epiteto.localeCompare(b.epiteto));

export const pistasCalendario = [...bancoG1, ...bancoCorridas]
  .filter((p, i, lista) => p?.nome && p.courseId && lista.findIndex((q) => q.nome === p.nome) === i)
  .sort((a, b) => a.nome.localeCompare(b.nome));

// ---------------------------------------------------------------------------
// Percursos (todos os do course_data, não só os do calendário)
// ---------------------------------------------------------------------------
const TERRENO_NOME = { 1: "Turf", 2: "Dirt" };
const CATEGORIA_NOME = { 1: "Sprint", 2: "Mile", 3: "Medium", 4: "Long" };
const TRACADO_NOME = { 2: "Inner", 3: "Outer", 4: "Outer → Inner" };
const DIRECAO_NOME = { 1: "Direita", 2: "Esquerda", 4: "Reta" };

export function infoPercurso(courseId) {
  const c = courseData[courseId];
  if (!c) return null;
  return {
    courseId: String(courseId),
    hipodromoId: String(c.raceTrackId),
    hipodromo: tracknames[c.raceTrackId]?.[1] ?? String(c.raceTrackId),
    distancia: c.distance,
    terreno: TERRENO_NOME[c.surface] ?? "?",
    categoria: CATEGORIA_NOME[c.distanceType] ?? "",
    tracado: TRACADO_NOME[c.course] ?? "",
    direcao: DIRECAO_NOME[c.turn] ?? "",
  };
}

const todosPercursos = Object.keys(courseData).map(infoPercurso).filter(Boolean);

export const hipodromos = [...new Map(todosPercursos.map((p) => [p.hipodromoId, p.hipodromo])).entries()]
  .map(([id, nome]) => ({ id, nome }))
  .sort((a, b) => a.nome.localeCompare(b.nome));

// Percursos de um hipódromo: Turf antes de Dirt, depois pela distância.
export function percursosDoHipodromo(hipodromoId) {
  return todosPercursos
    .filter((p) => p.hipodromoId === String(hipodromoId))
    .sort((a, b) => a.terreno.localeCompare(b.terreno) * -1 || a.distancia - b.distancia || a.tracado.localeCompare(b.tracado));
}

export const rotuloPercurso = (p) => `${p.terreno} ${p.distancia}m (${p.categoria})${p.tracado ? ` · ${p.tracado}` : ""}`;

// Aptidões da carta pro percurso e estratégia escolhidos (dados do GameTora:
// 10 letras na ordem Turf, Dirt, Sprint, Mile, Medium, Long, Front, Pace, Late, End).
// null se a carta não está no arquivo.
const INDICE_DISTANCIA = { Sprint: 2, Mile: 3, Medium: 4, Long: 5 };
const INDICE_ESTILO = { Front: 6, Runaway: 6, Pace: 7, Late: 8, End: 9 };
export function aptidoesDaCarta(outfitId, percurso, estrategia) {
  const letras = aptidoesCartas[String(outfitId)];
  if (!letras || !percurso) return null;
  return {
    terreno: letras[percurso.terreno === "Dirt" ? 1 : 0],
    distancia: letras[INDICE_DISTANCIA[percurso.categoria] ?? 4],
    estrategia: letras[INDICE_ESTILO[estrategia] ?? 7],
  };
}
