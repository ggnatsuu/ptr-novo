// 🎯 src/components/GraficoPosicoes.jsx
// Gráfico de posições embaixo do replay: uma linha por cavalo mostrando a
// colocação (1º no topo) ao longo da corrida. Passando o mouse numa linha
// (ou no nome à direita), ela fica em destaque. Usa a mesma simulação
// decodificada do replay (utils/replayCompartilhado.js).

import { useEffect, useMemo, useState } from "react";
import { decodificarReplay } from "../utils/replayCompartilhado";

const LARGURA = 1000;
const ESQ = 34;
const DIR = 265;
const TOPO = 16;
const PASSO = 24; // altura de cada posição
const PASSO_TEMPO = 0.5; // amostragem do gráfico, em segundos

const PALETA = [
  "#5b8def", "#ef5f91", "#1bd39e", "#f39a3d", "#b388eb", "#e2b93b", "#4aa3a9", "#e04b37", "#8fd14f",
  "#f06ec8", "#5fd4f4", "#c5a059", "#ff8a65", "#9fa8ff", "#66bb6a", "#ffd54f", "#ba68c8", "#4dd0e1",
];

function prepararPosicoes(raceData, replay) {
  const frames = raceData.frame;
  const total = frames[0].horseFrame.length;
  const resultados = raceData.horseResult;
  const infos = new Map((replay.cavalos ?? []).map((c) => [c.numero, c]));
  const ultimaChegada = Math.max(...resultados.map((r) => r.finishTimeRaw || 0));
  const tempoFim = Math.min(frames[frames.length - 1].time, ultimaChegada + 0.5);

  // Distância de cada cavalo num instante (linear entre quadros).
  let k = 0;
  const distanciasEm = (t) => {
    while (k < frames.length - 2 && frames[k + 1].time <= t) k++;
    const a = frames[k];
    const b = frames[Math.min(k + 1, frames.length - 1)];
    const f = b.time > a.time ? Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time))) : 0;
    return a.horseFrame.map((h, i) => h.distance + (b.horseFrame[i].distance - h.distance) * f);
  };

  const tempos = [];
  for (let t = 0; t < tempoFim; t += PASSO_TEMPO) tempos.push(t);
  tempos.push(tempoFim);

  const posicoes = Array.from({ length: total }, () => []);
  tempos.forEach((t) => {
    const distancias = distanciasEm(t);
    const ordem = distancias.map((d, i) => i).sort((a, b) => {
      // Quem já cruzou a linha fica na posição final.
      const ca = resultados[a].finishTimeRaw > 0 && t >= resultados[a].finishTimeRaw;
      const cb = resultados[b].finishTimeRaw > 0 && t >= resultados[b].finishTimeRaw;
      if (ca && cb) return resultados[a].finishOrder - resultados[b].finishOrder;
      if (ca !== cb) return ca ? -1 : 1;
      return distancias[b] - distancias[a];
    });
    ordem.forEach((indice, pos) => posicoes[indice].push(pos + 1));
  });

  const cavalos = Array.from({ length: total }, (_, i) => {
    const info = infos.get(i + 1) ?? {};
    return {
      indice: i,
      personagem: info.personagem ?? `#${i + 1}`,
      treinador: info.treinador ?? null,
      npc: !info.treinador,
      final: resultados[i].finishOrder + 1,
    };
  });
  // Cores fixas pelos treinadores (na ordem de chegada), NPCs em cinza.
  cavalos
    .filter((c) => !c.npc)
    .sort((a, b) => a.final - b.final)
    .forEach((c, n) => { c.cor = PALETA[n % PALETA.length]; });

  return { tempos, tempoFim, posicoes, cavalos, total };
}

