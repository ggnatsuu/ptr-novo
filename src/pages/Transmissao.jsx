import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExpand, faCompress, faArrowsRotate } from "@fortawesome/free-solid-svg-icons";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

// 🎯 Sala e senha fixas do VDO.Ninja, pra não precisar mexer em código toda
// rodada — o organizador só abre o link de PUSH (transmitir) no navegador
// dele, e este componente aqui é o lado VIEW (assistir) que já sai pronto
// com esses mesmos valores.
//
// ⚠️ Troque "PTR_SENHA_OFICIAL" por uma senha de verdade antes de divulgar
// esse link publicamente. Como o site é 100% client-side, qualquer pessoa
// que abrir o "Inspecionar" do navegador consegue ver esses dois valores
// no código — ou seja, isso NÃO é uma segurança de verdade, só impede que
// alguém entre "sem querer" digitando um nome de sala aleatório no
// vdo.ninja. Se quiser algo mais robusto, o caminho é trocar a senha a
// cada rodada e divulgar ela só por dentro do Discord.
//
// 📡 COMO TRANSMITIR (lado do organizador, no navegador — não aqui no
// código): abrir o link de PUSH abaixo, trocando SALA/SENHA pelos mesmos
// valores das constantes logo abaixo, e selecionar a Câmera Virtual do OBS
// como fonte de vídeo:
//
//   https://vdo.ninja/?push=ptr_oficial_live&password=PTR_SENHA_OFICIAL
//
// 👥 MAIS DE ~10 ESPECTADORES AO MESMO TEMPO: o link acima é peer-to-peer
// puro — o upload de quem transmite é dividido entre todo mundo assistindo,
// então a qualidade pode cair com muita gente conectada ao mesmo tempo. Se
// isso acontecer, basta adicionar "&meshcast2" no FINAL do link de PUSH
// (só nesse link, o de assistir aqui no site não precisa mudar nada):
//
//   https://vdo.ninja/?push=ptr_oficial_live&password=PTR_SENHA_OFICIAL&meshcast2
//
// Isso roteia o vídeo por um servidor gratuito do próprio VDO.Ninja
// (Meshcast, suporta até 100 espectadores), mantendo a latência baixa.
const VDO_NINJA_SALA = "ptr_oficial_live";
const VDO_NINJA_SENHA = "ptr_l1ve_c0rr1d4";
const VDO_NINJA_URL = `https://vdo.ninja/?view=${VDO_NINJA_SALA}&password=${VDO_NINJA_SENHA}&autostart=1&cleanoutput=1`;

// TODO: trocar pelo link real do canal de voz do Discord (mesmo esquema do
// TODO que já existe no Footer.jsx pro convite geral do servidor)
const DISCORD_CANAL_VOZ = "https://discord.gg/EBjffApByP";

