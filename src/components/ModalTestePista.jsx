import { useEffect, useMemo, useRef, useState } from "react";
import { bancoCorridas, bancoG1 } from "../data/bancos-corridas";
import { tracknames, courseData } from "../data/pistasCourseData";
import {
  buildSkillData, CAVALO_NEUTRO, PARAMETROS_CORRIDA_NEUTROS, ConditionsAjustadas, getParser, Region, RegionList,
} from "../uma-skill-tools/buildSkillData";
import skillDataRaw from "../uma-skill-tools/data/skill_data.json";
import skillNamesRaw from "../uma-skill-tools/data/skillnames.json";
import skillMetaRaw from "../uma-skill-tools/data/skill_meta.json";
import umasRaw from "../uma-skill-tools/data/umas.json";
import iconsRaw from "../uma-skill-tools/data/icons.json";
import recomendacoesPistasRaw from "../uma-skill-tools/data/recomendacoes-pistas.json";

// ============================================================================
// 🎯 Modal COMPLETO de teste de skill numa pista — a mesma tela que já
// existe no BuscadorPistas.jsx (diagrama + testar skill + clima/terreno/
// estação + recomendações), só que reaproveitável de qualquer lugar do
// site (usado pela Agenda, ver PistaCard em Agenda.jsx, pra abrir direto
// de um card de corrida sorteada, sem sair da página).
//
// IMPORTANTE: tudo aqui é CÓPIA do que já existe em BuscadorPistas.jsx
// (mesmas funções, mesma lógica, mesmo texto), não um import de lá — o
// BuscadorPistas.jsx é o arquivo mais editado/frágil do projeto inteiro,
// então preferi duplicar essas ~1300 linhas isoladas aqui a arriscar
// refatorar a estrutura dele só pra compartilhar código. Se corrigir um
// bug de skill/diagrama num dos dois lados, replicar no outro também.
//
// Usa as mesmas classes CSS de buscadorpistas.css (já carregado
// globalmente em main.jsx) — nenhum CSS novo foi necessário.
// ============================================================================

// ----------------------------------------------------------------------
// DIAGRAMA DA PISTA (lookup dos dados reais + desenho SVG)
// ----------------------------------------------------------------------

function traduzirDirecao(direcao) {
  if (direcao === "Right") return "Direita";
  if (direcao === "Left") return "Esquerda";
  return "Reta";
}

const APELIDOS_HIPODROMO = { Chukyo: "Chuukyo" };
const PREFERENCIA_COURSE_HIPODROMO = { Kyoto: 3 };

// 🎯 Nome da corrida → ID exato do percurso no jogo (campo courseId do
// bancos-corridas.js, cruzado com os dados do jogo). Serve pras pistas
// que chegam sem o ID (ex: salvas no Firestore antes do campo existir).
const COURSE_ID_POR_NOME = Object.fromEntries(
  [...bancoCorridas, ...bancoG1].filter((p) => p.courseId).map((p) => [p.nome, p.courseId])
);

function encontrarCourseData(pista) {
  // 🎯 Caminho principal: o ID exato do percurso. Só cai no cruzamento
  // hipódromo+distância+terreno+direção abaixo se a pista não tiver ID
  // nem estiver no banco — ele erra quando há 2 traçados (ex: Niigata).
  const courseIdExato = pista.courseId ?? pista.course_id ?? COURSE_ID_POR_NOME[pista.nome];
  if (courseIdExato != null && courseData[courseIdExato]) return courseData[courseIdExato];

  const nomeParaComparar = APELIDOS_HIPODROMO[pista.hipodromo] || pista.hipodromo;
  const raceTrackId = Object.keys(tracknames).find(
    (id) => tracknames[id][1].toLowerCase() === nomeParaComparar.toLowerCase()
  );
  if (!raceTrackId) return null;

  const surfaceAlvo = pista.terrenoCurto === "Dirt" ? 2 : 1;
  const turnAlvo = pista.direcao === "Right" ? 1 : pista.direcao === "Left" ? 2 : 4;

  const candidatos = Object.values(courseData).filter(
    (c) =>
      c.raceTrackId === Number(raceTrackId) &&
      c.distance === pista.distanciaNumero &&
      c.surface === surfaceAlvo &&
      c.turn === turnAlvo
  );
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  const coursePreferido = PREFERENCIA_COURSE_HIPODROMO[pista.hipodromo];
  if (coursePreferido != null) {
    const preferido = candidatos.find((c) => c.course === coursePreferido);
    if (preferido) return preferido;
  }
  return [...candidatos].sort((a, b) => a.course - b.course)[0];
}

function calcularFases(distancia) {
  const abertura = distancia / 6;
  const meio = distancia / 2;
  const final = distancia / 6;
  return {
    abertura: { inicio: 0, fim: abertura },
    meio: { inicio: abertura, fim: abertura + meio },
    final: { inicio: abertura + meio, fim: abertura + meio + final },
    ultimoSprint: { inicio: abertura + meio + final, fim: distancia },
  };
}

function montarSegmentosPista(dados) {
  const zonasConhecidas = [
    ...dados.corners.map((c) => ({ tipo: "curva", inicio: c.start, fim: c.start + c.length })),
    ...dados.straights.map((s) => ({ tipo: "reta", inicio: s.start, fim: s.end })),
  ].sort((a, b) => a.inicio - b.inicio);

  const segmentos = [];
  let cursor = 0;
  let numeroCurva = 0;
  zonasConhecidas.forEach((zona) => {
    if (zona.inicio > cursor) {
      segmentos.push({ tipo: "indefinido", inicio: cursor, fim: zona.inicio });
    }
    if (zona.inicio < cursor) return;
    if (zona.tipo === "curva") numeroCurva += 1;
    segmentos.push({ ...zona, numero: zona.tipo === "curva" ? numeroCurva : undefined });
    cursor = zona.fim;
  });
  if (cursor < dados.distance) {
    segmentos.push({ tipo: "indefinido", inicio: cursor, fim: dados.distance });
  }
  return segmentos;
}

function montarSegmentosDeclive(dados) {
  return [...(dados.slopes || [])]
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ tipo: s.slope > 0 ? "subida" : "descida", inicio: s.start, fim: s.start + s.length, slope: s.slope }));
}

function calcularPerfilElevacao(dados) {
  const pontos = [{ pos: 0, altura: 0 }];
  let alturaAtual = 0;
  let posAtual = 0;
  const slopesOrdenados = [...(dados.slopes || [])].sort((a, b) => a.start - b.start);
  slopesOrdenados.forEach((s) => {
    if (s.start > posAtual) pontos.push({ pos: s.start, altura: alturaAtual });
    const alturaFinal = alturaAtual + s.length * (s.slope / 1000000);
    pontos.push({ pos: s.start, altura: alturaAtual });
    pontos.push({ pos: s.start + s.length, altura: alturaFinal });
    alturaAtual = alturaFinal;
    posAtual = s.start + s.length;
  });
  if (posAtual < dados.distance) pontos.push({ pos: dados.distance, altura: alturaAtual });
  return pontos;
}

const CORES = {
  fundo: "#fdf9f0",
  skyline: "#c5e05a",
  faixaDeclive: "#ecdcea",
  subida: "#f0c890",
  subidaBorda: "#c98a3e",
  descida: "#4a9ea3",
  descidaBorda: "#2f7a7f",
  faixaSecao: "#bfe0f5",
  curva: "#f0c890",
  curvaBorda: "#c98a3e",
  reguaFundo: "#dbe6ef",
  textoEscuro: "#5a3018",
  textoClaro: "#ffffff",
};

