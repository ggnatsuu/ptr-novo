// 🎯 src/components/DiagramaPistaSVG.jsx
// Diagrama da pista no estilo do uma-tools (alpha123): fases, retas/curvas,
// subidas/descidas, régua e as faixas de ativação das skills destacadas.
// Usado pelo Buscador de Pistas e pelo Guia do Meta.

import { useMemo, useRef, useState } from "react";
import { calcularFases, montarSegmentosPista, montarSegmentosDeclive, velocidadeBaseDaPista, formatarDuracaoBase } from "../utils/diagramaPista";
import "../styles/buscadorpistas.css";

// 🎯 Cores copiadas direto da imagem de referência (uma-tools), sem
// adaptar pro tema escuro do site — só o diagrama em si fica com fundo
// claro, o resto do modal (título, botão de fechar) continua no estilo
// da PTR.
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

// 🎯 Calcula a altura acumulada ao longo da pista, ponto a ponto, a partir
// dos trechos de inclinação (slope/1000000 = fração de subida por metro
// percorrido). Testado contra a Nakayama 2500 inner: bateu exatamente com
// os percentuais esperados (2%, 1.5%, -1.5%, 2%) e deu um pico de ~5.2m,
// fisicamente plausível pra um hipódromo real.
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

// 🎯 Seta desenhada em linha+ponta, em vez de usar caractere Unicode (↗/↘)
// dentro do texto — algumas fontes não têm esse glifo específico e o
// navegador troca por um símbolo genérico qualquer, dando a impressão de
// que a seta "sumiu". Desenhando manualmente, funciona igual em qualquer
// navegador/fonte.
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
  const amplitude = alturaMaxima - alturaMinima || 1; // evita divisão por 0 numa pista 100% plana

  const svgRef = useRef(null);
  const [metragemMouse, setMetragemMouse] = useState(null);

  // 🎯 Converte a posição do mouse na tela (pixels reais) pra metros da
  // pista, usando o tamanho renderizado do SVG (não o viewBox) — assim
  // funciona certo independente de quanto o diagrama está esticado/
  // encolhido na tela do usuário.
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

  // 🎯 Uma "linha de trilha" por alternativa da skill, não por skill —
  // uma skill com 2 condições diferentes (tipo Sunny Breeze) ganha 2
  // linhas, uma pra cada. Skill sem nenhuma alternativa válida ainda
  // ganha 1 linha (mostrando "não ativa").
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

      {/* Faixa decorativa (skyline) — agora com o relevo real, calculado a
          partir da elevação acumulada. Sobe onde tem subida, desce onde
          tem descida, física de verdade, não é só estética. */}
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

      {/* Faixa de declive — fundo cobrindo a linha toda + caixas de subida/descida por cima */}
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

      {/* 🎯 Rótulos de metragem da faixa de declive, um por limite ÚNICO —
          em vez de cada trecho desenhar seu próprio início/fim (o que
          duplicava o número quando um trecho terminava exatamente onde o
          próximo começava, tipo dois "1600m" empilhados). */}
      {[...new Set(segmentosDeclive.flatMap((s) => [s.inicio, s.fim]))]
        .sort((a, b) => a - b)
        .map((m) => (
          <text key={`declive-marca-${m}`} x={m * escala} y={yDeclive - 3} textAnchor="middle" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>
            {Math.round(m)}m
          </text>
        ))}

      {/* Retas e curvas — indefinido (nem um nem outro) fica sem cor/borda,
          só com a metragem nas pontas pra referência */}
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

        // reta
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

      {/* Fases da corrida */}
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

      {/* Régua */}
      <rect x={0} y={yFase + alturaFase} width={largura} height={alturaRegua} fill={CORES.reguaFundo} />
      <line x1={0} y1={yRegua} x2={largura} y2={yRegua} stroke="rgba(90,48,24,0.3)" strokeWidth={1} />
      {Array.from({ length: Math.floor(distancia / 200) + 1 }, (_, i) => i * 200).map((m) => (
        <g key={`regua-${m}`}>
          <line x1={m * escala} y1={yRegua - 4} x2={m * escala} y2={yRegua + 4} stroke="rgba(90,48,24,0.4)" strokeWidth={1} />
          <text x={m * escala} y={yRegua + 19} textAnchor="middle" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>{m}m</text>
        </g>
      ))}
      <text x={largura - 2} y={yRegua + 19} textAnchor="end" className="bp-diagrama-texto-marca" fill={CORES.textoEscuro}>{distancia}m</text>

      {/* 🎯 Destaques de skill selecionada — linha fina quando a ativação é
          "imediata" (dispara no primeiro instante possível), zona colorida
          translúcida quando é aleatória (pode disparar em qualquer ponto
          daquela faixa). Mesma lógica visual do RaceTrack.tsx original. */}
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

      {/* 🎯 Trilha dedicada por ALTERNATIVA da skill — uma skill com 2
          condições diferentes (tipo Sunny Breeze) ganha 2 linhas, uma pra
          cada, já que cada alternativa pode ativar em lugar/efeito
          diferente. Duas camadas por linha: um contorno fraco mostrando o
          RANGE onde pode começar a ativar, e uma barra sólida do tamanho
          real — em metros — de quanto tempo fica ativa depois de disparar. */}
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
                {/* Range onde pode começar a ativar — contorno fraco, sem preenchimento sólido */}
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
                {/* Duração real, em metros — a barra sólida de verdade */}
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

      {/* 🎯 Linha de acompanhamento do mouse — desenhada por último de
          propósito, pra ficar sempre por cima de todas as outras faixas.
          Só aparece enquanto o mouse está em cima do diagrama. */}
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

export default DiagramaPistaSVG;
