import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { obterUrlImagemPersonagem } from "../utils/cloudinary";

const thStyle = {
  cursor: "pointer",
  textAlign: "center",
  padding: "15px 10px",
  fontFamily: "'Montserrat'",
  fontSize: "10pt",
  color: "#c5a059",
  fontWeight: 700,
  userSelect: "none",
  whiteSpace: "nowrap",
};

function ThOrdenavel({ campo, texto, ordenacao, aoClicar, alinhamento = "center" }) {
  const ativo = ordenacao.campo === campo;
  const icone = ativo ? (ordenacao.crescente ? "fa-sort-up" : "fa-sort-down") : "fa-sort";

  return (
    <th style={{ ...thStyle, textAlign: alinhamento }} onClick={() => aoClicar(campo)}>
      {texto}{" "}
      <i className={`fa-solid ${icone} sort-icon-hint`} style={ativo ? { opacity: 1, color: "#c5a059" } : undefined}></i>
    </th>
  );
}

// 🎯 Cores do pódio, mesmo padrão de medalha usado em todo o site
const CORES_PODIO = { 1: "#c5a059", 2: "#a4b3c6", 3: "#cd7f32" };

// 🎯 O campo dataRegistro é salvo como texto "DD/MM/AAAA" (via
// toLocaleDateString pt-BR) — essa função converte de volta pra Date,
// pra dar pra comparar qual vitória é mais recente.
function parseDataRegistro(texto) {
  if (!texto) return null;
  const [dia, mes, ano] = texto.split("/").map(Number);
  if (!dia || !mes || !ano) return null;
  return new Date(ano, mes - 1, dia);
}

// 🎯 Faixas de cor do Win Rate no modal de detalhes por treinador:
// 30%+ verde vivo, 10-29% dourado, 0% cinza apagado.
function corWinRateTreinador(valor) {
  if (valor >= 30) return "#1bd39e";
  if (valor >= 10) return "#c5a059";
  return "#5a6e85";
}

// 🎯 Abaixo disso o win rate fica em cinza: amostra pequena demais pra comparar.
const AMOSTRA_MINIMA = 15;
const NOMES_CAMPO = { vitorias: "vitórias", podios: "pódios", corridas: "corridas", winRate: "win rate", pickRate: "pick rate", posMedia: "posição média" };
const tipoDistancia = (texto) => String(texto ?? "").split(" (")[0].trim();

