// 🎯 src/components/GraficoDesempenho.jsx
// Gráfico de desempenho de um cavalo na corrida (inspirado no do Hakuraku),
// no mesmo visual do comparativo: em cima, velocidade (km/h) e HP ao longo
// do tempo, com as fases da corrida no fundo, as skills ativadas, os trechos
// bloqueados, o início do last spurt e a chegada; embaixo, quanto a
// velocidade e o HP mudaram de um ponto pro outro. As linhas terminam na
// chegada. Passando o mouse, uma caixinha mostra os números do instante.

import { useMemo, useState } from "react";
import { nomeDaSkill } from "../utils/replayCorrida";
import { caminhoSuave, escalaBonita } from "../utils/graficos";

const LARGURA = 1000;
const ESQ = 58;
const DIR = 112; // eixo do HP + bandeirinha de chegada
const TOPO_FAIXAS = 44; // faixas de pace up / downhill / rushed
const TOPO_A = 72; // gráfico de Speed + HP
const BASE_A = 350;
const TOPO_B = 398; // gráfico de Δ
const BASE_B = 520;
const ALTURA = 548;

const COR = {
  speed: "#5b8def",
  hp: "#c8e05a",
  dSpeed: "#a4b3c6",
  dHp: "#f39c52",
  grade: "rgba(164, 179, 198, 0.09)",
  texto: "#5f758e",
  // cavalo escolhido em "Compare with" (linhas tracejadas)
  speed2: "#ef5f91",
  hp2: "#4dd0e1",
};

const FAIXAS = {
  paceUp: { cor: "#5dade2", nome: "Pace Up", linha: 0 },
  paceDown: { cor: "#b388eb", nome: "Pace Down", linha: 0 },
  downhill: { cor: "#4aa3a9", nome: "Downhill", linha: 1 },
  rushed: { cor: "#e04b37", nome: "Rushed", linha: 1 },
};

const TIPO_SKILL = 3;

