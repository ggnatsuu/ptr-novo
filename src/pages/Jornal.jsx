import { useState, useEffect, useRef, useMemo } from "react";
import { doc, getDoc, collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useCorridas } from "../utils/resumoCorridas";

const ZOOM_FACTOR_PC = 2.5;

// 🎯 PARTE 4/4 (final): Top 3 do placar de líderes na sidebar, calculado
// a partir de TODAS as partidas registradas (mesma fonte de dados do
// Rank Geral, só que olhando apenas quem tem mais vitórias).
function Jornal() {
  const [carregando, setCarregando] = useState(true);
  const [edicaoAtiva, setEdicaoAtiva] = useState(null);
  const [edicaoAtualCache, setEdicaoAtualCache] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [paginaAtualIndex, setPaginaAtualIndex] = useState(0);

  // 🎯 Estados do Modo Cinema
  const [cinemaAberto, setCinemaAberto] = useState(false);
  const [zoomAtivoPC, setZoomAtivoPC] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [origemZoom, setOrigemZoom] = useState("center center");
  const [zoomMobile, setZoomMobile] = useState(1); // 1 (normal) ou 2 (ampliado)

  const imgCinemaRef = useRef(null);
  const arrastandoRef = useRef(false);
  const ultimoMouseRef = useRef({ x: 0, y: 0 });
  const tempoUltimoCliqueRef = useRef(0);
  const coordXInicialRef = useRef(0);

  // 🎯 Equivalente ao antigo inicializarFluxoDadosJornal() — só a parte
  // do documento "atual" por enquanto (o histórico vem na Parte 3).
  useEffect(() => {
    async function carregarEdicaoAtual() {
      try {
        const docAtual = await getDoc(doc(db, "jornais", "atual"));
        if (docAtual.exists()) {
          const dados = docAtual.data();
          setEdicaoAtualCache(dados);
          setEdicaoAtiva(dados);
        }
      } catch (erro) {
        console.error("Erro no carregamento do módulo PTR News:", erro);
      } finally {
        setCarregando(false);
      }
    }
    carregarEdicaoAtual();
  }, []);

  // 🎯 Equivalente à segunda parte do antigo inicializarFluxoDadosJornal():
  // observa a coleção inteira em tempo real, ordenada por data. Só começa
  // depois que a busca da edição "atual" já terminou (gate no !carregando),
  // pra não correr o risco de comparar contra um "edicaoAtualCache" ainda
  // não carregado — o mesmo efeito da ordem sequencial do código original.
  useEffect(() => {
    if (carregando) return;

    const consulta = query(collection(db, "jornais"), orderBy("data_postagem", "desc"));
    const pararDeObservar = onSnapshot(consulta, (snapshot) => {
      const edicoesFiltradas = [];
      let inicializadorCapa = true;

      snapshot.forEach((docSnap) => {
        const dados = docSnap.data();

        if (docSnap.id === "atual") return;
        if (inicializadorCapa && edicaoAtualCache && dados.numero_edicao === edicaoAtualCache.numero_edicao) {
          inicializadorCapa = false;
          return;
        }
        inicializadorCapa = false;
        edicoesFiltradas.push(dados);
      });

      setHistorico(edicoesFiltradas);
    });

    return () => pararDeObservar();
  }, [carregando, edicaoAtualCache]);

  // 🎯 Equivalente ao segundo bloco do jornal.js original (Top 3 do rank).
  // Só usa "nome" e "primeiros" no final, então simplifiquei o cálculo
  // pra não guardar campos que nunca chegam a ser exibidos.
  const corridas = useCorridas();
  const top3 = useMemo(() => {
    const mapaTreinadores = {};
    (corridas ?? []).forEach((partida) => {
      (partida.classificacao || []).forEach((linha) => {
        const treinador = linha.treinador;
        if (!treinador) return;
        if (!mapaTreinadores[treinador]) mapaTreinadores[treinador] = { nome: treinador, primeiros: 0 };
        if (parseInt(linha.posicao) === 1) mapaTreinadores[treinador].primeiros += 1;
      });
    });
    return Object.values(mapaTreinadores).sort((a, b) => b.primeiros - a.primeiros).slice(0, 3);
  }, [corridas]);

  function passarPagina() {
    if (!edicaoAtiva || !edicaoAtiva.paginas?.length) return;
    setPaginaAtualIndex((i) => (i < edicaoAtiva.paginas.length - 1 ? i + 1 : 0));
  }

  function voltarPagina() {
    if (!edicaoAtiva || !edicaoAtiva.paginas?.length) return;
    setPaginaAtualIndex((i) => (i > 0 ? i - 1 : edicaoAtiva.paginas.length - 1));
  }

  function voltarParaEdicaoAtual() {
    if (!edicaoAtualCache) return;
    setEdicaoAtiva(edicaoAtualCache);
    setPaginaAtualIndex(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetarZoomCinemaPC() {
    setZoomAtivoPC(false);
    setPan({ x: 0, y: 0 });
    setOrigemZoom("center center");
  }

  function abrirCinema() {
    setCinemaAberto(true);
  }

  function fecharCinema() {
    setCinemaAberto(false);
    resetarZoomCinemaPC();
    setZoomMobile(1);
  }

  // 🎯 Equivalente ao antigo dblclick no imgCinema: ancora o zoom no ponto
  // exato onde a pessoa clicou (calculado em % da imagem).
  function handleDoubleClickCinema(e) {
    if (window.innerWidth <= 768) return; // No celular o zoom é por toque duplo
    e.preventDefault();

    if (!zoomAtivoPC) {
      const rect = imgCinemaRef.current.getBoundingClientRect();
      const origemX = ((e.clientX - rect.left) / rect.width) * 100;
      const origemY = ((e.clientY - rect.top) / rect.height) * 100;
      setOrigemZoom(`${origemX}% ${origemY}%`);
      setZoomAtivoPC(true);
      setPan({ x: 0, y: 0 });
    } else {
      resetarZoomCinemaPC();
    }
  }

  function handleMouseDownCinema(e) {
    if (!zoomAtivoPC) return;
    e.preventDefault();
    arrastandoRef.current = true;
    ultimoMouseRef.current = { x: e.clientX, y: e.clientY };
  }

  // 🎯 Listeners globais de mousemove/mouseup (equivalente aos antigos
  // window.addEventListener), só ativos enquanto o Cinema estiver aberto.
  useEffect(() => {
    if (!cinemaAberto) return;

    function handleMouseMove(e) {
      if (!arrastandoRef.current) return;
      const deltaX = e.clientX - ultimoMouseRef.current.x;
      const deltaY = e.clientY - ultimoMouseRef.current.y;
      ultimoMouseRef.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + deltaX, y: p.y + deltaY }));
    }
    function handleMouseUp() {
      arrastandoRef.current = false;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [cinemaAberto]);

  // 🎯 Duplo toque pra zoom no celular (detecta 2 cliques rápidos)
  function handleCliqueTouchZone() {
    if (window.innerWidth > 768) return;
    const agora = Date.now();
    const diferenca = agora - tempoUltimoCliqueRef.current;
    if (diferenca < 300 && diferenca > 0) {
      setZoomMobile((z) => (z === 1 ? 2 : 1));
    }
    tempoUltimoCliqueRef.current = agora;
  }

  function avaliarDirecaoArrasto(inicio, fim) {
    const sensibilidadePxs = 50;
    if (inicio - fim > sensibilidadePxs) passarPagina();
    if (fim - inicio > sensibilidadePxs) voltarPagina();
  }

  function handleTouchStart(e) {
    coordXInicialRef.current = e.changedTouches[0].screenX;
  }
  function handleTouchEndViewport(e) {
    avaliarDirecaoArrasto(coordXInicialRef.current, e.changedTouches[0].screenX);
  }
  function handleTouchEndCinema(e) {
    if (zoomMobile !== 1) return; // Só troca de página se não estiver ampliado
    avaliarDirecaoArrasto(coordXInicialRef.current, e.changedTouches[0].screenX);
  }

  // 🎯 Teclado (Esc fecha, setas trocam de página) — só ativo com o Cinema aberto
  useEffect(() => {
    function handleKeyDown(e) {
      if (!cinemaAberto) return;
      if (e.key === "Escape") fecharCinema();
      if (e.key === "ArrowRight") passarPagina();
      if (e.key === "ArrowLeft") voltarPagina();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cinemaAberto, edicaoAtiva]);

  // 🎯 Trava o scroll da página de fundo enquanto o Cinema está aberto
  useEffect(() => {
    document.body.style.overflow = cinemaAberto ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [cinemaAberto]);

  if (carregando) {
    return (
      <main className="main-layout-wrapper" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "50vh" }}>
        <div style={{ color: "#c5a059", fontFamily: "'Montserrat', sans-serif" }}>
          <i className="fa-solid fa-circle-notch fa-spin"></i> Carregando edição...
        </div>
      </main>
    );
  }

  const linkMidiaAtual = edicaoAtiva?.paginas?.[paginaAtualIndex];
  const edicaoNumFormatado = edicaoAtiva ? (edicaoAtiva.numero_edicao < 10 ? `0${edicaoAtiva.numero_edicao}` : edicaoAtiva.numero_edicao) : "--";
  const estaNaEdicaoAtual = edicaoAtiva && edicaoAtualCache && edicaoAtiva.numero_edicao === edicaoAtualCache.numero_edicao;
  const dataFormatada = edicaoAtiva?.data_postagem
    ? new Date(edicaoAtiva.data_postagem.seconds * 1000).toLocaleDateString("pt-BR")
    : null;

  return (
    <main className="main-layout-wrapper">
      <div className="lottery-header">
        <h2 className="lottery-main-title" style={{ color: "rgba(197, 160, 89, 1)" }}>Mídia PTR</h2>
        <div className="lottery-title-divider" style={{ backgroundColor: "rgba(197, 160, 89, 1)", boxShadow: "0 0 10px rgba(255,104,85,0.5)" }}></div>
        <p className="lottery-subtitle">Acompanhe as crônicas das corridas semanais e as análises de hipódromos da nossa comunidade.</p>
      </div>

      <div className="jornal-main-grid">
        {/* COLUNA ESQUERDA: LEITOR */}
        <div className="jornal-leitor-area">
          {!estaNaEdicaoAtual && edicaoAtiva && (
            <div className="banner-edicao-antiga">
              <span><i className="fa-solid fa-clock-rotate-left"></i> Você está visualizando uma edição anterior.</span>
              <button onClick={voltarParaEdicaoAtual}>
                <i className="fa-solid fa-arrow-rotate-left"></i> Voltar para Edição Atual
              </button>
            </div>
          )}

          <div className="leitor-container">
            {!edicaoAtiva ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#a4b3c6", fontFamily: "'Montserrat', sans-serif" }}>
                <i className="fa-solid fa-newspaper" style={{ fontSize: "28pt", marginBottom: "15px", display: "block", color: "#c5a059" }}></i>
                Nenhuma edição publicada ainda.
              </div>
            ) : (
              <>
                <div className="viewport-wrapper" id="jornal-viewport" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEndViewport}>
                  <button className="nav-arrow arrow-left" onClick={voltarPagina} aria-label="Página anterior">
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>

                  <img id="leitor-imagem" src={linkMidiaAtual} alt="Página Ativa do Jornal PTR" className="jornal-view-img" />

                  <button className="nav-arrow arrow-right" onClick={passarPagina} aria-label="Próxima página">
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                </div>

                <div className="leitor-footer">
                  <span className="paginacao-info">
                    Pág. {paginaAtualIndex + 1} de {edicaoAtiva.paginas.length}
                  </span>
                  <button className="btn-cinema" onClick={abrirCinema}>
                    <i className="fa-solid fa-expand"></i> Modo Cinema
                  </button>
                </div>
              </>
            )}
          </div>

          {edicaoAtiva && (
            <div className="info-barra">
              <div className="info-meta">
                <h2>Edição #{edicaoNumFormatado}: {edicaoAtiva.titulo}</h2>
                <span>
                  <i className="fa-regular fa-calendar-days"></i> {dataFormatada ? `Publicado em ${dataFormatada}` : "--/--/----"}
                </span>
              </div>
              <a href={linkMidiaAtual} target="_blank" rel="noopener noreferrer" className="btn-baixar">
                <i className="fa-solid fa-cloud-arrow-down"></i> Baixar Página
              </a>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: SIDEBAR (Top 3 vem na Parte 4) */}
        <div className="lottery-card highlight-dark-card" style={{ padding: "25px" }}>
          <div className="lottery-header" style={{ textAlign: "left", marginBottom: "20px" }}>
            <h3 style={{ fontSize: "12pt", fontFamily: "'Montserrat'", fontWeight: 700, color: "#c5a059", marginBottom: "5px", textTransform: "uppercase" }}>
              <i className="fa-solid fa-trophy"></i> Destaques
            </h3>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: "18pt", color: "#f1ead4", margin: 0 }}>Líderes do Rank</h2>
            <div style={{ width: "40px", height: "3px", backgroundColor: "#ff6855", marginTop: "10px" }}></div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {top3.length === 0 ? (
              <div style={{ color: "#5f758e", fontSize: "9.5pt", fontStyle: "italic", textAlign: "center", padding: "15px" }}>
                Nenhum registro no placar nesta temporada.
              </div>
            ) : (
              top3.map((treinador, index) => {
                const posicao = index + 1;
                let iconeMedalha = "🏅";
                if (posicao === 1) iconeMedalha = "🏆";
                else if (posicao === 2) iconeMedalha = "🥈";
                else if (posicao === 3) iconeMedalha = "🥉";

                return (
                  <div
                    key={treinador.nome}
                    style={{ background: "rgba(14, 23, 38, 0.6)", border: "1px solid rgba(197, 160, 89, 0.15)", borderRadius: "8px", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "15px", boxSizing: "border-box" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
                      <span style={{ fontSize: "14pt", display: "inline-block", verticalAlign: "middle" }}>{iconeMedalha}</span>
                      <span style={{ fontFamily: "'Montserrat'", fontSize: "11pt", fontWeight: 700, color: "#f1ead4", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {treinador.nome}
                      </span>
                    </div>
                    <div style={{ fontFamily: "'Montserrat'", fontSize: "10pt", fontWeight: 800, color: "#c5a059", letterSpacing: "0.5px", whiteSpace: "nowrap", textAlign: "right" }}>
                      {treinador.primeiros} {treinador.primeiros === 1 ? "VITÓRIA" : "VITÓRIAS"}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* HISTÓRICO */}
      <section className="secao-historico-jornais">
        <div className="historico-header">
          <span className="historico-badge">Histórico</span>
          <h2 className="historico-title">Edições Anteriores</h2>
          <div className="historico-divider"></div>
        </div>
        <div className="historico-grid">
          {historico.length === 0 ? (
            <span style={{ color: "#a4b3c6", fontStyle: "italic" }}>Nenhum volume anterior catalogado.</span>
          ) : (
            historico.map((dados) => {
              const dataTratada = dados.data_postagem
                ? new Date(dados.data_postagem.seconds * 1000).toLocaleDateString("pt-BR")
                : "--/--/----";
              const edicaoNum = dados.numero_edicao < 10 ? `0${dados.numero_edicao}` : dados.numero_edicao;

              return (
                <div
                  key={dados.numero_edicao}
                  className="jornal-card"
                  onClick={() => {
                    setEdicaoAtiva(dados);
                    setPaginaAtualIndex(0);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  <div className="card-capa-wrapper">
                    <img src={dados.paginas?.[0]} alt={`Capa da Edição ${dados.numero_edicao}`} className="card-capa-img" loading="lazy" />
                    <span className="card-tag">ED. {edicaoNum}</span>
                  </div>
                  <h4 className="card-titulo">{dados.titulo}</h4>
                  <span style={{ fontSize: "8pt", color: "#a4b3c6", marginTop: "6px" }}>
                    <i className="fa-regular fa-calendar"></i> {dataTratada}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* MODAL MODO CINEMA */}
      {cinemaAberto && (
        <div className="cinema-modal" style={{ display: "flex" }}>
          <button className="btn-close-cinema" onClick={fecharCinema} aria-label="Fechar Modo Cinema">
            <i className="fa-solid fa-xmark"></i>
          </button>

          <div
            className="cinema-content-wrapper"
            id="cinema-touch-zone"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEndCinema}
            onClick={handleCliqueTouchZone}
          >
            <img
              ref={imgCinemaRef}
              src={linkMidiaAtual}
              alt="Jornal em Tela Cheia"
              className="cinema-img"
              style={{
                cursor: zoomAtivoPC ? "grab" : "zoom-in",
                transformOrigin: origemZoom,
                transform:
                  window.innerWidth <= 768
                    ? `scale(${zoomMobile})`
                    : `translate(${pan.x}px, ${pan.y}px) scale(${zoomAtivoPC ? ZOOM_FACTOR_PC : 1})`,
              }}
              onDoubleClick={handleDoubleClickCinema}
              onMouseDown={handleMouseDownCinema}
              onDragStart={(e) => e.preventDefault()}
            />
            {window.innerWidth <= 768 && (
              <div className="zoom-instrucao" style={{ display: "block" }}>
                Dica: Use toque duplo para aproximar e ler os textos
              </div>
            )}
          </div>

          {/* Setas exclusivas do Modo Cinema */}
          <div id="ptr-cinema-nav-wrapper">
            <button
              id="btn-cinema-ant"
              className="cinema-arrow arrow-left"
              aria-label="Voltar Página Cinema"
              onClick={(e) => { e.stopPropagation(); voltarPagina(); }}
            >
              <i className="fa-solid fa-chevron-left"></i>
            </button>
            <button
              id="btn-cinema-prox"
              className="cinema-arrow arrow-right"
              aria-label="Avançar Página Cinema"
              onClick={(e) => { e.stopPropagation(); passarPagina(); }}
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default Jornal;