// 🎯 Agrega por personagem as corridas recebidas (já filtradas). Cada linha
// de cada classificação vira um "voto" pra estatística daquela cavalinha.
function agregarPersonagens(corridas) {
  const mapaPersonagens = {};
  const novo = (nome) => ({ nome, corridas: 0, vitorias: 0, podios: 0, somaPosicoes: 0, corridasComEla: new Set(), porTreinador: {}, historicoVitorias: [] });

  corridas.forEach((corrida, indiceCorrida) => {
    // 🎯 Registra essa corrida no histórico de vitórias da cavalinha vencedora.
    if (corrida.cavaloVencedor) {
      const nomeVencedor = corrida.cavaloVencedor;
      if (!mapaPersonagens[nomeVencedor]) mapaPersonagens[nomeVencedor] = novo(nomeVencedor);
      mapaPersonagens[nomeVencedor].historicoVitorias.push({
        edicaoId: corrida.edicaoId || "",
        pistaNome: corrida.pistaNome || "",
        treinador: corrida.treinadorVencedor || "",
        dataRegistro: corrida.dataRegistro || "",
      });
    }

    (corrida.classificacao || []).forEach((linha) => {
      const nome = linha.personagem;
      if (!nome) return;
      if (!mapaPersonagens[nome]) mapaPersonagens[nome] = novo(nome);
      const p = mapaPersonagens[nome];
      const posicao = Number(linha.posicao);
      p.corridas++;
      p.somaPosicoes += posicao || 0;
      p.corridasComEla.add(indiceCorrida);
      if (posicao === 1) p.vitorias++;
      if (posicao <= 3) p.podios++;

      // 🎯 Estatística por treinador (alimenta o modal de Detalhes). Mesma
      // normalização do Rank Geral: agrupa por nome minúsculo/sem espaço nas
      // pontas, senão uma troca de nick separa as vitórias em 2 linhas.
      if (linha.treinador) {
        const chaveTreinador = linha.treinador.toLowerCase().trim();
        if (!p.porTreinador[chaveTreinador]) {
          p.porTreinador[chaveTreinador] = { treinador: linha.treinador, corridas: 0, vitorias: 0, podios: 0, contagemGrafias: {} };
        }
        const t = p.porTreinador[chaveTreinador];
        t.contagemGrafias[linha.treinador] = (t.contagemGrafias[linha.treinador] || 0) + 1;
        if (t.contagemGrafias[linha.treinador] > (t.contagemGrafias[t.treinador] || 0)) t.treinador = linha.treinador;
        t.corridas++;
        if (posicao === 1) t.vitorias++;
        if (posicao <= 3) t.podios++;
      }
    });
  });

  return Object.values(mapaPersonagens).map((p) => {
    const detalhesPorTreinador = Object.values(p.porTreinador)
      // eslint-disable-next-line no-unused-vars -- "contagemGrafias" era só um contador auxiliar, descartado de propósito
      .map(({ contagemGrafias, ...t }) => ({ ...t, winRate: t.corridas > 0 ? Math.round((t.vitorias / t.corridas) * 100) : 0 }))
      .sort((a, b) => b.vitorias - a.vitorias || b.podios - a.podios || b.winRate - a.winRate || a.corridas - b.corridas);

    // 🎯 Última vitória (mais recente pela data de registro) — vai no rodapé do modal.
    const ultimaVitoria = [...p.historicoVitorias]
      .sort((a, b) => {
        const dataA = parseDataRegistro(a.dataRegistro);
        const dataB = parseDataRegistro(b.dataRegistro);
        if (!dataA || !dataB) return 0;
        return dataB - dataA;
      })[0] || null;

    return {
      nome: p.nome,
      corridas: p.corridas,
      vitorias: p.vitorias,
      podios: p.podios,
      winRate: p.corridas > 0 ? Math.round((p.vitorias / p.corridas) * 100) : 0,
      // 🎯 Pick rate = % das corridas em que pelo menos um treinador usou
      // ela (antes contava cada uso, e passava de 100% quando duas pessoas
      // escolhiam a mesma na mesma corrida).
      pickRate: corridas.length > 0 ? Math.round((p.corridasComEla.size / corridas.length) * 100) : 0,
      posMedia: p.corridas > 0 ? Math.round((p.somaPosicoes / p.corridas) * 10) / 10 : 0,
      detalhesPorTreinador,
      ultimaVitoria,
    };
  });
}

