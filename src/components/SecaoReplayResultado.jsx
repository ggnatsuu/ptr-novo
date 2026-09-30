// 🎯 src/components/SecaoReplayResultado.jsx
// Bloco do replay embaixo da tabela de Resultados. Treinador logado: busca
// replays_partidas/{id do resultado} e já mostra o replay pronto pro play.
// Visitante: uma pista de enfeite borrada com o convite pra entrar — os
// dados reais nem são baixados (a regra do Firestore só libera pra logados).

import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buscarReplay, useUsuario } from "../utils/replayCompartilhado";

// O replay (e o decodificador da simulação) só é baixado pra quem está logado.
const ReplayCorrida = lazy(() => import("./ReplayCorrida"));
const GraficoComparativo = lazy(() => import("./GraficoComparativo"));

const ESTILO_CAIXA = {
  width: "100%",
  background: "#0d1624",
  border: "1px solid rgba(197, 160, 89, 0.2)",
  borderRadius: "8px",
  boxSizing: "border-box",
  boxShadow: "0 8px 25px rgba(0,0,0,0.5)",
};

function Aviso({ children }) {
  return (
    <div style={{ ...ESTILO_CAIXA, padding: "50px 20px", textAlign: "center", fontFamily: "'Montserrat', sans-serif", fontSize: "10pt", color: "#a4b3c6" }}>
      {children}
    </div>
  );
}

// Posições fixas dos "cavalos" da pista de enfeite (x em %, y em %).
const CAVALOS_ENFEITE = [
  [18, 78], [24, 60], [29, 84], [33, 45], [38, 70], [41, 88], [45, 55], [49, 76],
  [52, 38], [56, 64], [60, 84], [63, 50], [67, 72], [72, 58], [77, 80], [83, 66],
];

// Também usado no painel do treinador (gráficos), com altura e texto próprios.
export function ReplayBloqueado({
  altura = 460,
  titulo = "Replay exclusivo para treinadores",
  texto = "Entre na sua conta para assistir à corrida completa, com skills, duelos e posições ao vivo.",
}) {
  return (
    <div style={{ ...ESTILO_CAIXA, position: "relative", overflow: "hidden", height: `${altura}px` }}>
      {/* pista de enfeite, borrada */}
      <div style={{ position: "absolute", inset: 0, filter: "blur(7px)", opacity: 0.8 }} aria-hidden="true">
        <div style={{ position: "absolute", left: 0, right: 0, top: "14%", bottom: "14%", background: "#12301f" }} />
        <div style={{ position: "absolute", left: 0, right: 0, bottom: "14%", height: "3px", background: "#f1ead4", opacity: 0.6 }} />
        <div style={{ position: "absolute", left: "30%", width: "35%", top: "12%", height: "5px", background: "#c8e05a" }} />
        {CAVALOS_ENFEITE.map(([x, y]) => (
          <div
            key={`${x}-${y}`}
            style={{ position: "absolute", left: `${x}%`, top: `${y * 0.72 + 8}%`, width: "36px", height: "36px", borderRadius: "50%", background: "#c5a059", border: "3px solid #1bd39e", opacity: 0.85 }}
          />
        ))}
      </div>

      {/* convite */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", background: "rgba(5, 10, 18, 0.3)", textAlign: "center", padding: "20px" }}>
        <i className="fa-solid fa-lock" style={{ fontSize: "26pt", color: "#c5a059" }}></i>
        <p style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "14pt", fontWeight: 700 }}>
          {titulo}
        </p>
        <p style={{ margin: 0, fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6", fontSize: "9.5pt", maxWidth: "420px" }}>
          {texto}
        </p>
        <Link
          to="/login"
          style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "#c5a059", color: "#0b1320", borderRadius: "50px", padding: "10px 26px", fontSize: "10pt", fontWeight: 800, fontFamily: "'Montserrat', sans-serif", textDecoration: "none" }}
        >
          <i className="fa-solid fa-right-to-bracket"></i> Entrar na Área do Treinador
        </Link>
      </div>
    </div>
  );
}

function SecaoReplayResultado({ corrida, pedidoSeguir }) {
  // undefined = ainda verificando o login; null = visitante.
  const usuario = useUsuario();
  // Resultado da busca, guardado junto com o id da corrida — ao trocar de
  // corrida o que estava aqui deixa de valer e aparece "Carregando...".
  const [busca, setBusca] = useState({ id: null, dados: null, erro: "" });

  const logado = Boolean(usuario);
  useEffect(() => {
    if (!logado) return undefined;
    let cancelado = false;
    buscarReplay(corrida.id)
      .then((dados) => {
        if (cancelado) return;
        setBusca(dados
          ? { id: corrida.id, dados, erro: "" }
          : { id: corrida.id, dados: null, erro: "O replay desta corrida não está disponível." });
      })
      .catch((erro) => {
        console.error("Erro ao carregar replay:", erro);
        if (!cancelado) setBusca({ id: corrida.id, dados: null, erro: "Não foi possível carregar o replay agora. Tente novamente mais tarde." });
      });
    return () => { cancelado = true; };
  }, [corrida.id, logado]);

  if (usuario === undefined) return <Aviso>Carregando replay...</Aviso>;
  if (!usuario) return <ReplayBloqueado />;

  const atual = busca.id === corrida.id ? busca : null;
  if (!atual) return <Aviso>Carregando replay...</Aviso>;
  if (atual.erro) return <Aviso>{atual.erro}</Aviso>;

  return (
    <Suspense fallback={<Aviso>Carregando replay...</Aviso>}>
      <ReplayCorrida key={corrida.id} replay={atual.dados} pedidoSeguir={pedidoSeguir} />
      <div style={{ marginTop: "24px" }}>
        <GraficoComparativo key={`comparativo-${corrida.id}`} replay={atual.dados} />
      </div>
    </Suspense>
  );
}

export default SecaoReplayResultado;
