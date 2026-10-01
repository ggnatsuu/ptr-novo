// 🎯 src/pages/ReplayArquivo.jsx
// Ferramenta "Replay de Corrida": a pessoa escolhe (ou arrasta) o arquivo
// de corrida exportado do jogo — o mesmo que vai pro Hakuraku — e vê a
// mesma análise do Resultados: tabela de telemetria, painel de cada
// cavalinha, replay e comparativo. Serve pra corridas de fora da PTR
// (Career, Champions Meeting, testes...), então os NPCs aparecem também.
// Nada é enviado pro banco: o arquivo é lido só no navegador de quem abre.

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { lerArquivoCorrida } from "../utils/arquivoCorrida";
import courseData from "../uma-skill-tools/data/course_data.json";
import rotulosPistas from "../utils/hakuraku/dados/rotulos-pistas.json";
import CondicoesCorrida from "../components/CondicoesCorrida";
import DestaquesCorrida from "../components/DestaquesCorrida";
import TabelaResultado from "../components/TabelaResultado";
import PainelDetalheTreinador from "../components/PainelDetalheTreinador";
import SecaoAnaliseTreinador from "../components/SecaoAnaliseTreinador";
import SecaoGraficoDesempenho from "../components/SecaoGraficoDesempenho";
import ReplayCorrida from "../components/ReplayCorrida";
import GraficoComparativo from "../components/GraficoComparativo";

// 🔒 Enquanto estiver em testes, só admin usa. Pra liberar pra todo mundo
// (inclusive sem login), é só trocar pra false.
const SOMENTE_ADMIN = true;

const estiloCaixa = {
  width: "100%",
  background: "#0d1624",
  border: "1px solid rgba(197, 160, 89, 0.25)",
  borderRadius: "12px",
  boxSizing: "border-box",
  fontFamily: "'Montserrat', sans-serif",
};