function RankPersonagens() {
  const [carregando, setCarregando] = useState(true);
  const [corridas, setCorridas] = useState([]);
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState({ campo: "vitorias", crescente: false });
  const [personagemSelecionado, setPersonagemSelecionado] = useState(null);
  const [filtros, setFiltros] = useState({ grade: "", distancia: "", terreno: "" });

  // 🎯 Busca TODAS as corridas já registradas uma vez; os filtros e a
  // agregação rodam em cima disso, sem nova leitura no banco.
  useEffect(() => {
    getDocs(collection(db, "resultados_partidas"))
      .then((snapshot) => setCorridas(snapshot.docs.map((d) => d.data())))
      .catch((erro) => console.error("Erro ao carregar ranking de personagens:", erro))
      .finally(() => setCarregando(false));
  }, []);

  // Opções dos filtros a partir das corridas que existem.
  const opcoes = useMemo(() => {
    const unicos = (f) => [...new Set(corridas.map(f).filter(Boolean))].sort();
    return { grade: unicos((c) => c.grade), distancia: unicos((c) => tipoDistancia(c.distancia)), terreno: unicos((c) => c.terreno) };
  }, [corridas]);

  const filtrado = Boolean(filtros.grade || filtros.distancia || filtros.terreno);
  const listaPersonagens = useMemo(() => agregarPersonagens(corridas.filter((c) =>
    (!filtros.grade || c.grade === filtros.grade)
    && (!filtros.distancia || tipoDistancia(c.distancia) === filtros.distancia)
    && (!filtros.terreno || c.terreno === filtros.terreno))), [corridas, filtros]);

  function alternarOrdenacao(campo) {
    // Posição média: menor é melhor, então começa crescente.
    setOrdenacao((o) => (o.campo === campo ? { campo, crescente: !o.crescente } : { campo, crescente: campo === "posMedia" }));
  }

  // 🎯 Uma lista só, ordenada + filtrada pela busca — tanto o pódio
  // (3 primeiros) quanto a tabela vêm dela. Assim, ao clicar numa coluna
  // pra ordenar por outro critério (tipo "Corridas"), o pódio também
  // atualiza pra mostrar quem está no topo NAQUELE critério, em vez de
  // ficar sempre travado em "vitórias".
  const listaOrdenadaEFiltrada = useMemo(() => {
    let filtrada = listaPersonagens.filter((p) => p.nome.toLowerCase().includes(busca.toLowerCase().trim()));
    filtrada.sort((a, b) => {
      const valorA = a[ordenacao.campo];
      const valorB = b[ordenacao.campo];
      let resultado = 0;
      if (valorA < valorB) resultado = -1;
      if (valorA > valorB) resultado = 1;
      return ordenacao.crescente ? resultado : -resultado;
    });
    return filtrada;
  }, [listaPersonagens, busca, ordenacao]);

  const top3 = listaOrdenadaEFiltrada.slice(0, 3);
  const listaFiltrada = listaOrdenadaEFiltrada.slice(3);

  return (
    <>
    <main className="main-layout-wrapper">
      <div className="lottery-header">
        <h2 className="lottery-main-title">🏆 Ranking de Personagens</h2>
        <div className="lottery-title-divider"></div>
        <p className="lottery-subtitle">Desempenho geral de cada Uma Musume ao longo de todas as edições do torneio.</p>
      </div>

      {carregando ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#c5a059" }}>
          <i className="fa-solid fa-circle-notch fa-spin"></i> Carregando estatísticas...
        </div>
      ) : corridas.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#a4b3c6" }}>
          <div style={{ fontSize: "28pt", marginBottom: "15px" }}>🏆</div>
          Nenhum resultado de corrida registrado ainda.
        </div>
      ) : (
        <>
          {/* BUSCA + FILTROS */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", maxWidth: "1100px", margin: "0 auto 12px auto" }}>
            <input
              type="text"
              placeholder="Buscar cavalinha por nome..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              style={{ flex: "1 1 240px", maxWidth: "320px", backgroundColor: "#0b1320", color: "#f1ead4", border: "1px solid rgba(197,160,89,0.3)", borderRadius: "8px", padding: "11px 12px", fontFamily: "'Montserrat'", fontSize: "9.5pt" }}
            />
            {[["grade", "Todos os graus"], ["distancia", "Todas as distâncias"], ["terreno", "Todos os terrenos"]].map(([campo, rotulo]) => (
              <select key={campo} value={filtros[campo]} onChange={(e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }))} style={{ backgroundColor: "#0b1320", color: "#f1ead4", border: "1px solid rgba(197,160,89,0.3)", borderRadius: "8px", padding: "11px 12px", fontFamily: "'Montserrat'", fontSize: "9.5pt" }}>
                <option value="">{rotulo}</option>
                {opcoes[campo].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
          </div>
          <p style={{ textAlign: "center", color: "#5f758e", fontSize: "8.5pt", fontFamily: "'Montserrat'", margin: "0 0 40px 0" }}>
            Ordenado por <strong style={{ color: "#c5a059" }}>{NOMES_CAMPO[ordenacao.campo]}</strong> · clique nas colunas da tabela para mudar
          </p>

          {/* PÓDIO DOS 3 PRIMEIROS */}
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "flex-end", gap: "24px", maxWidth: "1100px", margin: "0 auto 50px auto" }}>
            {[top3[1], top3[0], top3[2]].map((p, indice) => {
              if (!p) return null;
              const posicao = indice === 0 ? 2 : indice === 1 ? 1 : 3;
              const ehPrimeiro = posicao === 1;
              const cor = CORES_PODIO[posicao];
              const urlImagem = obterUrlImagemPersonagem(p.nome);

              return (
                <div
                  key={p.nome}
                  onClick={() => setPersonagemSelecionado(p)}
                  title="Ver detalhes"
                  style={{
                    flex: ehPrimeiro ? "1 1 300px" : "1 1 240px",
                    maxWidth: ehPrimeiro ? "340px" : "270px",
                    background: "#0d1624",
                    border: `2px solid ${cor}`,
                    borderRadius: "16px",
                    padding: ehPrimeiro ? "30px 22px" : "22px 18px",
                    textAlign: "center",
                    boxShadow: ehPrimeiro ? `0 0 30px ${cor}55` : "0 8px 20px rgba(0,0,0,0.4)",
                    transform: ehPrimeiro ? "translateY(-10px)" : "none",
                    order: posicao === 1 ? 2 : posicao === 2 ? 1 : 3,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontFamily: "'Cinzel', serif", fontWeight: 900, fontSize: ehPrimeiro ? "24pt" : "18pt", color: cor, marginBottom: "10px" }}>
                    {posicao}
                  </div>

                  <div style={{ width: ehPrimeiro ? "120px" : "90px", height: ehPrimeiro ? "120px" : "90px", margin: "0 auto 15px auto", borderRadius: "50%", overflow: "hidden", border: `3px solid ${cor}`, background: "#0b1320" }}>
                    {urlImagem ? (
                      <img src={urlImagem} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20pt" }}>🐎</div>
                    )}
                  </div>

                  <h3 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: ehPrimeiro ? "15pt" : "12.5pt", margin: "0 0 4px 0" }}>{p.nome}</h3>

                  {ehPrimeiro && ordenacao.campo === "vitorias" && !filtrado && (
                    <div style={{ display: "inline-block", background: `${cor}22`, border: `1px solid ${cor}`, color: cor, fontSize: "8pt", fontWeight: 700, borderRadius: "50px", padding: "4px 14px", margin: "6px 0 4px 0", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                      👑 Campeã Geral
                    </div>
                  )}

                  <div style={{ marginTop: "14px", fontFamily: "'Montserrat'", fontVariantNumeric: "tabular-nums" }}>
                    <div style={{ fontSize: ehPrimeiro ? "30pt" : "24pt", fontWeight: 800, color: cor, lineHeight: 1 }}>{p[ordenacao.campo]}{["winRate", "pickRate"].includes(ordenacao.campo) ? "%" : ""}</div>
                    <div style={{ fontSize: "8pt", color: "#5f758e", textTransform: "uppercase", letterSpacing: "1px", marginTop: "6px" }}>{NOMES_CAMPO[ordenacao.campo]}</div>
                  </div>

                  <div style={{ marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(164, 179, 198, 0.1)", fontFamily: "'Montserrat'", fontSize: "9pt", color: "#a4b3c6", fontVariantNumeric: "tabular-nums" }}>
                    {[
                      ordenacao.campo !== "vitorias" && `${p.vitorias} vitórias`,
                      ordenacao.campo !== "corridas" && `${p.corridas} corridas`,
                      ordenacao.campo !== "podios" && `${p.podios} pódios`,
                      ordenacao.campo !== "winRate" && `${p.winRate}% WR`,
                      ordenacao.campo !== "posMedia" && `pos. média ${p.posMedia}`,
                    ].filter(Boolean).join(" · ")}
                  </div>
                </div>
              );
            })}
          </div>

          {/* TABELA DO RESTANTE DO RANKING */}
          {listaPersonagens.length > 3 && (
            <div style={{ width: "100%", maxWidth: "1100px", margin: "0 auto 60px auto" }}>
              {listaFiltrada.length === 0 ? (
                <p style={{ textAlign: "center", color: "#5f758e", fontStyle: "italic", fontFamily: "'Montserrat'", fontSize: "9.5pt" }}>
                  Nenhuma cavalinha encontrada com esse nome.
                </p>
              ) : (
              <div className="quadro-table-scroll" style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", boxShadow: "0 8px 25px rgba(0,0,0,0.5)", overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: "700px", borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={{ ...thStyle, textAlign: "left", cursor: "default" }}>Uma Musume</th>
                      <ThOrdenavel campo="corridas" texto="Corridas" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                      <ThOrdenavel campo="podios" texto="Pódios" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                      <ThOrdenavel campo="vitorias" texto="Vitórias" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                      <ThOrdenavel campo="winRate" texto="Win Rate (%)" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                      <ThOrdenavel campo="posMedia" texto="Pos. Média" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                      <ThOrdenavel campo="pickRate" texto="Pick Rate (%)" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                    </tr>
                  </thead>
                  <tbody>
                    {listaFiltrada.map((p, indice) => {
                      const urlImagem = obterUrlImagemPersonagem(p.nome);
                      return (
                        <tr key={p.nome} className="linha-clicavel" onClick={() => setPersonagemSelecionado(p)} title="Ver detalhes" style={{ borderBottom: "1px solid rgba(164, 179, 198, 0.1)", cursor: "pointer" }}>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#a4b3c6", fontFamily: "'Montserrat'", fontSize: "10pt" }}>{indice + 4}</td>
                          <td style={{ padding: "12px 10px", textAlign: "left" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div style={{ width: "32px", height: "32px", borderRadius: "50%", overflow: "hidden", border: "1px solid rgba(197,160,89,0.4)", flexShrink: 0, background: "#0b1320" }}>
                                {urlImagem && <img src={urlImagem} alt={p.nome} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                              </div>
                              <span style={{ color: "#f1ead4", fontWeight: 700, fontFamily: "'Montserrat'", fontSize: "10pt" }}>{p.nome}</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#a4b3c6", fontFamily: "'Montserrat'", fontSize: "10pt" }}>{p.corridas}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#a4b3c6", fontFamily: "'Montserrat'", fontSize: "10pt" }}>{p.podios}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#c5a059", fontWeight: 700, fontFamily: "'Montserrat'", fontSize: "10pt" }}>{p.vitorias}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: p.corridas < AMOSTRA_MINIMA ? "#5f758e" : "#f1ead4", fontWeight: 600, fontFamily: "'Montserrat'", fontSize: "10pt" }} title={p.corridas < AMOSTRA_MINIMA ? `Poucas corridas (menos de ${AMOSTRA_MINIMA}) para comparar` : undefined}>{p.winRate}%</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#a4b3c6", fontFamily: "'Montserrat'", fontSize: "10pt" }}>{p.posMedia.toLocaleString("pt-BR")}</td>
                          <td style={{ padding: "12px 10px", textAlign: "center", color: "#a4b3c6", fontFamily: "'Montserrat'", fontSize: "10pt" }}>{p.pickRate}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}
        </>
      )}
    </main>

    {/* MODAL DE DETALHES POR TREINADOR */}
    {personagemSelecionado && (
      <div
        style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(11, 19, 32, 0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(5px)", padding: "20px" }}
        onClick={(e) => { if (e.target === e.currentTarget) setPersonagemSelecionado(null); }}
      >
        <div style={{ width: "100%", maxWidth: "600px", maxHeight: "80vh", overflowY: "auto", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.4)", borderRadius: "12px", padding: "30px", boxShadow: "0 15px 40px rgba(0,0,0,0.6)", position: "relative" }}>
          <button
            onClick={() => setPersonagemSelecionado(null)}
            style={{ position: "absolute", top: "16px", right: "16px", background: "transparent", border: "none", color: "#a4b3c6", fontSize: "16pt", cursor: "pointer", lineHeight: 1 }}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "14px", borderBottom: "1px dashed rgba(197,160,89,0.2)", paddingBottom: "18px" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "50%", overflow: "hidden", background: "#0b1320", flexShrink: 0, border: "1px solid rgba(197,160,89,0.4)" }}>
              {obterUrlImagemPersonagem(personagemSelecionado.nome) && (
                <img
                  src={obterUrlImagemPersonagem(personagemSelecionado.nome)}
                  alt={personagemSelecionado.nome}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              )}
            </div>
            <div>
              <h3 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "15pt", margin: 0 }}>{personagemSelecionado.nome}</h3>
              <p style={{ color: "#a4b3c6", fontSize: "8.5pt", margin: "4px 0 0 0", fontFamily: "'Montserrat'" }}>
                Usada por {personagemSelecionado.detalhesPorTreinador.length} treinador(es) diferentes
              </p>
            </div>
          </div>

          {/* Mini stats de resumo global — já vêm prontas do próprio personagem selecionado */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "20px" }}>
            <span style={{ background: "rgba(197,160,89,0.08)", border: "1px solid rgba(197,160,89,0.2)", borderRadius: "50px", padding: "5px 14px", fontSize: "8.5pt", color: "#a4b3c6", fontFamily: "'Montserrat'" }}>
              🏁 <strong style={{ color: "#f1ead4" }}>{personagemSelecionado.corridas}</strong> corridas no total
            </span>
            <span style={{ background: "rgba(197,160,89,0.08)", border: "1px solid rgba(197,160,89,0.2)", borderRadius: "50px", padding: "5px 14px", fontSize: "8.5pt", color: "#a4b3c6", fontFamily: "'Montserrat'" }}>
              🏆 <strong style={{ color: "#c5a059" }}>{personagemSelecionado.vitorias}</strong> vitórias no total
            </span>
            <span style={{ background: "rgba(197,160,89,0.08)", border: "1px solid rgba(197,160,89,0.2)", borderRadius: "50px", padding: "5px 14px", fontSize: "8.5pt", color: "#a4b3c6", fontFamily: "'Montserrat'" }}>
              📊 Win Rate geral: <strong style={{ color: "#1bd39e" }}>{personagemSelecionado.winRate}%</strong>
            </span>
          </div>

          {personagemSelecionado.detalhesPorTreinador.length === 0 ? (
            <p style={{ textAlign: "center", color: "#5f758e", fontStyle: "italic", fontFamily: "'Montserrat'" }}>Nenhum treinador registrado pra essa cavalinha.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px", fontFamily: "'Montserrat'", fontSize: "8.5pt", color: "#c5a059", borderBottom: "1px solid rgba(197,160,89,0.2)" }}>Treinador</th>
                  <th style={{ textAlign: "center", padding: "8px", fontFamily: "'Montserrat'", fontSize: "8.5pt", color: "#c5a059", borderBottom: "1px solid rgba(197,160,89,0.2)" }}>Corridas</th>
                  <th style={{ textAlign: "center", padding: "8px", fontFamily: "'Montserrat'", fontSize: "8.5pt", color: "#c5a059", borderBottom: "1px solid rgba(197,160,89,0.2)" }}>Pódios</th>
                  <th style={{ textAlign: "center", padding: "8px", fontFamily: "'Montserrat'", fontSize: "8.5pt", color: "#c5a059", borderBottom: "1px solid rgba(197,160,89,0.2)" }}>Vitórias</th>
                  <th style={{ textAlign: "center", padding: "8px", fontFamily: "'Montserrat'", fontSize: "8.5pt", color: "#c5a059", borderBottom: "1px solid rgba(197,160,89,0.2)" }}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {personagemSelecionado.detalhesPorTreinador.map((t, indice) => {
                  const ehTop1 = indice === 0;
                  return (
                    <tr
                      key={t.treinador}
                      style={{
                        borderBottom: "1px solid rgba(164,179,198,0.08)",
                        background: ehTop1 ? "rgba(197, 160, 89, 0.08)" : "transparent",
                      }}
                    >
                      <td style={{ padding: "10px 8px", textAlign: "left", fontFamily: "'Montserrat'", fontSize: "9.5pt", color: "#f1ead4", fontWeight: 700 }}>
                        {ehTop1 && "👑 "}{t.treinador}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "'Montserrat'", fontSize: "9.5pt", color: "#a4b3c6" }}>{t.corridas}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "'Montserrat'", fontSize: "9.5pt", color: "#a4b3c6" }}>{t.podios}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "'Montserrat'", fontSize: "9.5pt", color: "#c5a059", fontWeight: 700 }}>{t.vitorias}</td>
                      <td style={{ padding: "10px 8px", textAlign: "center", fontFamily: "'Montserrat'", fontSize: "9.5pt", color: corWinRateTreinador(t.winRate), fontWeight: 700 }}>{t.winRate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Rodapé: última vitória registrada dessa cavalinha */}
          <div style={{ borderTop: "1px dashed rgba(197, 160, 89, 0.2)", marginTop: "22px", paddingTop: "16px", textAlign: "center" }}>
            {personagemSelecionado.ultimaVitoria ? (
              <p style={{ color: "#a4b3c6", fontSize: "8pt", fontFamily: "'Montserrat'", margin: 0, lineHeight: 1.6 }}>
                🏆 Última vitória:{" "}
                <strong style={{ color: "#c5a059" }}>
                  Edição {personagemSelecionado.ultimaVitoria.edicaoId.replace("edicao_", "") || "?"}
                </strong>
                {" "}na pista <strong style={{ color: "#f1ead4" }}>{personagemSelecionado.ultimaVitoria.pistaNome || "?"}</strong>
                {" "}com <strong style={{ color: "#f1ead4" }}>{personagemSelecionado.ultimaVitoria.treinador || "?"}</strong>
              </p>
            ) : (
              <p style={{ color: "#5f758e", fontSize: "8pt", fontFamily: "'Montserrat'", fontStyle: "italic", margin: 0 }}>
                🔍 Essa cavalinha ainda busca sua primeira vitória no torneio.
              </p>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default RankPersonagens;