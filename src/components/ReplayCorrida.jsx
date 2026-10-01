// 🎯 src/components/ReplayCorrida.jsx
// Replay da corrida a partir do arquivo do jogo (o mesmo enviado ao
// Hakuraku). Recebe o objeto "replay" montado em utils/arquivoCorrida.js —
// vindo do Firestore (replays_partidas) na página de Resultados, ou direto
// da prévia no RankAdmin — e desenha a pista "esticada" (distância × raia)
// com os cavalos andando, rótulos de skills/eventos e o placar ao vivo.
//
// A simulação só tem ~1 quadro por segundo no meio da corrida, então a
// posição entre quadros é suavizada com a velocidade de cada cavalo
// (interpolação de Hermite), pra ninguém "pular" na tela.

import { useEffect, useMemo, useState } from "react";
import courseData from "../uma-skill-tools/data/course_data.json";
import { prepararCorrida, estadoNoTempo } from "../utils/replayCorrida";
import { decodificarReplay } from "../utils/replayCompartilhado";
import MinimapaPista from "./MinimapaPista";
import TituloTreinador from "./TituloTreinador";
import { useTelaEstreita } from "../utils/useTelaEstreita";

// ---------------------------------------------------------------------
// CONSTANTES DE DESENHO
// ---------------------------------------------------------------------

// Largura do desenho da pista: no celular fica mais "quadrada" (e os textos
// dentro dela crescem na mesma proporção, pela escala E), senão tudo encolhe.
const LARGURA_PADRAO = 1200;
const LARGURA_ESTREITA = 640;
const ESCALA_TEXTO_ESTREITA = 1.6;
const ALTURA = 600;
const TOPO_PISTA = 80; // espaço acima pros rótulos
const BASE_PISTA = ALTURA - 50; // espaço abaixo pras faixas de curva/reta
const RAIO = 25;
// Modo "Chibis": tamanho do sprite (a imagem é quadrada, 256px, com o
// boneco ocupando quase tudo) e o quanto a cabeça fica acima dos pés.
const TAM_CHIBI = RAIO * 4;
const TOPO_CHIBI = TAM_CHIBI * 0.85;
const CHAVE_MODO_VISUAL = "ptr-replay-visual";

// Os ícones de roupa do jogo são quadrados (256px) com uma moldura dourada
// e um pedestal embaixo. Pra caber num círculo, damos zoom no miolo da
// moldura: centro em (128, 136) e raio ~88 dentro da imagem original.
const ICONE_TAM = 256;
const ICONE_CX = 128;
const ICONE_CY = 136;
const ICONE_R = 88;

function recorteIcone(raio) {
  const escala = raio / ICONE_R;
  return { tamanho: ICONE_TAM * escala, x: -ICONE_CX * escala, y: -ICONE_CY * escala };
}

// Ícone redondo em HTML (placar), com o mesmo recorte do SVG.
function IconeRedondo({ src, tamanho }) {
  const r = recorteIcone(tamanho / 2);
  return (
    <span style={{ position: "relative", display: "inline-block", width: tamanho, height: tamanho, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "#1b2a3f" }}>
      <img src={src} alt="" style={{ position: "absolute", width: r.tamanho, height: r.tamanho, left: tamanho / 2 + r.x, top: tamanho / 2 + r.y, maxWidth: "none" }} />
    </span>
  );
}
const RAIA_MIN_ESCALA = 3000; // lanePosition: 0 = cerca interna; ~10000 = portão mais aberto
const ALTURA_ROTULO = 16;
const JANELA_MIN_M = 70;
const JANELA_MAX_M = 260;

const VELOCIDADES = [0.5, 1, 2, 4];

const CORES_ROTULO = {
  skill: { fundo: "#c5a059", texto: "#0b1320" },
  duelo: { fundo: "#e67e22", texto: "#0b1320" },
  ponta: { fundo: "#3498db", texto: "#0b1320" },
  rushed: { fundo: "#e04b37", texto: "#fff" },
  spurt: { fundo: "#1bd39e", texto: "#0b1320" },
};

const CORES_ESTILO = { FRONT: "#3498db", PACE: "#2ecc71", LATE: "#f39c12", END: "#e74c3c" };

// Plaquinhas de pace up / pace down / downhill (trechos calculados no upload).
const MODOS = {
  paceUp: { cor: "#5dade2", simbolo: "↑", texto: "Pace Up" },
  paceDown: { cor: "#b388eb", simbolo: "↓", texto: "Pace Down" },
  downhill: { cor: "#4aa3a9", simbolo: "⬇", texto: "Downhill" },
};

// Modos em que o cavalo está naquela distância (sem repetir o tipo).
function modosAtivos(cavalo, distancia) {
  return [...new Set(cavalo.modos.filter((m) => distancia >= m.inicio && distancia <= m.fim).map((m) => m.tipo))];
}

function formatarTempo(segundos) {
  const m = Math.floor(segundos / 60);
  return `${m}:${(segundos % 60).toFixed(1).padStart(4, "0")}`;
}

// Trecho da pista que a câmera mostra: o pelotão inteiro (até um limite)
// ou, se alguém estiver sendo seguido, uma janela fechada nele. Devolve os
// limites relativos a uma referência (líder ou cavalo seguido), além da
// raia mais aberta, que define a escala vertical.
function enquadramento(estado, indicesVisiveis, seguindo) {
  const raiaMax = Math.max(...indicesVisiveis.map((i) => estado[i].raia));
  if (seguindo !== null) {
    return { ref: estado[seguindo].distancia, inicio: -JANELA_MIN_M * 0.6, fim: JANELA_MIN_M * 0.4, raiaMax };
  }
  const distancias = indicesVisiveis.map((i) => estado[i].distancia);
  const lider = Math.max(...distancias);
  const fim = 22;
  let inicio = Math.max(Math.min(...distancias) - lider - 12, fim - JANELA_MAX_M);
  if (fim - inicio < JANELA_MIN_M) inicio = fim - JANELA_MIN_M;
  return { ref: lider, inicio, fim, raiaMax };
}

// Coloca cada rótulo no primeiro "andar" livre acima do cavalo (ou logo
// abaixo, se não couber em cima); rótulo que não acha lugar fica de fora.
function posicionarRotulos(itens, larguraTela, E = 1) {
  const colocados = [];
  const alturaRotulo = ALTURA_ROTULO * E;
  const bate = (a, b) => a.x < b.x + b.largura && b.x < a.x + a.largura && a.y < b.y + alturaRotulo && b.y < a.y + alturaRotulo;
  itens.forEach((item) => {
    const largura = (item.texto.length * 6 + 12) * E;
    const x = Math.min(Math.max(item.xCavalo - largura / 2, 2), larguraTela - largura - 2);
    const andares = [0, 1, 2, 3, 4].map((k) => item.yCavalo - RAIO - 4 - alturaRotulo - k * (alturaRotulo + 2));
    andares.push(item.yCavalo + RAIO + 4);
    const y = andares.find((yy) => yy >= 2 && yy + alturaRotulo <= ALTURA - 2 && !colocados.some((c) => bate({ x, y: yy, largura }, c)));
    if (y !== undefined) colocados.push({ ...item, x, y, largura });
  });
  return colocados;
}

