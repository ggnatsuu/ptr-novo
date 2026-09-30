// 🎯 src/utils/replayCompartilhado.js
// Busca e decodificação do replay com cache, compartilhadas entre o replay
// embaixo da tabela (SecaoReplayResultado) e os gráficos de desempenho do
// painel do treinador (SecaoGraficoDesempenho) — assim abrir os dois custa
// uma leitura só no Firestore e uma decodificação só no navegador.

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

const documentos = new Map(); // id do resultado -> Promise<dados do replay | null>
const decodificados = new WeakMap(); // objeto do replay -> Promise<raceData>

// replays_partidas/{id}. Devolve null se a corrida não tiver replay.
export function buscarReplay(id) {
  if (!documentos.has(id)) {
    const busca = getDoc(doc(db, "replays_partidas", id))
      .then((snap) => (snap.exists() ? snap.data() : null))
      .catch((erro) => {
        documentos.delete(id); // deixa tentar de novo depois
        throw erro;
      });
    documentos.set(id, busca);
  }
  return documentos.get(id);
}

// Simulação decodificada pelo parser do Hakuraku (baixado só aqui).
export function decodificarReplay(replay) {
  if (!decodificados.has(replay)) {
    const decodificacao = import("./hakuraku/RaceDataParser").then(({ deserializeFromBase64 }) => deserializeFromBase64(replay.simDataBase64));
    decodificacao.catch(() => decodificados.delete(replay));
    decodificados.set(replay, decodificacao);
  }
  return decodificados.get(replay);
}

// Usuário logado: undefined enquanto o Firebase ainda está verificando,
// null pra visitante.
export function useUsuario() {
  const [usuario, setUsuario] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, setUsuario), []);
  return usuario;
}
