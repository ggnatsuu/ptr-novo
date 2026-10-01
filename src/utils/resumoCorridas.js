// 🎯 src/utils/resumoCorridas.js
// Resumo de todas as corridas num documento só (resumos/corridas), pra
// Rank Geral, Ranking de Personagens e cartão do treinador lerem 1
// documento em vez da coleção inteira de resultados. É gravado pelo
// RankAdmin junto com o recálculo das conquistas. Se ainda não existir
// (ou a regra não deixar ler), cai na leitura antiga da coleção.

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";

const REF_RESUMO = () => doc(db, "resumos", "corridas");

// Só o que as páginas usam (o Firestore não aceita "undefined").
function compactar(resultado, pistasPorEdicao) {
  const ordemPista = (pistasPorEdicao?.[resultado.edicaoId] ?? []).indexOf(resultado.pistaNome) + 1;
  const limpo = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ""));
  return limpo({
    id: resultado.id,
    edicaoId: resultado.edicaoId,
    pistaNome: resultado.pistaNome,
    grade: resultado.grade,
    hipodromo: resultado.hipodromo,
    distancia: resultado.distancia,
    terreno: resultado.terreno,
    grupo: resultado.grupo,
    ordemPista: ordemPista || undefined,
    dataRegistro: resultado.dataRegistro,
    cavaloVencedor: resultado.cavaloVencedor,
    treinadorVencedor: resultado.treinadorVencedor,
    classificacao: (resultado.classificacao ?? []).map((l) => limpo({
      treinador: l.treinador,
      treinadorUid: l.treinadorUid,
      personagem: l.personagem,
      posicao: l.posicao,
    })),
  });
}

// Grava o resumo (resultados = documentos da coleção, com id;
// pistasPorEdicao = { edicaoId: [nomes na ordem do sorteio] }).
export async function gravarResumoCorridas(resultados, pistasPorEdicao) {
  await setDoc(REF_RESUMO(), { corridas: resultados.map((r) => compactar(r, pistasPorEdicao)), atualizadoEm: serverTimestamp() });
}

async function lerColecao() {
  const snap = await getDocs(collection(db, "resultados_partidas"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Leitura única (cartão do treinador).
export async function buscarCorridas() {
  try {
    const snap = await getDoc(REF_RESUMO());
    if (snap.exists()) return snap.data().corridas ?? [];
  } catch (erro) {
    console.warn("Resumo das corridas indisponível, lendo a coleção:", erro.code ?? erro);
  }
  return lerColecao();
}

// Hook: corridas ao vivo (null enquanto carrega).
export function useCorridas() {
  const [corridas, setCorridas] = useState(null);
  useEffect(() => {
    let vivo = true;
    const cairNaColecao = () => lerColecao()
      .then((lista) => { if (vivo) setCorridas(lista); })
      .catch((erro) => { console.error("Erro ao ler as corridas:", erro); if (vivo) setCorridas([]); });
    const parar = onSnapshot(
      REF_RESUMO(),
      (snap) => (snap.exists() ? setCorridas(snap.data().corridas ?? []) : cairNaColecao()),
      (erro) => { console.warn("Resumo das corridas indisponível, lendo a coleção:", erro.code ?? erro); cairNaColecao(); },
    );
    return () => { vivo = false; parar(); };
  }, []);
  return corridas;
}