function ReplayArquivo() {
  // "verificando" | "liberado" | "negado"
  const [acesso, setAcesso] = useState(SOMENTE_ADMIN ? "verificando" : "liberado");
  useEffect(() => {
    if (!SOMENTE_ADMIN) return undefined;
    return onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        setAcesso("negado");
        return;
      }
      try {
        const perfil = await getDoc(doc(db, "treinadores", usuario.uid));
        setAcesso(perfil.exists() && perfil.data().nivelAcesso === "admin" ? "liberado" : "negado");
      } catch (erro) {
        console.error("Erro ao verificar acesso:", erro);
        setAcesso("negado");
      }
    });
  }, []);

  const [arquivo, setArquivo] = useState(null); // { nome, dados }
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [pedidoSeguir, setPedidoSeguir] = useState(null);
  const inputRef = useRef(null);

  async function abrirArquivo(file) {
    if (!file) return;
    setErro("");
    setProcessando(true);
    try {
      const texto = await file.text();
      const dados = await lerArquivoCorrida(texto, { incluirNpcs: true });
      setArquivo({ nome: file.name, dados });
      setPedidoSeguir(null);
    } catch (e) {
      console.error("Erro ao ler o arquivo de corrida:", e);
      setErro(e?.message || "Não foi possível ler esse arquivo. Confira se é o arquivo de corrida exportado do jogo (o mesmo do Hakuraku).");
    } finally {
      setProcessando(false);
    }
  }

  function seguirNoReplay(numero) {
    setPedidoSeguir({ numero });
    document.getElementById("replay-do-arquivo")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (acesso !== "liberado") {
    return (
      <main className="main-layout-wrapper">
        <div className="lottery-header">
          <h2 className="lottery-main-title">🎬 Replay de Corrida</h2>
          <div className="lottery-title-divider"></div>
          <p className="lottery-subtitle">
            {acesso === "verificando" ? "Verificando acesso..." : "Ferramenta em testes — em breve disponível para todos."}
          </p>
        </div>
      </main>
    );
  }

  const dados = arquivo?.dados;
  const curso = dados ? courseData[dados.condicoes.courseId] : null;
  const superficie = curso ? (curso.surface === 2 ? "(Dirt)" : "(Turf)") : null;
  const titulo = dados ? rotulosPistas[dados.condicoes.courseId] ?? `Percurso ${dados.condicoes.courseId}` : null;
  const corridaAnalise = dados ? { classificacao: dados.classificacao, condicoesArquivo: dados.condicoes } : null;

  return (
    <main className="main-layout-wrapper">
      <div className="lottery-header">
        <h2 className="lottery-main-title">🎬 Replay de Corrida</h2>
        <div className="lottery-title-divider"></div>
        <p className="lottery-subtitle">
          Abra o arquivo de corrida exportado do jogo (o mesmo que vai pro Hakuraku) para ver o replay, a telemetria e a análise de cada cavalinha.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: "1550px", margin: "0 auto 60px auto", padding: "0 12px", boxSizing: "border-box" }}>
        {/* ESCOLHER / ARRASTAR O ARQUIVO */}
        <div
          onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastando(false); abrirArquivo(e.dataTransfer.files?.[0]); }}
          onClick={() => !processando && inputRef.current?.click()}
          style={{
            ...estiloCaixa,
            padding: arquivo ? "14px 20px" : "40px 20px",
            textAlign: "center",
            cursor: processando ? "wait" : "pointer",
            borderStyle: "dashed",
            borderColor: arrastando ? "#c5a059" : "rgba(197, 160, 89, 0.4)",
            background: arrastando ? "rgba(197, 160, 89, 0.08)" : "#0d1624",
            marginBottom: "24px",
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            style={{ display: "none" }}
            onChange={(e) => { abrirArquivo(e.target.files?.[0]); e.target.value = ""; }}
          />
          {processando ? (
            <p style={{ margin: 0, color: "#c5a059", fontWeight: 700 }}><i className="fa-solid fa-spinner fa-spin"></i> Processando a corrida...</p>
          ) : arquivo ? (
            <p style={{ margin: 0, color: "#a4b3c6", fontSize: "9.5pt" }}>
              <i className="fa-solid fa-file-circle-check" style={{ color: "#1bd39e" }}></i> <strong style={{ color: "#f1ead4" }}>{arquivo.nome}</strong> — clique ou arraste outro arquivo para trocar
            </p>
          ) : (
            <>
              <i className="fa-solid fa-file-import" style={{ fontSize: "28pt", color: "#c5a059" }}></i>
              <p style={{ margin: "12px 0 4px 0", color: "#f1ead4", fontWeight: 700 }}>Clique para escolher ou arraste o arquivo .json aqui</p>
              <p style={{ margin: 0, color: "#5f758e", fontSize: "9pt" }}>🔒 O arquivo é lido só no seu navegador — nada é enviado para o site.</p>
            </>
          )}
        </div>

        {erro && (
          <p style={{ ...estiloCaixa, padding: "14px 20px", color: "#e04b37", borderColor: "rgba(224, 75, 55, 0.4)", marginBottom: "24px" }}>⚠️ {erro}</p>
        )}

        {dados && (
          <>
            <h3 style={{ textAlign: "center", fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "15pt", margin: "0 0 14px 0" }}>{titulo}</h3>
            <CondicoesCorrida condicoes={dados.condicoes} superficie={superficie} />
            <DestaquesCorrida corrida={{ classificacao: dados.classificacao, dadosTreinadores: dados.dadosTreinadores }} />

            <TabelaResultado
              classificacao={dados.classificacao}
              dadosTreinadores={dados.dadosTreinadores}
              chave={arquivo.nome}
              montarPainel={(linha, dadosTreinador) => (
                <PainelDetalheTreinador
                  dados={dadosTreinador}
                  aoSeguirNoReplay={() => seguirNoReplay(linha.numero)}
                  lateral={<SecaoAnaliseTreinador dados={dadosTreinador} linha={linha} corrida={corridaAnalise} replay={dados.replay} />}
                >
                  <SecaoGraficoDesempenho replay={dados.replay} numero={linha.numero} />
                </PainelDetalheTreinador>
              )}
            />

            <div id="replay-do-arquivo" style={{ marginTop: "30px", scrollMarginTop: "90px" }}>
              <ReplayCorrida key={arquivo.nome} replay={dados.replay} pedidoSeguir={pedidoSeguir} />
            </div>
            <div style={{ marginTop: "24px" }}>
              <GraficoComparativo key={`comparativo-${arquivo.nome}`} replay={dados.replay} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default ReplayArquivo;