const CORES_FASE = {
  abertura: "#1f7a54",
  meio: "#d9b03c",
  final: "#a8447a",
  ultimoSprint: "#7a2f56",
};

function SetaDireção({ x, y, tamanho = 9, subindo, cor }) {
  const pontos = subindo
    ? `M0,${tamanho} L${tamanho},0 M${tamanho * 0.5},0 L${tamanho},0 L${tamanho},${tamanho * 0.5}`
    : `M0,0 L${tamanho},${tamanho} M${tamanho * 0.5},${tamanho} L${tamanho},${tamanho} L${tamanho},${tamanho * 0.5}`;
  return (
    <path
      d={pontos}
      transform={`translate(${x},${y})`}
      stroke={cor}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

function velocidadeBaseDaPista(distancia) {
  return 20.0 - (distancia - 2000) / 1000.0;
}

function formatarDuracaoBase(baseDuration) {
  return (baseDuration / 10000).toFixed(1) + "s";
}

function DiagramaPistaSVG({ dadosCorrida, skillsDestacadas }) {
  const largura = 900;
  const distancia = dadosCorrida.distance;
  const escala = largura / distancia;

  const segmentosPista = useMemo(() => montarSegmentosPista(dadosCorrida), [dadosCorrida]);
  const segmentosDeclive = useMemo(() => montarSegmentosDeclive(dadosCorrida), [dadosCorrida]);
  const fases = useMemo(() => calcularFases(distancia), [distancia]);
  const perfilElevacao = useMemo(() => calcularPerfilElevacao(dadosCorrida), [dadosCorrida]);

  const alturas = perfilElevacao.map((p) => p.altura);
  const alturaMaxima = Math.max(...alturas, 0);
  const alturaMinima = Math.min(...alturas, 0);
  const amplitude = alturaMaxima - alturaMinima || 1;

  const svgRef = useRef(null);
  const [metragemMouse, setMetragemMouse] = useState(null);

  function aoMoverMouse(e) {
    if (!svgRef.current) return;
    const retangulo = svgRef.current.getBoundingClientRect();
    const proporcaoX = (e.clientX - retangulo.left) / retangulo.width;
    const metros = proporcaoX * distancia;
    setMetragemMouse(Math.max(0, Math.min(distancia, Math.round(metros))));
  }

  function aoSairMouse() {
    setMetragemMouse(null);
  }

  const alturaSkyline = 28;
  const alturaDeclive = 34;
  const alturaSecao = 36;
  const alturaFase = 36;
  const alturaRegua = 26;
  const alturaTrilhoSkill = 26;
  const espacoTrilho = 4;

  const linhasDeTrilha = useMemo(
    () =>
      skillsDestacadas.flatMap((sk) =>
        sk.gatilhos.length > 0
          ? sk.gatilhos.map((gatilho, gi) => ({ sk, gatilho, numero: gi + 1, chave: `${sk.id}-${gi}` }))
          : [{ sk, gatilho: null, numero: 1, chave: `${sk.id}-vazio` }]
      ),
    [skillsDestacadas]
  );

  const ySkyline = 20;
  const yDeclive = ySkyline + alturaSkyline;
  const ySecao = yDeclive + alturaDeclive;
  const yFase = ySecao + alturaSecao;
  const yRegua = yFase + alturaFase;
  const yTrilhosSkills = yRegua + alturaRegua + 8;
  const alturaTotal = yTrilhosSkills + linhasDeTrilha.length * (alturaTrilhoSkill + espacoTrilho);

  return (
    <svg
      viewBox={`0 0 ${largura} ${alturaTotal}`}
      className="bp-diagrama-svg"
      xmlns="http://www.w3.org/2000/svg"
      ref={svgRef}
      onMouseMove={aoMoverMouse}
      onMouseLeave={aoSairMouse}
    >
      <rect x={0} y={0} width={largura} height={alturaTotal} fill={CORES.fundo} />

      <rect x={0} y={ySkyline} width={largura} height={alturaSkyline} fill="#fdf9f0" />
      <polygon
        points={
          `0,${ySkyline + alturaSkyline} ` +
          perfilElevacao.map((p) => `${p.pos * escala},${ySkyline + alturaSkyline - 3 - ((p.altura - alturaMinima) / amplitude) * (alturaSkyline - 6)}`).join(" ") +
          ` ${largura},${ySkyline + alturaSkyline}`
        }
        fill={CORES.skyline}
      />
      {segmentosDeclive.map((s, idx) => {
        const meio = (s.inicio + s.fim) / 2;
        const alturaNoMeio = perfilElevacao.reduce((maisProximo, p) => (Math.abs(p.pos - meio) < Math.abs(maisProximo.pos - meio) ? p : maisProximo)).altura;
        const yPercentual = ySkyline + alturaSkyline - 3 - ((alturaNoMeio - alturaMinima) / amplitude) * (alturaSkyline - 6) - 4;
        const percentual = Math.abs(s.slope) / 10000;
        return (
          <text key={`pct-${idx}`} x={meio * escala} y={Math.max(yPercentual, 9)} textAnchor="middle" className="bp-diagrama-texto-marca" fill="#5a6b1a">
            {percentual > 0 ? `${percentual}%` : ""}
          </text>
        );
      })}

      <rect x={0} y={yDeclive} width={largura} height={alturaDeclive} fill={CORES.faixaDeclive} />
      {segmentosDeclive.map((s, idx) => {
        const larguraPx = (s.fim - s.inicio) * escala;
        const mostrarTexto = larguraPx > 55;
        return (
          <g key={`declive-${idx}`}>
            <rect
              x={s.inicio * escala}
              y={yDeclive}
              width={larguraPx}
              height={alturaDeclive}
              fill={s.tipo === "subida" ? CORES.subida : CORES.descida}
              stroke={s.tipo === "subida" ? CORES.subidaBorda : CORES.descidaBorda}
              strokeWidth={1}
            />
            {mostrarTexto ? (
              <>
                <text
                  x={(s.inicio + s.fim) / 2 * escala - 8}
                  y={yDeclive + alturaDeclive / 2 + 4}
                  textAnchor="end"
                  className="bp-diagrama-texto-segmento"
                  fill={s.tipo === "subida" ? CORES.textoEscuro : CORES.textoClaro}
                >
                  {s.tipo === "subida" ? "Uphill" : "Downhill"}
                </text>
                <SetaDireção
                  x={(s.inicio + s.fim) / 2 * escala}
                  y={yDeclive + alturaDeclive / 2 - 6}
                  tamanho={11}
                  subindo={s.tipo === "subida"}
                  cor={s.tipo === "subida" ? CORES.textoEscuro : CORES.textoClaro}
                />
              </>
            ) : (
              <SetaDireção
                x={(s.inicio + s.fim) / 2 * escala - 5}
                y={yDeclive + alturaDeclive / 2 - 5}
                tamanho={10}
                subindo={s.tipo === "subida"}
                cor={s.tipo === "subida" ? CORES.textoEscuro : CORES.textoClaro}
              />
            )}
          </g>
        );
      })}

      {[...new Set(segmentosDeclive.flatMap((s) => [s.inicio, s.fim]))]
        .sort((a, b) => a - b)
        .map((m) => (
          <text key={`declive-marca-${m}`} x={m * escala} y={yDeclive - 3} textAnchor="middle" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
            {Math.round(m)}m
          </text>
        ))}

      {segmentosPista.map((s, idx) => {
        const larguraPx = (s.fim - s.inicio) * escala;

        if (s.tipo === "indefinido") {
          return (
            <g key={`seg-${idx}`}>
              <text x={s.inicio * escala + 3} y={ySecao + 30} className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
                {s.inicio > 0 ? `${Math.round(s.inicio)}m` : ""}
              </text>
              <text x={s.fim * escala - 3} y={ySecao + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
                {s.fim < distancia ? `${Math.round(s.fim)}m` : ""}
              </text>
            </g>
          );
        }

        if (s.tipo === "curva") {
          return (
            <g key={`seg-${idx}`}>
              <rect x={s.inicio * escala} y={ySecao} width={larguraPx} height={alturaSecao} fill={CORES.curva} />
              <line x1={s.inicio * escala} y1={ySecao} x2={s.inicio * escala} y2={ySecao + alturaSecao} stroke={CORES.curvaBorda} strokeWidth={1} />
              <line x1={s.fim * escala} y1={ySecao} x2={s.fim * escala} y2={ySecao + alturaSecao} stroke={CORES.curvaBorda} strokeWidth={1} />
              <text x={(s.inicio + s.fim) / 2 * escala} y={ySecao + 16} textAnchor="middle" className="bp-diagrama-texto-segmento" fill={CORES.textoEscuro}>
                {`Corner ${s.numero}`}
              </text>
              <text x={s.fim * escala - 4} y={ySecao + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
                {larguraPx > 30 && s.fim < distancia ? `${Math.round(s.fim)}m` : ""}
              </text>
            </g>
          );
        }

        return (
          <g key={`seg-${idx}`}>
            <rect x={s.inicio * escala} y={ySecao} width={larguraPx} height={alturaSecao} fill={CORES.faixaSecao} />
            <text x={(s.inicio + s.fim) / 2 * escala} y={ySecao + 16} textAnchor="middle" className="bp-diagrama-texto-segmento" fill={CORES.textoEscuro}>
              Straight
            </text>
            <text x={s.fim * escala - 4} y={ySecao + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
              {larguraPx > 30 && s.fim < distancia ? `${Math.round(s.fim)}m` : ""}
            </text>
          </g>
        );
      })}

      {Object.entries(fases).map(([nome, f]) => (
        <g key={nome}>
          <rect x={f.inicio * escala} y={yFase} width={(f.fim - f.inicio) * escala} height={alturaFase} fill={CORES_FASE[nome]} />
          <text x={(f.inicio + f.fim) / 2 * escala} y={yFase + 16} textAnchor="middle" className="bp-diagrama-texto-segmento" fill={CORES.textoClaro}>
            {nome === "abertura" && "Early-race"}
            {nome === "meio" && "Mid-race"}
            {nome === "final" && "Late-race"}
            {nome === "ultimoSprint" && "Last spurt"}
          </text>
          <text x={f.fim * escala - 4} y={yFase + 30} textAnchor="end" className="bp-diagrama-texto-marca" fill="rgba(255,255,255,0.85)">
            {f.fim < distancia ? `${Math.round(f.fim)}m` : ""}
          </text>
        </g>
      ))}

      <rect x={0} y={yFase + alturaFase} width={largura} height={alturaRegua} fill={CORES.reguaFundo} />
      <line x1={0} y1={yRegua} x2={largura} y2={yRegua} stroke="rgba(90,48,24,0.3)" strokeWidth={1} />
      {Array.from({ length: Math.floor(distancia / 200) + 1 }, (_, i) => i * 200).map((m) => (
        <g key={`regua-${m}`}>
          <line x1={m * escala} y1={yRegua - 4} x2={m * escala} y2={yRegua + 4} stroke="rgba(90,48,24,0.4)" strokeWidth={1} />
          <text x={m * escala} y={yRegua + 19} textAnchor="middle" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>{m}m</text>
        </g>
      ))}
      <text x={largura - 2} y={yRegua + 19} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>{distancia}m</text>

      {skillsDestacadas.map((sk) =>
        sk.gatilhos.flatMap((gatilho, gi) =>
          gatilho.isImmediate ? (
            <line
              key={`skill-${sk.id}-${gi}-imediata`}
              x1={gatilho.regions[0].start * escala}
              y1={0}
              x2={gatilho.regions[0].start * escala}
              y2={yRegua + alturaRegua}
              stroke={sk.cor.stroke}
              strokeWidth={2.5}
            />
          ) : (
            gatilho.regions.map((r, ri) => (
              <rect
                key={`skill-${sk.id}-${gi}-${ri}`}
                x={r.start * escala}
                y={0}
                width={(r.end - r.start) * escala}
                height={yRegua + alturaRegua}
                fill={sk.cor.fill}
                stroke={sk.cor.stroke}
                strokeWidth={1}
              />
            ))
          )
        )
      )}

      {linhasDeTrilha.map((linha, idx) => {
        const y = yTrilhosSkills + idx * (alturaTrilhoSkill + espacoTrilho);
        const { sk, gatilho, numero } = linha;
        const regiao = gatilho && gatilho.regions[0];
        const larguraDuracaoMetros = gatilho && gatilho.baseDuration != null
          ? (gatilho.baseDuration / 10000) * velocidadeBaseDaPista(distancia)
          : 0;
        const numeroAlternativa = sk.gatilhos.length > 1 ? ` [${numero}]` : "";
        return (
          <g key={`trilho-${linha.chave}`}>
            <rect x={0} y={y} width={largura} height={alturaTrilhoSkill} fill="rgba(0,0,0,0.15)" rx={4} />
            {regiao && (
              <>
                <rect
                  x={regiao.start * escala}
                  y={y + 3}
                  width={Math.max((regiao.end - regiao.start) * escala, 5)}
                  height={alturaTrilhoSkill - 6}
                  fill={sk.cor.fill}
                  fillOpacity={0.25}
                  stroke={sk.cor.stroke}
                  strokeOpacity={0.5}
                  strokeWidth={1}
                  strokeDasharray="3,2"
                  rx={4}
                />
                <rect
                  x={regiao.start * escala}
                  y={y + 3}
                  width={Math.max(larguraDuracaoMetros * escala, 4)}
                  height={alturaTrilhoSkill - 6}
                  fill={sk.cor.fill}
                  stroke={sk.cor.stroke}
                  strokeWidth={1.5}
                  rx={4}
                />
                <text
                  x={Math.min(regiao.start * escala + 8, largura - 8)}
                  y={y + alturaTrilhoSkill / 2 + 4}
                  className="bp-diagrama-texto-marca"
                  fill={CORES.textoEscuro}
                  fontWeight="700"
                >
                  {sk.nome}{numeroAlternativa}
                  {gatilho.baseDuration != null && ` (${formatarDuracaoBase(gatilho.baseDuration)})`}
                </text>
              </>
            )}
            {!regiao && (
              <text x={8} y={y + alturaTrilhoSkill / 2 + 4} className="bp-diagrama-texto-marca" fill={CORES.textoEscuro} fontWeight="700" opacity={0.5}>
                {sk.nome} — não ativa nessa pista
              </text>
            )}
          </g>
        );
      })}

      {metragemMouse !== null && (
        <g pointerEvents="none">
          <line x1={metragemMouse * escala} y1={0} x2={metragemMouse * escala} y2={alturaTotal} stroke="#8b2635" strokeWidth={1.5} />
          <rect
            x={Math.min(Math.max(metragemMouse * escala - 22, 0), largura - 44)}
            y={2}
            width={44}
            height={16}
            fill="#fdf9f0"
            stroke="#8b2635"
            strokeWidth={1}
            rx={3}
          />
          <text
            x={Math.min(Math.max(metragemMouse * escala, 22), largura - 22)}
            y={14}
            textAnchor="middle"
            className="bp-diagrama-texto-marca"
            fill="#8b2635"
            fontWeight="700"
          >
            {metragemMouse}m
          </text>
        </g>
      )}
    </svg>
  );
}

// ----------------------------------------------------------------------
// SISTEMA DE SKILLS (motor + catálogos — cópia da preparação de dados de
// BuscadorPistas.jsx)
// ----------------------------------------------------------------------

const catalogoSkillsCompleto = Object.keys(skillDataRaw)
  .filter((id) => skillNamesRaw[id] && !id.includes("-"))
  .map((id) => {
    const alternativasIrmãs = Object.keys(skillDataRaw)
      .filter((outroId) => outroId.startsWith(`${id}-`))
      .flatMap((outroId) => skillDataRaw[outroId].alternatives);
    return {
      id,
      nome: skillNamesRaw[id][1] || skillNamesRaw[id][0],
      rarity: skillDataRaw[id].rarity,
      herdada: id[0] === "9",
      alternatives: [...skillDataRaw[id].alternatives, ...alternativasIrmãs],
      iconId: skillMetaRaw[id]?.iconId || null,
    };
  })
  .sort((a, b) => {
    const prioridade = (s) => {
      if (s.rarity === 2) return 0;
      if (s.rarity === 1 && !s.herdada) return 1;
      return 2;
    };
    const diff = prioridade(a) - prioridade(b);
    if (diff !== 0) return diff;
    return a.nome.localeCompare(b.nome);
  });

const EVOLUIDAS_DISPONIVEIS_NO_GLOBAL = false;

const catalogoSkills = catalogoSkillsCompleto.filter((s) => {
  if (!s.herdada && [3, 4, 5].includes(s.rarity)) return false;
  if (!EVOLUIDAS_DISPONIVEIS_NO_GLOBAL && s.rarity === 6) return false;
  return true;
});

const parserSkills = getParser(ConditionsAjustadas);

const VALORES_CONDICAO = {
  distance_type: { 1: "Sprint", 2: "Mile", 3: "Medium", 4: "Long" },
  ground_type: { 1: "Turf", 2: "Dirt" },
  running_style: { 1: "Front Runner", 2: "Pace Chaser", 3: "Late Surger", 4: "End Closer", 5: "Oonige" },
  phase: { 0: "Early-race", 1: "Mid-race", 2: "Late-race", 3: "Last spurt" },
};

function formatarValorCondicao(chave, valor) {
  if (VALORES_CONDICAO[chave] && VALORES_CONDICAO[chave][valor] !== undefined) {
    return VALORES_CONDICAO[chave][valor];
  }
  if (/_per$|_rate$/.test(chave)) {
    return `${valor}%`;
  }
  return valor;
}

function formatarCondicaoTexto(condStr) {
  if (!condStr) return "";
  return condStr.replace(/([a-z_]+)(==|!=|>=|<=|>|<)(\d+)/gi, (match, chave, op, valorStr) => {
    return `${chave}${op}${formatarValorCondicao(chave, Number(valorStr))}`;
  });
}

function partesDaCondicao(condStr) {
  if (!condStr) return [];
  return condStr.split(/(?=[&@])/).map((parte) => formatarCondicaoTexto(parte));
}

function formatarHn(valor) {
  const texto = valor.toFixed(4).replace(/\.?0+$/, "");
  return valor <= 0 ? texto : `+${texto}`;
}

const TIPOS_EFEITO_CONFIRMADOS = {
  1: { nome: "Speed up", formatar: (m) => formatarHn(m / 10000) },
  2: { nome: "Stamina up", formatar: (m) => formatarHn(m / 10000) },
  3: { nome: "Power up", formatar: (m) => formatarHn(m / 10000) },
  4: { nome: "Guts up", formatar: (m) => formatarHn(m / 10000) },
  5: { nome: "Wisdom up", formatar: (m) => formatarHn(m / 10000) },
  9: { nome: "Recovery", formatar: (m) => `${((m / 10000) * 100).toFixed(1)}%` },
  13: { nome: "Rushed duration", formatar: (m) => `${formatarHn(m / 10000)}s` },
  21: { nome: "Current speed", formatar: (m) => `${formatarHn(m / 10000)}m/s` },
  22: { nome: "Current speed with natural deceleration", formatar: (m) => `${formatarHn(m / 10000)}m/s` },
  27: { nome: "Target speed", formatar: (m) => `${formatarHn(m / 10000)}m/s` },
  28: { nome: "Lane movement speed", formatar: (m) => formatarHn(m / 10000) },
  29: { nome: "Rushed chance", formatar: (m) => `${formatarHn(m / 10000)}%` },
  31: { nome: "Acceleration", formatar: (m) => `${formatarHn(m / 10000)}m/s²` },
  37: { nome: "Activate random gold skill", formatar: (m) => formatarHn(m / 10000) },
  42: { nome: "Increase skill duration", formatar: (m) => `${(m / 10000).toFixed(2)}×` },
};

function formatarEfeito(efeito) {
  const info = TIPOS_EFEITO_CONFIRMADOS[efeito.type];
  if (info) return { nome: info.nome, valor: info.formatar(efeito.modifier) };
  return { nome: `Effect type ${efeito.type}`, valor: String(efeito.modifier) };
}

function formatarDuracaoEfetiva(baseDuration, distancia) {
  const valor = (baseDuration / 10000) * (distancia / 1000);
  return `${valor.toFixed(4).replace(/\.?0+$/, "")}s`;
}

const PALETA_SKILLS = [
  { stroke: "rgb(205,11,11)", fill: "rgba(247,115,115,0.35)" },
  { stroke: "rgb(28,61,106)", fill: "rgba(47,103,177,0.35)" },
  { stroke: "rgb(114,76,132)", fill: "rgba(182,153,196,0.35)" },
  { stroke: "rgb(36,106,99)", fill: "rgba(61,177,166,0.35)" },
];

function classeRaridade(rarity) {
  if (rarity === 1) return "branca";
  if (rarity === 2) return "dourada";
  if (rarity === 6) return "evoluida";
  return "unica";
}

function idDaUniqueSkill(outfitId, starCount) {
  const oid = String(outfitId);
  const i = Number(oid.slice(1, -2));
  const v = Number(oid.slice(-2));
  const sid = 10000 * (1 + 9 * (starCount > 2 ? 1 : 0)) + 10000 * (v - 1) + i * 10 + 1;
  return String(sid);
}

const catalogoCavalinhas = Object.entries(umasRaw).flatMap(([baseId, uma]) =>
  Object.entries(uma.outfits).map(([outfitId, outfit]) => ({
    outfitId,
    nomeBase: uma.name[1],
    epiteto: outfit.epithet,
    strategy: outfit.strategy,
    rarity: outfit.rarity,
  }))
).sort((a, b) => a.nomeBase.localeCompare(b.nomeBase));

const donoDaUniqueBase = new Map();
catalogoCavalinhas.forEach((c) => {
  donoDaUniqueBase.set(idDaUniqueSkill(c.outfitId, 3), c);
});

function caminhoIconeSkill(iconId) {
  return iconId ? `/assets/img/skills/utx_ico_skill_${iconId}.png` : null;
}

function caminhoIconeCavalinha(outfitId) {
  const entrada = iconsRaw[outfitId];
  if (!entrada) return null;
  const arquivo = Array.isArray(entrada) ? entrada[1] : entrada;
  return `/assets/img/chara/${arquivo}.png`;
}

const FILTROS_CONDICAO = {
  nige: ["running_style==1"],
  senkou: ["running_style==2"],
  sasi: ["running_style==3"],
  oikomi: ["running_style==4"],
  short: ["distance_type==1"],
  mile: ["distance_type==2"],
  medium: ["distance_type==3"],
  long: ["distance_type==4"],
  turf: ["ground_type==1"],
  dirt: ["ground_type==2"],
  phase0: ["phase==0", "phase_random==0", "phase_firsthalf_random==0", "phase_laterhalf_random==0"],
  phase1: ["phase==1", "phase>=1", "phase_random==1", "phase_firsthalf_random==1", "phase_laterhalf_random==1"],
  phase2: ["phase==2", "phase>=2", "phase_random==2", "phase_firsthalf_random==2", "phase_laterhalf_random==2", "phase_firstquarter_random==2", "is_lastspurt==1"],
  phase3: ["phase==3", "phase_random==3", "phase_firsthalf_random==3", "phase_laterhalf_random==3"],
  finalcorner: ["is_finalcorner==1", "is_finalcorner_laterhalf==1", "is_finalcorner_random==1"],
  finalstraight: ["is_last_straight==1", "is_last_straight_onetime==1"],
};

function skillPassaNoFiltro(skill, chaveFiltro) {
  const trechos = FILTROS_CONDICAO[chaveFiltro];
  return skill.alternatives.some((alt) =>
    trechos.some((t) => alt.condition.includes(t) || (alt.precondition && alt.precondition.includes(t)))
  );
}

function calcularRegioesSkill(dadosCorrida, skillId, estrategia) {
  const wholeCourse = new RegionList();
  wholeCourse.push(new Region(0, dadosCorrida.distance));
  try {
    const cavalo = { ...CAVALO_NEUTRO, strategy: estrategia };
    const gatilhos = buildSkillData(cavalo, PARAMETROS_CORRIDA_NEUTROS, dadosCorrida, wholeCourse, parserSkills, skillId);
    return { erro: false, gatilhos };
  } catch (e) {
    console.error("Erro ao calcular ativação da skill:", skillId, e);
    return { erro: true, gatilhos: [] };
  }
}

const GRUPOS_FILTRO = {
  raridade: [
    { chave: "branca", label: "White" },
    { chave: "dourada", label: "Gold" },
    { chave: "unica", label: "Unique" },
    { chave: "evoluida", label: "Evolved" },
    { chave: "herdada", label: "Inherited" },
  ],
  estrategia: [
    { chave: "nige", label: "Front Runner" },
    { chave: "senkou", label: "Pace Chaser" },
    { chave: "sasi", label: "Late Surger" },
    { chave: "oikomi", label: "End Closer" },
  ],
  distancia: [
    { chave: "short", label: "Sprint" },
    { chave: "mile", label: "Mile" },
    { chave: "medium", label: "Medium" },
    { chave: "long", label: "Long" },
  ],
  terreno: [
    { chave: "turf", label: "Turf" },
    { chave: "dirt", label: "Dirt" },
  ],
  fase: [
    { chave: "phase0", label: "Early-race" },
    { chave: "phase1", label: "Mid-race" },
    { chave: "phase2", label: "Late-race" },
    { chave: "phase3", label: "Last spurt" },
    { chave: "finalcorner", label: "Final corner" },
    { chave: "finalstraight", label: "Final straight" },
  ],
};

function passaFiltroRaridade(skill, chave) {
  if (chave === "branca") return skill.rarity === 1 && !skill.herdada;
  if (chave === "dourada") return skill.rarity === 2;
  if (chave === "unica") return skill.rarity >= 3 && skill.rarity <= 5;
  if (chave === "evoluida") return skill.rarity === 6;
  if (chave === "herdada") return skill.herdada;
  return true;
}

const ICONES_FILTRO = [
  { base: "1001", iconId: "10011" },
  { base: "1002", iconId: "10021" },
  { base: "1003", iconId: "10031" },
  { base: "1004", iconId: "10041" },
  { base: "1005", iconId: "10051" },
  { base: "1006", iconId: "10061" },
  { base: "2001", iconId: "20011" },
  { base: "2002", iconId: "20021" },
  { base: "2004", iconId: "20041" },
  { base: "2005", iconId: "20051" },
  { base: "2006", iconId: "20061" },
  { base: "2009", iconId: "20091" },
  { base: "3001", iconId: "30011" },
  { base: "3002", iconId: "30021" },
  { base: "3004", iconId: "30041" },
  { base: "3005", iconId: "30051" },
  { base: "3007", iconId: "30071" },
];

function passaFiltroIcone(skill, baseGrupo) {
  return !!skill.iconId && skill.iconId.slice(0, -1) === baseGrupo;
}

const LIMITE_CARDS_EXIBIDOS = 60;

const ESTRATEGIAS_TESTE = [
  { valor: 1, label: "Front Runner" },
  { valor: 2, label: "Pace Chaser" },
  { valor: 3, label: "Late Surger" },
  { valor: 4, label: "End Closer" },
];

// ----------------------------------------------------------------------
// SELETOR DE SKILLS (busca + chips removíveis, roda o motor ao selecionar)
// ----------------------------------------------------------------------

function SeletorDeSkills({ dadosCorrida, skillsDestacadas, setSkillsDestacadas, skillHerdadaParaAdicionar, aoConsumirSkillHerdadaParaAdicionar }) {
  const [busca, setBusca] = useState("");
  const [buscaCavalinha, setBuscaCavalinha] = useState("");
  const [cavalinhaAberta, setCavalinhaAberta] = useState(false);
  const [cavalinhaSelecionada, setCavalinhaSelecionada] = useState(null);
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [skillsMinimizadas, setSkillsMinimizadas] = useState(new Set());

  function alternarMinimizada(id) {
    setSkillsMinimizadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  const [estrategiaCavalo, setEstrategiaCavalo] = useState(2);
  const [filtrosAtivos, setFiltrosAtivos] = useState({
    raridade: new Set(), estrategia: new Set(), distancia: new Set(), terreno: new Set(), fase: new Set(), tipoEfeito: new Set(),
  });

  const resultadosCavalinha = useMemo(() => {
    const termo = buscaCavalinha.trim().toLowerCase();
    if (termo.length === 0) return [];
    return catalogoCavalinhas.filter((c) => c.nomeBase.toLowerCase().includes(termo)).slice(0, 8);
  }, [buscaCavalinha]);

  function mudarEstrategiaCavalo(novaEstrategia) {
    setEstrategiaCavalo(novaEstrategia);
    setSkillsDestacadas((atuais) =>
      atuais.map((sk) => {
        const { erro, gatilhos } = calcularRegioesSkill(dadosCorrida, sk.id, novaEstrategia);
        return { ...sk, erro, gatilhos };
      })
    );
  }

  function selecionarCavalinha(cavalinha) {
    if (cavalinhaSelecionada) {
      const idUnicaAnterior = idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3);
      removerSkill(idUnicaAnterior);
    }
    const idUnica = idDaUniqueSkill(cavalinha.outfitId, 3);
    const skillUnica = catalogoSkillsCompleto.find((s) => s.id === idUnica);
    mudarEstrategiaCavalo(cavalinha.strategy);
    if (skillUnica) adicionarSkill(skillUnica);
    setCavalinhaSelecionada(cavalinha);
    setBuscaCavalinha("");
    setCavalinhaAberta(false);
  }

  useEffect(() => {
    if (skillHerdadaParaAdicionar) {
      const jaEstava = skillsDestacadas.some((sk) => sk.id === skillHerdadaParaAdicionar.id);
      if (jaEstava) {
        removerSkill(skillHerdadaParaAdicionar.id);
      } else {
        adicionarSkill(skillHerdadaParaAdicionar);
      }
      aoConsumirSkillHerdadaParaAdicionar();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillHerdadaParaAdicionar]);

  function alternarFiltro(grupo, chave) {
    setFiltrosAtivos((prev) => {
      const novoSet = new Set(prev[grupo]);
      if (novoSet.has(chave)) novoSet.delete(chave); else novoSet.add(chave);
      return { ...prev, [grupo]: novoSet };
    });
  }

  const totalFiltrosAtivos = Object.values(filtrosAtivos).reduce((s, set) => s + set.size, 0);

  function limparFiltros() {
    setFiltrosAtivos({ raridade: new Set(), estrategia: new Set(), distancia: new Set(), terreno: new Set(), fase: new Set(), tipoEfeito: new Set() });
    setBusca("");
  }

  const skillsFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return catalogoSkills.filter((s) => {
      if (termo && !s.nome.toLowerCase().includes(termo)) return false;
      if (filtrosAtivos.raridade.size > 0 && ![...filtrosAtivos.raridade].some((f) => passaFiltroRaridade(s, f))) return false;
      if (filtrosAtivos.tipoEfeito.size > 0 && ![...filtrosAtivos.tipoEfeito].some((f) => passaFiltroIcone(s, f))) return false;
      for (const grupo of ["estrategia", "distancia", "terreno", "fase"]) {
        const ativos = filtrosAtivos[grupo];
        if (ativos.size > 0 && ![...ativos].some((chave) => skillPassaNoFiltro(s, chave))) return false;
      }
      return true;
    });
  }, [busca, filtrosAtivos]);

  function adicionarSkill(skill) {
    setSkillsDestacadas((atuais) => {
      if (atuais.some((sk) => sk.id === skill.id)) return atuais;
      const { erro, gatilhos } = calcularRegioesSkill(dadosCorrida, skill.id, estrategiaCavalo);
      const cor = PALETA_SKILLS[atuais.length % PALETA_SKILLS.length];
      return [...atuais, { id: skill.id, nome: skill.nome, iconId: skill.iconId, rarity: skill.rarity, alternatives: skill.alternatives, erro, gatilhos, cor }];
    });
    setSkillsMinimizadas((atual) => new Set(atual).add(skill.id));
  }

  function removerSkill(id) {
    setSkillsDestacadas((atuais) => atuais.filter((sk) => sk.id !== id));
  }

  return (
    <div className="bp-skill-seletor bp-skill-seletor-scrollavel">
      <p className="bp-skill-titulo">🎯 Testar skill nessa pista</p>

      <div className="bp-skill-cavalinha-wrap">
        <div className="bp-cavalinha-identidade">
          <div className="bp-cavalinha-avatar">
            {cavalinhaSelecionada && caminhoIconeCavalinha(cavalinhaSelecionada.outfitId) ? (
              <img
                src={caminhoIconeCavalinha(cavalinhaSelecionada.outfitId)}
                alt=""
                onError={(e) => { e.target.style.display = "none"; }}
              />
            ) : (
              <span className="bp-cavalinha-avatar-vazio">🐴</span>
            )}
          </div>
          <div className="bp-skill-busca-wrap bp-cavalinha-campo-nome">
            <input
              type="text"
              className="bp-cavalinha-input-nome"
              placeholder={
                cavalinhaSelecionada
                  ? `${cavalinhaSelecionada.nomeBase} [${cavalinhaSelecionada.epiteto}]`
                  : "Digite o nome da cavalinha..."
              }
              value={buscaCavalinha}
              onFocus={() => setCavalinhaAberta(true)}
              onBlur={() => setTimeout(() => setCavalinhaAberta(false), 150)}
              onChange={(e) => { setBuscaCavalinha(e.target.value); setCavalinhaAberta(true); }}
            />
            {cavalinhaSelecionada && !buscaCavalinha && (
              <button
                type="button"
                className="bp-cavalinha-limpar"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  // 🎯 Remove a unique DELA junto — senão a skill ficava
                  // esquecida na lista mesmo depois de tirar a cavalinha.
                  removerSkill(idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3));
                  setCavalinhaSelecionada(null);
                }}
                title="Remover cavalinha"
              >
                &times;
              </button>
            )}
            {cavalinhaAberta && resultadosCavalinha.length > 0 && (
              <div className="bp-skill-dropdown">
                {resultadosCavalinha.map((c) => (
                  <div
                    key={c.outfitId}
                    className="bp-skill-opcao"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selecionarCavalinha(c)}
                  >
                    {caminhoIconeCavalinha(c.outfitId) && (
                      <img
                        src={caminhoIconeCavalinha(c.outfitId)}
                        alt=""
                        className="bp-skill-opcao-icone"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    )}
                    <span>{c.nomeBase} <span className="bp-skill-opcao-epiteto">{c.epiteto}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bp-skill-estrategia-wrap">
        <span className="bp-skill-estrategia-label">Estratégia da corredora testada:</span>
        <div className="bp-skill-estrategia-botoes">
          {ESTRATEGIAS_TESTE.map((e) => (
            <button
              key={e.valor}
              type="button"
              className={`bp-skill-filtro-btn ${estrategiaCavalo === e.valor ? "ativo" : ""}`}
              onClick={() => mudarEstrategiaCavalo(e.valor)}
            >
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* 🎯 Algumas roupas novas já vêm nos dados de personagem, mas a
          unique delas ainda não tem dados de ativação no uma-skill-tools. */}
      {cavalinhaSelecionada && !catalogoSkillsCompleto.some((s) => s.id === idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3)) && (
        <div className="bp-ambiente-aviso">
          ⚠️ Unique ainda sem dados de ativação — será adicionada quando a fonte for atualizada.
        </div>
      )}

      {skillsDestacadas.length > 0 && (() => {
        const idUniqueAtual = cavalinhaSelecionada ? idDaUniqueSkill(cavalinhaSelecionada.outfitId, 3) : null;
        const skillsOrdenadas = idUniqueAtual
          ? [...skillsDestacadas].sort((a, b) => (a.id === idUniqueAtual ? -1 : b.id === idUniqueAtual ? 1 : 0))
          : skillsDestacadas;
        return (
        <div className="bp-skill-selecionadas-area-scroll">
        <div className="bp-skill-selecionadas">
          {skillsOrdenadas.map((sk) => {
            const condicoesParaMostrar = sk.alternatives;
            const minimizada = skillsMinimizadas.has(sk.id);
            return (
              <div key={sk.id} className={`bp-skill-selecionada-card bp-skill-card-${classeRaridade(sk.rarity)} ${minimizada ? "bp-skill-selecionada-minimizada" : ""}`}>
                <div className="bp-skill-selecionada-topo" onClick={() => alternarMinimizada(sk.id)} role="button" tabIndex={0}>
                  <span className="bp-skill-chip-cor" style={{ background: sk.cor.stroke }}></span>
                  {sk.iconId && (
                    <img
                      src={caminhoIconeSkill(sk.iconId)}
                      alt=""
                      className="bp-skill-chip-icone"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  <span className="bp-skill-chip-nome">{sk.nome}</span>
                  {sk.erro && <span className="bp-skill-chip-aviso">⚠️ erro ao calcular</span>}
                  <button type="button" className="bp-skill-chip-remover" onClick={(e) => { e.stopPropagation(); removerSkill(sk.id); }}>&times;</button>
                </div>
                {!minimizada && !sk.erro && condicoesParaMostrar.length > 0 && (
                  <div className="bp-skill-condicoes">
                    <div className="bp-skill-condicao-id">ID: {sk.id}</div>
                    {condicoesParaMostrar.map((c, i) => (
                      <div key={i} className="bp-skill-condicao-bloco">
                        <div className="bp-skill-secao">
                          <p className="bp-skill-secao-titulo">Conditions:</p>
                          {c.precondition && (
                            <div className="bp-skill-secao-grupo">
                              <span className="bp-skill-secao-subtitulo">Preconditions:</span>
                              {partesDaCondicao(c.precondition).map((parte, pi) => (
                                <code key={pi} className="bp-skill-secao-linha">{parte}</code>
                              ))}
                            </div>
                          )}
                          <div className="bp-skill-secao-grupo">
                            {partesDaCondicao(c.condition).map((parte, pi) => (
                              <code key={pi} className="bp-skill-secao-linha">{parte}</code>
                            ))}
                          </div>
                        </div>

                        {c.effects && c.effects.length > 0 && (
                          <div className="bp-skill-secao">
                            <p className="bp-skill-secao-titulo">Effects:</p>
                            {c.effects.map((ef, ei) => {
                              const { nome, valor } = formatarEfeito(ef);
                              return (
                                <div key={ei} className="bp-skill-efeito-linha">
                                  <span className="bp-skill-efeito-nome">{nome}</span>
                                  <span className="bp-skill-efeito-valor">{valor}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {c.baseDuration != null && (
                          <div className="bp-skill-secao">
                            <p className="bp-skill-secao-titulo">Base duration: <span className="bp-skill-secao-valor-inline">{formatarDuracaoBase(c.baseDuration)}</span></p>
                            {c.baseDuration > 0 && (
                              <p className="bp-skill-secao-titulo">
                                Effective duration ({dadosCorrida.distance}m): <span className="bp-skill-secao-valor-inline">{formatarDuracaoEfetiva(c.baseDuration, dadosCorrida.distance)}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
        );
      })()}

      <button type="button" className="bp-skill-adicionar-btn" onClick={() => setCatalogoAberto(true)}>
        + Adicionar outra skill
      </button>

      {catalogoAberto && (
        <div className="bp-catalogo-overlay" onClick={() => setCatalogoAberto(false)}>
          <div className="bp-catalogo-janela" onClick={(e) => e.stopPropagation()}>
            <div className="bp-catalogo-topo">
              <span className="bp-catalogo-titulo">Escolher skill</span>
              <button type="button" className="bp-catalogo-fechar" onClick={() => setCatalogoAberto(false)}>&times;</button>
            </div>

            <input
              type="text"
              className="bp-skill-busca-input"
              placeholder="Buscar skill pelo nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
            />

            <div className="bp-skill-filtros">
              {Object.entries(GRUPOS_FILTRO).map(([grupo, opcoes]) => (
                <div key={grupo} className="bp-skill-filtro-grupo">
                  {opcoes.map((op) => (
                    <button
                      key={op.chave}
                      type="button"
                      className={`bp-skill-filtro-btn ${filtrosAtivos[grupo].has(op.chave) ? "ativo" : ""}`}
                      onClick={() => alternarFiltro(grupo, op.chave)}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              ))}
              <div className="bp-skill-filtro-grupo bp-skill-filtro-tipoefeito">
                {ICONES_FILTRO.map((op) => (
                  <button
                    key={op.base}
                    type="button"
                    className={`bp-tipoefeito-btn ${filtrosAtivos.tipoEfeito.has(op.base) ? "ativo" : ""}`}
                    onClick={() => alternarFiltro("tipoEfeito", op.base)}
                  >
                    <img
                      src={caminhoIconeSkill(op.iconId)}
                      alt=""
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  </button>
                ))}
              </div>
              {totalFiltrosAtivos > 0 && (
                <button type="button" className="bp-skill-filtro-limpar" onClick={limparFiltros}>Limpar filtros</button>
              )}
            </div>

            <p className="bp-skill-contagem">
              {skillsFiltradas.length} skill{skillsFiltradas.length !== 1 ? "s" : ""} encontrada{skillsFiltradas.length !== 1 ? "s" : ""}
              {skillsFiltradas.length > LIMITE_CARDS_EXIBIDOS && ` (mostrando as primeiras ${LIMITE_CARDS_EXIBIDOS} — refine a busca)`}
            </p>

            <div className="bp-skill-grid bp-skill-grid-flutuante">
              {skillsFiltradas.slice(0, LIMITE_CARDS_EXIBIDOS).map((s) => {
                const jaAdicionada = skillsDestacadas.some((sk) => sk.id === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`bp-skill-card bp-skill-card-${classeRaridade(s.rarity)} ${jaAdicionada ? "bp-skill-card-selecionada" : ""}`}
                    onClick={() => adicionarSkill(s)}
                    disabled={jaAdicionada}
                    title={s.nome}
                  >
                    {s.iconId && (
                      <img
                        src={caminhoIconeSkill(s.iconId)}
                        alt=""
                        className="bp-skill-card-icone"
                        onError={(e) => { e.target.style.display = "none"; }}
                      />
                    )}
                    <span className="bp-skill-card-texto">{s.nome}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// SELETOR DE CONDIÇÕES AMBIENTAIS + RECOMENDAÇÕES DE SKILL
// ----------------------------------------------------------------------

const OPCOES_CLIMA = [
  { valor: "sol", label: "Sol", icone: "/assets/img/utx_ico_weather_00.png" },
  { valor: "nublado", label: "Nublado", icone: "/assets/img/utx_ico_weather_01.png" },
  { valor: "chuva", label: "Chuva", icone: "/assets/img/utx_ico_weather_02.png" },
  { valor: "neve", label: "Neve", icone: "/assets/img/utx_ico_weather_03.png" },
];
const OPCOES_TERRENO_CONDICAO = [
  { valor: "firme", label: "Firm" },
  { valor: "bom", label: "Good" },
  { valor: "leve", label: "Yielding" },
  { valor: "pesado", label: "Heavy" },
];
const OPCOES_ESTACAO = [
  { valor: "primavera", label: "Spring", icone: "/assets/img/global/utx_txt_season_00.png" },
  { valor: "verao", label: "Summer", icone: "/assets/img/global/utx_txt_season_01.png" },
  { valor: "outono", label: "Fall", icone: "/assets/img/global/utx_txt_season_02.png" },
  { valor: "inverno", label: "Winter", icone: "/assets/img/global/utx_txt_season_03.png" },
];

function resolverRecomendacao({ nome, herdada }) {
  if (!nome) return null;
  const termo = nome.trim().toLowerCase();
  const skill = catalogoSkillsCompleto.find(
    (s) => s.nome.toLowerCase().includes(termo) && s.herdada === !!herdada
  );
  if (!skill) return null;

  const idBase = herdada ? "1" + skill.id.slice(1) : skill.id;
  const dona = donoDaUniqueBase.get(idBase);

  if (dona) {
    return {
      chave: skill.id,
      icone: caminhoIconeCavalinha(dona.outfitId),
      label: dona.nomeBase,
      titulo: `${skill.nome} (${herdada ? "herdada de " : ""}${dona.nomeBase} [${dona.epiteto}])`,
      tipo: "cavalinha",
      skill,
    };
  }
  return {
    chave: skill.id,
    icone: caminhoIconeSkill(skill.iconId),
    label: skill.nome,
    titulo: skill.nome,
    tipo: "skill",
    skill,
  };
}

function RecomendacoesUniques({ pistaDiagramaAberta, skillsDestacadas, aoClicarSkillHerdada }) {
  if (!pistaDiagramaAberta) return null;

  const chave = `${pistaDiagramaAberta.hipodromo}-${pistaDiagramaAberta.distanciaNumero}-${pistaDiagramaAberta.terrenoCurto}`;
  const itensRecomendados = recomendacoesPistasRaw[chave];
  if (!itensRecomendados || itensRecomendados.length === 0) return null;

  const recomendacoes = itensRecomendados.map(resolverRecomendacao).filter(Boolean);
  if (recomendacoes.length === 0) return null;

  return (
    <div className="bp-recomendadas-wrap">
      <span className="bp-ambiente-label">Skills recomendadas nessa pista:</span>
      <div className="bp-recomendadas-icones">
        {recomendacoes.map(({ chave, icone, label, titulo, tipo, skill }) => {
          const ativa = skillsDestacadas.some((sk) => sk.id === skill.id);
          return (
            <button
              key={chave}
              type="button"
              className={`bp-recomendada-btn bp-recomendada-btn-${tipo} ${ativa ? "ativo" : ""}`}
              title={titulo}
              onClick={() => aoClicarSkillHerdada(skill)}
            >
              {icone && (
                <img src={icone} alt={label} onError={(e) => { e.target.style.display = "none"; }} />
              )}
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeletorAmbiente() {
  const [clima, setClima] = useState("sol");
  const [terreno, setTerreno] = useState("firme");
  const [estacao, setEstacao] = useState("primavera");

  return (
    <div className="bp-ambiente-wrap">
      <div className="bp-ambiente-aviso">
        ⚠️ Visual por enquanto — ainda não afeta o cálculo de ativação.
      </div>

      <div className="bp-ambiente-linha">
        <span className="bp-ambiente-label">Clima:</span>
        <div className="bp-ambiente-botoes">
          {OPCOES_CLIMA.map((op) => (
            <button
              key={op.valor}
              type="button"
              title={op.label}
              className={`bp-ambiente-icone-btn ${clima === op.valor ? "ativo" : ""}`}
              onClick={() => setClima(op.valor)}
            >
              <img src={op.icone} alt={op.label} onError={(e) => { e.target.style.display = "none"; }} />
            </button>
          ))}
        </div>
      </div>

      <div className="bp-ambiente-linha">
        <span className="bp-ambiente-label">Terreno:</span>
        <div className="bp-ambiente-botoes">
          {OPCOES_TERRENO_CONDICAO.map((op) => (
            <button
              key={op.valor}
              type="button"
              className={`bp-skill-filtro-btn ${terreno === op.valor ? "ativo" : ""}`}
              onClick={() => setTerreno(op.valor)}
            >
              {op.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bp-ambiente-linha">
        <span className="bp-ambiente-label">Estação:</span>
        <div className="bp-ambiente-botoes">
          {OPCOES_ESTACAO.map((op) => (
            <button
              key={op.valor}
              type="button"
              title={op.label}
              className={`bp-ambiente-icone-btn bp-ambiente-icone-estacao ${estacao === op.valor ? "ativo" : ""}`}
              onClick={() => setEstacao(op.valor)}
            >
              <img src={op.icone} alt={op.label} onError={(e) => { e.target.style.display = "none"; }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// MODAL — junta tudo (mesma estrutura split-view do BuscadorPistas.jsx)
// ----------------------------------------------------------------------

// 🎯 `pista` precisa ter: { nome, hipodromo, terrenoCurto ("Turf"/"Dirt"),
// distanciaNumero (metros), distanciaCategoria (Sprint/Mile/Medium/Long),
// direcao (Right/Left/Straight) }. Fecha só pelo botão × (sem clicar
// fora) — mesmo comportamento já combinado pro modal do Buscador.
function ModalTestePista({ pista, aoFechar }) {
  const dadosCorrida = useMemo(() => encontrarCourseData(pista), [pista]);
  const [skillHerdadaParaAdicionar, setSkillHerdadaParaAdicionar] = useState(null);
  const [skillsDestacadas, setSkillsDestacadas] = useState([]);

  return (
    <div className="bp-modal-overlay">
      <div className="bp-modal-box bp-modal-box-split" onClick={(e) => e.stopPropagation()}>
        <div className="bp-modal-header">
          <h3>{pista.nome}</h3>
          <button type="button" className="bp-modal-fechar" onClick={aoFechar}>&times;</button>
        </div>
        <p className="bp-modal-subtitulo">
          {pista.hipodromo} · {pista.distanciaNumero}m ({pista.distanciaCategoria}) · {pista.terrenoCurto} · {traduzirDirecao(pista.direcao)}
        </p>
        <p style={{ margin: "-4px 0 10px 0", fontSize: "8.5pt", color: "#5f758e", fontFamily: "'Montserrat', sans-serif" }}>
          Simulação feita com o <a href="https://github.com/alpha123/uma-skill-tools" target="_blank" rel="noopener noreferrer" style={{ color: "#c5a059" }}>uma-skill-tools</a>, de alpha123 · <a href="/creditos" style={{ color: "#c5a059" }}>créditos</a>
        </p>

        {dadosCorrida ? (
          <div className="bp-modal-split">
            <div className="bp-modal-coluna-esquerda">
              <SeletorDeSkills
                dadosCorrida={dadosCorrida}
                skillsDestacadas={skillsDestacadas}
                setSkillsDestacadas={setSkillsDestacadas}
                skillHerdadaParaAdicionar={skillHerdadaParaAdicionar}
                aoConsumirSkillHerdadaParaAdicionar={() => setSkillHerdadaParaAdicionar(null)}
              />
            </div>
            <div className="bp-modal-coluna-direita">
              <DiagramaPistaSVG dadosCorrida={dadosCorrida} skillsDestacadas={skillsDestacadas} />
              <SeletorAmbiente />
              <RecomendacoesUniques pistaDiagramaAberta={pista} skillsDestacadas={skillsDestacadas} aoClicarSkillHerdada={setSkillHerdadaParaAdicionar} />
            </div>
          </div>
        ) : (
          <div className="bp-modal-sem-diagrama">
            <p>📊 Ainda não temos o traçado dessa pista no nosso dataset.</p>
            <p className="bp-modal-sem-diagrama-hint">
              O hipódromo "{pista.hipodromo}" não está coberto pelos dados que temos disponíveis.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ModalTestePista;