function GraficoPosicoes({ replay }) {
  const [raceData, setRaceData] = useState(null);
  const [destaque, setDestaque] = useState(null);
  const [mostrarNpcs, setMostrarNpcs] = useState(true);

  useEffect(() => {
    let cancelado = false;
    decodificarReplay(replay)
      .then((dados) => { if (!cancelado) setRaceData(dados); })
      .catch((erro) => console.error("Erro ao montar o gráfico de posições:", erro));
    return () => { cancelado = true; };
  }, [replay]);

  const g = useMemo(() => (raceData ? prepararPosicoes(raceData, replay) : null), [raceData, replay]);
  if (!g) return null;

  const altura = TOPO + g.total * PASSO + 30;
  const xDe = (t) => ESQ + (t / g.tempoFim) * (LARGURA - ESQ - DIR);
  const yDe = (pos) => TOPO + (pos - 0.5) * PASSO;
  const marcas = [];
  for (let t = 0; t <= g.tempoFim; t += g.tempoFim > 100 ? 20 : 10) marcas.push(t);

  const visiveis = g.cavalos.filter((c) => mostrarNpcs || !c.npc);
  // Desenha NPCs primeiro e o destacado por último, por cima de tudo.
  const ordem = [...visiveis].sort((a, b) => Number(!a.npc) - Number(!b.npc) || Number(a.indice === destaque) - Number(b.indice === destaque));

  return (
    <div style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "18px", boxSizing: "border-box", boxShadow: "0 8px 25px rgba(0,0,0,0.5)", fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "13pt" }}>
          <i className="fa-solid fa-chart-line"></i> Positions
        </h3>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", color: "#a4b3c6", fontSize: "9pt" }}>
          <input type="checkbox" checked={mostrarNpcs} onChange={(e) => setMostrarNpcs(e.target.checked)} style={{ accentColor: "#c5a059" }} />
          Show NPCs
        </label>
      </div>

      <svg viewBox={`0 0 ${LARGURA} ${altura}`} style={{ width: "100%", display: "block" }} onMouseLeave={() => setDestaque(null)}>
        {/* grade */}
        {Array.from({ length: g.total }, (_, i) => i + 1).map((pos) => (
          <g key={`p-${pos}`}>
            <line x1={ESQ} x2={LARGURA - DIR} y1={yDe(pos)} y2={yDe(pos)} stroke="rgba(164, 179, 198, 0.07)" />
            <text x={ESQ - 8} y={yDe(pos) + 4} textAnchor="end" fill="#5f758e" fontSize="11">{pos}</text>
          </g>
        ))}
        {marcas.map((t) => (
          <g key={`t-${t}`}>
            <line x1={xDe(t)} x2={xDe(t)} y1={TOPO} y2={TOPO + g.total * PASSO} stroke="rgba(164, 179, 198, 0.07)" />
            <text x={xDe(t)} y={altura - 8} textAnchor="middle" fill="#5f758e" fontSize="11">{t}s</text>
          </g>
        ))}

        {/* linhas */}
        {ordem.map((c) => {
          const pontos = g.posicoes[c.indice].map((pos, k) => `${xDe(g.tempos[k]).toFixed(1)},${yDe(pos).toFixed(1)}`).join(" ");
          const ativo = destaque === null || destaque === c.indice;
          const cor = c.npc ? "#5f758e" : c.cor;
          return (
            <g key={c.indice} onMouseEnter={() => setDestaque(c.indice)} style={{ cursor: "pointer" }}>
              <polyline points={pontos} fill="none" stroke="transparent" strokeWidth="12" />
              <polyline
                points={pontos}
                fill="none"
                stroke={cor}
                strokeWidth={destaque === c.indice ? 4 : c.npc ? 1.5 : 2.2}
                strokeDasharray={c.npc ? "4 4" : undefined}
                strokeLinejoin="round"
                opacity={ativo ? (c.npc && destaque === null ? 0.5 : 1) : 0.12}
              />
              <text
                x={LARGURA - DIR + 10}
                y={yDe(c.final) + 4}
                fill={cor}
                fontSize="11.5"
                fontWeight={destaque === c.indice ? 800 : 600}
                opacity={ativo ? 1 : 0.35}
              >
                {`${c.final}. ${c.treinador ?? "NPC"} — ${c.personagem}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default GraficoPosicoes;
