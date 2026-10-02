// 🎯 src/utils/historicoGuia.js
// Histórico de alterações do Guia do Meta (coleção guia_meta_log):
// quem mexeu, quando, em qual evento e quais seções mudaram.

import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { ESTILOS_GUIA } from "./guiaMetaDados";

export const COLECAO_HISTORICO = "guia_meta_log";

export const ACOES_HISTORICO = {
  salvou: { texto: "editou", icone: "fa-pen", cor: "#5fa8e8" },
  criou: { texto: "criou", icone: "fa-plus", cor: "#7fb37a" },
  excluiu: { texto: "excluiu", icone: "fa-trash", cor: "#e8806f" },
  ocultou: { texto: "ocultou", icone: "fa-eye-slash", cor: "#e8806f" },
  mostrou: { texto: "voltou a mostrar", icone: "fa-eye", cor: "#7fb37a" },
  atual: { texto: "definiu como atual", icone: "fa-thumbtack", cor: "#c5a059" },
};

let nomeEmCache = null;
async function nomeDoUsuario(uid) {
  if (nomeEmCache?.uid === uid) return nomeEmCache.nome;
  let nome = auth.currentUser?.displayName ?? "Desconhecido";
  try {
    const snap = await getDoc(doc(db, "treinadores", uid));
    if (snap.exists()) nome = snap.data().usuarioID ?? nome;
  } catch { /* fica com o nome da conta */ }
  nomeEmCache = { uid, nome };
  return nome;
}

// Grava uma entrada. Falhar aqui nunca impede a ação principal.
export async function registrarHistorico(evento, acao, secoes = []) {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const entrada = { evento, acao, secoes, uid, nome: await nomeDoUsuario(uid) };
    await addDoc(collection(db, COLECAO_HISTORICO), { ...entrada, quando: serverTimestamp() });
    return { ...entrada, quando: new Date() };
  } catch (erro) {
    console.warn("Não foi possível gravar o histórico do guia:", erro);
    return null;
  }
}

export async function listarHistorico(quantidade = 80) {
  const snap = await getDocs(query(collection(db, COLECAO_HISTORICO), orderBy("quando", "desc"), limit(quantidade)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data(), quando: d.data().quando?.toDate?.() ?? new Date() }));
}

// Quais seções mudaram entre a versão salva e a nova.
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
export function secoesAlteradas(antes, depois) {
  if (!antes) return [];
  const secoes = [];
  if (["id", "nome", "cenario", "periodo_especial"].some((k) => !igual(antes[k], depois[k]))) secoes.push("Identificação");
  if (!igual(antes.informacoes_pista, depois.informacoes_pista)) secoes.push("Pista");
  if (!igual(antes.status_recomendados, depois.status_recomendados)) secoes.push("Status");
  if (!igual(antes.descricao, depois.descricao)) secoes.push("Meta");
  if (!igual(antes.estrategias, depois.estrategias)) secoes.push("Estratégias");
  ESTILOS_GUIA.forEach((estilo) => {
    const a = antes.estilos?.[estilo] ?? {};
    const d = depois.estilos?.[estilo] ?? {};
    if (!igual(a.aceleracoes, d.aceleracoes) || !igual(a.comentario_accel, d.comentario_accel)) secoes.push(`Acelerações ${estilo}`);
    if (!igual(a.personagens_recomendadas, d.personagens_recomendadas)) secoes.push(`Personagens ${estilo}`);
    if (["deck_iniciante", "deck_padrao", "deck_baleia"].some((k) => !igual(a[k], d[k]))) secoes.push(`Decks ${estilo}`);
  });
  return secoes;
}

export function tempoRelativo(data) {
  const seg = (Date.now() - data.getTime()) / 1000;
  if (seg < 60) return "agora";
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 7 * 86400) return `há ${Math.floor(seg / 86400)} dia${seg >= 2 * 86400 ? "s" : ""}`;
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
