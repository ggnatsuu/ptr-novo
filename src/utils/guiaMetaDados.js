// 🎯 src/utils/guiaMetaDados.js
// Dados do Guia do Meta no Firestore (editáveis pelo admin, sem deploy):
//   guia_meta/indice           -> lista leve dos eventos (seletor, aba de anotações)
//   guia_meta_eventos/<slug>   -> conteúdo completo de cada evento
// Enquanto o índice não existir, o guia usa o JSON da planilha (data/metaPvp.json),
// que também serve de base para a importação.
// Cache na memória: cada documento é lido no máximo uma vez por visita.

import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../config/firebase";

export const COLECAO_EVENTOS = "guia_meta_eventos";
export const slugEvento = (id) => id.replace(/[^A-Za-z0-9]+/g, "-");

// Só o que o seletor e a aba de anotações precisam de cada evento.
export function resumoEvento(e) {
  const p = e.informacoes_pista ?? {};
  return {
    id: e.id,
    tipo: e.tipo,
    numero: e.numero,
    nome: e.nome,
    informacoes_pista: { hipodromo: p.hipodromo ?? "", distancia: p.distancia ?? "", tipo_distancia: p.tipo_distancia ?? "", terreno: p.terreno ?? "" },
    status_recomendados: { speed: e.status_recomendados?.speed ?? null },
    oculto: !!e.oculto,
  };
}

let cacheIndice = null;
const cacheEventos = new Map();

// { fonte, eventos: [resumo...], origem: "firebase" | "json" }
export async function carregarIndice() {
  if (cacheIndice) return cacheIndice;
  try {
    const snap = await getDoc(doc(db, "guia_meta", "indice"));
    if (snap.exists()) {
      cacheIndice = { fonte: snap.data().fonte ?? "", eventos: snap.data().eventos ?? [], origem: "firebase" };
      return cacheIndice;
    }
  } catch (erro) {
    console.error("Erro ao ler o índice do Guia do Meta:", erro);
  }
  // Reserva: ainda não importado para o Firebase.
  const json = (await import("../data/metaPvp.json")).default;
  json.eventos.forEach((e) => cacheEventos.set(e.id, e));
  cacheIndice = { fonte: json.fonte, eventos: json.eventos.map(resumoEvento), origem: "json" };
  return cacheIndice;
}

export async function carregarEvento(id) {
  if (cacheEventos.has(id)) return cacheEventos.get(id);
  const snap = await getDoc(doc(db, COLECAO_EVENTOS, slugEvento(id)));
  const evento = snap.exists() ? snap.data() : null;
  if (evento) cacheEventos.set(id, evento);
  return evento;
}

// Admin: sobe todos os eventos do JSON da planilha + o índice, numa só operação.
export async function importarJsonParaFirebase() {
  const json = (await import("../data/metaPvp.json")).default;
  const lote = writeBatch(db);
  json.eventos.forEach((e) => lote.set(doc(db, COLECAO_EVENTOS, slugEvento(e.id)), e));
  lote.set(doc(db, "guia_meta", "indice"), { fonte: json.fonte, eventos: json.eventos.map(resumoEvento), atualizadoEm: serverTimestamp() });
  await lote.commit();
  cacheIndice = null;
  cacheEventos.clear();
  return json.eventos.length;
}

// ---------------------------------------------------------------------
// ADMIN: edição dos eventos
// ---------------------------------------------------------------------
export const ESTILOS_GUIA = ["Front", "Pace", "Late", "End"];

