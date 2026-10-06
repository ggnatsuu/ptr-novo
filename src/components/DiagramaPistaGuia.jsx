// 🎯 src/components/DiagramaPistaGuia.jsx
// Diagrama da pista no tema escuro do site (Guia do Meta e Buscador de Pistas): elevação como
// gráfico de área, retas/curvas, fases, régua e as skills de aceleração do
// estilo. Rótulos à esquerda, grade vertical ligando todas as faixas e
// metragens detalhadas só no tooltip (passar o mouse).

import { useId, useMemo, useRef, useState } from "react";
import { calcularFases, montarSegmentosPista, montarSegmentosDeclive, velocidadeBaseDaPista, formatarDuracaoBase } from "../utils/diagramaPista";
import { caminhoIconeSkill, PALETA_SKILLS } from "../utils/skillsPista";

const L = 104; // coluna dos rótulos
const R = 14;
const W = 1000;
const P = W - L - R; // largura útil

const COR = {
  texto: "#f1ead4",
  rotulo: "#5f758e",
  suave: "#8193a8",
  grade: "rgba(164, 179, 198, 0.07)",
  trilho: "rgba(164, 179, 198, 0.05)",
  ouro: "#c5a059",
  subida: "#f0a040",
  descida: "#4fc3c7",
};
const FASES = {
  abertura: { nome: "Early-race", cor: "#2f6b57" },
  meio: { nome: "Mid-race", cor: "#7d6a2e" },
  final: { nome: "Late-race", cor: "#7e3d5f" },
  ultimoSprint: { nome: "Last spurt", cor: "#a84a6c" },
};

// Altura acumulada ponto a ponto (slope/1e6 = fração por metro).
function perfilElevacao(dados) {
  const pontos = [{ pos: 0, altura: 0 }];
  let altura = 0;
  let pos = 0;
  [...(dados.slopes || [])].sort((a, b) => a.start - b.start).forEach((s) => {
    if (s.start > pos) pontos.push({ pos: s.start, altura });
    const fim = altura + s.length * (s.slope / 1000000);
    pontos.push({ pos: s.start + s.length, altura: fim });
    altura = fim;
    pos = s.start + s.length;
  });
  if (pos < dados.distance) pontos.push({ pos: dados.distance, altura });
  return pontos;
}
function alturaEm(perfil, m) {
  for (let i = 1; i < perfil.length; i++) {
    const a = perfil[i - 1], b = perfil[i];
    if (m <= b.pos) return b.pos === a.pos ? b.altura : a.altura + ((m - a.pos) / (b.pos - a.pos)) * (b.altura - a.altura);
  }
  return perfil.at(-1).altura;
}

