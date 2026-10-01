// 🎯 src/utils/anotacoesMeta.js
// Dados compartilhados pelo painel "Minhas anotações" do Guia do Meta e pelo
// seletor de cartas.

import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../config/firebase";
import cartasSuporte from "../data/cartasSuporte.json";
import roupasPersonagens from "../data/roupasPersonagens.json";

export const TIPOS_CARTA = [
  { chave: "Speed", cor: "#4ea3f5", icone: "/assets/img/textures/speed.webp" },
  { chave: "Stamina", cor: "#e85d5d", icone: "/assets/img/textures/stamina.webp" },
  { chave: "Power", cor: "#f0a040", icone: "/assets/img/textures/power.webp" },
  { chave: "Guts", cor: "#e27ab6", icone: "/assets/img/textures/guts.webp" },
  { chave: "Wit", cor: "#4fc76a", icone: "/assets/img/textures/wit.webp" },
  { chave: "Pal", cor: "#f0a040", icone: "/assets/img/utx_ico_obtain_05.png" },
  { chave: "Group", cor: "#7cc23a", icone: "/assets/img/utx_ico_obtain_06.png" },
];

export { cartasSuporte, roupasPersonagens };
export const roupaPorId = new Map(roupasPersonagens.map((r) => [r.id, r]));
export const cartaPorId = new Map(cartasSuporte.map((c) => [c.id, c]));
export const urlCarta = (id) => `/assets/img/cartas/${id}.webp`;

export const NUM_DECKS = 3;
export const CARTAS_POR_DECK = 6; // 5 + empréstimo

export const anotacaoVazia = () => ({
  // Cada deck: a personagem (card_id da roupa) e as 6 cartas (a última é o empréstimo).
  decks: Array.from({ length: NUM_DECKS }, () => ({ personagem: null, cartas: Array(CARTAS_POR_DECK).fill(null) })),
  memo: "",
});

// ---------------------------------------------------------------------
// FIRESTORE: anotacoes_meta/{uid}_{evento}
// Cada usuário só lê e grava os próprios documentos (regra do Firestore).
// ---------------------------------------------------------------------

export const COLECAO_ANOTACOES = "anotacoes_meta";
export const idDocAnotacao = (uid, idEvento) => `${uid}_${idEvento.replace(/[^A-Za-z0-9]+/g, "-")}`;

// Garante o formato atual (3 decks x 6 cartas), mesmo se o documento for antigo.
export function normalizarAnotacao(dados) {
  const base = anotacaoVazia();
  if (!dados) return base;
  return {
    decks: base.decks.map((vazio, i) => {
      const deck = dados.decks?.[i];
      if (!deck) return vazio;
      return { personagem: deck.personagem ?? null, cartas: vazio.cartas.map((_, j) => deck.cartas?.[j] ?? null) };
    }),
    memo: dados.memo ?? "",
  };
}

// Texto comparável, para saber se há alterações não salvas.
export const assinaturaAnotacao = (a) => JSON.stringify(normalizarAnotacao(a));

export async function carregarAnotacao(uid, idEvento) {
  const snap = await getDoc(doc(db, COLECAO_ANOTACOES, idDocAnotacao(uid, idEvento)));
  return snap.exists() ? normalizarAnotacao(snap.data()) : null;
}

export async function gravarAnotacao(uid, evento, anotacao) {
  const dados = normalizarAnotacao(anotacao);
  await setDoc(doc(db, COLECAO_ANOTACOES, idDocAnotacao(uid, evento.id)), {
    uid,
    evento: evento.id,
    nomeEvento: evento.nome,
    tipo: evento.tipo,
    numero: evento.numero,
    decks: dados.decks,
    memo: dados.memo,
    atualizadoEm: serverTimestamp(),
  });
}

// Todas as anotações do usuário (aba "Todas as anotações").
export async function listarAnotacoes(uid) {
  const snap = await getDocs(query(collection(db, COLECAO_ANOTACOES), where("uid", "==", uid)));
  return snap.docs.map((d) => {
    const dados = d.data();
    return { ...normalizarAnotacao(dados), evento: dados.evento, atualizadoEm: dados.atualizadoEm?.toDate?.() ?? null };
  });
}

export async function excluirAnotacao(uid, idEvento) {
  await deleteDoc(doc(db, COLECAO_ANOTACOES, idDocAnotacao(uid, idEvento)));
}

// Evento "atual" do Guia do Meta, definido pelo admin: guia_meta/config.eventoAtual
export async function lerEventoAtual() {
  try {
    const snap = await getDoc(doc(db, "guia_meta", "config"));
    return snap.exists() ? snap.data().eventoAtual ?? null : null;
  } catch (erro) {
    console.error("Erro ao ler o evento atual do Guia do Meta:", erro);
    return null;
  }
}

export async function definirEventoAtual(idEvento) {
  await setDoc(doc(db, "guia_meta", "config"), { eventoAtual: idEvento, atualizadoEm: serverTimestamp() }, { merge: true });
}

// Tipo da carta (Speed, Stamina...) com ícone e cor, pelo id.
export const tipoDaCarta = (id) => TIPOS_CARTA.find((t) => t.chave === cartaPorId.get(id)?.tipo) ?? null;

// Classes da moldura de raridade (ver .moldura-raridade no index.css).
export const classeRaridade = (id) => {
  const r = cartaPorId.get(id)?.raridade;
  return r ? `moldura-raridade moldura-${r.toLowerCase()}` : "";
};
