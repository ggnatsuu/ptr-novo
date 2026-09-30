import { useState, useEffect, useRef } from "react";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";
import { obterUrlImagemPersonagem } from "../utils/cloudinary";

// 🎯 PARTE 1/3: busca as corridas com resultado já lançado pra edição
// ativa, e monta o carrossel de cards clicáveis (nome, distância,
// Top 3 resumido). A tabela detalhada com os 22 campos de telemetria
// vem na Parte 2.
// 🎯 Estilo do "chip" de metadado (hipódromo/distância/terreno) — cada um
// é uma etiqueta própria que nunca quebra no meio (whiteSpace:nowrap),
// então se precisar ir pra 2ª linha, o chip inteiro desce junto, sem
// cortar texto no meio da palavra.
const estiloChipMetadado = {
  display: "inline-block",
  background: "rgba(197, 160, 89, 0.08)",
  border: "1px solid rgba(197, 160, 89, 0.2)",
  borderRadius: "4px",
  padding: "3px 8px",
  fontSize: "0.72rem",
  color: "#a4b3c6",
  whiteSpace: "nowrap",
  lineHeight: 1.4,
};

// 🎯 Estilo base de toda célula da tabela detalhada — cada coluna
// sobrescreve só o que precisa (cor, alinhamento, etc)
const estiloCelulaBase = {
  padding: "18px 16px",
  textAlign: "center",
  verticalAlign: "middle",
  fontSize: "10.5pt",
  fontFamily: "'Montserrat', sans-serif",
};

const CORES_STYLE = { FRONT: "#3498db", PACE: "#2ecc71", LATE: "#f39c12", END: "#e74c3c" };

// 🎯 Formata a distância de forma tolerante: corridas salvas com o bug
// antigo (campo "distancia" ausente/undefined) tentam se recuperar
// primeiro pela lista arquivada da edição (fonte real, não chute) —
// só se nem isso existir é que cai num aviso genérico.
function formatarDistancia(item, nomePista, pistasArquivadas) {
  if (item.distancia && item.distancia !== "undefined") return item.distancia;
  if (item.distancia_tipo && item.distancia_numero) return `${item.distancia_tipo} (${item.distancia_numero}m)`;

  if (pistasArquivadas) {
    const arquivada = pistasArquivadas.find((p) => p.nome === nomePista);
    if (arquivada && arquivada.distancia_tipo && arquivada.distancia_numero) {
      return `${arquivada.distancia_tipo} (${arquivada.distancia_numero}m)`;
    }
  }

  if (item.distancia_tipo) return item.distancia_tipo;
  if (item.distancia_numero) return `${item.distancia_numero}m`;
  return "Distância não informada";
}

// 🎯 Faixas de cor do WT: até -0.3 é verde (bom), entre -0.35 e -0.4 é
// dourado/amarelo (atenção), o resto (pior que -0.4, ou o intervalo entre
// -0.3 e -0.35) fica vermelho.
// 🎯 Campos de telemetria podem vir vazios (null) — ex: colunas que o
// upload do arquivo de corrida ainda não calcula. Mostra "-" nesses casos.
function mostrar(valor, sufixo = "") {
  if (valor === null || valor === undefined || valor === "") return "-";
  return `${valor}${sufixo}`;
}

function corWT(valor) {
  if (valor === null || valor === undefined) return "#a4b3c6";
  if (valor >= -0.3) return "#1bd39e";
  if (valor <= -0.35 && valor >= -0.4) return "#c5a059";
  return "#e04b37";
}

