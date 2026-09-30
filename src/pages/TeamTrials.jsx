import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { listaAvatares } from "../data/avatares";
import { obterUrlAvatarCloudinary, obterUrlImagemPersonagem } from "../utils/cloudinary";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus, faBolt, faBroom, faFileExport, faFileImport, faTrash,
  faSort, faSortUp, faSortDown, faArrowTrendUp, faArrowTrendDown, faMinus,
  faCircleNotch, faFloppyDisk, faCheck,
} from "@fortawesome/free-solid-svg-icons";

// ============================================================================
// CONSTANTES E HELPERS PUROS (fora do componente — não dependem de estado)
// ============================================================================

const CATEGORIAS = ["Sprint", "Mile", "Medium", "Long", "Dirt"];

// 🎯 Paleta por categoria, conforme pedido: Sprint rosa, Mile amarelo,
// Medium verde, Long azul, Dirt marrom. Usada nos chips de filtro, badges
// da tabela e nos cards de pódio da Aba 2.
const CATEGORIA_INFO = {
  Sprint: { cor: "#ff6fa5", bg: "rgba(255,111,165,0.12)", borda: "rgba(255,111,165,0.35)" },
  Mile: { cor: "#e8c547", bg: "rgba(232,197,71,0.12)", borda: "rgba(232,197,71,0.35)" },
  Medium: { cor: "#4dd68c", bg: "rgba(77,214,140,0.12)", borda: "rgba(77,214,140,0.35)" },
  Long: { cor: "#5b9dff", bg: "rgba(91,157,255,0.12)", borda: "rgba(91,157,255,0.35)" },
  Dirt: { cor: "#b3763f", bg: "rgba(179,118,63,0.16)", borda: "rgba(179,118,63,0.4)" },
};

const ESTRATEGIAS = ["", "Runner", "Leader", "Betweener", "Chaser"];

const ROUND_LABELS = ["R1", "R2", "R3", "R4", "R5"];

function gerarId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// 🎯 Cria um "slot" vazio pronto pra ser preenchido depois — usado tanto
// no botão "+ Nova Corredora" quanto no "Preencher Grade Padrão".
function criarPersonagemVazio(categoria, numeroNaCategoria) {
  return {
    id: gerarId(),
    name: numeroNaCategoria ? `${categoria} #${numeroNaCategoria}` : "",
    category: categoria,
    strategy: "",
    build: "",
    rounds: [0, 0, 0, 0, 0],
    // 🎯 createdAt garante um desempate estável (ordem de inserção) no
    // ranking quando total E média empatam. Soma um decimal aleatório
    // pra nunca empatar entre si mesmo se forem criados no mesmo milissegundo.
    createdAt: Date.now() + Math.random(),
  };
}

// 🎯 Regra de status por faixa de posição geral (Rank), conforme pedido.
function obterStatus(rankGeral) {
  if (rankGeral <= 3) return { emoji: "👑", label: "MVP / Top Performer", classe: "tt-status-mvp" };
  if (rankGeral <= 8) return { emoji: "✅", label: "Consistente", classe: "tt-status-consistente" };
  if (rankGeral <= 12) return { emoji: "⚠️", label: "Oscilando", classe: "tt-status-oscilando" };
  return { emoji: "🚫", label: "Candidata a Troca", classe: "tt-status-troca" };
}

// 🎯 Critério de desempate em cascata: total desc → média desc → ordem de
// inserção asc. Usado tanto no ranking geral quanto no ranking por categoria.
function compararDesempenho(a, b) {
  if (b.total !== a.total) return b.total - a.total;
  if (b.average !== a.average) return b.average - a.average;
  return a.createdAt - b.createdAt;
}

function formatarNumero(valor, casas = 1) {
  if (!Number.isFinite(valor)) return "0";
  return valor.toFixed(casas).replace(/\.0$/, "");
}