// Empilha etiquetas de skill: cada uma vai pra primeira linha onde não encosta
// na anterior (a barra é só o trecho ativo; o nome vai dentro ou logo depois).
function empilharEtiquetas(lista, distancia) {
  const fins = [];
  return lista.map((e) => {
    // A barra é só o trecho em que a skill ficou ativa; o nome vai dentro se
    // couber, senão logo depois da barra — ou antes dela, quando passaria do
    // fim do diagrama (skills perto da chegada). O nome também ocupa a linha.
    const xi = L + (e.inicio / distancia) * P;
    const larg = Math.max(((e.fim - e.inicio) / distancia) * P, 3);
    const largTexto = e.nome.length * 6.4 + 28;
    const dentro = larg >= largTexto;
    const textoAntes = !dentro && xi + larg + 4 + largTexto > W - R;
    const de = textoAntes ? xi - 4 - largTexto : xi;
    const ate = dentro ? xi + larg : textoAntes ? xi + larg : xi + larg + 4 + largTexto;
    return { ...e, xi, larg, dentro, textoAntes, largTexto, de, ate };
  }).sort((a, b) => a.de - b.de).map((e) => {
    let linha = fins.findIndex((f) => f < e.de - 2);
    if (linha < 0) { linha = fins.length; fins.push(0); }
    fins[linha] = e.ate;
    return { ...e, linha };
  });
}
// numerar: mostra a ordem de prioridade (Guia); no Buscador é só a ordem em que foram adicionadas.
// Comparador (opcionais):
//   curvas: { series: [{ nome, cor, eixo: "vel" | "hp", tracejado, pontos: [[pos, valor], ...] }], velMin, velMax, hpMax }
//           → faixa no topo com velocidade (eixo esquerdo) e HP (eixo direito).
//   etiquetas: [{ nome, inicio, fim, cor, iconId }] → skills como etiquetas na
//           posição em que ativaram, empilhadas quando se sobrepõem (estilo Umalator).
function DiagramaPistaGuia({ dadosCorrida, skills = [], numerar = true, curvas = null, etiquetas = null }) {
  const uid = useId().replace(/:/g, "");
  const distancia = dadosCorrida.distance;
  const x = (m) => L + (m / distancia) * P;

  const segmentos = useMemo(() => montarSegmentosPista(dadosCorrida), [dadosCorrida]);
  const declives = useMemo(() => montarSegmentosDeclive(dadosCorrida), [dadosCorrida]);
  const fases = useMemo(() => calcularFases(distancia), [distancia]);
  const perfil = useMemo(() => perfilElevacao(dadosCorrida), [dadosCorrida]);
  const ultimaReta = [...segmentos].reverse().find((s) => s.tipo === "reta");

  // Layout vertical (com curvas, a faixa de velocidade/HP entra no topo)
  const yCurvas = 34, hCurvas = curvas ? 190 : 0;
  const yElev = curvas ? yCurvas + hCurvas + 14 : 34, hElev = 70;
  const yTrecho = yElev + hElev + 12, hTrecho = 30;
  const yFase = yTrecho + hTrecho + 8, hFase = 24;
  const yRegua = yFase + hFase + 6;
  const ySkills = yRegua + 30;
  const hSkill = 34, gapSkill = 8;

  // Etiquetas de skill: cada uma vai pra primeira linha onde não encosta na anterior.
  const hEtiqueta = 22, gapEtiqueta = 5;
  // Etiquetas com `grupo` (ex.: "A" e "B") ficam em faixas separadas, uma
  // embaixo da outra; cada faixa empilha só as próprias etiquetas.
  const SEP_GRUPO = 12;
  const { linhasEtiqueta, gruposEtiqueta } = useMemo(() => {
    if (!etiquetas?.length) return { linhasEtiqueta: [], gruposEtiqueta: [] };
    const grupos = [];
    for (const e of etiquetas) {
      const chave = e.grupo ?? "";
      if (!grupos.some((g) => g.chave === chave)) grupos.push({ chave, cor: e.cor });
    }
    let base = 0;
    const todas = [];
    grupos.forEach((g, gi) => {
      const doGrupo = empilharEtiquetas(etiquetas.filter((e) => (e.grupo ?? "") === g.chave), distancia);
      const n = doGrupo.reduce((m, e) => Math.max(m, e.linha + 1), 0);
      Object.assign(g, { primeira: base, n, indice: gi });
      doGrupo.forEach((e) => todas.push({ ...e, linha: base + e.linha, grupoIndice: gi }));
      base += n;
    });
    return { linhasEtiqueta: todas, gruposEtiqueta: grupos };
  }, [etiquetas, distancia]);

  const nLinhasEtiqueta = linhasEtiqueta.reduce((m, e) => Math.max(m, e.linha + 1), 0);
  const yEtiqueta = (linha, grupoIndice) => ySkills + linha * (hEtiqueta + gapEtiqueta) + grupoIndice * SEP_GRUPO;

  const linhas = skills.flatMap((sk, i) => {
    const cor = sk.cor?.stroke ?? PALETA_SKILLS[i % PALETA_SKILLS.length].stroke;
    return sk.gatilhos.length
      ? sk.gatilhos.map((g, gi) => ({ sk, cor, gatilho: g, sufixo: sk.gatilhos.length > 1 ? ` [${gi + 1}]` : "", chave: `${sk.id}-${gi}` }))
      : [{ sk, cor, gatilho: null, sufixo: "", chave: `${sk.id}-x` }];
  });
  const altura = nLinhasEtiqueta
    ? ySkills + nLinhasEtiqueta * (hEtiqueta + gapEtiqueta) + Math.max(0, gruposEtiqueta.length - 1) * SEP_GRUPO + 4
    : (linhas.length ? ySkills + linhas.length * (hSkill + gapSkill) : ySkills - 6) + 4;

  // Curvas de velocidade (eixo esquerdo) e HP (eixo direito)
  const yVel = (v) => yCurvas + hCurvas - 8 - ((Math.min(Math.max(v, curvas.velMin), curvas.velMax) - curvas.velMin) / Math.max(0.1, curvas.velMax - curvas.velMin)) * (hCurvas - 20);
  const yHp = (h) => yCurvas + hCurvas - 8 - (Math.max(0, h) / Math.max(1, curvas.hpMax)) * (hCurvas - 20);
  const ticksVel = curvas ? Array.from({ length: 5 }, (_, i) => curvas.velMin + ((curvas.velMax - curvas.velMin) * i) / 4) : [];

  // Elevação
  const alturas = perfil.map((p) => p.altura);
  const hMin = Math.min(...alturas, 0), hMax = Math.max(...alturas, 0);
  const amp = hMax - hMin;
  const yAlt = (h) => (amp ? yElev + hElev - 6 - ((h - hMin) / amp) * (hElev - 22) : yElev + hElev - 14);
  const linhaElev = perfil.map((p) => `${x(p.pos)},${yAlt(p.altura)}`).join(" ");
  const areaElev = `${x(0)},${yElev + hElev} ${linhaElev} ${x(distancia)},${yElev + hElev}`;
  const areaTrecho = (ini, fim) => {
    const pts = [ini, ...perfil.filter((p) => p.pos > ini && p.pos < fim).map((p) => p.pos), fim];
    return `${x(ini)},${yElev + hElev} ${pts.map((m) => `${x(m)},${yAlt(alturaEm(perfil, m))}`).join(" ")} ${x(fim)},${yElev + hElev}`;
  };

  // Mouse
  const svgRef = useRef(null);
  const [mouse, setMouse] = useState(null);
  const aoMover = (e) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    if (px < L || px > W - R) return setMouse(null);
    return setMouse(Math.round(((px - L) / P) * distancia));
  };
  const infoMouse = (() => {
    if (mouse == null) return null;
    const seg = segmentos.find((s) => mouse >= s.inicio && mouse < s.fim);
    const fase = Object.entries(fases).find(([, f]) => mouse >= f.inicio && mouse < f.fim);
    const dec = declives.find((d) => mouse >= d.inicio && mouse < d.fim);
    const partes = [`${mouse}m`];
    if (seg && seg.tipo !== "indefinido") partes.push(seg.tipo === "curva" ? `Corner ${seg.numero}` : seg === ultimaReta ? "Final straight" : "Straight");
    if (fase) partes.push(FASES[fase[0]].nome);
    if (dec) partes.push(`${dec.tipo === "subida" ? "Uphill" : "Downhill"} ${Math.abs(dec.slope) / 10000}%`);
    // Valores das curvas no ponto do mouse, agrupados por corredora (A, B...)
    const grupos = [];
    curvas?.series.forEach((s) => {
      let melhor = null;
      for (const p of s.pontos) if (!melhor || Math.abs(p[0] - mouse) < Math.abs(melhor[0] - mouse)) melhor = p;
      if (!melhor || Math.abs(melhor[0] - mouse) > distancia / 50) return;
      const chave = s.grupo ?? s.nome;
      let g = grupos.find((x) => x.chave === chave);
      if (!g) grupos.push((g = { chave, cor: s.cor }));
      if (s.eixo === "hp") { g.hp = melhor[1]; g.yHp = yHp(melhor[1]); g.xHp = x(melhor[0]); }
      else { g.vel = melhor[1]; g.yVel = yVel(melhor[1]); g.xVel = x(melhor[0]); }
    });
    return { local: partes.join("  ·  "), grupos };
  })();

  const marcas = Array.from({ length: Math.floor(distancia / 200) + 1 }, (_, i) => i * 200);
  const rotulo = (texto, y) => <text x={L - 14} y={y} textAnchor="end" fill={COR.rotulo} fontSize="10" fontWeight="800" letterSpacing="1.2">{texto}</text>;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${altura}`} style={{ width: "100%", display: "block", fontFamily: "'Montserrat', sans-serif", userSelect: "none" }} onMouseMove={aoMover} onMouseLeave={() => setMouse(null)}>
      <defs>
        <linearGradient id={`elev-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={COR.ouro} stopOpacity="0.32" />
          <stop offset="100%" stopColor={COR.ouro} stopOpacity="0.02" />
        </linearGradient>
        <filter id={`brilho-${uid}`} x="-50%" y="-80%" width="200%" height="260%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id={`fase-${uid}`}><rect x={L} y={yFase} width={P} height={hFase} rx="6" /></clipPath>
        <clipPath id={`trecho-${uid}`}><rect x={L} y={yTrecho} width={P} height={hTrecho} rx="6" /></clipPath>
      </defs>

      {/* Grade vertical a cada 200m, ligando todas as faixas */}
      {marcas.map((m) => <line key={`g${m}`} x1={x(m)} y1={curvas ? yCurvas : yElev} x2={x(m)} y2={yRegua} stroke={COR.grade} strokeWidth="1" />)}

      {/* VELOCIDADE / HP (Comparador) */}
      {curvas && (
        <g>
          {rotulo("VELOC. / HP", yCurvas + hCurvas / 2 + 4)}
          <rect x={L} y={yCurvas} width={P} height={hCurvas} rx="6" fill={COR.trilho} />
          {ticksVel.map((v) => (
            <g key={`tv${v}`}>
              <line x1={L} x2={W - R} y1={yVel(v)} y2={yVel(v)} stroke={COR.grade} />
              <text x={L + 4} y={yVel(v) - 3} fill={COR.rotulo} fontSize="8.5" fontWeight="700">{v.toFixed(1)} m/s</text>
            </g>
          ))}
          {[0.5, 1].map((f) => (
            <text key={`th${f}`} x={W - R - 4} y={yHp(curvas.hpMax * f) - 3} textAnchor="end" fill={COR.rotulo} fontSize="8.5" fontWeight="700">{Math.round(curvas.hpMax * f)} HP</text>
          ))}
          {curvas.series.map((s, i) => (
            <polyline
              key={`c${i}`}
              points={s.pontos.map(([pos, val]) => `${x(pos)},${s.eixo === "hp" ? yHp(val) : yVel(val)}`).join(" ")}
              fill="none"
              stroke={s.cor}
              strokeWidth={s.tracejado ? 1.6 : 2.2}
              strokeDasharray={s.tracejado ? "5 4" : undefined}
              strokeOpacity={s.tracejado ? 0.85 : 1}
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}

      {/* Faixas de ativação das skills (atrás de tudo) */}
      {linhas.map(({ gatilho, cor, chave }) => gatilho && (gatilho.isImmediate
        ? <line key={`a${chave}`} x1={x(gatilho.regions[0].start)} y1={yElev} x2={x(gatilho.regions[0].start)} y2={yRegua} stroke={cor} strokeOpacity="0.85" strokeWidth="2" strokeDasharray="5 3" />
        : gatilho.regions.map((r, ri) => <rect key={`a${chave}-${ri}`} x={x(r.start)} y={yElev} width={Math.max(x(r.end) - x(r.start), 2)} height={yRegua - yElev} fill={cor} fillOpacity="0.1" />)))}

      {/* ELEVAÇÃO */}
      {rotulo("ELEVAÇÃO", yElev + hElev / 2 + 4)}
      <polygon points={areaElev} fill={`url(#elev-${uid})`} />
      {declives.map((d, i) => <polygon key={`d${i}`} points={areaTrecho(d.inicio, d.fim)} fill={d.tipo === "subida" ? COR.subida : COR.descida} fillOpacity="0.22" />)}
      <polyline points={linhaElev} fill="none" stroke={COR.ouro} strokeWidth="2" strokeLinejoin="round" />
      {declives.map((d, i) => {
        const meio = (d.inicio + d.fim) / 2;
        const cor = d.tipo === "subida" ? COR.subida : COR.descida;
        const texto = `${d.tipo === "subida" ? "▲" : "▼"} ${Math.abs(d.slope) / 10000}%`;
        return (
          <g key={`p${i}`}>
            <line x1={x(d.inicio)} y1={yElev + hElev} x2={x(d.fim)} y2={yElev + hElev} stroke={cor} strokeWidth="3" strokeLinecap="round" />
            <text x={x(meio)} y={Math.max(yAlt(alturaEm(perfil, meio)) - 8, yElev + 6)} textAnchor="middle" fill={cor} fontSize="11" fontWeight="800">{texto}</text>
          </g>
        );
      })}
      <line x1={L} y1={yElev + hElev} x2={W - R} y2={yElev + hElev} stroke="rgba(164, 179, 198, 0.15)" />

      {/* TRECHO */}
      {rotulo("TRECHO", yTrecho + hTrecho / 2 + 4)}
      <rect x={L} y={yTrecho} width={P} height={hTrecho} rx="6" fill={COR.trilho} />
      <g clipPath={`url(#trecho-${uid})`}>
        {segmentos.filter((s) => s.tipo !== "indefinido").map((s, i) => {
          const curva = s.tipo === "curva";
          const final = s === ultimaReta;
          const w = x(s.fim) - x(s.inicio);
          const nome = curva ? `Corner ${s.numero}` : final ? "Final straight" : "Straight";
          return (
            <g key={`t${i}`}>
              <rect x={x(s.inicio) + 1} y={yTrecho} width={Math.max(w - 2, 1)} height={hTrecho}
                fill={curva ? "rgba(197, 160, 89, 0.2)" : final ? "rgba(95, 168, 232, 0.24)" : "rgba(95, 168, 232, 0.1)"} />
              {curva && <rect x={x(s.inicio) + 1} y={yTrecho + hTrecho - 3} width={Math.max(w - 2, 1)} height="3" fill={COR.ouro} fillOpacity="0.7" />}
              {w > 52 && <text x={x(s.inicio) + w / 2} y={yTrecho + hTrecho / 2 + 4} textAnchor="middle" fill={curva ? "#e8cf8f" : final ? "#cfe4f7" : "#9db8d2"} fontSize="10.5" fontWeight="700">{w > 80 || curva ? nome : nome.replace("Final straight", "Final")}</text>}
            </g>
          );
        })}
      </g>

      {/* FASE */}
      {rotulo("FASE", yFase + hFase / 2 + 4)}
      <g clipPath={`url(#fase-${uid})`}>
        {Object.entries(fases).map(([chave, f]) => {
          const w = x(f.fim) - x(f.inicio);
          return (
            <g key={chave}>
              <rect x={x(f.inicio)} y={yFase} width={w} height={hFase} fill={FASES[chave].cor} />
              <line x1={x(f.fim)} y1={yFase} x2={x(f.fim)} y2={yFase + hFase} stroke="#0d1624" strokeWidth="2" />
              {w > 60 && <text x={x(f.inicio) + w / 2} y={yFase + hFase / 2 + 4} textAnchor="middle" fill="#ffffff" fillOpacity="0.92" fontSize="10.5" fontWeight="700">{FASES[chave].nome}</text>}
            </g>
          );
        })}
      </g>

      {/* RÉGUA */}
      {marcas.map((m) => (
        <g key={`r${m}`}>
          <line x1={x(m)} y1={yRegua} x2={x(m)} y2={yRegua + 4} stroke={COR.rotulo} />
          {(distancia - m) / distancia * P > 48 && <text x={x(m)} y={yRegua + 16} textAnchor="middle" fill={COR.rotulo} fontSize="9.5" fontWeight="600">{m}m</text>}
        </g>
      ))}
      <text x={x(distancia)} y={yRegua + 16} textAnchor="end" fill={COR.suave} fontSize="9.5" fontWeight="800">{distancia}m</text>

      {/* SKILLS — linha tingida na cor da skill, nome à esquerda e a ativação em destaque */}
      {linhas.map(({ sk, cor, gatilho, sufixo, chave }, i) => {
        const y = ySkills + i * (hSkill + gapSkill);
        const meioY = y + hSkill / 2;
        const icone = caminhoIconeSkill(sk.iconId);
        const regiao = gatilho?.regions[0];
        // Simulação (Comparador): gatilho traz o início médio e a duração real em metros.
        const durMetros = gatilho?.duracaoMetros ?? (gatilho?.baseDuration != null ? (gatilho.baseDuration / 10000) * velocidadeBaseDaPista(distancia) : 0);
        const inicio = gatilho?.inicio ?? regiao?.start;
        const xIni = regiao ? x(inicio) : L;
        const xFimDur = regiao ? Math.min(xIni + Math.max((durMetros / distancia) * P, 10), W - R) : L;
        const nome = `${sk.nome}${sufixo}`;
        const larguraNome = nome.length * 7 + 16;
        const nomeNaFrente = !regiao || xIni - L > larguraNome + 12; // cabe antes da ativação
        const duracao = gatilho?.textoDuracao ?? (gatilho?.baseDuration != null ? formatarDuracaoBase(gatilho.baseDuration) : "");
        const posicao = regiao ? `${Math.round(inicio)}m` : "";
        const prioridade = skills.indexOf(sk) + 1;
        const textoAtivacao = nomeNaFrente ? `${posicao} · ${duracao}` : `${nome} · ${duracao}`;
        const textoAntes = xFimDur + 8 + textoAtivacao.length * 6.8 > W - R;
        return (
          <g key={`s${chave}`} opacity={regiao ? 1 : 0.45}>
            {/* prioridade + ícone */}
            {numerar && <circle cx={L - 58} cy={meioY} r="10" fill={cor} />}
            {numerar && <text x={L - 58} y={meioY + 4} textAnchor="middle" fill="#0b1320" fontSize="11" fontWeight="900">{prioridade}</text>}
            {icone && <image href={icone} x={L - 42} y={meioY - 15} width="30" height="30" />}
            {/* trilho tingido */}
            <rect x={L} y={y} width={P} height={hSkill} rx="7" fill={cor} fillOpacity="0.07" stroke={cor} strokeOpacity="0.18" />
            <rect x={L} y={y} width="4" height={hSkill} rx="2" fill={cor} />
            {nomeNaFrente && <text x={L + 14} y={meioY + 4} fill={COR.texto} fontSize="12" fontWeight="800">{regiao ? nome : `${sk.nome} — não ativa nesta pista com este estilo`}</text>}
            {regiao && (
              <>
                <line x1={xIni} y1={y} x2={xIni} y2={y + hSkill} stroke={cor} strokeOpacity="0.6" />
                <rect x={x(regiao.start)} y={y + 5} width={Math.max(x(regiao.end) - x(regiao.start), 4)} height={hSkill - 10} rx="5" fill={cor} fillOpacity="0.16" stroke={cor} strokeOpacity="0.7" strokeDasharray="4 3" />
                <rect x={xIni} y={y + 5} width={xFimDur - xIni} height={hSkill - 10} rx="5" fill={cor} filter={`url(#brilho-${uid})`} />
                <text x={textoAntes ? xIni - 8 : xFimDur + 8} y={meioY + 4} textAnchor={textoAntes ? "end" : "start"} fill={cor} fontSize="11.5" fontWeight="800">{textoAtivacao}</text>
              </>
            )}
          </g>
        );
      })}

      {/* SKILLS em etiquetas (Comparador): posição real da ativação, largura = duração */}
      {gruposEtiqueta.length === 1 && rotulo("SKILLS", ySkills + 15)}
      {gruposEtiqueta.length > 1 && gruposEtiqueta.map((g) => {
        const y0 = yEtiqueta(g.primeira, g.indice);
        const y1 = yEtiqueta(g.primeira + g.n - 1, g.indice) + hEtiqueta;
        return (
          <g key={`grupo-${g.chave}`}>
            <rect x={L - 8} y={y0} width="3" height={y1 - y0} rx="1.5" fill={g.cor} />
            <text x={L - 14} y={y0 + 15} textAnchor="end" fill={g.cor} fontSize="10" fontWeight="900" letterSpacing="1.2">SKILLS {g.chave}</text>
            {g.indice > 0 && <line x1={L} x2={W - R} y1={y0 - SEP_GRUPO / 2 - gapEtiqueta / 2} y2={y0 - SEP_GRUPO / 2 - gapEtiqueta / 2} stroke="rgba(164, 179, 198, 0.12)" strokeDasharray="4 4" />}
          </g>
        );
      })}
      {linhasEtiqueta.map((e, i) => {
        const y = yEtiqueta(e.linha, e.grupoIndice ?? 0);
        const icone = e.iconId ? caminhoIconeSkill(e.iconId) : null;
        const xTexto = e.dentro ? e.xi + 3 : e.textoAntes ? e.xi - 4 - e.largTexto + 4 : e.xi + e.larg + 4;
        return (
          <g key={`e${i}`}>
            <title>{`${e.nome}: ${Math.round(e.inicio)}m → ${Math.round(e.fim)}m (${Math.round(e.fim - e.inicio)}m)`}</title>
            <line x1={e.xi} x2={e.xi} y1={yRegua} y2={y} stroke={e.cor} strokeOpacity="0.35" strokeDasharray="2 3" />
            <rect x={e.xi} y={y} width={e.larg} height={hEtiqueta} rx="4" fill={e.cor} fillOpacity={e.evento ? 0.14 : 0.55} stroke={e.cor} strokeDasharray={e.evento ? "4 3" : undefined} />
            {icone && <image href={icone} x={xTexto} y={y + 2} width="18" height="18" />}
            <text x={xTexto + (icone ? 22 : 4)} y={y + 15} fill={e.evento ? e.cor : COR.texto} fontSize="10.5" fontWeight={e.evento ? 800 : 700} fontStyle={e.evento ? "italic" : undefined}>{e.nome}</text>
          </g>
        );
      })}

      {/* Linha do mouse + tooltip */}
      {mouse != null && (
        <g pointerEvents="none">
          <line x1={x(mouse)} y1={(curvas ? yCurvas : yElev) - 4} x2={x(mouse)} y2={altura - 4} stroke={COR.texto} strokeOpacity="0.45" strokeWidth="1" />
          <circle cx={x(mouse)} cy={yAlt(alturaEm(perfil, mouse))} r="4" fill="#0d1624" stroke={COR.ouro} strokeWidth="2" />
          {/* pontos nas curvas */}
          {infoMouse.grupos.map((g) => (
            <g key={`p${g.chave}`}>
              {g.yVel != null && <circle cx={g.xVel} cy={g.yVel} r="4.5" fill={g.cor} stroke="#0b1320" strokeWidth="2" />}
              {g.yHp != null && <circle cx={g.xHp} cy={g.yHp} r="3.5" fill="#0b1320" stroke={g.cor} strokeWidth="2" />}
            </g>
          ))}
          {(() => {
            // Cartão ao lado do mouse: local em cima, uma linha por corredora embaixo.
            const { local, grupos } = infoMouse;
            const w = Math.max(local.length * 6.4 + 24, grupos.length ? 210 : 0);
            const h = 26 + grupos.length * 21;
            const ladoDireito = x(mouse) + 14 + w <= W - R;
            const bx = grupos.length ? (ladoDireito ? x(mouse) + 14 : x(mouse) - 14 - w) : Math.min(Math.max(x(mouse) - w / 2, L), W - R - w);
            const by = curvas ? yCurvas + 6 : 4;
            return (
              <g>
                <rect x={bx} y={by} width={w} height={h} rx="8" fill="#0b1320" fillOpacity="0.96" stroke={COR.ouro} strokeOpacity="0.7" />
                <text x={bx + 12} y={by + 17} fill={COR.ouro} fontSize="11" fontWeight="800">{local}</text>
                {grupos.map((g, i) => {
                  const y = by + 26 + i * 21;
                  return (
                    <g key={`t${g.chave}`}>
                      <rect x={bx + 8} y={y} width={w - 16} height="18" rx="4" fill={g.cor} fillOpacity="0.12" />
                      <rect x={bx + 8} y={y} width="3" height="18" rx="1.5" fill={g.cor} />
                      <text x={bx + 18} y={y + 13} fill={g.cor} fontSize="11" fontWeight="900">{g.chave}</text>
                      {g.vel != null && <text x={bx + 40} y={y + 13} fill={COR.texto} fontSize="11" fontWeight="700">{g.vel.toFixed(2)} m/s</text>}
                      {g.hp != null && <text x={bx + w - 14} y={y + 13} textAnchor="end" fill={COR.texto} fontSize="11" fontWeight="700">HP {Math.round(g.hp)}</text>}
                    </g>
                  );
                })}
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

export default DiagramaPistaGuia;
