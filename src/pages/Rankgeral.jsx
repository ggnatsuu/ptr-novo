import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot, doc, getDoc, query, where, getDocs } from "firebase/firestore";
import { db } from "../config/firebase";
import { obterUrlAvatarCloudinary } from "../utils/cloudinary";
import TituloTreinador from "../components/TituloTreinador";
import FotoTreinador from "../components/FotoTreinador";

// 🎯 Tabela de pontos por posição, idêntica à regra oficial do rankGeral.js
const PONTOS_POR_POSICAO = { 1: 12, 2: 10, 3: 9, 4: 8, 5: 7, 6: 6, 7: 5, 8: 4, 9: 3 };
const PONTOS_PARTICIPACAO = 300;

// 🎯 Sequência do botão de filtro cíclico. Clicar avança pro próximo índice,
// voltando pro início ao chegar no fim (Array cíclico).
const CATEGORIAS_CICLO = ["TOTAL", "G1", "G2", "G3"];

// 🎯 Tradução dos códigos de estratégia salvos no Firestore pro nome de exibição
const ESTRATEGIAS = { runner: "Front Runner", leader: "Pace Chaser", betweener: "Late Surger", chaser: "End Closer" };

// 🎯 CLOUDINARY: mesma conta usada no rankGeral.js original, pasta dos troféus
const CLOUDINARY_CLOUD_NAME = "k1qj4qrm";
function obterUrlTrofeuCloudinary(nomeTrofeu) {
  if (!nomeTrofeu || nomeTrofeu === "Bloqueado") return "";
  const nomeSanitizado = nomeTrofeu.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/${nomeSanitizado}.png`;
}

const numeroEdicao = (id) => Number(String(id ?? "").replace(/\D/g, "")) || 0;
const ordemPadrao = (a, b) => b.prestigio - a.prestigio || b.primeiros - a.primeiros || b.segundos - a.segundos;

// 🎯 Soma o ranking de uma lista de partidas (já filtrada pela modalidade).
// Devolve ordenado pela regra padrão, com "rank" (posição real) e as
// corridas de cada treinador (pra forma recente).
function somarRanking(partidas) {
  const mapa = {};
  partidas.forEach((partida) => {
    (partida.classificacao || []).forEach((linha) => {
      const nomeOriginal = linha.treinador;
      if (!nomeOriginal) return;

      // 🎯 Agrupa por nome normalizado (minúsculo/sem espaço nas pontas) —
      // um treinador que troca de nick (ex: "kirell" -> "Kirell") não pode
      // virar 2 linhas separadas no ranking com pontos divididos. O nome
      // exibido acompanha a grafia mais usada até agora.
      const chave = nomeOriginal.toLowerCase().trim();
      if (!mapa[chave]) {
        mapa[chave] = { chave, nome: nomeOriginal, uid: linha.treinadorUid || "", primeiros: 0, segundos: 0, terceiros: 0, totalCorridas: 0, pontosDePosicao: 0, corridas: [], contagemGrafias: {} };
      }
      const grupo = mapa[chave];
      grupo.contagemGrafias[nomeOriginal] = (grupo.contagemGrafias[nomeOriginal] || 0) + 1;
      if (grupo.contagemGrafias[nomeOriginal] > (grupo.contagemGrafias[grupo.nome] || 0)) grupo.nome = nomeOriginal;

      grupo.totalCorridas += 1;
      const pos = parseInt(linha.posicao);
      if (pos === 1) grupo.primeiros += 1;
      else if (pos === 2) grupo.segundos += 1;
      else if (pos === 3) grupo.terceiros += 1;
      if (PONTOS_POR_POSICAO[pos] !== undefined) grupo.pontosDePosicao += PONTOS_POR_POSICAO[pos];
      else if (pos >= 10 && pos <= 18) grupo.pontosDePosicao += 2;
      grupo.corridas.push({ ordem: partida._ordem, pos, pista: partida.pistaNome, edicao: numeroEdicao(partida.edicaoId) });
    });
  });

  // eslint-disable-next-line no-unused-vars -- "contagemGrafias" era só um contador auxiliar, descartado de propósito
  return Object.values(mapa).map(({ contagemGrafias, ...t }) => ({ ...t, prestigio: t.totalCorridas * PONTOS_PARTICIPACAO + t.pontosDePosicao }))
    .sort(ordemPadrao)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

// Cor da bolinha da forma recente.
function corDaForma(pos) {
  if (pos === 1) return { fundo: "#c5a059", texto: "#0b1320" };
  if (pos === 2) return { fundo: "#a4b3c6", texto: "#0b1320" };
  if (pos === 3) return { fundo: "#a8662c", texto: "#f1ead4" };
  return { fundo: "transparent", texto: pos <= 9 ? "#a4b3c6" : "#5f758e" };
}

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

// 🎯 Cabeçalho clicável reutilizável: mostra a seta neutra (fa-sort) quando
// essa coluna não está ativa, ou uma seta apontando pra cima/baixo quando
// está — dando um feedback visual que o original não tinha.
function ThOrdenavel({ campo, texto, ordenacao, aoClicar, alinhamento = "center" }) {
  const ativo = ordenacao.campo === campo;
  const icone = ativo ? (ordenacao.crescente ? "fa-sort-up" : "fa-sort-down") : "fa-sort";

  return (
    <th style={{ ...thStyle, textAlign: alinhamento }} onClick={() => aoClicar(campo)}>
      {texto}{" "}
      <i
        className={`fa-solid ${icone} sort-icon-hint`}
        style={ativo ? { opacity: 1, color: "#c5a059" } : undefined}
      ></i>
    </th>
  );
}

// 🎯 PARTE 4/4 (final): clicar no nome do treinador abre o modal do
// Trainer Card, com uma busca extra no Firestore (foto, troféus, status)
// e cálculos específicos daquele treinador (musume mais usada, hipódromo
// favorito, etc.)
function RankGeral() {
  const [partidas, setPartidas] = useState([]);
  const [categoriaIndex, setCategoriaIndex] = useState(0);

  const [modalAberto, setModalAberto] = useState(false);
  const [carregandoCard, setCarregandoCard] = useState(false);
  const [dadosCard, setDadosCard] = useState(null);

  // 🎯 Equivalente ao antigo window.abrirEGerarTrainerCard(nome, uid).
  // Busca dados extras do treinador (foto, status, troféus) no Firestore,
  // e calcula estatísticas específicas dele a partir de TODAS as partidas
  // (não só da categoria filtrada na tabela — mesmo comportamento do original).
  async function abrirTrainerCard(nomeTreinador, uidTreinador) {
    setModalAberto(true);
    setCarregandoCard(true);
    setDadosCard(null);

    let fotoPerfilRealDoBanco = "default_avatar.png";
    let statusReal = "Nenhum status definido por este treinador.";
    let estrategiaReal = "runner";
    let trofeusEquipados = ["Bloqueado", "Bloqueado", "Bloqueado", "Bloqueado"];
    let trainerId = "------";

    try {
      let docTreinador = null;

      // 1. Tenta buscar primeiro pelo UID, se ele existir
      if (uidTreinador) {
        const snap = await getDoc(doc(db, "treinadores", uidTreinador));
        if (snap.exists()) docTreinador = snap;
      }

      // 2. CONTINGÊNCIA: se não veio UID (corridas antigas), busca pelo nome exato
      if (!docTreinador && nomeTreinador) {
        const q = query(collection(db, "treinadores"), where("nomeTreinador", "==", nomeTreinador.trim()));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) docTreinador = querySnapshot.docs[0];
      }

      if (docTreinador && docTreinador.exists()) {
        const d = docTreinador.data();
        if (d.fotoPerfil) fotoPerfilRealDoBanco = d.fotoPerfil;
        if (d.status) statusReal = d.status;
        if (d.estrategia) estrategiaReal = d.estrategia;
        if (d.trofeusEquipados && Array.isArray(d.trofeusEquipados)) trofeusEquipados = d.trofeusEquipados;
        if (docTreinador.id) trainerId = docTreinador.id.slice(-6).toUpperCase();
      }
    } catch (err) {
      console.error("Erro ao ler dados complementares do treinador:", err);
    }

    // 🎯 Estatísticas específicas desse treinador, olhando TODAS as partidas
    let totaisGerais = { primeiros: 0, segundos: 0, terceiros: 0, total: 0, pontosColocacao: 0 };
    let contadorCavalos = {};
    let contadorHipodromosVitoria = {};

    partidas.forEach((partida) => {
      const inlineTr = (partida.classificacao || []).find(
        (c) => c.treinador && c.treinador.toLowerCase().trim() === nomeTreinador.toLowerCase().trim()
      );
      if (!inlineTr) return;

      totaisGerais.total++;
      const pos = parseInt(inlineTr.posicao);

      if (PONTOS_POR_POSICAO[pos] !== undefined) totaisGerais.pontosColocacao += PONTOS_POR_POSICAO[pos];
      else if (pos >= 10 && pos <= 18) totaisGerais.pontosColocacao += 2;

      if (pos === 1) {
        totaisGerais.primeiros++;
        if (partida.hipodromo) {
          const h = partida.hipodromo.trim();
          contadorHipodromosVitoria[h] = (contadorHipodromosVitoria[h] || 0) + 1;
        }
      }
      if (pos === 2) totaisGerais.segundos++;
      if (pos === 3) totaisGerais.terceiros++;
      if (inlineTr.personagem) contadorCavalos[inlineTr.personagem] = (contadorCavalos[inlineTr.personagem] || 0) + 1;
    });

    let cavaloMaisUsado = "Nenhum Registrado";
    let maiorUso = 0;
    Object.keys(contadorCavalos).forEach((c) => {
      if (contadorCavalos[c] > maiorUso) {
        maiorUso = contadorCavalos[c];
        cavaloMaisUsado = c;
      }
    });
    const arquivoMaisUsado =
      cavaloMaisUsado !== "Nenhum Registrado"
        ? cavaloMaisUsado.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/__+/g, "_").replace(/^_|_$/g, "") + ".png"
        : "default_avatar.png";

    let hipodromoFavorito = "Nenhum Registrado";
    let maxVitoriasHipodromo = 0;
    Object.keys(contadorHipodromosVitoria).forEach((h) => {
      if (contadorHipodromosVitoria[h] > maxVitoriasHipodromo) {
        maxVitoriasHipodromo = contadorHipodromosVitoria[h];
        hipodromoFavorito = h;
      }
    });

    const prestigioCalculado = totaisGerais.total * PONTOS_PARTICIPACAO + totaisGerais.pontosColocacao;

    setDadosCard({
      nomeTreinador,
      trainerId,
      fotoPerfilRealDoBanco,
      statusReal,
      estrategiaReal,
      trofeusEquipados,
      hipodromoFavorito,
      prestigioCalculado,
      totaisGerais,
      cavaloMaisUsado,
      maiorUso,
      arquivoMaisUsado,
    });
    setCarregandoCard(false);
  }

  // 🎯 campo = qual coluna está ordenando agora (null = usa a ordem padrão
  // por prestígio). crescente = a direção atual daquela coluna.
  const [ordenacao, setOrdenacao] = useState({ campo: null, crescente: false });

  function alternarOrdenacao(campo) {
    setOrdenacao((atual) => ({
      campo,
      // Se já estava ordenando por essa mesma coluna, inverte a direção.
      // Se é uma coluna nova, começa decrescente (igual o comportamento antigo).
      crescente: atual.campo === campo ? !atual.crescente : false,
    }));
  }

  // 🎯 Dois estados pra busca: "buscaInput" atualiza a cada tecla (deixa o
  // campo responsivo), e "termoBusca" só atualiza 150ms depois que a pessoa
  // parar de digitar (debounce) — evita recalcular a tabela a cada letra.
  const [buscaInput, setBuscaInput] = useState("");
  const [termoBusca, setTermoBusca] = useState("");

  useEffect(() => {
    const temporizador = setTimeout(() => {
      setTermoBusca(buscaInput.toLowerCase().trim());
    }, 150);
    return () => clearTimeout(temporizador);
  }, [buscaInput]);

  // 🎯 Equivalente ao antigo firestoreDb.collection("resultados_partidas").onSnapshot(...)
  useEffect(() => {
    const pararDeObservar = onSnapshot(
      collection(db, "resultados_partidas"),
      (snapshot) => {
        const lista = [];
        snapshot.forEach((doc) => lista.push(doc.data()));
        setPartidas(lista);
      },
      (erro) => {
        console.error("Erro ao puxar classificações:", erro);
      }
    );

    return () => pararDeObservar();
  }, []);

  // 🎯 Ordem das pistas sorteadas de cada edição (pra saber qual corrida
  // veio por último dentro de uma edição, na forma recente).
  const [ordemPistas, setOrdemPistas] = useState({});
  useEffect(() => {
    getDocs(collection(db, "pistas_sorteadas"))
      .then((snap) => setOrdemPistas(Object.fromEntries(snap.docs.map((d) => [d.id, (d.data().pistas ?? []).map((x) => x.nome)]))))
      .catch((erro) => console.error("Erro ao ler a ordem das pistas:", erro));
  }, []);

  // 🎯 Ranking da modalidade + comparação com o ranking antes da última
  // edição (variação de posição) + forma recente (últimas 5 corridas).
  const ranking = useMemo(() => {
    const modoAtivo = CATEGORIAS_CICLO[categoriaIndex];
    const daModalidade = partidas
      .filter((p) => modoAtivo === "TOTAL" || p.grade === modoAtivo)
      .map((p) => ({ ...p, _ordem: numeroEdicao(p.edicaoId) * 100 + ((ordemPistas[p.edicaoId] ?? []).indexOf(p.pistaNome) + 1) }));
    const ultima = Math.max(0, ...daModalidade.map((p) => numeroEdicao(p.edicaoId)));
    const atual = somarRanking(daModalidade);
    const anterior = new Map(somarRanking(daModalidade.filter((p) => numeroEdicao(p.edicaoId) !== ultima)).map((t) => [t.chave, t.rank]));
    const lider = atual[0]?.prestigio ?? 0;
    return atual.map((t) => ({
      ...t,
      variacao: anterior.size === 0 ? null : anterior.has(t.chave) ? anterior.get(t.chave) - t.rank : "novo",
      forma: [...t.corridas].sort((a, b) => a.ordem - b.ordem).slice(-5),
      atrasLider: lider - t.prestigio,
    }));
  }, [partidas, categoriaIndex, ordemPistas]);

  // 🎯 Busca e ordenação por coluna em cima do ranking já calculado.
  const treinadores = useMemo(() => {
    const listaFiltrada = termoBusca === "" ? [...ranking] : ranking.filter((t) => t.nome.toLowerCase().includes(termoBusca));
    if (ordenacao.campo) {
      const campoAlvo = ordenacao.campo === "posicao" ? "prestigio" : ordenacao.campo;
      const crescente = ordenacao.crescente;
      listaFiltrada.sort((a, b) => {
        if (typeof a[campoAlvo] === "string") {
          return crescente ? a[campoAlvo].localeCompare(b[campoAlvo]) : b[campoAlvo].localeCompare(a[campoAlvo]);
        }
        return crescente ? a[campoAlvo] - b[campoAlvo] : b[campoAlvo] - a[campoAlvo];
      });
    }
    return listaFiltrada;
  }, [ranking, termoBusca, ordenacao]);

  return (
    <>
    <main
      className="main-layout-wrapper"
      style={{ marginTop: "130px", padding: "0 24px", minHeight: "calc(100vh - 350px)" }}
    >
      <div className="lottery-header">
        <h2 className="lottery-main-title">Placar de Líderes PTR</h2>
        <div className="lottery-title-divider"></div>
        <p className="lottery-subtitle">
          Acompanhe a pontuação consolidada de todos os treinadores e os cavalos mais vitoriosos da temporada.
        </p>
      </div>

      {/* Barra de Ações: Busca + Filtro de Categoria Cíclico */}
      <div style={{ width: "100%", maxWidth: "1000px", margin: "0 auto 20px auto", display: "flex", gap: "15px", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flexGrow: 1, maxWidth: "400px" }}>
          <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "15px", top: "50%", transform: "translateY(-50%)", color: "#5f758e" }}></i>
          <input
            type="text"
            placeholder="Buscar treinador por nome..."
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            style={{
              width: "100%",
              background: "#0b1320",
              border: "1px solid rgba(197, 160, 89, 0.3)",
              borderRadius: "50px",
              padding: "12px 15px 12px 45px",
              color: "#ffffff",
              fontFamily: "'Montserrat', sans-serif",
              fontSize: "10pt",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick={() => setCategoriaIndex((i) => (i + 1) % CATEGORIAS_CICLO.length)}
          className="ptr-btn-confirm"
          style={{ marginTop: 0, width: "auto", padding: "12px 25px", fontSize: "9.5pt", display: "flex", alignItems: "center", gap: "10px", minWidth: "180px", justifyContent: "center" }}
        >
          <i className="fa-solid fa-filter"></i> MODO: {CATEGORIAS_CICLO[categoriaIndex]}
        </button>
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "1000px",
          margin: "0 auto 50px auto",
          background: "#0d1624",
          border: "1px solid rgba(197, 160, 89, 0.2)",
          borderRadius: "8px",
          boxShadow: "0 8px 25px rgba(0,0,0,0.5)",
          overflow: "hidden",
        }}
      >
        <div className="ptr-table-responsive" style={{ width: "100%" }}>
          <table id="tabelaRankGeral" style={{ width: "100%", borderCollapse: "collapse", margin: 0, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr style={{ background: "rgba(11, 19, 32, 0.8)", borderBottom: "2px solid rgba(197, 160, 89, 0.3)" }}>
                <ThOrdenavel campo="posicao" texto="Posição" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                <ThOrdenavel campo="nome" texto="Treinador" ordenacao={ordenacao} aoClicar={alternarOrdenacao} alinhamento="left" />
                <ThOrdenavel campo="prestigio" texto="Prestígio Total" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                <th style={{ ...thStyle, cursor: "default" }} title="A mais recente à direita">Últimas 5</th>
                <ThOrdenavel campo="primeiros" texto="1º Lugar" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                <ThOrdenavel campo="segundos" texto="2º Lugar" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                <ThOrdenavel campo="terceiros" texto="3º Lugar" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
                <ThOrdenavel campo="totalCorridas" texto="Corridas" ordenacao={ordenacao} aoClicar={alternarOrdenacao} />
              </tr>
            </thead>
            <tbody>
              {treinadores.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", color: "#5f758e", padding: "40px", fontStyle: "italic" }}>
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                treinadores.map((t) => {
                  const corPodio = { 1: "#c5a059", 2: "#a4b3c6", 3: "#cd7f32" }[t.rank];
                  const celula = { textAlign: "center", padding: "8px 10px", height: "64px", boxSizing: "border-box", fontFamily: "'Montserrat'" };

                  return (
                    <tr key={t.chave} style={{ borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
                      <td style={{ ...celula, boxShadow: corPodio ? `inset 3px 0 0 ${corPodio}` : undefined, whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: "11.5pt", fontWeight: corPodio ? 800 : 600, color: corPodio ?? "#f1ead4" }}>
                          {t.rank === 1 ? "👑 1" : t.rank}
                        </span>
                        {t.variacao !== null && t.variacao !== 0 && (
                          <span style={{ display: "inline-block", width: 0, overflow: "visible", verticalAlign: "middle" }} title="Em relação à edição anterior">
                            <span style={{ marginLeft: "6px", fontSize: "7.5pt", fontWeight: 700, color: t.variacao === "novo" ? "#4f9bd9" : t.variacao > 0 ? "#1bd39e" : "#e04b37" }}>
                              {t.variacao === "novo" ? "NOVO" : t.variacao > 0 ? `▲${t.variacao}` : `▼${-t.variacao}`}
                            </span>
                          </span>
                        )}
                      </td>
                      <td
                        onClick={() => abrirTrainerCard(t.nome, t.uid)}
                        style={{ ...celula, textAlign: "left", padding: "8px 15px", fontWeight: 700, color: "#ffffff", cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <FotoTreinador nome={t.nome} corBorda={corPodio} />
                          <div style={{ minWidth: 0 }}>
                            {t.nome}
                            <TituloTreinador nome={t.nome} estilo={{ marginTop: "2px" }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ ...celula, whiteSpace: "nowrap" }} title={t.atrasLider > 0 ? `${t.atrasLider.toLocaleString("pt-BR")} pts atrás do líder` : "Líder"}>
                        <span style={{ color: "#c5a059", fontWeight: 800, fontSize: "11.5pt" }}>{t.prestigio.toLocaleString("pt-BR")}</span>
                        <span style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 600, opacity: 0.6 }}> pts</span>
                      </td>
                      <td style={celula}>
                        <div style={{ display: "inline-flex", gap: "3px" }}>
                          {t.forma.map((c, i) => {
                            const cor = corDaForma(c.pos);
                            return (
                              <span key={i} title={`Ed. ${c.edicao} · ${c.pista ?? ""}: ${c.pos}º`} style={{ width: "20px", height: "20px", borderRadius: "50%", background: cor.fundo, color: cor.texto, fontSize: "8pt", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                {c.pos}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ ...celula, fontWeight: 600, color: "#f1ead4" }}>{t.primeiros}</td>
                      <td style={{ ...celula, fontWeight: 600, color: "#f1ead4" }}>{t.segundos}</td>
                      <td style={{ ...celula, fontWeight: 600, color: "#f1ead4" }}>{t.terceiros}</td>
                      <td style={{ ...celula, fontWeight: 600, color: "#a4b3c6" }}>{t.totalCorridas}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>

    {/* Modal do Trainer Card */}
    {modalAberto && (
      <div
        className="ptr-logout-overlay active"
        style={{ position: "fixed", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}
        onClick={() => setModalAberto(false)}
      >
        <div className="ptr-profile-box" style={{ animation: "fadeIn 0.25s ease-out" }} onClick={(e) => e.stopPropagation()}>
          <button className="ptr-modal-close-corner" onClick={() => setModalAberto(false)}>
            <i className="fa-solid fa-xmark"></i>
          </button>
          <div className="ptr-profile-header">
            <h4>PTR / JRA OFFICIAL LICENSE</h4>
            <div className="license-tag">[ EXPEDIDA EM TEMPO REAL ]</div>
          </div>

          <div id="conteudoTrainerCardInjetado">
            {carregandoCard || !dadosCard ? (
              <div style={{ color: "#c5a059", fontFamily: "'Montserrat'", fontStyle: "italic", padding: "40px", textAlign: "center" }}>
                <i className="fa-solid fa-circle-notch fa-spin"></i> Acessando registros da JRA...
              </div>
            ) : (
              <div className="ptr-profile-horizontal-layout" style={{ display: "flex", gap: "25px", alignItems: "stretch", fontFamily: "'Montserrat', sans-serif", boxSizing: "border-box", width: "100%" }}>
                {/* COLUNA ESQUERDA: Identidade + Stats */}
                <div style={{ flex: 1.3, display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                  <div className="ptr-profile-identity" style={{ display: "flex", alignItems: "center", gap: "25px", marginBottom: "10px" }}>
                    <div className="ptr-profile-avatar-wrapper" style={{ width: "140px", height: "140px", borderRadius: "12px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0, backgroundColor: "#0e1726", cursor: "default" }}>
                      <img
                        src={obterUrlAvatarCloudinary(dadosCard.fotoPerfilRealDoBanco)}
                        alt={dadosCard.nomeTreinador}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => { e.currentTarget.src = "https://placehold.co/140x140/0e1726/c5a059?text=🐎"; }}
                      />
                    </div>
                    <div className="ptr-profile-meta" style={{ flex: 1, minWidth: 0, lineHeight: 1.4, fontFamily: "'Montserrat', sans-serif" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px" }}>
                        <h2 className="trainer-name" style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "clamp(13pt, 2.2vw, 19pt)", fontWeight: 800, margin: 0, letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {dadosCard.nomeTreinador}
                        </h2>
                        <span style={{ fontSize: "8.5pt", fontWeight: 700, color: "rgba(197, 160, 89, 0.65)", letterSpacing: "0.5px", flexShrink: 0 }}>
                          ID: #{dadosCard.trainerId}
                        </span>
                      </div>
                      <TituloTreinador nome={dadosCard.nomeTreinador} tamanho="10pt" estilo={{ marginBottom: "4px" }} />
                      <div style={{ fontSize: "10.5pt", color: "#a4b3c6", margin: "4px 0", fontWeight: 600 }}>
                        HIPÓDROMO FAVORITO: <span style={{ color: "#c5a059", fontWeight: 700 }}>{dadosCard.hipodromoFavorito}</span>
                      </div>
                      <div style={{ fontSize: "10.5pt", color: "#a4b3c6", margin: "4px 0", fontWeight: 600 }}>
                        ESTRATEGIA: <span style={{ color: "#c5a059", fontWeight: 700 }}>{ESTRATEGIAS[dadosCard.estrategiaReal] || "Front Runner"}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ background: "rgba(14, 23, 38, 0.4)", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "12px", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box", width: "100%", marginTop: "auto" }}>
                    <div style={{ textAlign: "center", borderRight: "1px solid rgba(164, 179, 198, 0.15)", paddingRight: "20px", flexShrink: 0 }}>
                      <span style={{ fontSize: "7.5pt", fontWeight: 700, color: "rgba(164, 179, 198, 0.4)", letterSpacing: "0.5px", textTransform: "uppercase", display: "block", marginBottom: "2px" }}>Prestígio</span>
                      <span style={{ fontSize: "14pt", fontWeight: 800, color: "#c5a059", letterSpacing: "0.3px" }}>
                        {dadosCard.prestigioCalculado.toLocaleString("pt-BR")}{" "}
                        <span style={{ fontSize: "9pt", fontWeight: 700, color: "rgba(197, 160, 89, 0.7)" }}>PTS</span>
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "14px", borderRight: "1px solid rgba(164, 179, 198, 0.15)", paddingRight: "20px", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <div style={{ textAlign: "center" }}>
                        <span style={{ width: "18px", height: "18px", background: "#c5a059", color: "#0b1320", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: 800, marginBottom: "2px" }}>1</span>
                        <span style={{ fontSize: "7.5pt", color: "rgba(164, 179, 198, 0.4)", fontWeight: 700, display: "block" }}>1º</span>
                        <div style={{ fontSize: "12pt", fontWeight: 800, color: "#f1ead4", marginTop: "1px" }}>{dadosCard.totaisGerais.primeiros}</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <span style={{ width: "18px", height: "18px", background: "#a4b3c6", color: "#0b1320", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: 800, marginBottom: "2px" }}>2</span>
                        <span style={{ fontSize: "7.5pt", color: "rgba(164, 179, 198, 0.4)", fontWeight: 700, display: "block" }}>2º</span>
                        <div style={{ fontSize: "12pt", fontWeight: 800, color: "#f1ead4", marginTop: "1px" }}>{dadosCard.totaisGerais.segundos}</div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <span style={{ width: "18px", height: "18px", background: "#cd7f32", color: "#0b1320", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: 800, marginBottom: "2px" }}>3</span>
                        <span style={{ fontSize: "7.5pt", color: "rgba(164, 179, 198, 0.4)", fontWeight: 700, display: "block" }}>3º</span>
                        <div style={{ fontSize: "12pt", fontWeight: 800, color: "#f1ead4", marginTop: "1px" }}>{dadosCard.totaisGerais.terceiros}</div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "8px", border: "1.5px solid rgba(197, 160, 89, 0.4)", overflow: "hidden", backgroundColor: "#0e1726", flexShrink: 0 }}>
                        <img
                          src={obterUrlAvatarCloudinary(dadosCard.arquivoMaisUsado)}
                          alt={dadosCard.cavaloMaisUsado}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => { e.currentTarget.src = "https://placehold.co/38x38/0e1726/c5a059?text=🐎"; }}
                        />
                      </div>
                      <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
                        <div style={{ fontSize: "7.5pt", fontWeight: 700, color: "rgba(164, 179, 198, 0.4)", letterSpacing: "0.5px" }}>MUSUME MAIS USADA</div>
                        <div style={{ fontSize: "10.5pt", fontWeight: 700, color: "#c5a059", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: "1px 0" }}>{dadosCard.cavaloMaisUsado}</div>
                        <div style={{ fontSize: "7.5pt", color: "#a4b3c6" }}>{dadosCard.maiorUso}x utilizada</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* COLUNA DIREITA: Troféu de Destaque */}
                <div className="ptr-profile-showcase-panel" style={{ width: "260px", background: "rgba(14, 23, 38, 0.4)", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "12px", padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", boxSizing: "border-box", flexShrink: 0, cursor: "default", height: "auto" }}>
                  {(() => {
                    const principalTrofeu = dadosCard.trofeusEquipados.find((t) => t && t !== "Bloqueado") || "Bloqueado";
                    const estaTrancado = principalTrofeu === "Bloqueado";
                    return (
                      <>
                        <div style={{ width: "100%", maxWidth: "110px", aspectRatio: "1/1", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", marginBottom: "25px", opacity: estaTrancado ? 0.25 : 1 }}>
                          {estaTrancado ? (
                            <i className="fa-solid fa-lock" style={{ fontSize: "24pt", color: "rgba(164,179,198,0.3)" }}></i>
                          ) : (
                            <img
                              src={obterUrlTrofeuCloudinary(principalTrofeu)}
                              alt={principalTrofeu}
                              style={{ maxHeight: "115px", width: "auto", objectFit: "contain" }}
                              onError={(e) => { e.currentTarget.src = "https://placehold.co/140x140/0e1726/c5a059?text=%F0%9F%8F%86"; }}
                            />
                          )}
                        </div>
                        <span style={{ fontFamily: "'Cinzel', serif", fontSize: "8pt", fontWeight: 700, color: "#c5a059", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px" }}>Troféu de Destaque</span>
                        <h4 style={{ margin: "0 0 20px 0", fontSize: "13pt", fontWeight: 800, color: "#ffffff", lineHeight: 1.3, fontFamily: "'Montserrat'", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                          {estaTrancado ? "NENHUM EQUIPADO" : principalTrofeu}
                        </h4>
                        <span style={{ fontSize: "8pt", fontWeight: 800, color: "#a4b3c6", background: "rgba(11, 19, 32, 0.6)", padding: "5px 16px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid rgba(164, 179, 198, 0.08)" }}>
                          {estaTrancado ? "---" : "G1"}
                        </span>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default RankGeral;