function Transmissao() {
  const navigate = useNavigate();

  // 🎯 Trava de acesso: só admin vê essa página por enquanto (mesmo padrão
  // já usado no Sorteio.jsx/RankAdmin.jsx). "verificando" | "negado-login" |
  // "negado-permissao" | "liberado".
  const [statusAcesso, setStatusAcesso] = useState("verificando");

  useEffect(() => {
    const pararDeObservar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        setStatusAcesso("negado-login");
        return;
      }
      try {
        const docSnap = await getDoc(doc(db, "treinadores", usuario.uid));
        if (docSnap.exists() && docSnap.data().nivelAcesso === "admin") {
          setStatusAcesso("liberado");
        } else {
          setStatusAcesso("negado-permissao");
        }
      } catch (erro) {
        console.error("Erro na validação de segurança:", erro);
        setStatusAcesso("negado-permissao");
      }
    });
    return () => pararDeObservar();
  }, []);

  const [edicaoAtual, setEdicaoAtual] = useState(null);
  const [emTelaCheia, setEmTelaCheia] = useState(false);
  const [chaveRecarga, setChaveRecarga] = useState(0);

  const wrapperPlayerRef = useRef(null);

  // 🎯 Busca a edição ativa no mesmo documento que Sorteio/Agenda/RankAdmin
  // já usam, só pra exibir o número certo no subtítulo. Não precisa de
  // listener em tempo real aqui — um getDoc ao abrir a página já basta.
  useEffect(() => {
    async function buscarEdicaoAtual() {
      try {
        const snap = await getDoc(doc(db, "pistas_sorteadas", "atual"));
        if (snap.exists() && snap.data().edicaoAtiva) {
          setEdicaoAtual(snap.data().edicaoAtiva.replace("edicao_", ""));
        }
      } catch (erro) {
        console.error("Erro ao buscar edição atual:", erro);
      }
    }
    buscarEdicaoAtual();
  }, []);

  // 🎯 Escuta o evento nativo de tela cheia do navegador, pra manter o
  // ícone/texto do botão sincronizados mesmo se a pessoa sair apertando
  // ESC em vez de clicar de novo no botão.
  useEffect(() => {
    function aoMudarTelaCheia() {
      setEmTelaCheia(document.fullscreenElement === wrapperPlayerRef.current);
    }
    document.addEventListener("fullscreenchange", aoMudarTelaCheia);
    return () => document.removeEventListener("fullscreenchange", aoMudarTelaCheia);
  }, []);

  function alternarTelaCheia() {
    if (!wrapperPlayerRef.current) return;
    if (!document.fullscreenElement) {
      wrapperPlayerRef.current.requestFullscreen?.().catch((erro) => {
        console.error("Não foi possível entrar em tela cheia:", erro);
      });
    } else {
      document.exitFullscreen?.();
    }
  }

  // 🎯 Truque do "key" do React: trocar a key força o React a desmontar e
  // remontar o <iframe> do zero, recarregando o player de verdade — bem
  // mais confiável do que tentar reatribuir o mesmo src na mão.
  function recarregarStream() {
    setChaveRecarga((k) => k + 1);
  }

  // ==========================================================================
  // TELAS DE BLOQUEIO (mesmo padrão do Sorteio.jsx/RankAdmin.jsx)
  // ==========================================================================
  if (statusAcesso === "verificando") {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#c5a059", fontFamily: "'Montserrat', sans-serif" }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: "10px" }}></i> Verificando credenciais de acesso...
      </div>
    );
  }

  if (statusAcesso === "negado-login" || statusAcesso === "negado-permissao") {
    const titulo = statusAcesso === "negado-login" ? "Acesso Restrito" : "Operação Negada";
    const mensagem =
      statusAcesso === "negado-login"
        ? "A transmissão ao vivo é uma área exclusiva da Comissão Executiva da PTR por enquanto. Por favor, realize o login com uma credencial autorizada."
        : "Sua licença atual de Treinador não possui nível de acesso administrativo para assistir a transmissão ao vivo no momento.";

    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ maxWidth: "550px", padding: "45px", border: "3px solid #ff4d4d", borderRadius: "12px", background: "#0b1320", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.7)" }}>
          <h3 style={{ color: "#ff4d4d", borderBottom: "2px solid rgba(255,77,77,0.2)", paddingBottom: "15px", fontSize: "20pt", marginTop: 0, marginBottom: "20px", fontFamily: "'Cinzel', serif" }}>
            {titulo}
          </h3>
          <p style={{ fontSize: "13pt", lineHeight: 1.6, marginBottom: "35px", color: "#a4b3c6", fontFamily: "'Montserrat', sans-serif" }}>
            {mensagem}
          </p>
          <button
            onClick={() => navigate(statusAcesso === "negado-login" ? "/login" : "/")}
            style={{ background: "#ff4d4d", border: "none", color: "#fff", fontSize: "11pt", padding: "15px 38px", cursor: "pointer", borderRadius: "6px", fontWeight: 700, textTransform: "uppercase" }}
          >
            {statusAcesso === "negado-login" ? "Ir para Login" : "Voltar ao Início"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-container live-page-container">
      <div className="live-header">
        <span className="live-badge-realtime">
          <span className="live-badge-dot"></span> TEMPO REAL (WebRTC)
        </span>
        <h1 className="live-title">
          <span className="live-title-dot"></span> Transmissão Oficial PTR
        </h1>
        <p className="live-subtitle">
          {edicaoAtual ? `Edição Nº ${edicaoAtual} — ao vivo direto do circuito` : "Acompanhe a rodada da semana ao vivo"}
        </p>
      </div>

      <div className="live-player-frame" ref={wrapperPlayerRef}>
        <iframe
          key={chaveRecarga}
          className="live-player-iframe"
          src={VDO_NINJA_URL}
          allow="autoplay; fullscreen; picture-in-picture"
          title="Transmissão Oficial PTR"
        ></iframe>
      </div>

      <div className="live-actions-bar">
        <button type="button" className="live-action-btn" onClick={alternarTelaCheia}>
          <FontAwesomeIcon icon={emTelaCheia ? faCompress : faExpand} />
          {emTelaCheia ? "Sair da Tela Cheia" : "Tela Cheia"}
        </button>

        <button type="button" className="live-action-btn" onClick={recarregarStream}>
          <FontAwesomeIcon icon={faArrowsRotate} />
          Recarregar Stream
        </button>

        <a
          href={DISCORD_CANAL_VOZ}
          target="_blank"
          rel="noopener noreferrer"
          className="live-action-btn live-action-btn-discord"
        >
          <FontAwesomeIcon icon={faDiscord} />
          Canal de Voz
        </a>
      </div>

      <p className="live-fallback-notice">
        ⚠️ Se a tela estiver preta ou estática, a transmissão da rodada iniciará nos próximos minutos.
      </p>
    </div>
  );
}

export default Transmissao;