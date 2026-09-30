// 🎯 src/components/GraficoComparativo.jsx
// Comparativo embaixo do replay: o jogador escolhe 2 ou mais cavalos e vê
// a velocidade (em cima) e o HP (embaixo) deles ao longo da corrida, lado a
// lado. Passando o mouse, uma caixinha mostra Speed e HP de cada um naquele
// instante. Usa a mesma simulação decodificada do replay
// (utils/replayCompartilhado.js).

import { useEffect, useMemo, useState } from "react";
import { decodificarReplay } from "../utils/replayCompartilhado";
import { iconeDaRoupa } from "../utils/iconeRoupa";

const LARGURA = 1000;
const ESQ = 58;
const DIR = 20;
const PASSO_TEMPO = 0.5; // amostragem, em segundos

// Os dois gráficos empilhados (mesmo eixo de tempo).
const PAINEIS = [
  { metrica: "velocidade", nome: "Speed", unidade: "km/h", topo: 20, base: 250 },
  { metrica: "hp", nome: "HP", unidade: "HP", topo: 290, base: 520 },
];
const ALTURA = 550;

const PALETA = [
  "#5b8def", "#ef5f91", "#1bd39e", "#f39a3d", "#b388eb", "#e2b93b", "#4aa3a9", "#e04b37", "#8fd14f",
  "#f06ec8", "#5fd4f4", "#c5a059", "#ff8a65", "#9fa8ff", "#66bb6a", "#ffd54f", "#ba68c8", "#4dd0e1",
];

function prepararComparativo(raceData, replay) {
  const frames = raceData.frame;
  const total = frames[0].horseFrame.length;
  const resultados = raceData.horseResult;
  const infos = new Map((replay.cavalos ?? []).map((c) => [c.numero, c]));
  const ultimaChegada = Math.max(...resultados.map((r) => r.finishTimeRaw || 0));
  const tempoFim = Math.min(frames[frames.length - 1].time, ultimaChegada + 0.5);

  // Speed e HP de todos num instante (linear entre quadros).
  let k = 0;
  const estadoEm = (t) => {
    while (k < frames.length - 2 && frames[k + 1].time <= t) k++;
    const a = frames[k];
    const b = frames[Math.min(k + 1, frames.length - 1)];
    const f = b.time > a.time ? Math.min(1, Math.max(0, (t - a.time) / (b.time - a.time))) : 0;
    return a.horseFrame.map((h, i) => {
      const hb = b.horseFrame[i];
      return {
        velocidade: ((h.speed + (hb.speed - h.speed) * f) / 100) * 3.6,
        hp: Math.max(0, h.hp + (hb.hp - h.hp) * f),
      };
    });
  };

  const tempos = [];
  for (let t = 0; t < tempoFim; t += PASSO_TEMPO) tempos.push(t);
  tempos.push(tempoFim);

  const series = Array.from({ length: total }, () => ({ velocidade: [], hp: [] }));
  tempos.forEach((t) => {
    estadoEm(t).forEach((e, i) => {
      series[i].velocidade.push(e.velocidade);
      series[i].hp.push(e.hp);
    });
  });

  const cavalos = Array.from({ length: total }, (_, i) => {
    const info = infos.get(i + 1) ?? {};
    return {
      indice: i,
      personagem: info.personagem ?? `#${i + 1}`,
      treinador: info.treinador ?? null,
      npc: !info.treinador,
      icone: iconeDaRoupa(info.cardId),
      final: resultados[i].finishOrder + 1,
      chegada: resultados[i].finishTimeRaw > 0 ? resultados[i].finishTimeRaw : null,
      cor: PALETA[resultados[i].finishOrder % PALETA.length],
    };
  });

  return { tempos, tempoFim, series, cavalos };
}