const fmt = (n, casas = 0) => n.toLocaleString("en-US", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const formatarTempo = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const kmh = (ms) => ms * 3.6;

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

// Ponto mais próximo de um instante.
function indiceMaisProximo(pontos, t) {
  let melhor = 0;
  pontos.forEach((p, k) => {
    if (Math.abs(p.t - t) < Math.abs(pontos[melhor].t - t)) melhor = k;
  });
  return melhor;
}

function prepararGrafico(raceData, replay, numero) {
  const indice = numero - 1;
  const resultado = raceData.horseResult[indice];
  const chegada = resultado?.finishTimeRaw > 0 ? resultado.finishTimeRaw : null;

  const brutos = raceData.frame.map((f) => {
    const h = f.horseFrame[indice];
    return {
      t: f.time,
      d: h.distance,
      v: h.speed / 100, // m/s
      hp: Math.max(0, h.hp),
      bloq: h.blockFrontHorseIndex ?? -1,
      rushed: (h.temptationMode ?? 0) > 0,
    };
  });
  // Só até a chegada (com um ponto exatamente nela).
  let pontos = brutos;
  if (chegada !== null) {
    const k = brutos.findIndex((p) => p.t >= chegada);
    if (k > 0) {
      const a = brutos[k - 1];
      const b = brutos[k];
      const f = b.t > a.t ? (chegada - a.t) / (b.t - a.t) : 0;
      pontos = [...brutos.slice(0, k), { ...a, t: chegada, d: a.d + (b.d - a.d) * f, v: a.v + (b.v - a.v) * f, hp: a.hp + (b.hp - a.hp) * f }];
    }
  }
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
    if (inicio !== null && fim !== null && fim > inicio) faixas.push({ tipo: m.tipo, inicio, fim });
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

  // Fases da corrida pela distância DESTE cavalo.
  const distancia = replay.condicoes?.distancia ?? null;
  const fases = distancia
    ? [
      { nome: "Early", inicio: 0 },
      { nome: "Mid", inicio: tempoNaDistancia(pontos, distancia / 6) },
      { nome: "Late", inicio: tempoNaDistancia(pontos, replay.inicioFaseFinal ?? (distancia * 2) / 3) },
      { nome: "Last Spurt", inicio: tempoNaDistancia(pontos, (distancia * 5) / 6) },
    ].filter((f) => f.inicio !== null)
    : [];

  const spurt = resultado?.lastSpurtStartDistance > 0 ? tempoNaDistancia(pontos, resultado.lastSpurtStartDistance) : null;

  return {
    pontos, bloqueios, faixas, skills, fases, spurt, chegada,
    posicao: (resultado?.finishOrder ?? -1) + 1,
    hpInicial: pontos[0].hp || 1,
    tempoFim: pontos[pontos.length - 1].t,
  };
}

function GraficoDesempenho({ raceData, replay, numero }) {
  const g = useMemo(() => prepararGrafico(raceData, replay, numero), [raceData, replay, numero]);
  const [sob, setSob] = useState(null); // instante (s) sob o mouse

  // "Compare with": outro cavalo sobreposto (Speed e HP tracejados).
  const [comparar, setComparar] = useState(null);
  const g2 = useMemo(() => (comparar ? prepararGrafico(raceData, replay, comparar) : null), [raceData, replay, comparar]);
  const outros = (replay.cavalos ?? [])
    .filter((c) => c.numero !== numero)
    .sort((a, b) => Number(!a.treinador) - Number(!b.treinador) || (a.posicao ?? 99) - (b.posicao ?? 99));
  const nomeComparado = (() => {
    const c = (replay.cavalos ?? []).find((x) => x.numero === comparar);
    return c ? `${c.treinador ?? "NPC"} — ${c.personagem}` : "";
  })();

  // ---- escalas ----
  const tempoGrafico = Math.max(g.tempoFim, g2?.tempoFim ?? 0);
  const todos = [...g.pontos, ...(g2?.pontos ?? [])];
  const depoisDaLargada = todos.filter((p) => p.t >= 5).map((p) => kmh(p.v));
  const escV = escalaBonita(depoisDaLargada.length ? Math.min(...depoisDaLargada) * 0.97 : 0, Math.max(...todos.map((p) => kmh(p.v))));
  const escHp = escalaBonita(0, Math.max(...todos.map((p) => p.hp)));
  const dvMax = escalaBonita(0, Math.max(...g.pontos.map((p) => Math.abs(kmh(p.dv)))), 2).max || 1;
  const dhpMax = escalaBonita(0, Math.max(...g.pontos.map((p) => Math.abs(p.dhp))), 2).max || 1;

  const xDe = (t) => ESQ + (t / tempoGrafico) * (LARGURA - ESQ - DIR);
  const noIntervalo = (f) => Math.min(1, Math.max(0, f));
  const yV = (v) => BASE_A - noIntervalo((kmh(v) - escV.min) / (escV.max - escV.min || 1)) * (BASE_A - TOPO_A);
  const yHp = (hp) => BASE_A - noIntervalo(hp / (escHp.max || 1)) * (BASE_A - TOPO_A);
  const meioB = (TOPO_B + BASE_B) / 2;
  const yDv = (dv) => meioB - Math.max(-1, Math.min(1, kmh(dv) / dvMax)) * ((BASE_B - TOPO_B) / 2);
  const yDhp = (dhp) => meioB - Math.max(-1, Math.min(1, dhp / dhpMax)) * ((BASE_B - TOPO_B) / 2);

  const curva = (pontos, fy) => caminhoSuave(pontos.map((q) => [xDe(q.t), fy(q)]));
  const area = (pontos, fy, base) => {
    const d = curva(pontos, fy);
    return d ? `${d}L${xDe(pontos[pontos.length - 1].t).toFixed(1)},${base}L${xDe(pontos[0].t).toFixed(1)},${base}Z` : "";
  };

  const marcasTempo = [];
  for (let t = 0; t <= tempoGrafico; t += tempoGrafico > 100 ? 20 : 10) marcasTempo.push(t);

  function aoMover(e) {
    const matriz = e.currentTarget.getScreenCTM();
    if (!matriz) return;
    const x = (e.clientX - matriz.e) / matriz.a;
    const t = ((x - ESQ) / (LARGURA - ESQ - DIR)) * tempoGrafico;
    setSob(t < 0 || t > tempoGrafico ? null : t);
  }

  const p = sob !== null && sob <= g.tempoFim + 0.01 ? g.pontos[indiceMaisProximo(g.pontos, sob)] : null;
  const p2 = sob !== null && g2 && sob <= g2.tempoFim + 0.01 ? g2.pontos[indiceMaisProximo(g2.pontos, sob)] : null;
  const faixasAtivas = p ? g.faixas.filter((f) => p.t >= f.inicio && p.t <= f.fim).map((f) => f.tipo) : [];
  const bloqueioAtivo = p && p.bloq >= 0 ? g.bloqueios.find((b) => p.t >= b.inicio && p.t <= b.fim) : null;
  const xCursor = sob !== null ? xDe(p?.t ?? p2?.t ?? sob) : null;

  // Skills: nomes que cairiam no mesmo ponto vão sendo afastados pra direita.
  const skillsNaTela = g.skills.reduce((lista, s) => {
    const anterior = lista[lista.length - 1];
    const xTexto = Math.max(xDe(s.t) + 4, anterior ? anterior.xTexto + 13 : 0);
    return [...lista, { ...s, xTexto }];
  }, []);

  return (
    <div style={{ position: "relative", fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", marginBottom: "4px", fontSize: "9pt", color: "#a4b3c6" }}>
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
        style={{ width: "100%", display: "block", cursor: "crosshair", overflow: "visible" }}
        onMouseMove={aoMover}
        onMouseLeave={() => setSob(null)}
      >
        <defs>
          <linearGradient id={`des-area-speed-${numero}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR.speed} stopOpacity="0.22" />
            <stop offset="100%" stopColor={COR.speed} stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`des-area-hp-${numero}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR.hp} stopOpacity="0.14" />
            <stop offset="100%" stopColor={COR.hp} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* fases da corrida no fundo (dos dois gráficos) */}
        {g.fases.filter((f) => f.inicio < tempoGrafico).map((f, i, fases) => {
          const fim = Math.min(fases[i + 1]?.inicio ?? tempoGrafico, tempoGrafico);
          return (
            <g key={f.nome}>
              {[[TOPO_A, BASE_A], [TOPO_B, BASE_B]].map(([topo, base]) => (
                <rect key={topo} x={xDe(f.inicio)} y={topo} width={Math.max(0, xDe(fim) - xDe(f.inicio))} height={base - topo} fill={i % 2 ? "rgba(197, 160, 89, 0.035)" : "rgba(164, 179, 198, 0.02)"} />
              ))}
              {i > 0 && <line x1={xDe(f.inicio)} x2={xDe(f.inicio)} y1={TOPO_A} y2={BASE_B} stroke="rgba(197, 160, 89, 0.22)" strokeDasharray="4 4" />}
              <text x={xDe(f.inicio) + 6} y={TOPO_A + 14} fill="rgba(197, 160, 89, 0.7)" fontSize="10.5" fontWeight="700" letterSpacing="0.5">{f.nome.toUpperCase()}</text>
            </g>
          );
        })}

        {/* títulos */}
        <text x={ESQ} y={TOPO_A - 10} fill={COR.speed} fontSize="13" fontWeight="800">Speed <tspan fill="#5f758e" fontWeight="500" fontSize="11">km/h</tspan></text>
        <text x={LARGURA - DIR + 8} y={TOPO_A - 10} fill={COR.hp} fontSize="13" fontWeight="800">HP</text>
        <text x={ESQ} y={TOPO_B - 10} fill="#f1ead4" fontSize="13" fontWeight="800">
          <tspan fill={COR.dSpeed}>Δ Speed</tspan> <tspan fill="#5f758e" fontWeight="500" fontSize="11">km/h</tspan>
          <tspan fill="#5f758e" fontWeight="500">{"  ·  "}</tspan>
          <tspan fill={COR.dHp}>Δ HP</tspan>
        </text>

        {/* grade do gráfico de cima: Speed à esquerda, HP à direita */}
        {escV.marcas.map((v) => (
          <g key={`v-${v}`}>
            <line x1={ESQ} x2={LARGURA - DIR} y1={yV(v / 3.6)} y2={yV(v / 3.6)} stroke={COR.grade} />
            <text x={ESQ - 8} y={yV(v / 3.6) + 4} textAnchor="end" fill={COR.speed} fontSize="11" opacity="0.85">{fmt(v)}</text>
          </g>
        ))}
        {escHp.marcas.map((hp) => (
          <text key={`h-${hp}`} x={LARGURA - DIR + 8} y={yHp(hp) + 4} fill={COR.hp} fontSize="11" opacity="0.85">{fmt(hp)}</text>
        ))}
        {/* grade do gráfico de baixo (simétrica, zero no meio) */}
        {[-1, -0.5, 0, 0.5, 1].map((f) => (
          <g key={`d-${f}`}>
            <line x1={ESQ} x2={LARGURA - DIR} y1={meioB - f * ((BASE_B - TOPO_B) / 2)} y2={meioB - f * ((BASE_B - TOPO_B) / 2)} stroke={f === 0 ? "rgba(164, 179, 198, 0.3)" : COR.grade} />
            <text x={ESQ - 8} y={meioB - f * ((BASE_B - TOPO_B) / 2) + 4} textAnchor="end" fill={COR.dSpeed} fontSize="11" opacity="0.85">{fmt(f * dvMax, dvMax < 10 ? 1 : 0)}</text>
            <text x={LARGURA - DIR + 8} y={meioB - f * ((BASE_B - TOPO_B) / 2) + 4} fill={COR.dHp} fontSize="11" opacity="0.85">{fmt(f * dhpMax)}</text>
          </g>
        ))}
        {marcasTempo.map((t) => (
          <g key={`t-${t}`}>
            <line x1={xDe(t)} x2={xDe(t)} y1={TOPO_A} y2={BASE_A} stroke="rgba(164, 179, 198, 0.05)" />
            <line x1={xDe(t)} x2={xDe(t)} y1={TOPO_B} y2={BASE_B} stroke="rgba(164, 179, 198, 0.05)" />
            <text x={xDe(t)} y={ALTURA - 6} textAnchor="middle" fill={COR.texto} fontSize="11">{t}s</text>
          </g>
        ))}

        {/* faixas de pace up / pace down / downhill / rushed, acima do gráfico */}
        {g.faixas.map((f, k) => (
          <rect key={`f-${k}`} x={xDe(f.inicio)} y={TOPO_FAIXAS + FAIXAS[f.tipo].linha * 8} width={Math.max(2, xDe(f.fim) - xDe(f.inicio))} height="5" rx="2.5" fill={FAIXAS[f.tipo].cor} opacity="0.9" />
        ))}

        {/* trechos bloqueados */}
        {g.bloqueios.map((b, k) => (
          <g key={`b-${k}`}>
            <rect x={xDe(b.inicio)} y={TOPO_A} width={Math.max(3, xDe(b.fim) - xDe(b.inicio))} height={BASE_A - TOPO_A} fill="rgba(224, 75, 55, 0.16)" />
            <line x1={xDe(b.inicio)} x2={xDe(b.inicio)} y1={TOPO_A} y2={BASE_A} stroke="rgba(224, 75, 55, 0.5)" />
            <text transform={`translate(${xDe((b.inicio + b.fim) / 2) - 4}, ${TOPO_A + 24}) rotate(90)`} fill="#e8836f" fontSize="10.5" fontWeight="600">{`⛔ Blocked by ${b.nome}`}</text>
          </g>
        ))}

        {/* skills */}
        {skillsNaTela.map((s, k) => (
          <g key={`s-${k}`}>
            <line x1={xDe(s.t)} x2={xDe(s.t)} y1={TOPO_A} y2={BASE_A} stroke="rgba(241, 234, 212, 0.18)" />
            <circle cx={xDe(s.t)} cy={BASE_A} r="2.5" fill="#c5a059" />
            <text transform={`translate(${s.xTexto + 3.5}, ${BASE_A - 8}) rotate(-90)`} fill="#d9d2bd" fontSize="10.5">{s.nome}</text>
          </g>
        ))}

        {/* início do last spurt deste cavalo */}
        {g.spurt !== null && (
          <g>
            <line x1={xDe(g.spurt)} x2={xDe(g.spurt)} y1={TOPO_A - 4} y2={BASE_B} stroke="#1bd39e" strokeDasharray="5 4" opacity="0.8" />
            <text x={xDe(g.spurt)} y={TOPO_A - 8} textAnchor="middle" fill="#1bd39e" fontSize="10.5" fontWeight="700">Spurt start</text>
          </g>
        )}

        {/* áreas e linhas */}
        {!g2 && <path d={area(g.pontos, (q) => yHp(q.hp), BASE_A)} fill={`url(#des-area-hp-${numero})`} />}
        {!g2 && <path d={area(g.pontos, (q) => yV(q.v), BASE_A)} fill={`url(#des-area-speed-${numero})`} />}
        {g2 && (
          <>
            <path d={curva(g2.pontos, (q) => yHp(q.hp))} fill="none" stroke={COR.hp2} strokeWidth="2" strokeDasharray="6 4" />
            <path d={curva(g2.pontos, (q) => yV(q.v))} fill="none" stroke={COR.speed2} strokeWidth="2" strokeDasharray="6 4" />
          </>
        )}
        <path d={curva(g.pontos, (q) => yHp(q.hp))} fill="none" stroke={COR.hp} strokeWidth="2.4" strokeLinecap="round" />
        <path d={curva(g.pontos, (q) => yV(q.v))} fill="none" stroke={COR.speed} strokeWidth="2.4" strokeLinecap="round" />
        <path d={curva(g.pontos, (q) => yDhp(q.dhp))} fill="none" stroke={COR.dHp} strokeWidth="1.8" />
        <path d={curva(g.pontos, (q) => yDv(q.dv))} fill="none" stroke={COR.dSpeed} strokeWidth="1.8" />

        {/* chegada: bolinha no fim da linha e bandeirinha com posição e tempo */}
        {[[g, COR.speed], ...(g2 ? [[g2, COR.speed2]] : [])].map(([gr, cor], n) => gr.chegada !== null && (
          <g key={`fim-${n}`} style={{ pointerEvents: "none" }}>
            <circle cx={xDe(gr.chegada)} cy={yV(gr.pontos[gr.pontos.length - 1].v)} r="4.5" fill={cor} stroke="#0b1320" strokeWidth="1.5" />
            {/* acima da bolinha (o 2º cavalo, embaixo), longe dos números do eixo do HP */}
            <text x={xDe(gr.chegada) - 8} y={yV(gr.pontos[gr.pontos.length - 1].v) + (n === 0 ? -12 : 20)} textAnchor="end" fill={cor} fontSize="11" fontWeight="800">
              {`🏁 ${gr.posicao}º`}
              <tspan fill="#8193a8" fontWeight="600">{` ${formatarTempo(gr.chegada)}`}</tspan>
            </text>
          </g>
        ))}

        {/* cursor */}
        {xCursor !== null && (
          <g style={{ pointerEvents: "none" }}>
            <line x1={xCursor} x2={xCursor} y1={TOPO_A} y2={BASE_B} stroke="#f1ead4" strokeDasharray="3 3" opacity="0.55" />
            {p2 && <circle cx={xDe(p2.t)} cy={yV(p2.v)} r="4.5" fill={COR.speed2} stroke="#0b1320" strokeWidth="1.5" />}
            {p2 && <circle cx={xDe(p2.t)} cy={yHp(p2.hp)} r="4.5" fill={COR.hp2} stroke="#0b1320" strokeWidth="1.5" />}
            {p && (
              <>
                <circle cx={xDe(p.t)} cy={yV(p.v)} r="5" fill={COR.speed} stroke="#0b1320" strokeWidth="2" />
                <circle cx={xDe(p.t)} cy={yHp(p.hp)} r="5" fill={COR.hp} stroke="#0b1320" strokeWidth="2" />
                <circle cx={xDe(p.t)} cy={yDv(p.dv)} r="4" fill={COR.dSpeed} stroke="#0b1320" strokeWidth="1.5" />
                <circle cx={xDe(p.t)} cy={yDhp(p.dhp)} r="4" fill={COR.dHp} stroke="#0b1320" strokeWidth="1.5" />
              </>
            )}
          </g>
        )}
      </svg>

      {/* caixinha do instante */}
      {xCursor !== null && (p || p2) && (
        <div
          style={{
            position: "absolute",
            top: "12%",
            ...(xCursor / LARGURA > 0.55 ? { right: `${(1 - xCursor / LARGURA) * 100 + 1.5}%` } : { left: `${(xCursor / LARGURA) * 100 + 1.5}%` }),
            background: "rgba(11, 19, 32, 0.96)",
            border: "1px solid rgba(197, 160, 89, 0.5)",
            borderRadius: "8px",
            padding: "10px 12px",
            fontSize: "9pt",
            color: "#a4b3c6",
            pointerEvents: "none",
            minWidth: "210px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.5)",
          }}
        >
          {p ? (
            <>
              <div style={{ color: "#f1ead4", fontWeight: 800, marginBottom: "6px" }}>
                {formatarTempo(p.t)} <span style={{ color: "#5f758e", fontWeight: 600 }}>• {fmt(p.d, 1)}m</span>
              </div>
              <Linha cor={COR.speed} nome="Speed" valor={`${fmt(kmh(p.v), 1)} km/h`} />
              <Linha cor={COR.hp} nome="HP" valor={`${fmt(p.hp)} (${fmt((p.hp / g.hpInicial) * 100)}%)`} />
              <Linha cor={COR.dSpeed} nome="Δ Speed" valor={`${p.dv >= 0 ? "+" : ""}${fmt(kmh(p.dv), 2)} km/h`} />
              <Linha cor={COR.dHp} nome="Δ HP" valor={`${p.dhp >= 0 ? "+" : ""}${fmt(p.dhp)}`} />
              {faixasAtivas.length > 0 && (
                <div style={{ marginTop: "6px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {faixasAtivas.map((tipo) => (
                    <span key={tipo} style={{ color: FAIXAS[tipo].cor, border: `1px solid ${FAIXAS[tipo].cor}`, borderRadius: "10px", padding: "1px 8px", fontSize: "8pt", fontWeight: 700 }}>{FAIXAS[tipo].nome}</span>
                  ))}
                </div>
              )}
              {bloqueioAtivo && <div style={{ marginTop: "6px", color: "#e8836f", fontWeight: 700 }}>⛔ Blocked by {bloqueioAtivo.nome}</div>}
            </>
          ) : (
            <div style={{ color: COR.speed, fontWeight: 800 }}>🏁 {g.posicao}º • {formatarTempo(g.chegada)}</div>
          )}
          {g2 && (
            <div style={{ marginTop: "8px", paddingTop: "6px", borderTop: "1px dashed rgba(164, 179, 198, 0.25)" }}>
              <div style={{ color: "#f1ead4", fontWeight: 700, marginBottom: "2px", maxWidth: "250px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                vs {nomeComparado}{p2 && <span style={{ color: "#5f758e", fontWeight: 600 }}> • {fmt(p2.d, 1)}m</span>}
              </div>
              {p2 ? (
                <>
                  <Linha cor={COR.speed2} nome="Speed" valor={`${fmt(kmh(p2.v), 1)} km/h`} />
                  <Linha cor={COR.hp2} nome="HP" valor={`${fmt(p2.hp)} (${fmt((p2.hp / g2.hpInicial) * 100)}%)`} />
                  {p && (
                    <div style={{ marginTop: "4px", fontSize: "8.5pt", color: p.d >= p2.d ? "#1bd39e" : "#e04b37", fontWeight: 700 }}>
                      {p.d >= p2.d ? "▲" : "▼"} {fmt(Math.abs(p.d - p2.d), 1)}m {p.d >= p2.d ? "ahead" : "behind"}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: COR.speed2, fontWeight: 800 }}>🏁 {g2.posicao}º • {formatarTempo(g2.chegada)}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* legenda */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px", marginTop: "8px", fontSize: "8.5pt", color: "#a4b3c6" }}>
        {[[COR.speed, "Speed"], [COR.hp, "HP"], [COR.dSpeed, "Δ Speed"], [COR.dHp, "Δ HP"], ...(g2 ? [[COR.speed2, "Speed (compared)"], [COR.hp2, "HP (compared)"]] : [])].map(([cor, nome]) => (
          <span key={nome} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "14px", height: "3px", background: cor, borderRadius: "2px" }} /> {nome}
          </span>
        ))}
        {Object.entries(FAIXAS).filter(([tipo]) => g.faixas.some((f) => f.tipo === tipo)).map(([tipo, { cor, nome }]) => (
          <span key={tipo} style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "14px", height: "5px", background: cor, borderRadius: "2.5px" }} /> {nome}
          </span>
        ))}
        {g.bloqueios.length > 0 && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "12px", height: "10px", background: "rgba(224, 75, 55, 0.35)" }} /> Blocked
          </span>
        )}
        {g.spurt !== null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ width: "14px", height: "0", borderTop: "2px dashed #1bd39e" }} /> Spurt start
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