// 🎯 Campo de busca com menu suspenso mostrando a miniatura de cada
// cavalinha, puxando direto do catálogo de 142 avatares (data/avatares.js)
// já usado no Trainer Card. Continua aceitando texto livre (caso a pessoa
// queira registrar um nome que não esteja no catálogo), mas prioriza a
// seleção visual. Reaproveitado tanto no formulário de "Nova Corredora"
// quanto na edição do nome direto na tabela.
function SeletorCorredora({ valor, onSelecionar, compacto = false }) {
  const [busca, setBusca] = useState(valor || "");
  const [aberto, setAberto] = useState(false);

  // 🎯 Mantém o campo sincronizado se o valor mudar por fora (ex: outra
  // aba do navegador atualizando o mesmo personagem).
  useEffect(() => { setBusca(valor || ""); }, [valor]);

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = termo.length === 0
      ? listaAvatares
      : listaAvatares.filter((a) => a.nome.toLowerCase().includes(termo));
    return lista.slice(0, 8);
  }, [busca]);

  const urlAvatarAtual = obterUrlImagemPersonagem(valor);

  return (
    <div className={`tt-selector-wrap${compacto ? " tt-selector-compacto" : ""}`}>
      <div className="tt-selector-input-linha">
        {urlAvatarAtual && (
          <img
            src={urlAvatarAtual}
            alt=""
            className="tt-selector-avatar-atual"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}
        <input
          type="text"
          className={compacto ? "tt-input-inline" : ""}
          placeholder="Buscar cavalinha..."
          value={busca}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onChange={(e) => {
            setBusca(e.target.value);
            onSelecionar(e.target.value);
            setAberto(true);
          }}
        />
      </div>

      {aberto && resultados.length > 0 && (
        <div className="tt-selector-dropdown">
          {resultados.map((a) => (
            <div
              key={a.nome}
              className="tt-selector-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setBusca(a.nome);
                onSelecionar(a.nome);
                setAberto(false);
              }}
            >
              <img
                src={obterUrlAvatarCloudinary(a.arquivo)}
                alt=""
                className="tt-selector-avatar-opcao"
                onError={(e) => { e.target.style.visibility = "hidden"; }}
              />
              <span>{a.nome}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

function TeamTrials() {
  const navigate = useNavigate();

  // -------------------------------------------------------------------------
  // ACESSO: precisa estar logado (não precisa ser admin — é individual de
  // cada treinador). "verificando" | "negado-login" | "liberado".
  // -------------------------------------------------------------------------
  const [statusAcesso, setStatusAcesso] = useState("verificando");
  const [uid, setUid] = useState(null);
  const [nomeTreinador, setNomeTreinador] = useState("Treinador");

  useEffect(() => {
    const pararDeObservar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        setStatusAcesso("negado-login");
        return;
      }
      setUid(usuario.uid);
      try {
        const docSnap = await getDoc(doc(db, "treinadores", usuario.uid));
        if (docSnap.exists()) setNomeTreinador(docSnap.data().usuarioID || "Treinador");
      } catch (erro) {
        console.error(erro);
      }
      setStatusAcesso("liberado");
    });
    return () => pararDeObservar();
  }, []);

  // -------------------------------------------------------------------------
  // DADOS: personagens + histórico de re-treinos, salvos em
  // team_trials/{uid} no Firestore — individual por conta, acessível de
  // qualquer dispositivo (diferente de localStorage puro).
  // -------------------------------------------------------------------------
  const [personagens, setPersonagens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [statusSalvamento, setStatusSalvamento] = useState(""); // "" | "salvando" | "salvo" | "erro"
  const dadosCarregadosRef = useRef(false);

  useEffect(() => {
    if (!uid) return;
    async function carregarDados() {
      try {
        const snap = await getDoc(doc(db, "team_trials", uid));
        if (snap.exists()) {
          const dados = snap.data();
          setPersonagens(Array.isArray(dados.characters) ? dados.characters : []);
        }
      } catch (erro) {
        console.error("Erro ao carregar Team Trials:", erro);
      } finally {
        setCarregando(false);
        // 🎯 Só libera o salvamento automático DEPOIS do carregamento
        // terminar — sem isso, o efeito de salvar abaixo dispararia com o
        // estado inicial vazio e sobrescreveria os dados reais no Firestore.
        setTimeout(() => { dadosCarregadosRef.current = true; }, 0);
      }
    }
    carregarDados();
  }, [uid]);

  // 🎯 Salvamento automático com debounce de 900ms — junta várias teclas
  // digitadas seguidas numa única escrita no Firestore, em vez de gravar a
  // cada caractere.
  useEffect(() => {
    if (!uid || !dadosCarregadosRef.current) return;
    setStatusSalvamento("salvando");
    const temporizador = setTimeout(async () => {
      try {
        await setDoc(
          doc(db, "team_trials", uid),
          { characters: personagens, updatedAt: Date.now() },
          { merge: true }
        );
        setStatusSalvamento("salvo");
      } catch (erro) {
        console.error("Erro ao salvar Team Trials:", erro);
        setStatusSalvamento("erro");
      }
    }, 900);
    return () => clearTimeout(temporizador);
  }, [personagens, uid]);

  // -------------------------------------------------------------------------
  // CÁLCULOS DERIVADOS (reativos, nunca guardados no Firestore — sempre
  // recalculados a partir de "personagens" pra nunca ficarem desatualizados)
  // -------------------------------------------------------------------------
  const personagensComputados = useMemo(() => {
    const comTotais = personagens.map((p) => {
      const preenchidos = (p.rounds || [0, 0, 0, 0, 0]).filter((r) => r > 0);
      const total = preenchidos.reduce((soma, r) => soma + r, 0);
      const completedRounds = preenchidos.length;
      const average = completedRounds > 0 ? total / completedRounds : 0;
      return { ...p, total, completedRounds, average };
    });

    const rankGeralPorId = {};
    [...comTotais].sort(compararDesempenho).forEach((p, i) => { rankGeralPorId[p.id] = i + 1; });

    const rankCategoriaPorId = {};
    CATEGORIAS.forEach((cat) => {
      [...comTotais.filter((p) => p.category === cat)]
        .sort(compararDesempenho)
        .forEach((p, i) => { rankCategoriaPorId[p.id] = i + 1; });
    });

    return comTotais.map((p) => ({
      ...p,
      overallRank: rankGeralPorId[p.id],
      categoryRank: rankCategoriaPorId[p.id],
      status: obterStatus(rankGeralPorId[p.id]),
    }));
  }, [personagens]);

  const totalGeralEquipe = useMemo(
    () => personagensComputados.reduce((soma, p) => soma + p.total, 0),
    [personagensComputados]
  );

  // -------------------------------------------------------------------------
  // AÇÕES sobre personagens
  // -------------------------------------------------------------------------
  function atualizarCampo(id, campo, valor) {
    setPersonagens((atual) => atual.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  function atualizarRound(id, indice, valorTexto) {
    const valor = valorTexto === "" ? 0 : Math.max(0, parseInt(valorTexto, 10) || 0);
    setPersonagens((atual) =>
      atual.map((p) => {
        if (p.id !== id) return p;
        const novasRounds = [...p.rounds];
        novasRounds[indice] = valor;
        return { ...p, rounds: novasRounds };
      })
    );
  }

  function removerPersonagem(id, nome) {
    if (!window.confirm(`Remover "${nome || "esta corredora"}" da equipe? Essa ação não pode ser desfeita.`)) return;
    setPersonagens((atual) => atual.filter((p) => p.id !== id));
  }

  function preencherGradePadrao() {
    if (personagens.length > 0) {
      const confirmado = window.confirm(
        "Isso vai SUBSTITUIR toda a equipe atual por 15 slots vazios (3 por categoria). Deseja continuar?"
      );
      if (!confirmado) return;
    }
    const nova = [];
    CATEGORIAS.forEach((cat) => {
      for (let i = 1; i <= 3; i++) nova.push(criarPersonagemVazio(cat, i));
    });
    setPersonagens(nova);
  }

  function limparPontuacoes() {
    if (personagens.length === 0) return;
    if (!window.confirm("Isso vai zerar R1–R5 de TODAS as corredoras, mantendo nomes/builds. Continuar?")) return;
    setPersonagens((atual) => atual.map((p) => ({ ...p, rounds: [0, 0, 0, 0, 0] })));
  }

  // -------------------------------------------------------------------------
  // EXPORTAR / IMPORTAR JSON (pra mandar o time pronto pra outra pessoa)
  // -------------------------------------------------------------------------
  const inputImportarRef = useRef(null);

  function exportarJSON() {
    const payload = {
      formato: "ptr_team_trials_v1",
      exportadoEm: new Date().toISOString(),
      characters: personagens,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-trials-${nomeTreinador || "ptr"}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function acionarImportarJSON() {
    inputImportarRef.current?.click();
  }

  function lidarComArquivoImportado(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = () => {
      try {
        const dados = JSON.parse(leitor.result);
        const novosPersonagens = Array.isArray(dados.characters) ? dados.characters : [];

        if (novosPersonagens.length === 0) {
          alert("⚠️ Esse arquivo não parece ter nenhuma corredora (campo 'characters' vazio ou ausente).");
          return;
        }

        const confirmado = window.confirm(
          `Esse arquivo tem ${novosPersonagens.length} corredora(s). Isso vai SUBSTITUIR os dados atuais. Continuar?`
        );
        if (!confirmado) return;

        // 🎯 Garante que cada personagem importado tenha os campos certos
        // (defensivo, caso o JSON venha de uma versão diferente/editado à mão).
        const normalizados = novosPersonagens.map((p) => ({
          id: p.id || gerarId(),
          name: p.name || "",
          category: CATEGORIAS.includes(p.category) ? p.category : "Sprint",
          strategy: ESTRATEGIAS.includes(p.strategy) ? p.strategy : "",
          build: p.build || "",
          rounds: Array.isArray(p.rounds) && p.rounds.length === 5 ? p.rounds.map((r) => Number(r) || 0) : [0, 0, 0, 0, 0],
          createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now() + Math.random(),
        }));

        setPersonagens(normalizados);
        alert("✅ Time importado com sucesso!");
      } catch (erro) {
        console.error(erro);
        alert("❌ Não consegui ler esse arquivo. Confirme que é um JSON exportado daqui mesmo do Team Trials Tracker.");
      } finally {
        evento.target.value = "";
      }
    };
    leitor.readAsText(arquivo);
  }

  // -------------------------------------------------------------------------
  // NAVEGAÇÃO ENTRE ABAS
  // -------------------------------------------------------------------------
  const [abaAtiva, setAbaAtiva] = useState("geral");

  // ==========================================================================
  // TELAS DE BLOQUEIO (mesmo padrão do Sorteio.jsx/RankAdmin.jsx)
  // ==========================================================================
  if (statusAcesso === "verificando") {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#c5a059", fontFamily: "'Montserrat', sans-serif" }}>
        <FontAwesomeIcon icon={faCircleNotch} spin style={{ marginRight: "10px" }} /> Verificando credenciais de acesso...
      </div>
    );
  }

  if (statusAcesso === "negado-login") {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ maxWidth: "550px", padding: "45px", border: "3px solid #ff4d4d", borderRadius: "12px", background: "#0b1320", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.7)" }}>
          <h3 style={{ color: "#ff4d4d", borderBottom: "2px solid rgba(255,77,77,0.2)", paddingBottom: "15px", fontSize: "20pt", marginTop: 0, marginBottom: "20px", fontFamily: "'Cinzel', serif" }}>
            Acesso Restrito
          </h3>
          <p style={{ fontSize: "13pt", lineHeight: 1.6, marginBottom: "35px", color: "#a4b3c6", fontFamily: "'Montserrat', sans-serif" }}>
            O Team Trials Tracker é individual de cada Treinador. Faça login pra acessar o seu.
          </p>
          <button
            onClick={() => navigate("/login")}
            style={{ background: "#ff4d4d", border: "none", color: "#fff", fontSize: "11pt", padding: "15px 38px", cursor: "pointer", borderRadius: "6px", fontWeight: 700, textTransform: "uppercase" }}
          >
            Ir para Login
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // TELA PRINCIPAL
  // ==========================================================================
  return (
    <div className="hero-container tt-page">
      <div className="tt-header">
        <h1 className="tt-title">🏆 Team Trials Tracker</h1>
        <p className="tt-subtitle">Acompanhe as 5 rodadas das suas 15 corredoras e identifique quem precisa de re-treino.</p>

        <div className="tt-save-indicator">
          {statusSalvamento === "salvando" && (
            <span className="tt-save-tag tt-save-salvando"><FontAwesomeIcon icon={faCircleNotch} spin /> Salvando...</span>
          )}
          {statusSalvamento === "salvo" && (
            <span className="tt-save-tag tt-save-ok"><FontAwesomeIcon icon={faCheck} /> Salvo na sua conta</span>
          )}
          {statusSalvamento === "erro" && (
            <span className="tt-save-tag tt-save-erro">⚠️ Erro ao salvar — tente novamente</span>
          )}
          {statusSalvamento === "" && !carregando && (
            <span className="tt-save-tag"><FontAwesomeIcon icon={faFloppyDisk} /> Sincronizado com sua conta</span>
          )}
        </div>
      </div>

      <div className="tt-tabs">
        <button className={`tt-tab-btn${abaAtiva === "geral" ? " active" : ""}`} onClick={() => setAbaAtiva("geral")}>
          📊 Desempenho Geral
        </button>
        <button className={`tt-tab-btn${abaAtiva === "categoria" ? " active" : ""}`} onClick={() => setAbaAtiva("categoria")}>
          🏃 Visão por Categoria
        </button>
      </div>

      {carregando ? (
        <div className="tt-loading"><FontAwesomeIcon icon={faCircleNotch} spin /> Carregando sua equipe...</div>
      ) : (
        <>
          {abaAtiva === "geral" && (
            <AbaDesempenhoGeral
              personagens={personagensComputados}
              onAtualizarCampo={atualizarCampo}
              onAtualizarRound={atualizarRound}
              onRemover={removerPersonagem}
              onPreencherGradePadrao={preencherGradePadrao}
              onLimparPontuacoes={limparPontuacoes}
              onExportarJSON={exportarJSON}
              onAcionarImportarJSON={acionarImportarJSON}
              onAdicionarPersonagem={(p) => setPersonagens((atual) => [...atual, p])}
            />
          )}
          {abaAtiva === "categoria" && (
            <AbaCategoria personagens={personagensComputados} totalGeralEquipe={totalGeralEquipe} />
          )}
        </>
      )}

      {/* Input de arquivo escondido, acionado pelo botão "Importar JSON" da Aba 1 */}
      <input
        type="file"
        accept="application/json,.json"
        ref={inputImportarRef}
        onChange={lidarComArquivoImportado}
        style={{ display: "none" }}
      />
    </div>
  );
}

// 🎯 Modo alternativo de preenchimento: em vez de rolar a tabela inteira
// procurando a coluna certa, a pessoa escolhe UMA rodada e vê todas as
// corredoras em lista, com um campo só cada — o jeito natural de digitar
// quando os resultados chegam rodada por rodada, não corredora por
// corredora. Enter pula pro campo seguinte automaticamente.
function EntradaPorRodada({ personagens, onAtualizarRound }) {
  const [indiceRodada, setIndiceRodada] = useState(0);
  const inputsRef = useRef([]);

  const preenchidas = personagens.filter((p) => p.rounds[indiceRodada] > 0).length;

  function focarProximo(indiceAtual) {
    const proximo = inputsRef.current[indiceAtual + 1];
    if (proximo) proximo.focus();
  }

  return (
    <div className="tt-rodada-wrap">
      <div className="tt-rodada-selector">
        {ROUND_LABELS.map((label, idx) => (
          <button
            key={label}
            type="button"
            className={`tt-rodada-pill${indiceRodada === idx ? " active" : ""}`}
            onClick={() => setIndiceRodada(idx)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="tt-rodada-progresso">
        {preenchidas} de {personagens.length} corredoras preenchidas na <strong>{ROUND_LABELS[indiceRodada]}</strong>
      </p>

      {personagens.length === 0 ? (
        <div className="tt-empty-state">
          <p>Nenhuma corredora pra preencher (confira o filtro de categoria acima).</p>
        </div>
      ) : (
        <div className="tt-rodada-lista">
          {personagens.map((p, idx) => {
            const urlAvatar = obterUrlImagemPersonagem(p.name);
            const valor = p.rounds[indiceRodada];
            return (
              <div key={p.id} className={`tt-rodada-item${valor > 0 ? " preenchido" : ""}`}>
                {urlAvatar && (
                  <img src={urlAvatar} alt="" className="tt-rodada-avatar" onError={(e) => { e.target.style.display = "none"; }} />
                )}
                <div className="tt-rodada-info">
                  <span className="tt-rodada-nome">{p.name || "(sem nome)"}</span>
                  <span className="tt-rodada-cat" style={{ color: CATEGORIA_INFO[p.category]?.cor }}>{p.category}</span>
                </div>
                <input
                  ref={(el) => { inputsRef.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  className="tt-mono tt-rodada-input"
                  value={valor === 0 ? "" : valor}
                  placeholder="0"
                  onChange={(e) => onAtualizarRound(p.id, indiceRodada, e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      focarProximo(idx);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ABA 1 — DESEMPENHO GERAL
// ============================================================================

function AbaDesempenhoGeral({
  personagens, onAtualizarCampo, onAtualizarRound, onRemover,
  onPreencherGradePadrao, onLimparPontuacoes, onExportarJSON, onAcionarImportarJSON,
  onAdicionarPersonagem,
}) {
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [ordenacao, setOrdenacao] = useState({ campo: "overallRank", direcao: "asc" });
  const [mostrarFormNova, setMostrarFormNova] = useState(false);
  const [modoEntrada, setModoEntrada] = useState("tabela"); // "tabela" | "rodada"

  function alternarOrdenacao(campo) {
    setOrdenacao((atual) => {
      if (atual.campo === campo) return { campo, direcao: atual.direcao === "asc" ? "desc" : "asc" };
      const padraoAsc = campo === "name" || campo === "category" || campo === "build";
      return { campo, direcao: padraoAsc ? "asc" : "desc" };
    });
  }

  function iconeOrdenacao(campo) {
    if (ordenacao.campo !== campo) return faSort;
    return ordenacao.direcao === "asc" ? faSortUp : faSortDown;
  }

  const listaFiltrada = useMemo(() => {
    const base = filtroCategoria === "Todas" ? personagens : personagens.filter((p) => p.category === filtroCategoria);
    const copia = [...base];
    copia.sort((a, b) => {
      let va, vb;
      if (ordenacao.campo.startsWith("round")) {
        const idx = Number(ordenacao.campo.replace("round", ""));
        va = a.rounds[idx]; vb = b.rounds[idx];
      } else {
        va = a[ordenacao.campo]; vb = b[ordenacao.campo];
      }
      if (typeof va === "string") {
        const cmp = va.localeCompare(vb);
        return ordenacao.direcao === "asc" ? cmp : -cmp;
      }
      const cmp = (va ?? 0) - (vb ?? 0);
      return ordenacao.direcao === "asc" ? cmp : -cmp;
    });
    return copia;
  }, [personagens, filtroCategoria, ordenacao]);

  // 🎯 Ordem FIXA (categoria → nome), independente do total/rank — usada só
  // no modo "Preencher por Rodada". Se usasse a mesma ordenação da tabela
  // (por rank), a lista ficaria "pulando" de posição a cada número digitado,
  // o que atrapalha muito quando a pessoa está tentando preencher em sequência.
  const listaParaRodada = useMemo(() => {
    const base = filtroCategoria === "Todas" ? personagens : personagens.filter((p) => p.category === filtroCategoria);
    return [...base].sort((a, b) => {
      const diferencaCategoria = CATEGORIAS.indexOf(a.category) - CATEGORIAS.indexOf(b.category);
      if (diferencaCategoria !== 0) return diferencaCategoria;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [personagens, filtroCategoria]);

  return (
    <div className="tt-tab-content">
      {/* Barra de ações */}
      <div className="tt-actions-bar">
        <div className="tt-filter-chips">
          <button className={`tt-chip${filtroCategoria === "Todas" ? " active" : ""}`} onClick={() => setFiltroCategoria("Todas")}>
            Todas
          </button>
          {CATEGORIAS.map((cat) => (
            <button
              key={cat}
              className={`tt-chip${filtroCategoria === cat ? " active" : ""}`}
              style={{ "--chip-cor": CATEGORIA_INFO[cat].cor, "--chip-bg": CATEGORIA_INFO[cat].bg, "--chip-borda": CATEGORIA_INFO[cat].borda }}
              onClick={() => setFiltroCategoria(cat)}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="tt-modo-switch">
          <button
            type="button"
            className={`tt-modo-btn${modoEntrada === "tabela" ? " active" : ""}`}
            onClick={() => setModoEntrada("tabela")}
          >
            📋 Tabela Completa
          </button>
          <button
            type="button"
            className={`tt-modo-btn${modoEntrada === "rodada" ? " active" : ""}`}
            onClick={() => setModoEntrada("rodada")}
          >
            🎯 Preencher por Rodada
          </button>
        </div>
      </div>

      <div className="tt-actions-bar-secundaria">
        <div className="tt-actions-buttons">
          <button className="tt-btn tt-btn-gold" onClick={() => setMostrarFormNova(true)}>
            <FontAwesomeIcon icon={faPlus} /> Nova Corredora
          </button>
          <button className="tt-btn" onClick={onPreencherGradePadrao}>
            <FontAwesomeIcon icon={faBolt} /> Preencher Grade Padrão (15 Slots)
          </button>
          <button className="tt-btn tt-btn-danger-outline" onClick={onLimparPontuacoes}>
            <FontAwesomeIcon icon={faBroom} /> Limpar Pontuações
          </button>
          <button className="tt-btn" onClick={onExportarJSON}>
            <FontAwesomeIcon icon={faFileExport} /> Exportar JSON
          </button>
          <button className="tt-btn" onClick={onAcionarImportarJSON}>
            <FontAwesomeIcon icon={faFileImport} /> Importar JSON
          </button>
        </div>
      </div>

      {mostrarFormNova && (
        <FormNovaCorredora onCancelar={() => setMostrarFormNova(false)} onSalvar={(p) => { onAdicionarPersonagem(p); setMostrarFormNova(false); }} />
      )}

      {personagens.length === 0 ? (
        <div className="tt-empty-state">
          <p>Nenhuma corredora cadastrada ainda.</p>
          <p className="tt-empty-hint">Use "Preencher Grade Padrão" pra gerar os 15 slots de uma vez, ou "+ Nova Corredora" pra adicionar uma por vez.</p>
        </div>
      ) : modoEntrada === "rodada" ? (
        <EntradaPorRodada personagens={listaParaRodada} onAtualizarRound={onAtualizarRound} />
      ) : (
        <div className="tt-table-scroll">
          <table className="tt-table">
            <thead>
              <tr>
                <Th campo="overallRank" label="Pos" ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao("overallRank")} />
                <Th campo="name" label="Nome" ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao("name")} />
                <Th campo="category" label="Categoria" ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao("category")} />
                <Th campo="build" label="Build" ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao("build")} />
                {ROUND_LABELS.map((label, idx) => (
                  <Th key={label} campo={`round${idx}`} label={label} ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao(`round${idx}`)} />
                ))}
                <Th campo="average" label="Média" ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao("average")} />
                <Th campo="total" label="Total" ordenacao={ordenacao} onClick={alternarOrdenacao} icone={iconeOrdenacao("total")} />
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((p) => {
                const destaque = p.overallRank <= 3 ? "tt-row-top" : p.overallRank >= 13 ? "tt-row-bottom" : "";
                return (
                  <tr key={p.id} className={destaque}>
                    <td className="tt-mono tt-pos-cell">{p.overallRank}º</td>
                    <td>
                      <SeletorCorredora
                        valor={p.name}
                        onSelecionar={(v) => onAtualizarCampo(p.id, "name", v)}
                        compacto
                      />
                    </td>
                    <td>
                      <select
                        className="tt-select-inline"
                        style={{ color: CATEGORIA_INFO[p.category]?.cor }}
                        value={p.category}
                        onChange={(e) => onAtualizarCampo(p.id, "category", e.target.value)}
                      >
                        {CATEGORIAS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="tt-input-inline tt-input-build"
                        value={p.build}
                        placeholder="ex: UG5"
                        onChange={(e) => onAtualizarCampo(p.id, "build", e.target.value)}
                      />
                    </td>
                    {p.rounds.map((valor, idx) => (
                      <td key={idx}>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="tt-input-round tt-mono"
                          value={valor === 0 ? "" : valor}
                          placeholder="0"
                          onChange={(e) => onAtualizarRound(p.id, idx, e.target.value.replace(/[^0-9]/g, ""))}
                        />
                      </td>
                    ))}
                    <td className="tt-mono tt-num-cell">{formatarNumero(p.average, 1)}</td>
                    <td className="tt-mono tt-num-cell tt-total-cell">{p.total}</td>
                    <td>
                      <span className={`tt-status-badge ${p.status.classe}`}>{p.status.emoji} {p.status.label}</span>
                    </td>
                    <td>
                      <button className="tt-icon-btn tt-icon-btn-danger" onClick={() => onRemover(p.id, p.name)} title="Remover">
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ campo, label, ordenacao, onClick, icone }) {
  return (
    <th className="tt-th-sortable" onClick={() => onClick(campo)}>
      {label} <FontAwesomeIcon icon={icone} className={`tt-sort-icon${ordenacao.campo === campo ? " active" : ""}`} />
    </th>
  );
}

function FormNovaCorredora({ onCancelar, onSalvar }) {
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("Sprint");
  const [estrategia, setEstrategia] = useState("");
  const [build, setBuild] = useState("");

  function lidarComSalvar(e) {
    e.preventDefault();
    if (!nome.trim()) {
      alert("⚠️ Digite o nome da corredora.");
      return;
    }
    onSalvar({
      id: gerarId(),
      name: nome.trim(),
      category: categoria,
      strategy: estrategia,
      build: build.trim(),
      rounds: [0, 0, 0, 0, 0],
      createdAt: Date.now() + Math.random(),
    });
  }

  return (
    <form className="tt-form-nova" onSubmit={lidarComSalvar}>
      <div className="tt-form-campo">
        <label>Nome</label>
        <SeletorCorredora valor={nome} onSelecionar={setNome} />
      </div>
      <div className="tt-form-campo">
        <label>Categoria</label>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>
      <div className="tt-form-campo">
        <label>Estratégia</label>
        <select value={estrategia} onChange={(e) => setEstrategia(e.target.value)}>
          {ESTRATEGIAS.map((estr) => <option key={estr} value={estr}>{estr || "—"}</option>)}
        </select>
      </div>
      <div className="tt-form-campo">
        <label>Build</label>
        <input type="text" value={build} onChange={(e) => setBuild(e.target.value)} placeholder="Ex: UG5" />
      </div>
      <div className="tt-form-botoes">
        <button type="button" className="tt-btn" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="tt-btn tt-btn-gold">Adicionar</button>
      </div>
    </form>
  );
}

// ============================================================================
// ABA 2 — VISÃO POR CATEGORIA (Pódio)
// ============================================================================

function AbaCategoria({ personagens, totalGeralEquipe }) {
  return (
    <div className="tt-tab-content">
      <p className="tt-aba-explicacao">
        As 3 melhores de cada categoria — 🥇🥈 são referência, 🥉 é a "lanterna" da categoria (mais indicada pra re-treino ali).
        A barra embaixo mostra o quanto aquela categoria pesa no total geral da equipe.
      </p>
      <div className="tt-categoria-grid">
        {CATEGORIAS.map((cat) => {
          const info = CATEGORIA_INFO[cat];
          const doGrupo = personagens.filter((p) => p.category === cat).sort(compararDesempenho);
          const totalCategoria = doGrupo.reduce((soma, p) => soma + p.total, 0);
          const contribuicaoPct = totalGeralEquipe > 0 ? (totalCategoria / totalGeralEquipe) * 100 : 0;

          return (
            <div key={cat} className="tt-categoria-card" style={{ "--cat-cor": info.cor, "--cat-bg": info.bg, "--cat-borda": info.borda }}>
              <div className="tt-categoria-card-header">
                <h3>{cat}</h3>
                <span className="tt-categoria-total">{totalCategoria} pts</span>
              </div>

              {doGrupo.length === 0 ? (
                <p className="tt-categoria-vazia">Nenhuma corredora nessa categoria.</p>
              ) : (
                <div className="tt-podio-lista">
                  {doGrupo.slice(0, 3).map((p, idx) => (
                    <div key={p.id} className={`tt-podio-item tt-podio-${idx + 1}`}>
                      <span className="tt-podio-medalha">{idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉"}</span>
                      <div className="tt-podio-info">
                        <span className="tt-podio-nome">{p.name || "(sem nome)"}</span>
                        <span className="tt-podio-detalhe">{p.build || "sem build"} · {p.total} pts</span>
                        {idx === 2 && <span className="tt-podio-tag-alerta">🚨 Lanterna / Troca Prioritária</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="tt-contribuicao">
                <div className="tt-contribuicao-label">
                  <span>Contribuição pro time</span>
                  <span className="tt-mono">{formatarNumero(contribuicaoPct, 1)}%</span>
                </div>
                <div className="tt-contribuicao-barra-fundo">
                  <div className="tt-contribuicao-barra-preenchida" style={{ width: `${Math.min(100, contribuicaoPct)}%` }}></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default TeamTrials;