// Esqueleto de um evento novo (ou base para copiar de outro).
export function eventoVazio(tipo, numero) {
  const sigla = tipo === "League of Heroes" ? "LoH" : "CM";
  const id = `${sigla} #${numero}`;
  const estiloVazio = () => ({ personagens_recomendadas: [], rec_accel: null, rec_skills: null, deck_iniciante: null, deck_padrao: null, deck_baleia: null, cartas_mencao_honrosa: null });
  return {
    id,
    tipo,
    numero,
    nome: id,
    cenario: "",
    periodo_especial: null,
    informacoes_pista: { distancia: "", tipo_distancia: "", terreno: "Turf", hipodromo: "", direcao: "Right", estacao: "Spring", clima: tipo === "League of Heroes" ? "Random" : "Sunny", condicao_pista: tipo === "League of Heroes" ? "Random" : "Firm" },
    status_recomendados: { speed: null, stamina: null, power: null, guts: null, wit: null, alternativa_1: { rotulo: null, stamina: null, guts: null }, alternativa_2: { stamina: null, guts: null } },
    descricao: { curta: null, analise_meta: null, ranking_estilos: null },
    estilos: Object.fromEntries(ESTILOS_GUIA.map((e) => [e, estiloVazio()])),
    decks_mencao_honrosa: [],
    cartas_novas: [],
    notas_extras: [],
  };
}

// Índice sempre lido do servidor antes de alterar (evita sobrescrever com cache antigo).
async function lerIndiceServidor() {
  const snap = await getDoc(doc(db, "guia_meta", "indice"));
  return snap.exists() ? snap.data() : { fonte: "", eventos: [] };
}

const ORDEM = { "Champions Meeting": 0, "League of Heroes": 1 };
const ordenar = (lista) => [...lista].sort((a, b) => (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9) || a.numero - b.numero);

export async function salvarEventoGuia(evento) {
  await setDoc(doc(db, COLECAO_EVENTOS, slugEvento(evento.id)), evento);
  const indice = await lerIndiceServidor();
  const eventos = ordenar([...indice.eventos.filter((e) => e.id !== evento.id), resumoEvento(evento)]);
  await setDoc(doc(db, "guia_meta", "indice"), { ...indice, eventos, atualizadoEm: serverTimestamp() });
  cacheEventos.set(evento.id, evento);
  cacheIndice = null;
  return eventos;
}

// Oculta/mostra um evento para os membros (grava na hora, sem mexer no resto).
export async function definirOcultoGuia(id, oculto) {
  await updateDoc(doc(db, COLECAO_EVENTOS, slugEvento(id)), { oculto });
  const indice = await lerIndiceServidor();
  const eventos = indice.eventos.map((e) => (e.id === id ? { ...e, oculto } : e));
  await setDoc(doc(db, "guia_meta", "indice"), { ...indice, eventos, atualizadoEm: serverTimestamp() });
  const salvo = cacheEventos.get(id);
  if (salvo) cacheEventos.set(id, { ...salvo, oculto });
  cacheIndice = null;
  return eventos;
}

export async function excluirEventoGuia(id) {
  await deleteDoc(doc(db, COLECAO_EVENTOS, slugEvento(id)));
  const indice = await lerIndiceServidor();
  const eventos = indice.eventos.filter((e) => e.id !== id);
  await setDoc(doc(db, "guia_meta", "indice"), { ...indice, eventos, atualizadoEm: serverTimestamp() });
  cacheEventos.delete(id);
  cacheIndice = null;
  return eventos;
}

// Recarrega o índice ignorando o cache (tela de admin).
export async function recarregarIndice() {
  cacheIndice = null;
  return carregarIndice();
}

// Estratégias de composição do time (Guia do Meta).
export const FUNCOES_COMPOSICAO = {
  as: { nome: "Ás", cor: "#f3c75a", icone: "fa-crown" },
  ra: { nome: "RA", cor: "#5fa8e8", icone: "fa-shield-halved" },
  debuff: { nome: "Debuff", cor: "#c58bff", icone: "fa-skull" },
  suporte: { nome: "Suporte", cor: "#a4b3c6", icone: "fa-hands-holding" },
};
export const SELOS_COMPOSICAO = {
  recomendada: { nome: "Recomendada", cor: "#7fb37a", icone: "fa-star" },
  alternativa: { nome: "Alternativa", cor: "#5fa8e8", icone: "fa-code-branch" },
  arriscada: { nome: "Arriscada", cor: "#e8806f", icone: "fa-triangle-exclamation" },
};
