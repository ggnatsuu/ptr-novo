// 🎯 src/components/GraficoComparativo.jsx
// Comparativo embaixo do replay: o jogador escolhe 2 ou mais cavalos e vê
// a velocidade (em cima) e o HP (embaixo) deles ao longo da corrida, com as
// fases da corrida no fundo e a chegada de cada um marcada no fim da linha.
// Passando o mouse, uma caixinha mostra Speed e HP de cada um naquele
// instante. Usa a mesma simulação decodificada do replay
// (utils/replayCompartilhado.js).

import { useEffect, useMemo, useState } from "react";
import { decodificarReplay } from "../utils/replayCompartilhado";
import { iconeDaRoupa } from "../utils/iconeRoupa";
import { caminhoSuave, escalaBonita } from "../utils/graficos";

const LARGURA = 1000;
const ESQ = 52;
const DIR = 118; // espaço pras bandeirinhas de chegada
const PASSO_TEMPO = 0.5; // amostragem, em segundos

// Os dois gráficos empilhados (mesmo eixo de tempo).
const PAINEIS = [
  { metrica: "velocidade", nome: "Speed", unidade: "km/h", topo: 34, base: 264 },
  { metrica: "hp", nome: "HP", unidade: "", topo: 306, base: 506 },
];
const ALTURA = 536;

const PALETA = [
  "#5b8def", "#ef5f91", "#1bd39e", "#f39a3d", "#b388eb", "#e2b93b", "#4aa3a9", "#e04b37", "#8fd14f",
  "#f06ec8", "#5fd4f4", "#c5a059", "#ff8a65", "#9fa8ff", "#66bb6a", "#ffd54f", "#ba68c8", "#4dd0e1",
];

const ORDINAL = (n) => `${n}º`;
const formatarTempo = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function prepararComparativo(raceData, replay) {
  const frames = raceData.frame;
  const total = frames[0].horseFrame.length;
  const resultados = raceData.horseResult;
  const infos = new Map((replay.cavalos ?? []).map((c) => [c.numero, c]));
  const ultimaChegada = Math.max(...resultados.map((r) => r.finishTimeRaw || 0));
  const tempoFim = Math.min(frames[frames.length - 1].time, ultimaChegada + 0.5);
  const distancia = replay.condicoes?.distancia ?? null;

  // Estado de um cavalo num instante qualquer (linear entre quadros).
  const estadoEm = (i, t) => {
    let lo = 0;
    let hi = frames.length - 1;
    while (hi - lo > 1) {
      const meio = (lo + hi) >> 1;
      if (frames[meio].time <= t) lo = meio;
      else hi = meio;
    }
    const a = frames[lo].horseFrame[i];
    const b = frames[hi].horseFrame[i];
    const f = frames[hi].time > frames[lo].time ? Math.min(1, Math.max(0, (t - frames[lo].time) / (frames[hi].time - frames[lo].time))) : 0;
    return {
      d: a.distance + (b.distance - a.distance) * f,
      velocidade: ((a.speed + (b.speed - a.speed) * f) / 100) * 3.6,
      hp: Math.max(0, a.hp + (b.hp - a.hp) * f),
    };
  };

  const tempos = [];
  for (let t = 0; t < tempoFim; t += PASSO_TEMPO) tempos.push(t);
  tempos.push(tempoFim);

  // Série de cada cavalo até a chegada dele (com um ponto exatamente nela).
  const cavalos = Array.from({ length: total }, (_, i) => {
    const info = infos.get(i + 1) ?? {};
    const chegada = resultados[i].finishTimeRaw > 0 ? resultados[i].finishTimeRaw : null;
    const instantes = tempos.filter((t) => chegada === null || t < chegada);
    if (chegada !== null) instantes.push(chegada);
    const pontos = instantes.map((t) => ({ t, ...estadoEm(i, t) }));
    return {
      indice: i,
      personagem: info.personagem ?? `#${i + 1}`,
      treinador: info.treinador ?? null,
      npc: !info.treinador,
      icone: iconeDaRoupa(info.cardId),
      final: resultados[i].finishOrder + 1,
      chegada,
      pontos,
      cor: PALETA[resultados[i].finishOrder % PALETA.length],
    };
  });

  // Fases da corrida pelo tempo em que o primeiro cavalo passou por elas.
  const primeiroEm = (metros) => {
    for (const t of tempos) {
      if (cavalos.some((c) => estadoEm(c.indice, t).d >= metros)) return t;
    }
    return null;
  };
  const fases = distancia
    ? [
      { nome: "Early", inicio: 0 },
      { nome: "Mid", inicio: primeiroEm(distancia / 6) },
      { nome: "Late", inicio: primeiroEm(replay.inicioFaseFinal ?? (distancia * 2) / 3) },
      { nome: "Last Spurt", inicio: primeiroEm((distancia * 5) / 6) },
    ].filter((f) => f.inicio !== null)
    : [];

  return { tempos, tempoFim, cavalos, fases };
}

