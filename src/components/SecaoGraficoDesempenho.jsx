// 🎯 src/components/SecaoGraficoDesempenho.jsx
// Gráfico de desempenho dentro do painel do treinador. Duas formas de uso:
//  - Resultados: recebe o id da corrida e busca o replay (só pra logados;
//    visitante vê o cadeado). A busca é compartilhada com o replay embaixo
//    da tabela (utils/replayCompartilhado.js), então não gasta leitura a mais.
//  - Prévia do RankAdmin: recebe o objeto do replay direto do arquivo.

import { Suspense, lazy, useEffect, useState } from "react";
import { buscarReplay, decodificarReplay, useUsuario } from "../utils/replayCompartilhado";
import { ReplayBloqueado } from "./SecaoReplayResultado";

const GraficoDesempenho = lazy(() => import("./GraficoDesempenho"));

function Aviso({ children }) {
  return <p style={{ color: "#5f758e", fontSize: "9pt", fontStyle: "italic", margin: "10px 0" }}>{children}</p>;
}

function SecaoGraficoDesempenho({ corridaId, replay, numero }) {
  const usuario = useUsuario();
  const chave = corridaId ?? replay;
  // Dados guardados junto com a chave da corrida: ao trocar, o antigo deixa de valer.
  const [carga, setCarga] = useState({ chave: null, replay: null, raceData: null, erro: "" });

  const podeCarregar = Boolean(replay) || Boolean(usuario);
  useEffect(() => {
    if (!podeCarregar) return undefined;
    let cancelado = false;
    const origem = replay ? Promise.resolve(replay) : buscarReplay(corridaId);
    origem
      .then((dados) => {
        if (!dados) return { replay: null, raceData: null, erro: "Os dados de desempenho desta corrida não estão disponíveis." };
        return decodificarReplay(dados).then((raceData) => ({ replay: dados, raceData, erro: "" }));
      })
      .then((r) => { if (!cancelado) setCarga({ chave, ...r }); })
      .catch((erro) => {
        console.error("Erro ao carregar o gráfico de desempenho:", erro);
        if (!cancelado) setCarga({ chave, replay: null, raceData: null, erro: "Não foi possível carregar o gráfico agora." });
      });
    return () => { cancelado = true; };
  }, [chave, corridaId, replay, podeCarregar]);

  if (!replay) {
    if (usuario === undefined) return <Aviso>Carregando gráfico...</Aviso>;
    if (!usuario) {
      return (
        <ReplayBloqueado
          altura={260}
          titulo="Gráfico exclusivo para treinadores"
          texto="Entre na sua conta para ver a velocidade, o HP e os bloqueios de cada treinador ao longo da corrida."
        />
      );
    }
  }

  const atual = carga.chave === chave ? carga : null;
  if (!atual) return <Aviso>Carregando gráfico...</Aviso>;
  if (atual.erro) return <Aviso>{atual.erro}</Aviso>;

  return (
    <Suspense fallback={<Aviso>Carregando gráfico...</Aviso>}>
      <GraficoDesempenho raceData={atual.raceData} replay={atual.replay} numero={numero} />
    </Suspense>
  );
}

export default SecaoGraficoDesempenho;
