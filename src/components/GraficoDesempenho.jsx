// 🎯 src/components/GraficoDesempenho.jsx
// Gráfico de desempenho de um cavalo na corrida (inspirado no do Hakuraku):
// em cima, velocidade e HP ao longo do tempo, com as skills ativadas, os
// trechos bloqueados, o início do last spurt e a chegada; embaixo, quanto a
// velocidade e o HP mudaram de um ponto pro outro. Passando o mouse, uma
// caixinha mostra os números daquele instante.

import { useMemo, useState } from "react";
import { nomeDaSkill } from "../utils/replayCorrida";

const LARGURA = 1000;
const ESQ = 58;
const DIR = 58;
const TOPO_A = 28; // gráfico de cima
const BASE_A = 300;
const TOPO_B = 336; // gráfico de baixo
const BASE_B = 450;
const ALTURA = 480;

const COR = {
  speed: "#5b8def",
  hp: "#c8e05a",
  dSpeed: "#a4b3c6",
  dHp: "#f39c52",
  grade: "rgba(164, 179, 198, 0.1)",
  texto: "#5f758e",
  // cavalo escolhido em "Compare with" (linhas tracejadas)
  speed2: "#ef5f91",
  hp2: "#4dd0e1",
};

const FAIXAS = {
  paceUp: { cor: "#5dade2", nome: "Pace Up" },
  paceDown: { cor: "#b388eb", nome: "Pace Down" },
  downhill: { cor: "#4aa3a9", nome: "Downhill" },
  rushed: { cor: "#e04b37", nome: "Rushed" },
};

const TIPO_SKILL = 3;

const fmt = (n, casas = 0) => n.toLocaleString("en-US", { minimumFractionDigits: casas, maximumFractionDigits: casas });