// ---------------------------------------------------------------------
// COMPONENTE
// ---------------------------------------------------------------------

// Sem "aoFechar", o replay é desenhado embutido na página (Resultados) em
// vez de numa janela por cima de tudo (prévia do RankAdmin).
// "pedidoSeguir" ({ numero }) vem do botão "Follow in replay" do painel do
// treinador: um objeto novo a cada clique faz a câmera seguir aquele cavalo.
function ReplayCorrida({ replay, titulo, aoFechar, pedidoSeguir }) {
  const [corrida, setCorrida] = useState(null);
  const [erro, setErro] = useState(null);
  const [tempo, setTempo] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  const [mostrarNpcs, setMostrarNpcs] = useState(true);
  const [mostrarSkills, setMostrarSkills] = useState(true);
  const [mostrarEventos, setMostrarEventos] = useState(true);
  const [mostrarModos, setMostrarModos] = useState(true);
  // "chibis" (bonequinhos, padrão) ou "icones" (bolinhas com o ícone da roupa).
  const [modoVisual, setModoVisualEstado] = useState(() => {
    try {
      return window.localStorage.getItem(CHAVE_MODO_VISUAL) === "icones" ? "icones" : "chibis";
    } catch {
      return "chibis";
    }
  });
  const setModoVisual = (modo) => {
    setModoVisualEstado(modo);
    try {
      window.localStorage.setItem(CHAVE_MODO_VISUAL, modo);
    } catch {
      // navegador sem armazenamento: só não lembra a escolha
    }
  };
  const [seguindo, setSeguindo] = useState(null); // índice do cavalo seguido pela câmera
  const [sobMouse, setSobMouse] = useState(null); // cavalo com o mouse em cima (pista ou placar)
  const [mouseDentro, setMouseDentro] = useState(false); // mouse em cima do replay
  const estreito = useTelaEstreita();
  const LARGURA = estreito ? LARGURA_ESTREITA : LARGURA_PADRAO;
  const E = estreito ? ESCALA_TEXTO_ESTREITA : 1; // escala dos textos dentro da pista
  const [filtroFeed, setFiltroFeed] = useState("todos"); // "todos" | "treinadores" | "seguido"

  // Pedido novo de "seguir": câmera no cavalo e play (do início, se já acabou).
  const [pedidoAtendido, setPedidoAtendido] = useState(null);
  if (pedidoSeguir && pedidoSeguir !== pedidoAtendido) {
    setPedidoAtendido(pedidoSeguir);
    setSeguindo(pedidoSeguir.numero - 1);
    setMostrarNpcs(true);
    if (corrida && tempo >= corrida.tempoFinal) setTempo(0);
    setTocando(true);
  }

  // Decodifica a simulação (o decodificador só é baixado aqui).
  useEffect(() => {
    let cancelado = false;
    decodificarReplay(replay)
      .then((raceData) => {
        if (!cancelado) setCorrida(prepararCorrida(raceData, replay));
      })
      .catch((e) => {
        console.error("Erro ao montar o replay:", e);
        if (!cancelado) setErro("Não foi possível carregar o replay desta corrida.");
      });
    return () => { cancelado = true; };
  }, [replay]);

  // Loop de animação.
  useEffect(() => {
    if (!tocando || !corrida) return undefined;
    let quadro;
    let anterior = performance.now();
    const passo = (agora) => {
      const dtReal = (agora - anterior) / 1000;
      anterior = agora;
      setTempo((t) => {
        const novo = t + dtReal * velocidade;
        if (novo >= corrida.tempoFinal) {
          setTocando(false);
          return corrida.tempoFinal;
        }
        return novo;
      });
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando, velocidade, corrida]);

  // Espaço dá play/pause; na janela, Esc fecha. Embutido na página, o
  // espaço só controla o replay com o mouse em cima dele — fora disso
  // continua rolando a página normalmente.
  useEffect(() => {
    if (!aoFechar && !mouseDentro) return undefined;
    const tecla = (e) => {
      if (e.key === "Escape" && aoFechar) aoFechar();
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        setTocando((v) => !v);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar, mouseDentro]);

  const estado = useMemo(() => (corrida ? estadoNoTempo(corrida, tempo) : null), [corrida, tempo]);

  const trechos = useMemo(() => {
    const curso = courseData[replay.courseId];
    if (!curso) return { curvas: [], subidas: [], sentido: 1 };
    return {
      curvas: (curso.corners ?? []).map((c, i) => ({ inicio: c.start, fim: c.start + c.length, nome: `Corner ${i + 1}` })),
      subidas: (curso.slopes ?? []).map((s) => ({ inicio: s.start, fim: s.start + s.length, subida: s.slope > 0 })),
      // Pista no sentido horário: a cerca interna fica à direita de quem corre → embaixo na tela.
      sentido: curso.turn === 2 ? -1 : 1,
    };
  }, [replay.courseId]);

  if (erro) {
    return <Moldura titulo={titulo} aoFechar={aoFechar}><p style={{ color: "#e04b37", textAlign: "center", padding: "40px" }}>{erro}</p></Moldura>;
  }
  if (!corrida || !estado) {
    return <Moldura titulo={titulo} aoFechar={aoFechar}><p style={{ color: "#a4b3c6", textAlign: "center", padding: "40px" }}>Carregando replay...</p></Moldura>;
  }

  const visiveis = corrida.cavalos.filter((c) => mostrarNpcs || !c.npc);

  // ---- Câmera: acompanha o pelotão (ou o cavalo seguido). Pra não
  // tremer, o tamanho da janela e a escala das raias são a média do último
  // segundo — mas presos à posição ATUAL do líder, pra não ficar atrasada.
  const indicesVisiveis = visiveis.map((c) => c.indice);
  const amostras = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map((atraso) => {
    const e = atraso === 0 ? estado : estadoNoTempo(corrida, Math.max(0, tempo - atraso));
    return enquadramento(e, indicesVisiveis, seguindo);
  });
  const media = (campo) => amostras.reduce((soma, a) => soma + a[campo], 0) / amostras.length;
  const camera = { inicio: amostras[0].ref + media("inicio"), fim: amostras[0].ref + media("fim") };
  const escalaRaia = Math.max(RAIA_MIN_ESCALA, media("raiaMax")) * 1.1;
  const escalaX = LARGURA / (camera.fim - camera.inicio);
  const xDe = (d) => (d - camera.inicio) * escalaX;
  const alturaPista = BASE_PISTA - TOPO_PISTA;
  const yDe = (raia) => {
    const fracao = Math.min(1, Math.max(0, raia / escalaRaia));
    return trechos.sentido === 1 ? BASE_PISTA - RAIO - fracao * (alturaPista - 2 * RAIO) : TOPO_PISTA + RAIO + fracao * (alturaPista - 2 * RAIO);
  };

  // ---- Marcas da pista na janela visível ----
  const passoMarca = camera.fim - camera.inicio > 150 ? 50 : 25;
  const marcas = [];
  for (let m = Math.ceil(camera.inicio / passoMarca) * passoMarca; m <= camera.fim; m += passoMarca) {
    if (m >= 0 && m <= corrida.distancia) marcas.push(m);
  }
  const fases = [
    { d: corrida.distancia / 6, nome: "Mid-race" },
    { d: replay.inicioFaseFinal ?? (corrida.distancia * 2) / 3, nome: "Late-race" },
    { d: (corrida.distancia * 5) / 6, nome: "Last spurt" },
  ];

  // ---- Rótulos ativos agora ----
  const rotulosPorCavalo = new Map();
  corrida.rotulos.forEach((r) => {
    if (tempo < r.inicio || tempo > r.fim) return;
    if (r.tipo === "skill" ? !mostrarSkills : !mostrarEventos) return;
    if (!rotulosPorCavalo.has(r.indice)) rotulosPorCavalo.set(r.indice, []);
    rotulosPorCavalo.get(r.indice).push(r);
  });
  if (mostrarEventos) {
    estado.forEach((e, i) => {
      if (!e.rushed) return;
      if (!rotulosPorCavalo.has(i)) rotulosPorCavalo.set(i, []);
      rotulosPorCavalo.get(i).push({ texto: "Rushed", tipo: "rushed" });
    });
  }

  // ---- Placar: ordem atual por distância (quem já chegou fica pela posição final) ----
  const placar = [...visiveis]
    .map((c) => {
      const r = corrida.resultados[c.indice];
      const chegou = r.tempoChegada > 0 && tempo >= r.tempoChegada;
      return { ...c, e: estado[c.indice], chegou, r };
    })
    .sort((a, b) => {
      if (a.chegou && b.chegou) return a.r.posicaoFinal - b.r.posicaoFinal;
      if (a.chegou !== b.chegou) return a.chegou ? -1 : 1;
      return b.e.distancia - a.e.distancia;
    });

  const trocarSeguir = (indice) => setSeguindo((atual) => (atual === indice ? null : indice));

  // Modo chibi: cavalos de treinador viram bonequinhos (NPCs continuam bolinha).
  // O ponto (x, y) do cavalo passa a ser o dos pés; rótulos e etiquetas sobem
  // pra cima da cabeça.
  const usaChibi = (c) => modoVisual === "chibis" && Boolean(c.chibi);
  const deslocTopo = (c) => (usaChibi(c) ? RAIO - TOPO_CHIBI : 0);

  // Foco: seguindo alguém, os outros cavalos (e os rótulos deles) ficam transparentes.
  const opacidade = (c, base) => (seguindo !== null && c.indice !== seguindo ? base * 0.3 : base);

  // Posição de todo mundo agora (inclusive NPCs escondidos), pra ficha.
  const posicaoAgora = new Map(
    corrida.cavalos
      .map((c) => {
        const r = corrida.resultados[c.indice];
        return { indice: c.indice, chegou: r.tempoChegada > 0 && tempo >= r.tempoChegada, final: r.posicaoFinal, d: estado[c.indice].distancia };
      })
      .sort((a, b) => {
        if (a.chegou && b.chegou) return a.final - b.final;
        if (a.chegou !== b.chegou) return a.chegou ? -1 : 1;
        return b.d - a.d;
      })
      .map((x, pos) => [x.indice, pos + 1]),
  );
  const distanciaLider = Math.max(...estado.map((e) => e.distancia));

  // Feed: eventos que já aconteceram, do mais novo pro mais antigo.
  const nomeDoCavalo = (i) => corrida.cavalos[i].treinador ?? corrida.cavalos[i].personagem;
  const eventosFeed = corrida.eventos
    .filter((ev) => ev.t <= tempo + 0.01)
    .filter((ev) => mostrarNpcs || !corrida.cavalos[ev.indice].npc)
    .filter((ev) => {
      if (filtroFeed === "treinadores") return !corrida.cavalos[ev.indice].npc;
      if (filtroFeed === "seguido") return seguindo === null || ev.indice === seguindo;
      return true;
    })
    .reverse()
    .slice(0, 80);

  // Ficha: cavalo com o mouse em cima; senão, o seguido.
  const alvoFicha = sobMouse ?? seguindo;

  // Desenha quem está atrás primeiro, pra quem está na frente ficar por cima.
  const ordemDesenho = [...visiveis].sort((a, b) => (modoVisual === "chibis"
    ? yDe(estado[a.indice].raia) - yDe(estado[b.indice].raia) || estado[a.indice].distancia - estado[b.indice].distancia
    : estado[a.indice].distancia - estado[b.indice].distancia));

  // Rótulos: eventos (duelo, rushed...) têm prioridade; depois quem vai na frente.
  const rotulosNaTela = posicionarRotulos(
    [...rotulosPorCavalo.entries()]
      .filter(([indice]) => visiveis.some((c) => c.indice === indice))
      .flatMap(([indice, lista]) => lista.map((r) => ({ ...r, indice, xCavalo: xDe(estado[indice].distancia), yCavalo: yDe(estado[indice].raia) + deslocTopo(corrida.cavalos[indice]) })))
      .sort((a, b) => Number(a.tipo === "skill") - Number(b.tipo === "skill") || b.xCavalo - a.xCavalo),
    LARGURA,
    E,
  );

  return (
    <Moldura titulo={titulo} aoFechar={aoFechar}>
      <div onMouseEnter={() => setMouseDentro(true)} onMouseLeave={() => { setMouseDentro(false); setSobMouse(null); }} style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
        {/* PISTA */}
        <div style={{ flex: "1 1 620px", minWidth: 0 }}>
          <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} style={{ width: "100%", display: "block", background: "#0b1320", borderRadius: "8px", border: "1px solid rgba(197, 160, 89, 0.2)" }}>
            <defs>
              <clipPath id="replay-clip-icone">
                <circle cx="0" cy="0" r={RAIO - 1} />
              </clipPath>
            </defs>

            {/* grama / pista */}
            <rect x="0" y={TOPO_PISTA} width={LARGURA} height={alturaPista} fill="#12301f" opacity="0.55" />
            {/* cerca interna */}
            <line x1="0" x2={LARGURA} y1={trechos.sentido === 1 ? BASE_PISTA : TOPO_PISTA} y2={trechos.sentido === 1 ? BASE_PISTA : TOPO_PISTA} stroke="#f1ead4" strokeWidth="2" opacity="0.6" />

            {/* subidas e descidas (faixa de cima) */}
            {trechos.subidas.map((s, i) => (
              s.fim >= camera.inicio && s.inicio <= camera.fim && (
                <g key={`sub-${i}`}>
                  <rect x={xDe(s.inicio)} y={TOPO_PISTA - 6} width={Math.max(1, xDe(s.fim) - xDe(s.inicio))} height="5" rx="2" fill={s.subida ? "#c8e05a" : "#4aa3a9"} opacity="0.85" />
                  <text x={Math.max(4, xDe(s.inicio) + 4)} y={TOPO_PISTA - 10} fill={s.subida ? "#c8e05a" : "#4aa3a9"} fontSize={12 * E} fontFamily="Montserrat, sans-serif">{s.subida ? "Uphill" : "Downhill"}</text>
                </g>
              )
            ))}

            {/* curvas e retas (faixa de baixo) */}
            <rect x="0" y={BASE_PISTA + 6} width={LARGURA} height="16" fill="rgba(164, 179, 198, 0.12)" />
            {trechos.curvas.map((c, i) => (
              c.fim >= camera.inicio && c.inicio <= camera.fim && (
                <g key={`curva-${i}`}>
                  <rect x={xDe(c.inicio)} y={BASE_PISTA + 6} width={Math.max(1, xDe(c.fim) - xDe(c.inicio))} height="16" fill="rgba(197, 160, 89, 0.35)" />
                  <text x={Math.max(4, xDe(c.inicio) + 4)} y={BASE_PISTA + 18} fill="#f1ead4" fontSize={12 * E} fontFamily="Montserrat, sans-serif">{c.nome}</text>
                </g>
              )
            ))}

            {/* marcas de distância */}
            {marcas.map((m) => (
              <g key={`m-${m}`}>
                <line x1={xDe(m)} x2={xDe(m)} y1={TOPO_PISTA} y2={BASE_PISTA} stroke="#f1ead4" strokeWidth="1" opacity="0.08" />
                <text x={xDe(m)} y={ALTURA - 8} fill="#5f758e" fontSize={12 * E} textAnchor="middle" fontFamily="Montserrat, sans-serif">{m}m</text>
              </g>
            ))}

            {/* fases */}
            {fases.map((f) => (
              f.d >= camera.inicio && f.d <= camera.fim && (
                <g key={f.nome}>
                  <line x1={xDe(f.d)} x2={xDe(f.d)} y1={TOPO_PISTA} y2={BASE_PISTA} stroke="#c5a059" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
                  <text x={xDe(f.d) + 4} y={TOPO_PISTA + 12 * E} fill="#c5a059" fontSize={12 * E} fontFamily="Montserrat, sans-serif">{f.nome}</text>
                </g>
              )
            ))}

            {/* chegada */}
            {corrida.distancia >= camera.inicio && corrida.distancia <= camera.fim && (
              <line x1={xDe(corrida.distancia)} x2={xDe(corrida.distancia)} y1={TOPO_PISTA - 10} y2={BASE_PISTA + 22} stroke="#f1ead4" strokeWidth="3" strokeDasharray="4 4" />
            )}

            {/* cavalos */}
            {ordemDesenho.map((c) => {
              const e = estado[c.indice];
              const x = xDe(e.distancia);
              const y = yDe(e.raia);
              const seguido = seguindo === c.indice;
              if (usaChibi(c)) {
                const r = corrida.resultados[c.indice];
                const chegou = r.tempoChegada > 0 && tempo >= r.tempoChegada;
                // Pódio comemora depois de cruzar a linha.
                const imagem = chegou && r.posicaoFinal <= 3 && c.chibiFesta ? c.chibiFesta : c.chibi;
                // Balanço leve enquanto corre (fase diferente pra cada um).
                const pulo = tocando && !chegou ? -Math.abs(Math.sin(tempo * 9 + c.indice * 1.7)) * 5 : 0;
                const destaque = seguido || sobMouse === c.indice;
                const corSombra = e.rushed ? "#e04b37" : destaque ? "#c5a059" : CORES_ESTILO[c.estilo] ?? "#a4b3c6";
                return (
                  <g key={c.indice} transform={`translate(${x}, ${y})`} opacity={opacidade(c, 1)} style={{ cursor: "pointer" }} onClick={() => trocarSeguir(c.indice)} onMouseEnter={() => setSobMouse(c.indice)} onMouseLeave={() => setSobMouse(null)}>
                    <ellipse cx="0" cy="0" rx={RAIO * 1.05} ry={RAIO * 0.32} fill={corSombra} opacity={destaque || e.rushed ? 0.8 : 0.5} />
                    {destaque && <ellipse cx="0" cy="0" rx={RAIO * 1.05} ry={RAIO * 0.32} fill="none" stroke="#f1ead4" strokeWidth="1.5" opacity="0.7" />}
                    <image href={imagem} x={-TAM_CHIBI / 2} y={-TAM_CHIBI * 0.93 + pulo} width={TAM_CHIBI} height={TAM_CHIBI} />
                    {/* área de clique do bonequinho */}
                    <rect x={-TAM_CHIBI * 0.32} y={-TOPO_CHIBI} width={TAM_CHIBI * 0.64} height={TOPO_CHIBI} fill="transparent" />
                  </g>
                );
              }
              return (
                <g key={c.indice} transform={`translate(${x}, ${y})`} opacity={opacidade(c, c.npc ? 0.45 : 1)} style={{ cursor: "pointer" }} onClick={() => trocarSeguir(c.indice)} onMouseEnter={() => setSobMouse(c.indice)} onMouseLeave={() => setSobMouse(null)}>
                  <circle r={RAIO} fill="#1b2a3f" stroke={e.rushed ? "#e04b37" : seguido || sobMouse === c.indice ? "#c5a059" : CORES_ESTILO[c.estilo] ?? "#a4b3c6"} strokeWidth={seguido || e.rushed || sobMouse === c.indice ? 3.5 : 2} />
                  {c.icone
                    ? <image href={c.icone} x={recorteIcone(RAIO - 1).x} y={recorteIcone(RAIO - 1).y} width={recorteIcone(RAIO - 1).tamanho} height={recorteIcone(RAIO - 1).tamanho} clipPath="url(#replay-clip-icone)" />
                    : <text y="6" textAnchor="middle" fill="#f1ead4" fontSize="17" fontWeight="700" fontFamily="Montserrat, sans-serif">{c.numero}</text>}
                </g>
              );
            })}

            {/* ícone de bloqueado (círculo vermelho com faixa branca), por cima de todos os cavalos */}
            {mostrarEventos && ordemDesenho.map((c) => estado[c.indice].bloqueadoPor >= 0 && (
              <g key={`bloq-${c.indice}`} transform={`translate(${xDe(estado[c.indice].distancia) + (usaChibi(c) ? TAM_CHIBI * 0.3 : RAIO * 0.75)}, ${yDe(estado[c.indice].raia) + (usaChibi(c) ? -TOPO_CHIBI * 0.7 : RAIO * 0.7)})`} opacity={opacidade(c, c.npc ? 0.6 : 1)} style={{ pointerEvents: "none" }}>
                <circle r="10" fill="#e04b37" stroke="#fff" strokeWidth="2" />
                <rect x="-6" y="-2.2" width="12" height="4.4" rx="1.2" fill="#fff" />
              </g>
            ))}

            {/* plaquinhas de pace up / pace down / downhill, embaixo de cada cavalo */}
            {mostrarModos && ordemDesenho.map((c) => {
              const ativos = modosAtivos(c, estado[c.indice].distancia);
              if (!ativos.length) return null;
              const larguras = ativos.map((tipo) => ((MODOS[tipo].simbolo.length + MODOS[tipo].texto.length + 1) * 6.3 + 12) * E);
              const total = larguras.reduce((a, b) => a + b, 0) + (ativos.length - 1) * 4;
              let x = xDe(estado[c.indice].distancia) - total / 2;
              const y = yDe(estado[c.indice].raia) + (usaChibi(c) ? RAIO * 0.4 : RAIO) + 3;
              return (
                <g key={`modo-${c.indice}`} opacity={opacidade(c, c.npc ? 0.5 : 0.95)} style={{ pointerEvents: "none" }}>
                  {ativos.map((tipo, i) => {
                    const caixaX = x;
                    x += larguras[i] + 4;
                    return (
                      <g key={tipo}>
                        <rect x={caixaX} y={y} width={larguras[i]} height={16 * E} rx={8 * E} fill="#0b1320" stroke={MODOS[tipo].cor} strokeWidth="1.5" />
                        <text x={caixaX + larguras[i] / 2} y={y + 11.8 * E} textAnchor="middle" fill={MODOS[tipo].cor} fontSize={10.5 * E} fontWeight="700" fontFamily="Montserrat, sans-serif">{`${MODOS[tipo].simbolo} ${MODOS[tipo].texto}`}</text>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* rótulos (por cima de todos os cavalos) */}
            {rotulosNaTela.map((r) => {
              const cores = CORES_ROTULO[r.tipo];
              const npc = corrida.cavalos[r.indice].npc;
              return (
                <g key={`${r.indice}-${r.tipo}-${r.texto}`} opacity={opacidade(corrida.cavalos[r.indice], npc ? 0.55 : 1)} style={{ pointerEvents: "none" }}>
                  <line x1={r.xCavalo} y1={r.yCavalo} x2={Math.min(Math.max(r.xCavalo, r.x + 4), r.x + r.largura - 4)} y2={r.y > r.yCavalo ? r.y : r.y + ALTURA_ROTULO * E} stroke={cores.fundo} strokeWidth="1" opacity="0.6" />
                  <rect x={r.x} y={r.y} width={r.largura} height={ALTURA_ROTULO * E} rx="4" fill={cores.fundo} opacity="0.95" />
                  <text x={r.x + r.largura / 2} y={r.y + 11.8 * E} textAnchor="middle" fill={cores.texto} fontSize={10.5 * E} fontWeight="700" fontFamily="Montserrat, sans-serif">{r.texto}</text>
                </g>
              );
            })}

            {/* etiqueta de quem é o cavalo sob o mouse */}
            {sobMouse !== null && visiveis.some((c) => c.indice === sobMouse) && (() => {
              const c = corrida.cavalos[sobMouse];
              const x = xDe(estado[sobMouse].distancia);
              const y = yDe(estado[sobMouse].raia) + deslocTopo(c);
              const linha2 = c.treinador ?? "NPC";
              const bloqueador = estado[sobMouse].bloqueadoPor >= 0 ? corrida.cavalos[estado[sobMouse].bloqueadoPor] : null;
              const linha3 = bloqueador ? `Blocked by #${bloqueador.numero} ${bloqueador.personagem}` : null;
              const largura = (Math.max(c.personagem.length * 8.2, linha2.length * 7.6, linha3 ? linha3.length * 6.8 : 0) + 24) * E;
              const altura = (linha3 ? 60 : 44) * E;
              const caixaX = Math.min(Math.max(x - largura / 2, 4), LARGURA - largura - 4);
              const caixaY = y - RAIO - altura - 8 >= 4 ? y - RAIO - altura - 8 : y + RAIO + 8;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <rect x={caixaX} y={caixaY} width={largura} height={altura} rx="6" fill="#0b1320" stroke="#c5a059" strokeWidth="1.5" opacity="0.97" />
                  <text x={caixaX + largura / 2} y={caixaY + 18 * E} textAnchor="middle" fill="#f1ead4" fontSize={14 * E} fontWeight="700" fontFamily="Montserrat, sans-serif">{c.personagem}</text>
                  <text x={caixaX + largura / 2} y={caixaY + 35 * E} textAnchor="middle" fill={c.treinador ? "#c5a059" : "#5f758e"} fontSize={13 * E} fontWeight="600" fontFamily="Montserrat, sans-serif">{linha2}</text>
                  {linha3 && <text x={caixaX + largura / 2} y={caixaY + 52 * E} textAnchor="middle" fill="#e04b37" fontSize={12 * E} fontWeight="700" fontFamily="Montserrat, sans-serif">{linha3}</text>}
                </g>
              );
            })()}
          </svg>

          {/* CONTROLES */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginTop: "12px" }}>
            <button type="button" onClick={() => { if (tempo >= corrida.tempoFinal) setTempo(0); setTocando((v) => !v); }} style={estiloBotao(true)}>
              <i className={`fa-solid ${tocando ? "fa-pause" : "fa-play"}`}></i> {tocando ? "Pause" : "Play"}
            </button>
            <button type="button" onClick={() => { setTempo(0); setTocando(false); }} style={estiloBotao(false)} title="Voltar ao início">
              <i className="fa-solid fa-backward-step"></i>
            </button>
            {VELOCIDADES.map((v) => (
              <button key={v} type="button" onClick={() => setVelocidade(v)} style={estiloBotao(velocidade === v)}>{v}×</button>
            ))}
            <input
              type="range"
              min="0"
              max={corrida.tempoFinal}
              step="0.05"
              value={tempo}
              onChange={(e) => setTempo(Number(e.target.value))}
              style={{ flex: "1 1 200px", accentColor: "#c5a059" }}
            />
            <span style={{ color: "#f1ead4", fontFamily: "'Courier New', monospace", fontSize: "10pt", minWidth: "110px", textAlign: "right" }}>
              {formatarTempo(tempo)} / {formatarTempo(corrida.tempoFinal)}
            </span>
          </div>

          {/* OPÇÕES */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "10px", fontFamily: "'Montserrat', sans-serif", fontSize: "9pt", color: "#a4b3c6" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              Visual:
              {[["icones", "Ícones"], ["chibis", "Chibis"]].map(([modo, nome]) => (
                <button key={modo} type="button" onClick={() => setModoVisual(modo)} style={{ ...estiloBotao(modoVisual === modo), padding: "2px 10px", fontSize: "8.5pt" }}>{nome}</button>
              ))}
            </span>
            <Opcao ativo={mostrarSkills} aoTrocar={setMostrarSkills}>Skill labels</Opcao>
            <Opcao ativo={mostrarEventos} aoTrocar={setMostrarEventos}>Duels / Rushed / Blocked / Last spurt</Opcao>
            {corrida.cavalos.some((c) => c.modos.length > 0) && (
              <Opcao ativo={mostrarModos} aoTrocar={setMostrarModos}>Pace up / Pace down / Downhill</Opcao>
            )}
            <Opcao ativo={mostrarNpcs} aoTrocar={(v) => { setMostrarNpcs(v); if (!v && seguindo !== null && corrida.cavalos[seguindo].npc) setSeguindo(null); }}>Show NPCs</Opcao>
            {seguindo !== null && (
              <button type="button" onClick={() => setSeguindo(null)} style={{ ...estiloBotao(false), padding: "2px 10px", fontSize: "8.5pt" }}>
                Parar de seguir {corrida.cavalos[seguindo].personagem}
              </button>
            )}
          </div>

          {/* FEED DE EVENTOS + FICHA */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "12px", marginTop: "14px" }}>
            <div style={{ ...ESTILO_QUADRO, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <p style={ESTILO_TITULO_QUADRO}>Eventos — clique para ir ao momento</p>
                <select value={filtroFeed} onChange={(e) => setFiltroFeed(e.target.value)} style={{ background: "#0d1624", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "6px", padding: "3px 8px", fontSize: "9.5pt", fontFamily: "'Montserrat', sans-serif" }}>
                  <option value="todos">All</option>
                  <option value="treinadores">Trainers only</option>
                  <option value="seguido">Followed only</option>
                </select>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {eventosFeed.length === 0 && <p style={{ color: "#5f758e", fontSize: "10pt", fontStyle: "italic", margin: "6px 0" }}>Os eventos aparecem aqui conforme a corrida anda.</p>}
                {eventosFeed.map((ev) => {
                  const c = corrida.cavalos[ev.indice];
                  const { cor, texto } = descreverEvento(ev, nomeDoCavalo);
                  return (
                    <div
                      key={`${ev.t}-${ev.indice}-${ev.tipo}-${ev.texto ?? ""}`}
                      onClick={() => { setTempo(Math.max(0, ev.t - 1.5)); setSeguindo(ev.indice); }}
                      style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 4px", borderBottom: "1px solid rgba(164, 179, 198, 0.06)", cursor: "pointer", opacity: c.npc ? 0.6 : 1, fontFamily: "'Montserrat', sans-serif", fontSize: "10.5pt" }}
                    >
                      <span style={{ color: "#8193a8", fontFamily: "'Courier New', monospace", minWidth: "54px", fontSize: "10pt" }}>{formatarTempo(ev.t)}</span>
                      {c.icone
                        ? <IconeRedondo src={c.icone} tamanho={28} />
                        : <span style={{ width: "28px", height: "28px", flexShrink: 0, borderRadius: "50%", background: "#1b2a3f", color: "#a4b3c6", fontSize: "8.5pt", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.numero}</span>}
                      <span style={{ color: "#f1ead4", fontWeight: 700, whiteSpace: "nowrap" }}>{nomeDoCavalo(ev.indice)}</span>
                      <span style={{ color: cor, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{texto}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={alvoFicha === null && estreito ? { ...ESTILO_QUADRO, height: "auto", padding: "18px 12px" } : ESTILO_QUADRO}>
              {alvoFicha === null ? (
                <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#5f758e", fontSize: "10.5pt", fontStyle: "italic", padding: "0 20px" }}>
                  Clique numa personagem (na pista ou no placar) para segui-la e ver a ficha dela aqui. Passar o mouse também mostra.
                </div>
              ) : (
                <FichaCavalo
                  c={corrida.cavalos[alvoFicha]}
                  e={estado[alvoFicha]}
                  r={corrida.resultados[alvoFicha]}
                  tempo={tempo}
                  posicao={posicaoAgora.get(alvoFicha)}
                  atrasLider={distanciaLider - estado[alvoFicha].distancia}
                  hpInicial={corrida.hpInicial[alvoFicha]}
                  skills={corrida.rotulos.filter((rt) => rt.indice === alvoFicha && rt.tipo === "skill" && rt.inicio <= tempo)}
                  bloqueador={estado[alvoFicha].bloqueadoPor >= 0 ? nomeDoCavalo(estado[alvoFicha].bloqueadoPor) : null}
                  frames={corrida.frames}
                  tempoFinal={corrida.tempoFinal}
                />
              )}
            </div>
          </div>
        </div>

        <div style={{ flex: "0 1 360px", minWidth: "280px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {/* MINIMAPA */}
        <div style={{ background: "#0b1320", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "8px" }}>
          <MinimapaPista
            courseId={replay.courseId}
            trechoVisivel={camera}
            marcadores={visiveis.map((c) => ({
              indice: c.indice,
              distancia: estado[c.indice].distancia,
              raia: estado[c.indice].raia,
              cor: CORES_ESTILO[c.estilo] ?? "#a4b3c6",
              npc: c.npc,
              destaque: c.indice === seguindo || c.indice === sobMouse,
            }))}
          />
        </div>

        {/* PLACAR AO VIVO */}
        <div style={{ background: "#0b1320", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "10px", maxHeight: "56vh", overflowY: "auto" }}>
          <p style={{ margin: "0 0 8px 0", fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 800, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px" }}>
            Posições — clique para seguir
          </p>
          {placar.map((c, i) => {
            const hpPct = Math.max(0, Math.min(100, (c.e.hp / corrida.hpInicial[c.indice]) * 100));
            const seguido = seguindo === c.indice;
            return (
              <div
                key={c.indice}
                onClick={() => trocarSeguir(c.indice)}
                onMouseEnter={() => setSobMouse(c.indice)}
                onMouseLeave={() => setSobMouse(null)}
                style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 6px", borderRadius: "6px", cursor: "pointer", opacity: c.npc ? 0.55 : 1, background: seguido ? "rgba(197, 160, 89, 0.15)" : sobMouse === c.indice ? "rgba(197, 160, 89, 0.07)" : "transparent", fontFamily: "'Montserrat', sans-serif" }}
              >
                <span style={{ width: "22px", textAlign: "right", color: "#c5a059", fontWeight: 800, fontSize: "9.5pt" }}>{c.chegou ? c.r.posicaoFinal : i + 1}</span>
                {c.icone
                  ? <IconeRedondo src={c.icone} tamanho={34} />
                  : <span style={{ width: "34px", height: "34px", flexShrink: 0, borderRadius: "50%", background: "#1b2a3f", color: "#a4b3c6", fontSize: "8pt", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{c.numero}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: "#f1ead4", fontSize: "9pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.personagem}
                    {mostrarModos && !c.chegou && modosAtivos(c, c.e.distancia).map((tipo) => (
                      <span key={tipo} title={MODOS[tipo].texto} style={{ color: MODOS[tipo].cor, marginLeft: "6px", fontWeight: 800 }}>{MODOS[tipo].simbolo}</span>
                    ))}
                  </div>
                  <div style={{ color: "#5f758e", fontSize: "7.5pt", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.treinador ?? "NPC"}</div>
                  <div style={{ height: "3px", background: "rgba(164, 179, 198, 0.15)", borderRadius: "2px", marginTop: "2px" }}>
                    <div style={{ width: `${hpPct}%`, height: "100%", borderRadius: "2px", background: hpPct > 30 ? "#1bd39e" : hpPct > 10 ? "#c5a059" : "#e04b37" }} />
                  </div>
                </div>
                <span style={{ color: "#a4b3c6", fontSize: "8pt", fontFamily: "'Courier New', monospace", minWidth: "52px", textAlign: "right" }}>
                  {c.chegou ? formatarTempo(c.r.tempoChegada) : `${(c.e.velocidade * 3.6).toFixed(1)}km/h`}
                </span>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </Moldura>
  );
}

// ---------------------------------------------------------------------
// PEÇAS DE INTERFACE
// ---------------------------------------------------------------------

const ESTILO_QUADRO = {
  background: "#0b1320",
  border: "1px solid rgba(197, 160, 89, 0.2)",
  borderRadius: "8px",
  padding: "10px 12px",
  height: "460px",
  boxSizing: "border-box",
  overflow: "hidden",
  fontFamily: "'Montserrat', sans-serif",
};

const ESTILO_TITULO_QUADRO = { margin: 0, fontSize: "10pt", fontWeight: 800, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px" };

const ORDINAIS = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

// Texto e cor de cada linha do feed.
function descreverEvento(ev, nomeDoCavalo) {
  switch (ev.tipo) {
    case "skill": return { cor: "#c5a059", texto: `✨ ${ev.texto}` };
    case "duelo": return { cor: CORES_ROTULO.duelo.fundo, texto: "⚔️ Duel" };
    case "ponta": return { cor: CORES_ROTULO.ponta.fundo, texto: "🏇 Spot Struggle" };
    case "spurt": return { cor: CORES_ROTULO.spurt.fundo, texto: "🏁 Last Spurt" };
    case "rushed": return { cor: CORES_ROTULO.rushed.fundo, texto: "🔴 Rushed" };
    case "bloqueio": return { cor: "#e8836f", texto: `⛔ blocked by ${nomeDoCavalo(ev.por)}` };
    case "chegada": return { cor: "#f1ead4", texto: `🏆 finished ${ORDINAIS(ev.posicao)}` };
    default: return { cor: "#a4b3c6", texto: ev.texto ?? "" };
  }
}

// Mini gráfico ao vivo da ficha: Speed e HP do cavalo na corrida toda
// (apagadinho) e o trecho até o instante atual por cima, com a bolinha.
const ALTURA_MINI = 120; // altura do mini gráfico na tela, em px

function MiniGrafico({ frames, indice, tempo, tempoFinal, velocidadeAgora, hpAgora }) {
  const L = 400;
  const A = 90;
  const serie = useMemo(() => frames.filter((f) => f.tempo <= tempoFinal).map((f) => ({ t: f.tempo, v: f.cavalos[indice].velocidade, hp: f.cavalos[indice].hp })), [frames, indice, tempoFinal]);
  const vMax = Math.max(...serie.map((p) => p.v)) * 1.08 || 1;
  const hpMax = Math.max(...serie.map((p) => p.hp)) * 1.08 || 1;
  const x = (t) => (t / tempoFinal) * L;
  const yV = (v) => A - 4 - (v / vMax) * (A - 8);
  const yHp = (hp) => A - 4 - (Math.max(0, hp) / hpMax) * (A - 8);
  const linha = (pontos, fy) => pontos.map((p) => `${x(p.t).toFixed(1)},${fy(p).toFixed(1)}`).join(" ");
  const passado = [...serie.filter((p) => p.t < tempo), { t: tempo, v: velocidadeAgora, hp: hpAgora }];
  return (
    <div>
      <div style={{ display: "flex", gap: "12px", fontSize: "9pt", color: "#8193a8", marginBottom: "3px" }}>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#5b8def", verticalAlign: "middle", marginRight: "4px" }} />Speed</span>
        <span><span style={{ display: "inline-block", width: "10px", height: "3px", background: "#c8e05a", verticalAlign: "middle", marginRight: "4px" }} />HP</span>
      </div>
      <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" style={{ width: "100%", height: `${ALTURA_MINI}px`, display: "block", background: "rgba(13, 22, 36, 0.6)", borderRadius: "4px" }}>
        <polyline points={linha(serie, (p) => yHp(p.hp))} fill="none" stroke="#c8e05a" strokeWidth="1.5" opacity="0.18" vectorEffect="non-scaling-stroke" />
        <polyline points={linha(serie, (p) => yV(p.v))} fill="none" stroke="#5b8def" strokeWidth="1.5" opacity="0.18" vectorEffect="non-scaling-stroke" />
        <polyline points={linha(passado, (p) => yHp(p.hp))} fill="none" stroke="#c8e05a" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={linha(passado, (p) => yV(p.v))} fill="none" stroke="#5b8def" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <line x1={x(tempo)} x2={x(tempo)} y1="0" y2={A} stroke="#f1ead4" strokeDasharray="3 3" opacity="0.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* bolinhas do instante atual (em HTML pra não esticar com o gráfico) */}
      {[[yV(velocidadeAgora), "#5b8def"], [yHp(hpAgora), "#c8e05a"]].map(([y, cor]) => (
        <span key={cor} style={{ position: "absolute", left: `calc(${(x(tempo) / L) * 100}% - 4px)`, top: `calc(${(y / A) * ALTURA_MINI}px - 4px)`, width: "8px", height: "8px", borderRadius: "50%", background: cor, boxShadow: "0 0 0 2px #0b1320" }} />
      ))}
      </div>
    </div>
  );
}

function FichaCavalo({ c, e, r, tempo, posicao, atrasLider, hpInicial, skills, bloqueador, frames, tempoFinal }) {
  const chegou = r.tempoChegada > 0 && tempo >= r.tempoChegada;
  const hpPct = Math.max(0, Math.min(100, (e.hp / (hpInicial || 1)) * 100));
  const ativos = modosAtivos(c, e.distancia);
  const selos = [
    ...ativos.map((tipo) => ({ cor: MODOS[tipo].cor, texto: `${MODOS[tipo].simbolo} ${MODOS[tipo].texto}` })),
    ...(e.rushed ? [{ cor: "#e04b37", texto: "Rushed" }] : []),
    ...(bloqueador ? [{ cor: "#e8836f", texto: `⛔ Blocked by ${bloqueador}` }] : []),
    ...(r.inicioSpurt > 0 && e.distancia >= r.inicioSpurt && !chegou ? [{ cor: CORES_ROTULO.spurt.fundo, texto: "🏁 Last Spurt" }] : []),
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        {c.icone
          ? <IconeRedondo src={c.icone} tamanho={54} />
          : <span style={{ width: "46px", height: "46px", borderRadius: "50%", background: "#1b2a3f", color: "#a4b3c6", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{c.numero}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#f1ead4", fontWeight: 800, fontSize: "13.5pt" }}>{c.personagem}</div>
          <div style={{ color: c.treinador ? "#c5a059" : "#5f758e", fontSize: "11pt", fontWeight: 600 }}>{c.treinador ?? "NPC"}{c.estilo ? ` • ${c.estilo}` : ""}</div>
          {c.treinador && <TituloTreinador nome={c.treinador} />}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#c5a059", fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: "24pt", lineHeight: 1 }}>{chegou ? r.posicaoFinal : posicao}º</div>
          <div style={{ color: "#8193a8", fontSize: "9.5pt" }}>{chegou ? `finished ${formatarTempo(r.tempoChegada)}` : atrasLider < 0.05 ? "leading" : `${atrasLider.toFixed(1)}m behind leader`}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: "10.5pt", color: "#a4b3c6" }}>
        <span>Speed <strong style={{ color: "#f1ead4", float: "right" }}>{(e.velocidade * 3.6).toFixed(1)} km/h</strong></span>
        <span>Distance <strong style={{ color: "#f1ead4", float: "right" }}>{e.distancia.toFixed(0)} m</strong></span>
        <span style={{ gridColumn: "1 / -1" }}>
          HP <strong style={{ color: "#f1ead4", float: "right" }}>{Math.max(0, Math.round(e.hp))} ({hpPct.toFixed(0)}%)</strong>
          <span style={{ display: "block", height: "5px", background: "rgba(164, 179, 198, 0.15)", borderRadius: "3px", marginTop: "4px" }}>
            <span style={{ display: "block", width: `${hpPct}%`, height: "100%", borderRadius: "3px", background: hpPct > 30 ? "#1bd39e" : hpPct > 10 ? "#c5a059" : "#e04b37" }} />
          </span>
        </span>
      </div>

      {/* Linha dos selos com altura fixa (mesmo vazia), pra nada embaixo pular
          quando um Pace Up / Downhill aparece ou some. */}
      <div style={{ display: "flex", gap: "6px", height: "24px", overflow: "hidden", flexShrink: 0 }}>
        {selos.map((selo) => (
          <span key={selo.texto} style={{ color: selo.cor, border: `1px solid ${selo.cor}`, borderRadius: "10px", padding: "1px 9px", fontSize: "9.5pt", fontWeight: 700, whiteSpace: "nowrap", lineHeight: "20px" }}>{selo.texto}</span>
        ))}
      </div>

      <MiniGrafico frames={frames} indice={c.indice} tempo={tempo} tempoFinal={tempoFinal} velocidadeAgora={e.velocidade} hpAgora={e.hp} />

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <p style={{ ...ESTILO_TITULO_QUADRO, fontSize: "9pt", marginBottom: "5px" }}>Skills até agora ({skills.length})</p>
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexWrap: "wrap", alignContent: "flex-start", gap: "4px" }}>
          {[...skills].reverse().map((sk) => (
            <span key={`${sk.inicio}-${sk.texto}`} title={formatarTempo(sk.inicio)} style={{ background: "rgba(197, 160, 89, 0.12)", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.3)", borderRadius: "4px", padding: "2px 8px", fontSize: "9.5pt" }}>
              {sk.texto}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function estiloBotao(ativo) {
  return {
    background: ativo ? "rgba(197, 160, 89, 0.2)" : "transparent",
    border: `1px solid ${ativo ? "#c5a059" : "rgba(197, 160, 89, 0.35)"}`,
    color: ativo ? "#c5a059" : "#a4b3c6",
    borderRadius: "6px",
    padding: "6px 12px",
    fontFamily: "'Montserrat', sans-serif",
    fontSize: "9pt",
    fontWeight: 700,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  };
}

function Opcao({ ativo, aoTrocar, children }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
      <input type="checkbox" checked={ativo} onChange={(e) => aoTrocar(e.target.checked)} style={{ accentColor: "#c5a059" }} />
      {children}
    </label>
  );
}

function Moldura({ titulo, aoFechar, children }) {
  if (!aoFechar) {
    return (
      <div style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "18px", boxSizing: "border-box", boxShadow: "0 8px 25px rgba(0,0,0,0.5)" }}>
        <h3 style={{ margin: "0 0 14px 0", fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "13pt" }}>
          <i className="fa-solid fa-film"></i> Replay{titulo ? ` — ${titulo}` : ""}
          <span style={{ marginLeft: "12px", fontFamily: "'Montserrat', sans-serif", fontSize: "8pt", fontWeight: 500, color: "#5f758e" }}>baseado no <a href="https://hakuraku.moe/" target="_blank" rel="noopener noreferrer" style={{ color: "#c5a059" }}>Hakuraku</a> · <a href="/creditos" style={{ color: "#c5a059" }}>créditos</a></span>
        </h3>
        {children}
      </div>
    );
  }
  return (
    <div
      onClick={aoFechar}
      style={{ position: "fixed", inset: 0, background: "rgba(5, 10, 18, 0.85)", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px", overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: "min(1900px, 98vw)", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "12px", padding: "20px", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "14pt" }}>
            <i className="fa-solid fa-film"></i> Replay{titulo ? ` — ${titulo}` : ""}
          <span style={{ marginLeft: "12px", fontFamily: "'Montserrat', sans-serif", fontSize: "8pt", fontWeight: 500, color: "#5f758e" }}>baseado no <a href="https://hakuraku.moe/" target="_blank" rel="noopener noreferrer" style={{ color: "#c5a059" }}>Hakuraku</a> · <a href="/creditos" style={{ color: "#c5a059" }}>créditos</a></span>
          </h3>
          <button type="button" onClick={aoFechar} style={{ background: "transparent", border: "none", color: "#a4b3c6", fontSize: "18pt", cursor: "pointer", lineHeight: 1 }} title="Fechar (Esc)">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default ReplayCorrida;