// Valor do cavalo no instante t (null depois da chegada).
function valorEm(cavalo, metrica, t) {
  const p = cavalo.pontos;
  if (!p.length || t > p[p.length - 1].t + 0.01) return null;
  let k = 0;
  while (k < p.length - 1 && p[k + 1].t <= t) k++;
  const a = p[k];
  const b = p[Math.min(k + 1, p.length - 1)];
  const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
  return a[metrica] + (b[metrica] - a[metrica]) * Math.min(1, Math.max(0, f));
}

function GraficoComparativo({ replay }) {
  const [raceData, setRaceData] = useState(null);
  const [selecionados, setSelecionados] = useState(null); // null = ainda no padrão
  const [mostrarNpcs, setMostrarNpcs] = useState(false);
  const [sob, setSob] = useState(null); // instante (s) sob o mouse

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
  const npcs = porChegada.filter((c) => c.npc);
  // Padrão: os 2 primeiros treinadores.
  const escolhidos = selecionados ?? treinadores.slice(0, 2).map((c) => c.indice);
  const alternar = (indice) => setSelecionados(escolhidos.includes(indice) ? escolhidos.filter((i) => i !== indice) : [...escolhidos, indice]);
  const cavalosEscolhidos = escolhidos.map((i) => g.cavalos[i]);

  // O eixo de tempo vai até a chegada da última personagem ESCOLHIDA (e não
  // da corrida toda), pra linha chegar até o fim do gráfico.
  const tempoGrafico = cavalosEscolhidos.length && cavalosEscolhidos.every((c) => c.chegada !== null)
    ? Math.max(...cavalosEscolhidos.map((c) => c.chegada))
    : g.tempoFim;
  const xDe = (t) => ESQ + (t / tempoGrafico) * (LARGURA - ESQ - DIR);

  // Escala de cada painel. A velocidade começa logo abaixo da menor
  // velocidade depois da largada, senão as diferenças (de poucos km/h) somem.
  const escalas = Object.fromEntries(PAINEIS.map((painel) => {
    const valores = cavalosEscolhidos.flatMap((c) => c.pontos.map((p) => p[painel.metrica]));
    if (!valores.length) return [painel.metrica, escalaBonita(0, 1)];
    const max = Math.max(...valores);
    let min = 0;
    if (painel.metrica === "velocidade") {
      const depoisDaLargada = cavalosEscolhidos.flatMap((c) => c.pontos.filter((p) => p.t >= 5).map((p) => p.velocidade));
      min = depoisDaLargada.length ? Math.min(...depoisDaLargada) * 0.97 : 0;
    }
    return [painel.metrica, escalaBonita(min, max)];
  }));
  const yDe = (painel, v) => {
    const { min, max } = escalas[painel.metrica];
    const f = Math.min(1, Math.max(0, (v - min) / (max - min || 1)));
    return painel.base - f * (painel.base - painel.topo);
  };

  const marcasX = [];
  for (let t = 0; t <= tempoGrafico; t += tempoGrafico > 100 ? 20 : 10) marcasX.push(t);

  // Bandeirinhas de chegada (no painel de Speed), afastadas pra não se sobreporem.
  const painelSpeed = PAINEIS[0];
  const bandeiras = cavalosEscolhidos
    .filter((c) => c.chegada !== null)
    .map((c) => ({ c, x: xDe(c.chegada), y: yDe(painelSpeed, c.pontos[c.pontos.length - 1].velocidade) }))
    .sort((a, b) => a.y - b.y);
  bandeiras.forEach((b, i) => {
    b.yTexto = i === 0 ? Math.max(b.y, painelSpeed.topo + 6) : Math.max(b.y, bandeiras[i - 1].yTexto + 17);
  });

  function aoMover(e) {
    const matriz = e.currentTarget.getScreenCTM();
    if (!matriz) return;
    const x = (e.clientX - matriz.e) / matriz.a;
    const t = ((x - ESQ) / (LARGURA - ESQ - DIR)) * tempoGrafico;
    setSob(t < 0 || t > tempoGrafico ? null : Math.min(tempoGrafico, Math.round(t / PASSO_TEMPO) * PASSO_TEMPO));
  }

  const linhasSob = sob !== null
    ? cavalosEscolhidos
      .map((c) => ({ c, v: valorEm(c, "velocidade", sob), hp: valorEm(c, "hp", sob) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.c.final - b.c.final;
        if (a.v === null) return -1;
        if (b.v === null) return 1;
        return b.v - a.v;
      })
    : [];

  const estiloChip = (ativo, cor) => ({
    display: "inline-flex", alignItems: "center", gap: "7px", padding: "3px 12px 3px 3px", borderRadius: "20px", cursor: "pointer",
    border: `1px solid ${ativo ? cor : "rgba(164, 179, 198, 0.15)"}`, background: ativo ? `${cor}26` : "rgba(11, 19, 32, 0.6)",
    color: ativo ? "#f1ead4" : "#8193a8", fontSize: "9pt", fontWeight: 600, fontFamily: "'Montserrat', sans-serif", transition: "all 0.15s",
  });
  const estiloBotao = {
    background: "transparent", border: "1px solid rgba(197, 160, 89, 0.3)", color: "#a4b3c6", borderRadius: "6px",
    padding: "5px 12px", fontSize: "8.5pt", fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat', sans-serif",
  };
  const chip = (c) => {
    const ativo = escolhidos.includes(c.indice);
    return (
      <span key={c.indice} onClick={() => alternar(c.indice)} style={estiloChip(ativo, c.cor)} title={`${c.personagem}${c.treinador ? ` — ${c.treinador}` : ""}`}>
        {c.icone
          ? <img src={c.icone} alt="" style={{ width: "24px", height: "24px", opacity: ativo ? 1 : 0.55 }} />
          : <span style={{ width: "24px", height: "24px", borderRadius: "50%", background: "#1b2a3f", fontSize: "7.5pt", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.indice + 1}</span>}
        <span style={{ color: ativo ? c.cor : "#5f758e", fontWeight: 800 }}>{ORDINAL(c.final)}</span>
        {c.treinador ?? c.personagem}
      </span>
    );
  };

  return (
    <div style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "18px", boxSizing: "border-box", boxShadow: "0 8px 25px rgba(0,0,0,0.5)", fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "12px" }}>
        <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "13pt" }}>
          <i className="fa-solid fa-code-compare"></i> Comparativo — Speed e HP
        </h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button type="button" onClick={() => setSelecionados(treinadores.slice(0, 3).map((c) => c.indice))} style={estiloBotao}>Top 3</button>
          <button type="button" onClick={() => setSelecionados(treinadores.map((c) => c.indice))} style={estiloBotao}>Todos os treinadores</button>
          <button type="button" onClick={() => setSelecionados([])} style={estiloBotao}>Limpar</button>
        </div>
      </div>

      {/* escolha dos cavalos: treinadores sempre à mostra, NPCs recolhidos */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px", alignItems: "center" }}>
        {treinadores.map(chip)}
        {npcs.length > 0 && (
          mostrarNpcs
            ? npcs.map(chip)
            : (
              <button type="button" onClick={() => setMostrarNpcs(true)} style={{ ...estiloBotao, borderStyle: "dashed", borderRadius: "20px" }}>
                + NPCs ({npcs.length})
              </button>
            )
        )}
      </div>

      {escolhidos.length === 0 ? (
        <p style={{ color: "#5f758e", fontSize: "9.5pt", fontStyle: "italic", textAlign: "center", padding: "40px 0" }}>Escolha uma ou mais personagens acima para comparar.</p>
      ) : (
        <div style={{ position: "relative" }}>
          <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} style={{ width: "100%", display: "block", cursor: "crosshair", overflow: "visible" }} onMouseMove={aoMover} onMouseLeave={() => setSob(null)}>
            <defs>
              {cavalosEscolhidos.map((c) => (
                <linearGradient key={c.indice} id={`comp-area-${c.indice}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.cor} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={c.cor} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>

            {PAINEIS.map((painel) => (
              <g key={painel.metrica}>
                {/* fases da corrida no fundo */}
                {g.fases.filter((f) => f.inicio < tempoGrafico).map((f, i, fases) => {
                  const fim = Math.min(fases[i + 1]?.inicio ?? tempoGrafico, tempoGrafico);
                  return (
                    <g key={f.nome}>
                      <rect x={xDe(f.inicio)} y={painel.topo} width={Math.max(0, xDe(fim) - xDe(f.inicio))} height={painel.base - painel.topo} fill={i % 2 ? "rgba(197, 160, 89, 0.035)" : "rgba(164, 179, 198, 0.02)"} />
                      {i > 0 && <line x1={xDe(f.inicio)} x2={xDe(f.inicio)} y1={painel.topo} y2={painel.base} stroke="rgba(197, 160, 89, 0.25)" strokeDasharray="4 4" />}
                      {painel === painelSpeed && (
                        <text x={xDe(f.inicio) + 6} y={painel.topo + 14} fill="rgba(197, 160, 89, 0.7)" fontSize="10.5" fontWeight="700" letterSpacing="0.5">{f.nome.toUpperCase()}</text>
                      )}
                    </g>
                  );
                })}

                {/* título e grade */}
                <text x={ESQ} y={painel.topo - 10} fill="#f1ead4" fontSize="13" fontWeight="800">
                  {painel.nome}{painel.unidade && <tspan fill="#5f758e" fontWeight="500" fontSize="11">{`  ${painel.unidade}`}</tspan>}
                </text>
                {escalas[painel.metrica].marcas.map((v) => (
                  <g key={v}>
                    <line x1={ESQ} x2={LARGURA - DIR} y1={yDe(painel, v)} y2={yDe(painel, v)} stroke="rgba(164, 179, 198, 0.09)" />
                    <text x={ESQ - 8} y={yDe(painel, v) + 4} textAnchor="end" fill="#5f758e" fontSize="11">{v.toLocaleString("en-US")}</text>
                  </g>
                ))}

                {/* áreas e linhas */}
                {cavalosEscolhidos.map((c) => {
                  const pontos = c.pontos.map((p) => [xDe(p.t), yDe(painel, p[painel.metrica])]);
                  const linha = caminhoSuave(pontos);
                  const ultimo = pontos[pontos.length - 1];
                  return (
                    <g key={c.indice}>
                      {cavalosEscolhidos.length <= 2 && (
                        <path d={`${linha}L${ultimo[0].toFixed(1)},${painel.base}L${pontos[0][0].toFixed(1)},${painel.base}Z`} fill={`url(#comp-area-${c.indice})`} />
                      )}
                      <path d={linha} fill="none" stroke={c.cor} strokeWidth="2.4" strokeDasharray={c.npc ? "6 4" : undefined} strokeLinecap="round" />
                      {c.chegada !== null && <circle cx={ultimo[0]} cy={ultimo[1]} r="4" fill={c.cor} stroke="#0d1624" strokeWidth="1.5" />}
                    </g>
                  );
                })}

                {/* bolinhas do instante sob o mouse */}
                {sob !== null && cavalosEscolhidos.map((c) => {
                  const v = valorEm(c, painel.metrica, sob);
                  return v === null ? null : <circle key={`s-${c.indice}`} cx={xDe(sob)} cy={yDe(painel, v)} r="5" fill={c.cor} stroke="#0d1624" strokeWidth="2" style={{ pointerEvents: "none" }} />;
                })}
              </g>
            ))}

            {/* bandeirinhas de chegada: posição e tempo */}
            {bandeiras.map(({ c, x, y, yTexto }) => (
              <g key={`b-${c.indice}`} style={{ pointerEvents: "none" }}>
                {Math.abs(yTexto - y) > 2 && <line x1={x} y1={y} x2={x + 8} y2={yTexto} stroke={c.cor} strokeWidth="1" opacity="0.6" />}
                <text x={x + 10} y={yTexto + 4} fill={c.cor} fontSize="11" fontWeight="800">
                  {`🏁 ${ORDINAL(c.final)}`}
                  <tspan fill="#8193a8" fontWeight="600">{` ${formatarTempo(c.chegada)}`}</tspan>
                </text>
              </g>
            ))}

            {marcasX.map((t) => (
              <text key={`x-${t}`} x={xDe(t)} y={ALTURA - 8} textAnchor="middle" fill="#5f758e" fontSize="11">{t}s</text>
            ))}
            {sob !== null && (
              <line x1={xDe(sob)} x2={xDe(sob)} y1={PAINEIS[0].topo} y2={PAINEIS[PAINEIS.length - 1].base} stroke="#f1ead4" strokeDasharray="3 3" opacity="0.5" style={{ pointerEvents: "none" }} />
            )}
          </svg>

          {sob !== null && (
            <div
              style={{
                position: "absolute",
                top: "8%",
                ...(xDe(sob) / LARGURA > 0.55 ? { right: `${(1 - xDe(sob) / LARGURA) * 100 + 1.5}%` } : { left: `${(xDe(sob) / LARGURA) * 100 + 1.5}%` }),
                background: "rgba(11, 19, 32, 0.96)", border: "1px solid rgba(197, 160, 89, 0.5)", borderRadius: "8px", padding: "8px 12px",
                fontSize: "9pt", color: "#a4b3c6", pointerEvents: "none", boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ display: "flex", gap: "10px", color: "#f1ead4", fontWeight: 800, marginBottom: "4px" }}>
                <span style={{ flex: 1 }}>{formatarTempo(sob)}</span>
                <span style={{ width: "76px", textAlign: "right", color: "#5f758e" }}>Speed</span>
                <span style={{ width: "56px", textAlign: "right", color: "#5f758e" }}>HP</span>
              </div>
              {linhasSob.map(({ c, v, hp }) => (
                <div key={c.indice} style={{ display: "flex", alignItems: "center", gap: "10px", lineHeight: 1.75 }}>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>
                    <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: c.cor }} />
                    {c.treinador ?? "NPC"} <span style={{ color: "#5f758e" }}>— {c.personagem}</span>
                  </span>
                  {v === null ? (
                    <strong style={{ width: "142px", textAlign: "right", color: c.cor }}>🏁 {ORDINAL(c.final)} • {formatarTempo(c.chegada)}</strong>
                  ) : (
                    <>
                      <strong style={{ width: "76px", textAlign: "right", color: "#f1ead4", fontFamily: "'Courier New', monospace" }}>{v.toFixed(1)}</strong>
                      <strong style={{ width: "56px", textAlign: "right", color: "#f1ead4", fontFamily: "'Courier New', monospace" }}>{Math.round(hp)}</strong>
                    </>
                  )}
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
