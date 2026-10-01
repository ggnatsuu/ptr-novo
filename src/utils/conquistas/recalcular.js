// 🎯 src/utils/conquistas/recalcular.js
// Recalcula as conquistas de todos os treinadores a partir do banco e grava
// em conquistas/{chave do treinador}. Roda no RankAdmin (precisa de admin:
// lê os replays e grava a coleção). As concedidas à mão (campo "manuais")
// não são tocadas.

import { collection, doc, getDoc, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../config/firebase";
import { montarHistorico, calcularConquistas, calcularPersonagens } from "./motor";
import { metricasConquistas } from "./metricasArquivo";
import { idConquistas } from "./leve";

export { idConquistas };

export async function recalcularConquistas() {
  const resultados = (await getDocs(collection(db, "resultados_partidas"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const edicoes = [...new Set(resultados.map((r) => r.edicaoId))];

  const pistasPorEdicao = {};
  const checkins = {};
  for (const edicaoId of edicoes) {
    const pistas = await getDoc(doc(db, "pistas_sorteadas", edicaoId));
    pistasPorEdicao[edicaoId] = pistas.exists() ? (pistas.data().pistas ?? []).map((p) => p.nome) : [];
    const confirmados = await getDocs(collection(db, "checkins", edicaoId, "confirmados"));
    checkins[edicaoId] = confirmados.docs.map((d) => ({ nome: d.data().nome, confirmadoEm: d.data().confirmadoEm?.seconds ?? null }));
  }

  // Corridas enviadas por arquivo: detalhes dos treinadores + métricas do replay.
  const extras = {};
  const { deserializeFromBase64 } = await import("../hakuraku/RaceDataParser");
  for (const r of resultados.filter((x) => x.origem === "arquivo")) {
    const detalhes = r.dadosTreinadores ? null : await getDoc(doc(db, "detalhes_partidas", r.id));
    const replay = await getDoc(doc(db, "replays_partidas", r.id));
    const extra = { dadosTreinadores: r.dadosTreinadores ?? (detalhes?.exists() ? detalhes.data().dadosTreinadores : null), metricas: {} };
    if (replay.exists()) {
      const dadosReplay = replay.data();
      const raceData = await deserializeFromBase64(dadosReplay.simDataBase64);
      (r.classificacao ?? []).forEach((l) => {
        if (l.numero) extra.metricas[l.numero] = metricasConquistas(raceData, l.numero, dadosReplay.courseId);
      });
    }
    extras[r.id] = extra;
  }

  const historico = montarHistorico({ resultados, pistasPorEdicao, checkins, extras });
  const conquistas = calcularConquistas(historico);
  const personagens = calcularPersonagens(historico);

  // Compara com o que já estava gravado pra contar as novas.
  const anteriores = new Map((await getDocs(collection(db, "conquistas"))).docs.map((d) => [d.id, d.data()]));
  let novas = 0;
  const lote = writeBatch(db);
  conquistas.forEach((t, chave) => {
    const id = idConquistas(chave);
    const tinha = new Set((anteriores.get(id)?.conquistas ?? []).map((q) => q.tag));
    novas += t.conquistas.filter((q) => !tinha.has(q.tag)).length;
    lote.set(doc(db, "conquistas", id), {
      nome: t.nome,
      conquistas: t.conquistas,
      personagens: personagens.get(chave) ?? [],
      atualizadoEm: serverTimestamp(),
    }, { merge: true });
  });
  // Treinador que sumiu dos resultados (ex.: resultado apagado) perde as automáticas.
  anteriores.forEach((_, id) => {
    if (![...conquistas.keys()].some((chave) => idConquistas(chave) === id)) {
      lote.set(doc(db, "conquistas", id), { conquistas: [], personagens: [], atualizadoEm: serverTimestamp() }, { merge: true });
    }
  });
  await lote.commit();

  return { treinadores: conquistas.size, novas };
}