function GraficoComparativo({ replay }) {
  const [raceData, setRaceData] = useState(null);
  const [selecionados, setSelecionados] = useState(null); // null = ainda no padrão
  const [sob, setSob] = useState(null); // índice da amostra sob o mouse

  useEffect(() => {
    let cancelado = false;
    decodificarReplay(replay)
      .then((dados) => { if (!cancelado) setRaceData(dados); })
      .catch((erro) => console.error("Erro ao montar o comparativo:", erro));
    return () => { cancelado = true; };
  }, [replay]);

  const g = useMemo(() => (raceData ? prepararComparativo(raceData, replay) : null), [raceData, replay]);
  if (!g) return null;

  const porChegada = [...g.cavalos].sort((a, b) => a.final - b.final);
  const treinadores = porChegada.filter((c) => !c.npc);
  // Padrão: os 2 primeiros treinadores.
  const escolhidos = selecionados ?? treinadores.slice(0, 2).map((c) => c.indice);
  const alternar = (indice) => setSelecionados(escolhidos.includes(indice) ? escolhidos.filter((i) => i !== indice) : [...escolhidos, indice]);

  const xDe = (t) => ESQ + (t / g.tempoFim) * (LARGURA - ESQ - DIR);
  // Escala de cada painel pelos valores dos escolhidos. A velocidade não
  // começa em 0: começa logo abaixo da menor velocidade depois da largada,
  // senão as diferenças (que são de poucos km/h) somem no gráfico.
  const escalas = Object.fromEntries(PAINEIS.map((p) => {
    const valores = escolhidos.flatMap((i) => g.series[i][p.metrica]);
    const max = valores.length ? Math.max(...valores) * 1.03 : 1;
    let min = 0;
    if (p.metrica === "velocidade" && valores.length) {
      const inicio = g.tempos.findIndex((t) => t >= 5);
      const depoisDaLargada = escolhidos.flatMap((i) => g.series[i].velocidade.slice(Math.max(0, inicio)));
      min = Math.max(0, Math.floor((Math.min(...depoisDaLargada) * 0.95) / 5) * 5);
    }
    return [p.metrica, { min, max: max > min ? max : min + 1 }];
  }));
  const yDe = (painel, v) => {
    const { min, max } = escalas[painel.metrica];
    const f = Math.max(0, (v - min) / (max - min));
    return painel.base - f * (painel.base - painel.topo);
  };
  const marcaY = (painel, f) => escalas[painel.metrica].min + f * (escalas[painel.metrica].max - escalas[painel.metrica].min);

  const marcasX = [];
  for (let t = 0; t <= g.tempoFim; t += g.tempoFim > 100 ? 20 : 10) marcasX.push(t);

  function aoMover(e) {
    const matriz = e.currentTarget.getScreenCTM();
    if (!matriz) return;
    const x = (e.clientX - matriz.e) / matriz.a;
    const t = ((x - ESQ) / (LARGURA - ESQ - DIR)) * g.tempoFim;
    if (t < 0 || t > g.tempoFim) {
      setSob(null);
      return;
    }
    setSob(Math.min(g.tempos.length - 1, Math.round(t / PASSO_TEMPO)));
  }

  const linhasSob = sob !== null
    ? escolhidos
      .map((i) => ({ c: g.cavalos[i], v: g.series[i].velocidade[sob], hp: g.series[i].hp[sob] }))
      .sort((a, b) => b.v - a.v)
    : [];

  const estiloChip = (ativo, cor) => ({
    display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 10px 3px 3px", borderRadius: "20px", cursor: "pointer",
    border: `1px solid ${ativo ? cor : "rgba(164, 179, 198, 0.2)"}`, background: ativo ? `${cor}22` : "transparent",
    color: ativo ? "#f1ead4" : "#5f758e", fontSize: "8.5pt", fontWeight: 600, fontFamily: "'Montserrat', sans-serif",
  });
  const estiloBotao = {
    background: "transparent", border: "1px solid rgba(197, 160, 89, 0.3)", color: "#a4b3c6", borderRadius: "6px",
    padding: "5px 12px", fontSize: "8.5pt", fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat', sans-serif",
  };

  return (
    <div style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "18px", boxSizing: "border-box", boxShadow: "0 8px 25px rgba(0,0,0,0.5)", fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "13pt" }}>
          <i className="fa-solid fa-code-compare"></i> Comparativo — Speed e HP
        </h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => setSelecionados(treinadores.slice(0, 3).map((c) => c.indice))} style={estiloBotao}>Top 3</button>
          <button type="button" onClick={() => setSelecionados(treinadores.map((c) => c.indice))} style={estiloBotao}>Só treinadores</button>
          <button type="button" onClick={() => setSelecionados([])} style={estiloBotao}>Limpar</button>
        </div>
      </div>

      {/* escolha dos cavalos */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
        {porChegada.map((c) => {
          const ativo = escolhidos.includes(c.indice);
          return (
            <span key={c.indice} onClick={() => alternar(c.indice)} style={{ ...estiloChip(ativo, c.cor), opacity: c.npc && !ativo ? 0.6 : 1 }} title={c.personagem}>
              {c.icone
                ? <img src={c.icone} alt="" style={{ width: "22px", height: "22px" }} />
                : <span style={{ width: "22px", height: "22px", borderRadius: "50%", background: "#1b2a3f", fontSize: "7pt", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.indice + 1}</span>}
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: ativo ? c.cor : "transparent", border: `1px solid ${c.cor}` }} />
              {c.final}. {c.treinador ?? c.personagem}
            </span>
          );
        })}
      </div>

      {escolhidos.length === 0 ? (
        <p style={{ color: "#5f758e", fontSize: "9pt", fontStyle: "italic", textAlign: "center", padding: "40px 0" }}>Escolha uma ou mais personagens acima para comparar.</p>
      ) : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} style={{ width: "100%", display: "block", cursor: "crosshair" }} onMouseMove={aoMover} onMouseLeave={() => setSob(null)}>
            {PAINEIS.map((painel) => (
              <g key={painel.metrica}>
                <text x={ESQ} y={painel.topo - 6} fill="#c5a059" fontSize="11.5" fontWeight="700">{painel.nome} <tspan fill="#5f758e" fontWeight="500">({painel.unidade})</tspan></text>
                {[0, 0.25, 0.5, 0.75, 1].map((f) => (
                  <g key={f}>
                    <line x1={ESQ} x2={LARGURA - DIR} y1={yDe(painel, marcaY(painel, f))} y2={yDe(painel, marcaY(painel, f))} stroke="rgba(164, 179, 198, 0.08)" />
                    <text x={ESQ - 8} y={yDe(painel, marcaY(painel, f)) + 4} textAnchor="end" fill="#5f758e" fontSize="11">{Math.round(marcaY(painel, f))}</text>
                  </g>
                ))}
                {marcasX.map((t) => (
                  <line key={t} x1={xDe(t)} x2={xDe(t)} y1={painel.topo} y2={painel.base} stroke="rgba(164, 179, 198, 0.06)" />
                ))}
                {escolhidos.map((i) => {
                  const c = g.cavalos[i];
                  const pontos = g.series[i][painel.metrica].map((v, k) => `${xDe(g.tempos[k]).toFixed(1)},${yDe(painel, v).toFixed(1)}`).join(" ");
                  return (
                    <g key={i}>
                      <polyline points={pontos} fill="none" stroke={c.cor} strokeWidth="2.2" strokeDasharray={c.npc ? "5 4" : undefined} strokeLinejoin="round" />
                      {/* chegada de cada um: tracinho na cor dele */}
                      {c.chegada !== null && <line x1={xDe(c.chegada)} x2={xDe(c.chegada)} y1={painel.base - 8} y2={painel.base} stroke={c.cor} strokeWidth="2" />}
                    </g>
                  );
                })}
                {sob !== null && escolhidos.map((i) => (
                  <circle key={`s-${i}`} cx={xDe(g.tempos[sob])} cy={yDe(painel, g.series[i][painel.metrica][sob])} r="4.5" fill={g.cavalos[i].cor} stroke="#0b1320" strokeWidth="1.5" style={{ pointerEvents: "none" }} />
                ))}
              </g>
            ))}
            {marcasX.map((t) => (
              <text key={`x-${t}`} x={xDe(t)} y={ALTURA - 8} textAnchor="middle" fill="#5f758e" fontSize="11">{t}s</text>
            ))}
            {sob !== null && (
              <line x1={xDe(g.tempos[sob])} x2={xDe(g.tempos[sob])} y1={PAINEIS[0].topo} y2={PAINEIS[PAINEIS.length - 1].base} stroke="#f1ead4" strokeDasharray="3 3" opacity="0.6" style={{ pointerEvents: "none" }} />
            )}
          </svg>

          {sob !== null && (
            <div
              style={{
                position: "absolute",
                top: "6%",
                ...(xDe(g.tempos[sob]) / LARGURA > 0.6 ? { right: `${(1 - xDe(g.tempos[sob]) / LARGURA) * 100 + 1.5}%` } : { left: `${(xDe(g.tempos[sob]) / LARGURA) * 100 + 1.5}%` }),
                background: "rgba(11, 19, 32, 0.96)", border: "1px solid rgba(197, 160, 89, 0.5)", borderRadius: "8px", padding: "8px 12px",
                fontSize: "8.5pt", color: "#a4b3c6", pointerEvents: "none", boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", gap: "10px", color: "#f1ead4", fontWeight: 800, marginBottom: "4px" }}>
                <span style={{ flex: 1 }}>{g.tempos[sob].toFixed(1)}s</span>
                <span style={{ width: "74px", textAlign: "right", color: "#5f758e" }}>Speed</span>
                <span style={{ width: "56px", textAlign: "right", color: "#5f758e" }}>HP</span>
              </div>
              {linhasSob.map(({ c, v, hp }) => (
                <div key={c.indice} style={{ display: "flex", alignItems: "center", gap: "10px", lineHeight: 1.7 }}>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.cor }} />
                    {c.treinador ?? "NPC"} — {c.personagem}
                  </span>
                  <strong style={{ width: "74px", textAlign: "right", color: "#f1ead4", fontFamily: "'Courier New', monospace" }}>{v.toFixed(1)}</strong>
                  <strong style={{ width: "56px", textAlign: "right", color: "#f1ead4", fontFamily: "'Courier New', monospace" }}>{Math.round(hp)}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default GraficoComparativo;