function Resultados() {
  const [edicaoAtiva, setEdicaoAtiva] = useState(null);
  const [pistasArquivadasPorEdicao, setPistasArquivadasPorEdicao] = useState({});
  const [pistasSorteadas, setPistasSorteadas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [todasCorridas, setTodasCorridas] = useState([]);
  const [edicaoVisualizada, setEdicaoVisualizada] = useState(null);
  const [limiteEdicoesAntigas, setLimiteEdicoesAntigas] = useState(10);
  const [indiceSelecionado, setIndiceSelecionado] = useState(null);

  const carrosselRef = useRef(null);

  // 🎯 Descobre qual é a edição ativa e a lista de pistas já sorteadas
  // (mesma fonte que Agenda/Sorteio já usam) — precisamos das pistas pra
  // mostrar um card de "aguardando resultado" pra quem ainda não foi
  // computado pelo admin.
  useEffect(() => {
    async function carregarEdicaoAtiva() {
      try {
        const snap = await getDoc(doc(db, "pistas_sorteadas", "atual"));
        if (snap.exists()) {
          setEdicaoAtiva(snap.data().edicaoAtiva || null);
          setPistasSorteadas(snap.data().pistas || []);
        } else {
          setEdicaoAtiva(null);
          setPistasSorteadas([]);
        }
      } catch (erro) {
        console.error("Erro ao buscar edição ativa:", erro);
      } finally {
        setCarregando(false);
      }
    }
    carregarEdicaoAtiva();
  }, []);

  // 🎯 Mesma derivação do Sorteio/Agenda/RankAdmin: se algum confirmado
  // da edição ativa já tem "grupo" gravado, cada pista sorteada tem 2
  // resultados possíveis (um por grupo) em vez de 1.
  const [gruposAtivosNaAtual, setGruposAtivosNaAtual] = useState(false);

  useEffect(() => {
    if (!edicaoAtiva) return;
    const pararDeObservar = onSnapshot(
      collection(db, "checkins", edicaoAtiva, "confirmados"),
      (snapshot) => setGruposAtivosNaAtual(snapshot.docs.some((d) => d.data().grupo)),
      (erro) => console.error("Erro ao observar grupos (Resultados):", erro)
    );
    return () => pararDeObservar();
  }, [edicaoAtiva]);

  // 🎯 Assim que descobrirmos qual é a edição ativa, começamos mostrando
  // ela (só na primeira vez — depois disso, é o clique do usuário nos
  // chips de "Edições Anteriores" que decide o que aparece).
  useEffect(() => {
    if (edicaoAtiva && edicaoVisualizada === null) {
      setEdicaoVisualizada(edicaoAtiva);
    }
  }, [edicaoAtiva, edicaoVisualizada]);

  // 🎯 Busca (com cache, só uma vez por edição) o documento arquivado
  // pistas_sorteadas/{edicao} — é a fonte "de verdade" de distancia_tipo/
  // distancia_numero pra corridas antigas cujo resultado foi salvo com o
  // bug do campo "distancia" ausente. Só busca quando realmente precisa
  // (edição passada, ainda não buscada antes).
  useEffect(() => {
    if (!edicaoVisualizada || edicaoVisualizada === edicaoAtiva) return;
    if (pistasArquivadasPorEdicao[edicaoVisualizada]) return;

    async function buscarPistasArquivadas() {
      try {
        const snap = await getDoc(doc(db, "pistas_sorteadas", edicaoVisualizada));
        setPistasArquivadasPorEdicao((prev) => ({ ...prev, [edicaoVisualizada]: snap.exists() ? snap.data().pistas || [] : [] }));
      } catch (erro) {
        console.error("Erro ao buscar pistas arquivadas da edição:", erro);
      }
    }
    buscarPistasArquivadas();
  }, [edicaoVisualizada, edicaoAtiva, pistasArquivadasPorEdicao]);

  // 🎯 Observa em tempo real TODAS as corridas já registradas (de
  // qualquer edição, não só a ativa) — assim dá pra navegar pelo
  // histórico sem precisar de uma consulta nova a cada clique.
  useEffect(() => {
    const pararDeObservar = onSnapshot(
      collection(db, "resultados_partidas"),
      (snapshot) => {
        const lista = [];
        snapshot.forEach((docSnap) => lista.push({ id: docSnap.id, ...docSnap.data() }));
        setTodasCorridas(lista);
      },
      (erro) => {
        console.error("Erro ao observar resultados:", erro);
      }
    );

    return () => pararDeObservar();
  }, []);

  function obterTop3(corrida) {
    return [...(corrida.classificacao || [])]
      .sort((a, b) => a.posicao - b.posicao)
      .slice(0, 3);
  }

  function rolarCarrossel(direcao) {
    if (!carrosselRef.current) return;
    carrosselRef.current.scrollBy({ left: direcao * 320, behavior: "smooth" });
  }

  // 🎯 Agrupa todas as corridas por edição — base tanto pra saber quais
  // pistas mostrar no carrossel quanto pra montar a lista de "Edições
  // Anteriores" (contando quantas corridas cada uma teve).
  const corridasAgrupadasPorEdicao = {};
  todasCorridas.forEach((c) => {
    if (!c.edicaoId) return;
    if (!corridasAgrupadasPorEdicao[c.edicaoId]) corridasAgrupadasPorEdicao[c.edicaoId] = [];
    corridasAgrupadasPorEdicao[c.edicaoId].push(c);
  });

  const edicoesAntigasOrdenadas = Object.keys(corridasAgrupadasPorEdicao)
    .filter((id) => id !== edicaoAtiva)
    .sort((a, b) => {
      const numA = parseInt(a.replace("edicao_", ""), 10) || 0;
      const numB = parseInt(b.replace("edicao_", ""), 10) || 0;
      return numB - numA;
    });

  const estaNaEdicaoAtiva = edicaoVisualizada === edicaoAtiva;
  const corridasDaEdicaoVisualizada = corridasAgrupadasPorEdicao[edicaoVisualizada] || [];
  const corridasOrdenadas = [...corridasDaEdicaoVisualizada].sort((a, b) => {
    if (a.grade !== b.grade) {
      if (a.grade === "G1") return -1;
      if (b.grade === "G1") return 1;
      return (a.grade || "").localeCompare(b.grade || "");
    }
    const cmpNome = (a.pistaNome || "").localeCompare(b.pistaNome || "");
    if (cmpNome !== 0) return cmpNome;
    return (a.grupo || "").localeCompare(b.grupo || "");
  });

  // 🎯 Na edição ATIVA: junta a lista de pistas sorteadas (do Sorteio) com
  // o resultado já lançado (se existir), mostrando "aguardando" pra quem
  // ainda não foi computado. Em edições PASSADAS: mostra só as corridas
  // que realmente têm resultado, já que a rodada já está encerrada.
  const listaCombinada = estaNaEdicaoAtiva
    ? gruposAtivosNaAtual
      ? pistasSorteadas.flatMap((pista, indice) =>
          ["A", "B"].map((grupo) => {
            const resultado = corridasOrdenadas.find((c) => c.pistaNome === pista.nome && c.grupo === grupo) || null;
            return {
              chave: resultado ? resultado.id : `pendente-${indice}-${grupo}`,
              pistaNome: pista.nome,
              grupo,
              grade: pista.grade,
              hipodromo: pista.hipodromo,
              distancia: formatarDistancia(pista, pista.nome, null),
              terreno: pista.terreno,
              resultado,
            };
          })
        )
      : pistasSorteadas.map((pista, indice) => {
          const resultado = corridasOrdenadas.find((c) => c.pistaNome === pista.nome) || null;
          return {
            chave: resultado ? resultado.id : `pendente-${indice}`,
            pistaNome: pista.nome,
            grade: pista.grade,
            hipodromo: pista.hipodromo,
            distancia: formatarDistancia(pista, pista.nome, null),
            terreno: pista.terreno,
            resultado,
          };
        })
    : corridasOrdenadas.map((c) => ({
        chave: c.id,
        pistaNome: c.pistaNome,
        grupo: c.grupo || null,
        grade: c.grade,
        hipodromo: c.hipodromo,
        distancia: formatarDistancia(c, c.pistaNome, pistasArquivadasPorEdicao[edicaoVisualizada]),
        terreno: c.terreno,
        resultado: c,
      }));

  const itemSelecionado = indiceSelecionado !== null ? listaCombinada[indiceSelecionado] : null;
  const corridaSelecionada = itemSelecionado ? itemSelecionado.resultado : null;

  return (
    <main className="main-layout-wrapper">
      <div className="lottery-header">
        <h2 className="lottery-main-title">🏁 Resultados da Rodada</h2>
        <div className="lottery-title-divider"></div>
        <p className="lottery-subtitle">
          {edicaoVisualizada ? `Edição ${edicaoVisualizada.replace("edicao_", "")}` : ""} — clique num circuito abaixo para ver os detalhes completos da corrida.
        </p>
      </div>

      {!estaNaEdicaoAtiva && edicaoVisualizada && (
        <div className="banner-edicao-antiga" style={{ maxWidth: "700px", margin: "0 auto 30px auto" }}>
          <span><i className="fa-solid fa-clock-rotate-left"></i> Você está vendo uma edição anterior.</span>
          <button onClick={() => { setEdicaoVisualizada(edicaoAtiva); setIndiceSelecionado(null); }}>
            <i className="fa-solid fa-arrow-rotate-left"></i> Voltar para Edição Atual
          </button>
        </div>
      )}

      {carregando ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#c5a059" }}>
          <i className="fa-solid fa-circle-notch fa-spin"></i> Carregando resultados...
        </div>
      ) : listaCombinada.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#a4b3c6" }}>
          <div style={{ fontSize: "28pt", marginBottom: "15px" }}>🏁</div>
          Nenhuma pista sorteada ainda para essa rodada.
        </div>
      ) : (
        <>
          {/* CARROSSEL DE CARDS */}
          <div style={{ position: "relative", width: "100%", maxWidth: "1100px", margin: "0 auto 40px auto" }}>
            <button
              onClick={() => rolarCarrossel(-1)}
              aria-label="Anterior"
              style={{ position: "absolute", left: "-15px", top: "50%", transform: "translateY(-50%)", zIndex: 5, width: "40px", height: "40px", borderRadius: "50%", background: "rgba(11, 19, 32, 0.9)", border: "1px solid rgba(197, 160, 89, 0.4)", color: "#c5a059", cursor: "pointer" }}
            >
              <i className="fa-solid fa-chevron-left"></i>
            </button>

            <div
              ref={carrosselRef}
              style={{ display: "flex", gap: "20px", overflowX: "auto", scrollSnapType: "x mandatory", padding: "10px 30px", scrollbarWidth: "none" }}
            >
              {listaCombinada.map((item, indice) => {
                const temResultado = item.resultado !== null;
                const top3 = temResultado ? obterTop3(item.resultado) : [];
                const selecionado = indice === indiceSelecionado;
                const nomeImagemHipodromo = item.hipodromo ? item.hipodromo.toLowerCase().replace(/[^a-z0-9]/g, "") : "default";

                return (
                  <div
                    key={item.chave}
                    onClick={() => temResultado && setIndiceSelecionado(selecionado ? null : indice)}
                    style={{
                      flex: "0 0 290px",
                      scrollSnapAlign: "start",
                      background: "#0d1624",
                      border: selecionado ? "2px solid #c5a059" : "1px solid rgba(197, 160, 89, 0.2)",
                      borderRadius: "12px",
                      overflow: "hidden",
                      cursor: temResultado ? "pointer" : "default",
                      opacity: temResultado ? 1 : 0.65,
                      boxShadow: selecionado ? "0 0 20px rgba(197, 160, 89, 0.3)" : "0 8px 20px rgba(0,0,0,0.4)",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <div style={{ position: "relative", height: "110px" }}>
                      <img
                        src={`/assets/img/hipodromos/${nomeImagemHipodromo}.png`}
                        alt={item.hipodromo}
                        style={{ width: "100%", height: "100%", objectFit: "cover", filter: temResultado ? "none" : "grayscale(60%)" }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                      <span
                        className={`lottery-card-badge ${item.grade === "G1" ? "badge-gold" : ""}`}
                        style={{ position: "absolute", top: "10px", left: "10px" }}
                      >
                        {item.grade}
                      </span>
                    </div>

                    <div style={{ padding: "16px" }}>
                      <h4 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "12.5pt", margin: "0 0 4px 0" }}>
                        {item.pistaNome}{item.grupo && <span style={{ color: "#c5a059" }}> — Grupo {item.grupo}</span>}
                      </h4>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "0 0 12px 0", minHeight: "56px", alignContent: "flex-start" }}>
                        <span style={estiloChipMetadado}>📍 {item.hipodromo}</span>
                        <span style={estiloChipMetadado}>📏 {item.distancia}</span>
                        <span style={estiloChipMetadado}>🌿 {item.terreno}</span>
                      </div>

                      {temResultado ? (
                        <div style={{ borderTop: "1px dashed rgba(197, 160, 89, 0.2)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {top3.map((linha) => {
                            const emojiMedalha = linha.posicao === 1 ? "🥇" : linha.posicao === 2 ? "🥈" : "🥉";
                            return (
                              <div key={linha.posicao} style={{ display: "flex", alignItems: "center", fontSize: "8.5pt" }}>
                                <span style={{ width: "24px", flexShrink: 0, textAlign: "center" }}>{emojiMedalha}</span>
                                <span
                                  style={{
                                    flex: 1,
                                    minWidth: 0,
                                    color: "#f1ead4",
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {linha.personagem}
                                </span>
                                <span
                                  style={{
                                    flexShrink: 0,
                                    marginLeft: "6px",
                                    color: "#c5a059",
                                    fontSize: "0.6rem",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  [{linha.treinador}]
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ borderTop: "1px dashed rgba(197, 160, 89, 0.2)", paddingTop: "10px", textAlign: "center", color: "#5f758e", fontSize: "8.5pt", fontStyle: "italic" }}>
                          <i className="fa-solid fa-hourglass-half" style={{ marginRight: "6px" }}></i>
                          Aguardando resultado...
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => rolarCarrossel(1)}
              aria-label="Próximo"
              style={{ position: "absolute", right: "-15px", top: "50%", transform: "translateY(-50%)", zIndex: 5, width: "40px", height: "40px", borderRadius: "50%", background: "rgba(11, 19, 32, 0.9)", border: "1px solid rgba(197, 160, 89, 0.4)", color: "#c5a059", cursor: "pointer" }}
            >
              <i className="fa-solid fa-chevron-right"></i>
            </button>
          </div>

          {/* TABELA DETALHADA DE TELEMETRIA */}
          {corridaSelecionada && (
            <div style={{ width: "100%", maxWidth: "1550px", margin: "0 auto 60px auto" }}>
              <h3 style={{ textAlign: "center", fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "15pt", marginBottom: corridaSelecionada.linkReplay ? "14px" : "20px" }}>
                {corridaSelecionada.grade} • {corridaSelecionada.pistaNome}{corridaSelecionada.grupo ? ` — Grupo ${corridaSelecionada.grupo}` : ""} — Resultados Detalhados
              </h3>

              {corridaSelecionada.linkReplay && (
                <div style={{ textAlign: "center", marginBottom: "20px" }}>
                  <a
                    href={corridaSelecionada.linkReplay}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(197, 160, 89, 0.08)", border: "1px solid rgba(197, 160, 89, 0.4)", color: "#c5a059", borderRadius: "50px", padding: "8px 20px", fontSize: "9pt", fontWeight: 700, fontFamily: "'Montserrat'", textDecoration: "none" }}
                  >
                    <i className="fa-solid fa-arrow-up-right-from-square"></i> Ver Detalhes da Corrida
                  </a>
                </div>
              )}

              <div className="quadro-table-scroll" style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", boxShadow: "0 8px 25px rgba(0,0,0,0.5)", boxSizing: "border-box", overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: "1350px", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["FINISH", "NO.", "CHARACTER", "TIME", "STYLE", "DELAY", "LAST SPURT", "HP RESULT", "DUEL", "DOWNHILL", "PACE", "WT"].map((titulo) => (
                        <th
                          key={titulo}
                          style={{
                            background: "#0b1320",
                            color: "#c5a059",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            padding: "20px 16px",
                            borderBottom: "2px solid rgba(197, 160, 89, 0.3)",
                            fontSize: "9.5pt",
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            fontFamily: "'Montserrat', sans-serif",
                          }}
                        >
                          {titulo}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(corridaSelecionada.classificacao || [])]
                      .sort((a, b) => a.posicao - b.posicao)
                      .map((linha) => {
                        const corPosicao = linha.posicao === 1 ? "#c5a059" : linha.posicao === 2 ? "#a4b3c6" : linha.posicao === 3 ? "#cd7f32" : "#f1ead4";
                        const corStyle = CORES_STYLE[linha.style] || "#a4b3c6";

                        return (
                          <tr key={linha.posicao} style={{ borderBottom: "1px solid rgba(164, 179, 198, 0.1)", background: linha.posicao <= 3 ? "rgba(197, 160, 89, 0.03)" : "transparent" }}>
                            <td style={{ ...estiloCelulaBase, color: corPosicao, fontWeight: 800, fontSize: "14pt" }}>{linha.posicao}</td>
                            <td style={{ ...estiloCelulaBase, color: "#a4b3c6", fontSize: "10.5pt" }}>{linha.numero}</td>
                            <td style={{ ...estiloCelulaBase, textAlign: "left" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                {obterUrlImagemPersonagem(linha.personagem) && (
                                  <img
                                    src={obterUrlImagemPersonagem(linha.personagem)}
                                    alt={linha.personagem}
                                    style={{ width: "36px", height: "36px", borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(197, 160, 89, 0.4)", flexShrink: 0 }}
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  />
                                )}
                                <div>
                                  <div style={{ fontWeight: 700, color: "#f1ead4", fontSize: "11pt" }}>{linha.personagem}</div>
                                  <div style={{ fontSize: "9pt", color: "#c5a059" }}>[{linha.treinador}]</div>
                                </div>
                              </div>
                            </td>
                            <td style={estiloCelulaBase}>
                              <div style={{ color: "#f1ead4", fontWeight: 600, fontSize: "10.5pt" }}>{linha.tempo}</div>
                              {linha.distancia_diff !== null && <div style={{ fontSize: "9pt", color: "#5f758e" }}>+{linha.distancia_diff}m</div>}
                            </td>
                            <td style={estiloCelulaBase}>
                              <span style={{ background: `${corStyle}22`, color: corStyle, border: `1px solid ${corStyle}55`, borderRadius: "50px", padding: "5px 14px", fontSize: "9pt", fontWeight: 700 }}>
                                {linha.style}
                              </span>
                            </td>
                            <td style={estiloCelulaBase}>
                              <div style={{ color: "#f1ead4", fontSize: "10pt" }}>{linha.start_delay_ms}ms</div>
                              <div style={{ fontSize: "9pt", color: linha.start_delay_status === "Late" ? "#e04b37" : "#1bd39e" }}>{linha.start_delay_status}</div>
                            </td>
                            <td style={estiloCelulaBase}>
                              <div style={{ fontSize: "9pt", color: "#a4b3c6" }}>Delay: <span style={{ color: "#f1ead4" }}>{mostrar(linha.last_spurt_delay_m, "m")}</span></div>
                              <div style={{ fontSize: "9pt", color: "#a4b3c6" }}>Speed: <span style={{ color: "#f1ead4" }}>{mostrar(linha.last_spurt_speed)}</span></div>
                            </td>
                            <td style={estiloCelulaBase}>
                              <div style={{ color: linha.hp_status === "Survived" ? "#1bd39e" : "#e04b37", fontWeight: 700, fontSize: "10pt" }}>
                                {linha.hp_status}{linha.hp_status === "Died" && linha.hp_m_diff ? ` (${linha.hp_m_diff}m)` : ""}
                              </div>
                              <div style={{ fontSize: "9pt", color: "#a4b3c6" }}>
                                {linha.hp_val === null || linha.hp_val === undefined ? "-" : `${linha.hp_val} HP (${mostrar(linha.hp_pct, "%")})`}
                              </div>
                            </td>
                            <td style={{ ...estiloCelulaBase, color: "#a4b3c6", fontSize: "10.5pt" }}>{mostrar(linha.duel_s, "s")}</td>
                            <td style={estiloCelulaBase}>
                              <div style={{ color: "#f1ead4", fontSize: "10pt" }}>{mostrar(linha.downhill_s, "s")}</div>
                              <div style={{ fontSize: "8.5pt", color: "#a4b3c6" }}>{linha.downhill_detail}</div>
                            </td>
                            <td style={estiloCelulaBase}>
                              <div style={{ color: "#1bd39e", fontSize: "9.5pt" }}>↑ {mostrar(linha.pace_up_s, "s")}</div>
                              <div style={{ color: "#e04b37", fontSize: "9.5pt" }}>↓ {mostrar(linha.pace_down_s, "s")}</div>
                            </td>
                            <td style={{ ...estiloCelulaBase, color: corWT(linha.wt_s), fontWeight: 700, fontSize: "11pt" }}>{mostrar(linha.wt_s, "m")}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* EDIÇÕES ANTERIORES */}
      {edicoesAntigasOrdenadas.length > 0 && (
        <div style={{ width: "100%", maxWidth: "900px", margin: "50px auto 60px auto", borderTop: "1px dashed rgba(197, 160, 89, 0.2)", paddingTop: "35px" }}>
          <h3 style={{ textAlign: "center", fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "13pt", marginBottom: "20px" }}>
            📜 Edições Anteriores
          </h3>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center" }}>
            {edicoesAntigasOrdenadas.slice(0, limiteEdicoesAntigas).map((id) => {
              const corridasDessaEdicao = corridasAgrupadasPorEdicao[id] || [];
              const numeroEdicao = id.replace("edicao_", "");
              const dataRepresentativa = corridasDessaEdicao[0]?.dataRegistro || "";
              const selecionada = id === edicaoVisualizada;

              return (
                <button
                  key={id}
                  onClick={() => {
                    setEdicaoVisualizada(id);
                    setIndiceSelecionado(null);
                  }}
                  style={{
                    background: selecionada ? "rgba(197, 160, 89, 0.15)" : "#0d1624",
                    border: selecionada ? "2px solid #c5a059" : "1px solid rgba(197, 160, 89, 0.25)",
                    borderRadius: "10px",
                    padding: "12px 18px",
                    cursor: "pointer",
                    textAlign: "center",
                    minWidth: "110px",
                  }}
                >
                  <div style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "10.5pt", fontWeight: 700 }}>ED. {numeroEdicao}</div>
                  <div style={{ fontFamily: "'Montserrat'", color: "#a4b3c6", fontSize: "7.5pt", marginTop: "3px" }}>
                    {corridasDessaEdicao.length} corrida{corridasDessaEdicao.length !== 1 ? "s" : ""}
                    {dataRepresentativa && ` · ${dataRepresentativa}`}
                  </div>
                </button>
              );
            })}
          </div>

          {limiteEdicoesAntigas < edicoesAntigasOrdenadas.length && (
            <div style={{ textAlign: "center", marginTop: "22px" }}>
              <button
                onClick={() => setLimiteEdicoesAntigas((l) => l + 10)}
                style={{ background: "transparent", border: "1px solid rgba(197,160,89,0.4)", color: "#c5a059", borderRadius: "50px", padding: "10px 26px", fontSize: "9pt", fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat'" }}
              >
                <i className="fa-solid fa-chevron-down"></i> Carregar mais edições
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default Resultados;