// "Arredonda pra cima" num passo bonito pra escala do eixo.
function tetoBonito(valor) {
  if (valor <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  const passo = [1, 2, 2.5, 5, 10].find((p) => p * potencia >= valor);
  return passo * potencia;
}

// Tempo em que o cavalo passou por uma certa distância (interpolado).
function tempoNaDistancia(pontos, metros) {
  for (let k = 1; k < pontos.length; k++) {
    const a = pontos[k - 1];
    const b = pontos[k];
    if (a.d <= metros && b.d >= metros) {
      const fracao = b.d > a.d ? (metros - a.d) / (b.d - a.d) : 0;
      return a.t + fracao * (b.t - a.t);
    }
  }
  return null;
}

function prepararGrafico(raceData, replay, numero) {
  const indice = numero - 1;
  const pontos = raceData.frame.map((f) => {
    const h = f.horseFrame[indice];
    return {
      t: f.time,
      d: h.distance,
      v: h.speed / 100, // m/s
      hp: h.hp,
      bloq: h.blockFrontHorseIndex ?? -1,
      rushed: (h.temptationMode ?? 0) > 0,
    };
  });
  pontos.forEach((p, k) => {
    p.dv = k ? p.v - pontos[k - 1].v : 0;
    p.dhp = k ? p.hp - pontos[k - 1].hp : 0;
  });

  const cavalos = new Map((replay.cavalos ?? []).map((c) => [c.numero, c]));
  const nomeCavalo = (i) => {
    const c = cavalos.get(i + 1);
    return c ? `#${i + 1} ${c.personagem}${c.treinador ? ` [${c.treinador}]` : ""}` : `#${i + 1}`;
  };

  // Trechos bloqueados: quadros seguidos com alguém na frente.
  const bloqueios = [];
  pontos.forEach((p, k) => {
    const ultimo = bloqueios[bloqueios.length - 1];
    if (p.bloq >= 0 && ultimo && ultimo.aberto && ultimo.por === p.bloq) {
      ultimo.fim = p.t;
    } else {
      if (ultimo) ultimo.aberto = false;
      if (p.bloq >= 0) bloqueios.push({ inicio: k ? pontos[k - 1].t : p.t, fim: p.t, por: p.bloq, nome: nomeCavalo(p.bloq), aberto: true });
    }
  });

  // Faixas coloridas: pace up / pace down / downhill (vêm em metros do
  // upload) e rushed (direto da simulação).
  const faixas = [];
  (cavalos.get(numero)?.modos ?? []).forEach((m) => {
    const inicio = tempoNaDistancia(pontos, m.inicio);
    const fim = tempoNaDistancia(pontos, m.fim);
    if (inicio !== null && fim !== null && fim > inicio) faixas.push({ tipo: m.tipo, inicio, fim, di: m.inicio, df: m.fim });
  });
  pontos.forEach((p, k) => {
    if (!p.rushed) return;
    const ultima = faixas[faixas.length - 1];
    const antes = k ? pontos[k - 1].t : p.t;
    if (ultima && ultima.tipo === "rushed" && ultima.fim >= antes) ultima.fim = p.t;
    else faixas.push({ tipo: "rushed", inicio: antes, fim: p.t });
  });

  const skills = raceData.event
    .map(({ event }) => event)
    .filter((e) => e && e.type === TIPO_SKILL && e.param?.[0] === indice)
    .map((e) => ({ t: e.frameTime, nome: nomeDaSkill(e.param[1]) }))
    .sort((a, b) => a.t - b.t);

  const resultado = raceData.horseResult[indice];
  const lastSpurt = resultado?.lastSpurtStartDistance > 0 ? tempoNaDistancia(pontos, resultado.lastSpurtStartDistance) : null;
  const chegada = resultado?.finishTimeRaw > 0 ? resultado.finishTimeRaw : null;

  const tempoMax = pontos[pontos.length - 1].t;
  // Topo dos eixos em múltiplos de 4, pra cada quarto da grade dar um número redondo.
  const vMax = Math.ceil((Math.max(...pontos.map((p) => p.v)) * 1.05) / 4) * 4;
  const hpInicial = pontos[0].hp || 1;
  const hpMax = Math.ceil((Math.max(...pontos.map((p) => p.hp)) * 1.05) / 400) * 400;
  const dvMax = tetoBonito(Math.max(...pontos.map((p) => Math.abs(p.dv))));
  const dhpMax = tetoBonito(Math.max(...pontos.map((p) => Math.abs(p.dhp))));

  return { pontos, bloqueios, faixas, skills, lastSpurt, chegada, tempoMax, vMax, hpMax, hpInicial, dvMax, dhpMax };
}

function GraficoDesempenho({ raceData, replay, numero }) {
  const g = useMemo(() => prepararGrafico(raceData, replay, numero), [raceData, replay, numero]);
  const [sob, setSob] = useState(null); // índice do ponto sob o mouse

  // "Compare with": outro cavalo sobreposto (Speed e HP tracejados).
  const [comparar, setComparar] = useState(null);
  const g2 = useMemo(() => (comparar ? prepararGrafico(raceData, replay, comparar) : null), [raceData, replay, comparar]);
  const vMax = Math.max(g.vMax, g2?.vMax ?? 0);
  const hpMax = Math.max(g.hpMax, g2?.hpMax ?? 0);
  const outros = (replay.cavalos ?? [])
    .filter((c) => c.numero !== numero)
    .sort((a, b) => Number(!a.treinador) - Number(!b.treinador) || (a.posicao ?? 99) - (b.posicao ?? 99));
  const nomeComparado = (() => {
    const c = (replay.cavalos ?? []).find((x) => x.numero === comparar);
    return c ? `${c.treinador ?? "NPC"} — ${c.personagem}` : "";
  })();

  const xDe = (t) => ESQ + (t / g.tempoMax) * (LARGURA - ESQ - DIR);
  const yV = (v) => BASE_A - (v / vMax) * (BASE_A - TOPO_A);
  const yHp = (hp) => BASE_A - (hp / hpMax) * (BASE_A - TOPO_A);
  const meioB = (TOPO_B + BASE_B) / 2;
  const yDv = (dv) => meioB - (dv / g.dvMax) * ((BASE_B - TOPO_B) / 2);
  const yDhp = (dhp) => meioB - (dhp / g.dhpMax) * ((BASE_B - TOPO_B) / 2);

  const linha = (fx, fy) => g.pontos.map((p) => `${fx(p).toFixed(1)},${fy(p).toFixed(1)}`).join(" ");

  const passoTempo = g.tempoMax > 100 ? 20 : 10;
  const marcasTempo = [];
  for (let t = 0; t <= g.tempoMax; t += passoTempo) marcasTempo.push(t);
  const fracoes = [0, 0.25, 0.5, 0.75, 1];

  function aoMover(e) {
    const matriz = e.currentTarget.getScreenCTM();
    if (!matriz) return;
    const x = (e.clientX - matriz.e) / matriz.a;
    const t = ((x - ESQ) / (LARGURA - ESQ - DIR)) * g.tempoMax;
    if (t < 0 || t > g.tempoMax) {
      setSob(null);
      return;
    }
    let melhor = 0;
    g.pontos.forEach((p, k) => {
      if (Math.abs(p.t - t) < Math.abs(g.pontos[melhor].t - t)) melhor = k;
    });
    setSob(melhor);
  }

  const p = sob !== null ? g.pontos[sob] : null;
  const p2 = sob !== null && g2 ? g2.pontos[sob] : null; // mesmos quadros, mesmo índice
  const faixasAtivas = p ? g.faixas.filter((f) => p.t >= f.inicio && p.t <= f.fim).map((f) => f.tipo) : [];
  const bloqueioAtivo = p && p.bloq >= 0 ? g.bloqueios.find((b) => p.t >= b.inicio && p.t <= b.fim) : null;

  return (
    <div style={{ position: "relative", fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginBottom: "6px", fontSize: "9pt", color: "#a4b3c6" }}>
        <i className="fa-solid fa-code-compare" style={{ color: "#c5a059" }}></i>
        Compare with
        <select
          value={comparar ?? ""}
          onChange={(e) => setComparar(e.target.value ? Number(e.target.value) : null)}
          style={{ background: "#0d1624", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.4)", borderRadius: "6px", padding: "4px 8px", fontFamily: "'Montserrat', sans-serif", fontSize: "9pt", maxWidth: "280px" }}
        >
          <option value="">—</option>
          {outros.map((c) => (
            <option key={c.numero} value={c.numero}>
              {c.posicao ? `${c.posicao}. ` : ""}{c.treinador ?? "NPC"} — {c.personagem}
            </option>
          ))}
        </select>
      </div>
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        style={{ width: "100%", display: "block", cursor: "crosshair" }}
        onMouseMove={aoMover}
        onMouseLeave={() => setSob(null)}
      >
        {/* grades e eixos */}
        {fracoes.map((f) => (
          <g key={`ga-${f}`}>
            <line x1={ESQ} x2={LARGURA - DIR} y1={BASE_A - f * (BASE_A - TOPO_A)} y2={BASE_A - f * (BASE_A - TOPO_A)} stroke={COR.grade} />
            <text x={ESQ - 6} y={BASE_A - f * (BASE_A - TOPO_A) + 4} textAnchor="end" fill={COR.speed} fontSize="11">{fmt(f * vMax, vMax < 10 ? 1 : 0)}</text>
            <text x={LARGURA - DIR + 6} y={BASE_A - f * (BASE_A - TOPO_A) + 4} fill={COR.hp} fontSize="11">{fmt(f * hpMax)}</text>
          </g>
        ))}
        {[-1, -0.5, 0, 0.5, 1].map((f) => (
          <g key={`gb-${f}`}>
            <line x1={ESQ} x2={LARGURA - DIR} y1={yDv(f * g.dvMax)} y2={yDv(f * g.dvMax)} stroke={f === 0 ? "rgba(164, 179, 198, 0.35)" : COR.grade} />
            <text x={ESQ - 6} y={yDv(f * g.dvMax) + 4} textAnchor="end" fill={COR.dSpeed} fontSize="11">{fmt(f * g.dvMax, g.dvMax < 10 ? 1 : 0)}</text>
            <text x={LARGURA - DIR + 6} y={yDhp(f * g.dhpMax) + 4} fill={COR.dHp} fontSize="11">{fmt(f * g.dhpMax)}</text>
          </g>
        ))}
        {marcasTempo.map((t) => (
          <g key={`t-${t}`}>
            <line x1={xDe(t)} x2={xDe(t)} y1={TOPO_A} y2={BASE_A} stroke={COR.grade} />
            <line x1={xDe(t)} x2={xDe(t)} y1={TOPO_B} y2={BASE_B} stroke={COR.grade} />
            <text x={xDe(t)} y={BASE_A + 16} textAnchor="middle" fill={COR.texto} fontSize="11">{t}s</text>
            <text x={xDe(t)} y={BASE_B + 16} textAnchor="middle" fill={COR.texto} fontSize="11">{t}s</text>
          </g>
        ))}
        <text x={ESQ - 6} y={TOPO_A - 14} textAnchor="end" fill={COR.speed} fontSize="10.5" fontWeight="700">m/s</text>
        <text x={LARGURA - DIR + 6} y={TOPO_A - 14} fill={COR.hp} fontSize="10.5" fontWeight="700">HP</text>

        {/* faixas de pace up / pace down / downhill / rushed, logo acima do gráfico */}
        {g.faixas.map((f, k) => (
          <rect key={`f-${k}`} x={xDe(f.inicio)} y={TOPO_A - 8 + (f.tipo === "downhill" || f.tipo === "rushed" ? 4 : 0)} width={Math.max(1.5, xDe(f.fim) - xDe(f.inicio))} height="4" fill={FAIXAS[f.tipo].cor} />
        ))}

        {/* trechos bloqueados */}
        {g.bloqueios.map((b, k) => (
          <g key={`b-${k}`}>
            <rect x={xDe(b.inicio)} y={TOPO_A} width={Math.max(3, xDe(b.fim) - xDe(b.inicio))} height={BASE_A - TOPO_A} fill="rgba(224, 75, 55, 0.22)" />
            <text transform={`translate(${xDe((b.inicio + b.fim) / 2) - 4}, ${TOPO_A + 6}) rotate(90)`} fill="#e8836f" fontSize="10.5">{`Blocked by ${b.nome}`}</text>
          </g>
        ))}

        {/* skills (nomes que cairiam no mesmo ponto vão sendo afastados pra direita) */}
        {g.skills.reduce((lista, s) => {
          const anterior = lista[lista.length - 1];
          const xTexto = Math.max(xDe(s.t) + 4, anterior ? anterior.xTexto + 12 : 0);
          return [...lista, { ...s, xTexto }];
        }, []).map((s, k) => (
          <g key={`s-${k}`}>
            <line x1={xDe(s.t)} x2={xDe(s.t)} y1={TOPO_A} y2={BASE_A} stroke="rgba(241, 234, 212, 0.35)" />
            <text transform={`translate(${s.xTexto + 3.5}, ${BASE_A - 6}) rotate(-90)`} fill="#f1ead4" fontSize="10.5">{s.nome}</text>
          </g>
        ))}

        {/* last spurt e chegada */}
        {[[g.lastSpurt, "Last Spurt"], [g.chegada, "Goal In"]].map(([t, nome]) => t !== null && (
          <g key={nome}>
            <line x1={xDe(t)} x2={xDe(t)} y1={TOPO_A - 12} y2={BASE_B} stroke="#c5a059" strokeDasharray="5 4" />
            <text x={xDe(t)} y={TOPO_A - 16} textAnchor="middle" fill="#c5a059" fontSize="11" fontWeight="700">{nome}</text>
          </g>
        ))}

        {/* linhas */}
        {g2 && (
          <>
            <polyline points={g2.pontos.map((q) => `${xDe(q.t).toFixed(1)},${yHp(q.hp).toFixed(1)}`).join(" ")} fill="none" stroke={COR.hp2} strokeWidth="2" strokeDasharray="6 4" />
            <polyline points={g2.pontos.map((q) => `${xDe(q.t).toFixed(1)},${yV(q.v).toFixed(1)}`).join(" ")} fill="none" stroke={COR.speed2} strokeWidth="2" strokeDasharray="6 4" />
            {g2.chegada !== null && <line x1={xDe(g2.chegada)} x2={xDe(g2.chegada)} y1={TOPO_A} y2={BASE_A} stroke={COR.speed2} strokeDasharray="2 4" opacity="0.8" />}
          </>
        )}
        <polyline points={linha((q) => xDe(q.t), (q) => yHp(q.hp))} fill="none" stroke={COR.hp} strokeWidth="2.2" />
        <polyline points={linha((q) => xDe(q.t), (q) => yV(q.v))} fill="none" stroke={COR.speed} strokeWidth="2.2" />
        <polyline points={linha((q) => xDe(q.t), (q) => yDhp(q.dhp))} fill="none" stroke={COR.dHp} strokeWidth="1.8" />
        <polyline points={linha((q) => xDe(q.t), (q) => yDv(q.dv))} fill="none" stroke={COR.dSpeed} strokeWidth="1.8" />

        {/* cursor */}
        {p && (
          <g style={{ pointerEvents: "none" }}>
            <line x1={xDe(p.t)} x2={xDe(p.t)} y1={TOPO_A} y2={BASE_B} stroke="#f1ead4" strokeDasharray="3 3" opacity="0.7" />
            <circle cx={xDe(p.t)} cy={yV(p.v)} r="4" fill={COR.speed} />
            {p2 && <circle cx={xDe(p2.t)} cy={yV(p2.v)} r="4" fill={COR.speed2} />}
            {p2 && <circle cx={xDe(p2.t)} cy={yHp(p2.hp)} r="4" fill={COR.hp2} />}
            <circle cx={xDe(p.t)} cy={yHp(p.hp)} r="4" fill={COR.hp} />
            <circle cx={xDe(p.t)} cy={yDv(p.dv)} r="3.5" fill={COR.dSpeed} />
            <circle cx={xDe(p.t)} cy={yDhp(p.dhp)} r="3.5" fill={COR.dHp} />
          </g>
        )}
      </svg>

      {/* caixinha do instante */}
      {p && (
        <div
          style={{
            position: "absolute",
            top: "8%",
            ...(xDe(p.t) / LARGURA > 0.6 ? { right: `${(1 - xDe(p.t) / LARGURA) * 100 + 1.5}%` } : { left: `${(xDe(p.t) / LARGURA) * 100 + 1.5}%` }),
            background: "rgba(11, 19, 32, 0.96)",
            border: "1px solid rgba(197, 160, 89, 0.5)",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "9pt",
            color: "#a4b3c6",
            pointerEvents: "none",
            minWidth: "190px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ color: "#f1ead4", fontWeight: 800, marginBottom: "6px" }}>
            {fmt(p.t, 2)}s <span style={{ color: "#5f758e", fontWeight: 600 }}>• {fmt(p.d, 1)}m</span>
          </div>
          <Linha cor={COR.speed} nome="Speed" valor={`${fmt(p.v, 2)} m/s (${fmt(p.v * 3.6, 1)} km/h)`} />
          <Linha cor={COR.hp} nome="HP" valor={`${fmt(p.hp)} (${fmt((p.hp / g.hpInicial) * 100)}%)`} />
          <Linha cor={COR.dSpeed} nome="ΔSpeed" valor={`${p.dv >= 0 ? "+" : ""}${fmt(p.dv, 2)} m/s`} />
          <Linha cor={COR.dHp} nome="ΔHP" valor={`${p.dhp >= 0 ? "+" : ""}${fmt(p.dhp)}`} />
          {faixasAtivas.length > 0 && (
            <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {faixasAtivas.map((tipo) => (
                <span key={tipo} style={{ color: FAIXAS[tipo].cor, border: `1px solid ${FAIXAS[tipo].cor}`, borderRadius: "10px", padding: "1px 8px", fontSize: "8pt", fontWeight: 700 }}>{FAIXAS[tipo].nome}</span>
              ))}
            </div>
          )}
          {bloqueioAtivo && <div style={{ marginTop: "6px", color: "#e8836f", fontWeight: 700 }}>⛔ Blocked by {bloqueioAtivo.nome}</div>}
          {p2 && (
            <div style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed rgba(164, 179, 198, 0.25)" }}>
              <div style={{ color: "#f1ead4", fontWeight: 700, marginBottom: "2px", maxWidth: "240px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                vs {nomeComparado} <span style={{ color: "#5f758e", fontWeight: 600 }}>• {fmt(p2.d, 1)}m</span>
              </div>
              <Linha cor={COR.speed2} nome="Speed" valor={`${fmt(p2.v, 2)} m/s (${fmt(p2.v * 3.6, 1)} km/h)`} />
              <Linha cor={COR.hp2} nome="HP" valor={`${fmt(p2.hp)} (${fmt((p2.hp / g2.hpInicial) * 100)}%)`} />
              <div style={{ marginTop: "4px", fontSize: "8.5pt", color: p.d >= p2.d ? "#1bd39e" : "#e04b37", fontWeight: 700 }}>
                {p.d >= p2.d ? "▲" : "▼"} {fmt(Math.abs(p.d - p2.d), 1)}m {p.d >= p2.d ? "ahead" : "behind"}
              </div>
            </div>
          )}
        </div>
      )}

      {/* legenda */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px", marginTop: "6px", fontSize: "8.5pt", color: "#a4b3c6" }}>
        {[[COR.speed, "Speed"], [COR.hp, "HP"], [COR.dSpeed, "ΔSpeed"], [COR.dHp, "ΔHP"], ...(g2 ? [[COR.speed2, "Speed (compared)"], [COR.hp2, "HP (compared)"]] : [])].map(([cor, nome]) => (
          <span key={nome} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "14px", height: "3px", background: cor, borderRadius: "2px" }} /> {nome}
          </span>
        ))}
        {Object.entries(FAIXAS).filter(([tipo]) => g.faixas.some((f) => f.tipo === tipo)).map(([tipo, { cor, nome }]) => (
          <span key={tipo} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "14px", height: "4px", background: cor }} /> {nome}
          </span>
        ))}
        {g.bloqueios.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "12px", height: "10px", background: "rgba(224, 75, 55, 0.4)" }} /> Blocked
          </span>
        )}
      </div>
    </div>
  );
}

function Linha({ cor, nome, valor }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", lineHeight: 1.6 }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: cor }} />
      <span style={{ flex: 1 }}>{nome}</span>
      <span style={{ color: "#f1ead4", fontWeight: 700, fontFamily: "'Courier New', monospace" }}>{valor}</span>
    </div>
  );
}

export default GraficoDesempenho;
