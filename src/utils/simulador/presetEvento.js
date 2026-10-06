// 🎯 src/utils/simulador/presetEvento.js
// "Usar o CM atual" no Comparador: pega o evento atual do Guia do Meta e
// devolve o percurso e as condições dele. Os dados do Guia só carregam quando
// alguém clica (import dinâmico), pra não pesar o Comparador.

import courseData from "../../uma-skill-tools/data/course_data.json";
import { tracknames } from "../../data/pistasCourseData";

const ALIAS_HIPODROMO = { Chukyo: "Chuukyo" };
const ESTACAO = { Spring: "Spring", Summer: "Summer", Fall: "Fall", Autumn: "Fall", Winter: "Winter" };
const CLIMAS = ["Sunny", "Cloudy", "Rainy", "Snowy"];
const TERRENOS = ["Firm", "Good", "Soft", "Heavy"];

// Mesmo critério do Guia do Meta: com 2 traçados, usa o externo (course maior).
function acharCourseId(pista) {
  const nome = ALIAS_HIPODROMO[pista.hipodromo] ?? pista.hipodromo;
  const idPista = Object.keys(tracknames).find((k) => tracknames[k][1] === nome);
  if (!idPista) return null;
  const distancia = parseInt(pista.distancia, 10);
  const superficie = pista.terreno === "Dirt" ? 2 : 1;
  const opcoes = Object.entries(courseData)
    .filter(([, c]) => String(c.raceTrackId) === idPista && c.distance === distancia && c.surface === superficie)
    .sort(([, a], [, b]) => b.course - a.course);
  return opcoes[0]?.[0] ?? null;
}

// Evento que o Guia mostra por padrão: o marcado como atual pelo admin, senão o
// último CM com status preenchido.
function eventoPadrao(eventos, atual) {
  const visiveis = eventos.filter((e) => !e.oculto);
  if (atual && visiveis.some((e) => e.id === atual)) return atual;
  const cms = visiveis.filter((e) => e.tipo === "Champions Meeting");
  const completo = [...cms].reverse().find((e) => e.status_recomendados?.speed && e.status_recomendados.speed !== "wip");
  return (completo ?? cms.at(-1) ?? visiveis.at(-1))?.id ?? null;
}

// { nome, courseId, condicoes: { terreno?, clima?, estacao? } } ou null.
// Clima/condição "Random" (LoH) ficam de fora pra não mexer no que já está.
export async function presetEventoAtual() {
  const [{ carregarIndice, carregarEvento }, { lerEventoAtual }] = await Promise.all([
    import("../guiaMetaDados"),
    import("../anotacoesMeta"),
  ]);
  const [indice, atual] = await Promise.all([carregarIndice(), lerEventoAtual()]);
  const id = eventoPadrao(indice.eventos, atual);
  if (!id) return null;
  const evento = await carregarEvento(id);
  const p = evento?.informacoes_pista;
  if (!p) return null;
  const condicoes = {};
  if (TERRENOS.includes(p.condicao_pista)) condicoes.terreno = p.condicao_pista;
  if (CLIMAS.includes(p.clima)) condicoes.clima = p.clima;
  if (ESTACAO[p.estacao]) condicoes.estacao = ESTACAO[p.estacao];
  return { nome: evento.nome ? `${evento.tipo === "Champions Meeting" ? "CM" : evento.tipo} #${evento.numero} · ${evento.nome}` : id, courseId: acharCourseId(p), condicoes };
}
