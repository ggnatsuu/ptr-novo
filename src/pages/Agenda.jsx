import { useEffect, useRef, useState } from "react";
import { doc, collection, onSnapshot, setDoc, deleteDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../config/firebase";
import { obterUrlAvatarCloudinary } from "../utils/cloudinary";
import ModalTestePista from "../components/ModalTestePista";

// ==========================================================================
// REWORK (retirada do dangerouslySetInnerHTML): a Agenda agora lê os dados
// CRUS da rodada (pistas, clima, cenário, deck, teto de SSR, códigos de
// sala) direto do Firestore e desenha tudo com JSX normal — em vez de
// injetar uma string de HTML pronta e depois sair caçando elemento por
// elemento com document.getElementById pra "remendar" os códigos de sala
// por cima. Isso elimina de vez a classe de bug onde algo (ainda não
// identificado) ficava resetando aquele remendo manual depois de alguns
// segundos: agora não existe mais remendo nenhum, é tudo render normal do
// React, sempre em sincronia com o estado.
//
// IMPORTANTE: isso NÃO muda em nada o que a Agenda grava no Firestore (o
// Check-in continua escrevendo exatamente do mesmo jeito na coleção
// "checkins") — só muda como ela DESENHA o que já estava salvo. O
// Sorteio.jsx continua gravando o campo "muralBaseHTML" normalmente (por
// segurança/compatibilidade), só que a Agenda não lê mais esse campo.
// ==========================================================================

// 🎯 Mesmo slug determinístico usado no Sorteio.jsx pra gerar a chave de
// cada pista dentro de pacoteLobbiesData — precisa ser IDÊNTICO aos dois
// lados, senão a busca do código da sala não bate.
function slugPista(nome) {
  return (nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// 🎯 Catálogos de clima/cenário — mesmos dados do Sorteio.jsx, duplicados
// aqui de propósito (são só listas pequenas de referência visual; os dois
// arquivos são páginas/rotas separadas sem um módulo compartilhado ainda).
const CONDICOES_BASE_CLIMA = [
  { clima: "Sunny", terreno: "Good", emoji: "☀️" },
  { clima: "Sunny", terreno: "Firm", emoji: "☀️" },
  { clima: "Cloudy", terreno: "Firm", emoji: "☁️" },
  { clima: "Cloudy", terreno: "Good", emoji: "☁️" },
  { clima: "Rainy", terreno: "Soft", emoji: "🌧️" },
  { clima: "Rainy", terreno: "Heavy", emoji: "⛈️" },
];
const CONDICOES_INVERNO = [
  { clima: "Snowy", terreno: "Soft", emoji: "❄️" },
  { clima: "Snowy", terreno: "Good", emoji: "❄️" },
];
const CATALOGO_CLIMA_COMPLETO = [...CONDICOES_BASE_CLIMA, ...CONDICOES_INVERNO];

const CORES_CENARIO = { "URA Finale": "#c0392b", "Unity Cup": "#2980b9", "Trackblazer": "#e67e22", "Grand Concerto": "#8e44ad", "Livre": "#34495e" };
const EMOJI_CENARIO = { "URA Finale": "🏅", "Unity Cup": "🤝", "Trackblazer": "🔥", "Grand Concerto": "🎻", "Livre": "🎲" };
const CLOUDINARY_CLOUD_NAME_CENARIO = "k1qj4qrm";
const ARQUIVOS_CENARIO_CLOUDINARY = {
  "URA Finale": "urafinale",
  "Unity Cup": "unitycup",
  "Trackblazer": "trackblazer",
  "Grand Concerto": "grandconcert",
};
function obterUrlCenarioCloudinary(nomeCenario) {
  const arquivo = ARQUIVOS_CENARIO_CLOUDINARY[nomeCenario];
  if (!arquivo) return "";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME_CENARIO}/image/upload/f_auto,q_auto/${arquivo}.png`;
}

// 🎯 Banner do código de sala — agora é um componente React de verdade,
// com o próprio estado pro ícone de "copiado". Só renderiza alguma coisa
// se já existir código pra essa pista (senão retorna null: nada de caixa
// vazia escondida esperando ser preenchida por fora).
function RoomCodeBanner({ codigo }) {
  const [copiado, setCopiado] = useState(false);

  if (!codigo) return null;

  function copiar() {
    navigator.clipboard.writeText(codigo).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div
      onDoubleClick={copiar}
      title="Dê 2 cliques para copiar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        fontFamily: "'Montserrat', sans-serif",
        marginBottom: "14px",
        background: "rgba(197, 160, 89, 0.08)",
        border: "1px dashed rgba(197, 160, 89, 0.4)",
        padding: "8px 12px",
        borderRadius: "4px",
        boxSizing: "border-box",
        cursor: "pointer",
      }}
    >
      <span style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", pointerEvents: "none" }}>
        <i className="fa-solid fa-key" style={{ marginRight: "5px" }}></i> ID LOBBY OFICIAL
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ffffff" }}>
        <span style={{ fontSize: "11pt", fontWeight: 800, letterSpacing: "1.5px", textShadow: "0 0 10px rgba(197,160,89,0.3)", pointerEvents: "none" }}>
          {codigo}
        </span>
        <i className={`fa-regular ${copiado ? "fa-check" : "fa-copy"}`} style={{ color: "#c5a059", fontSize: "10pt", transition: "transform 0.2s, color 0.2s", pointerEvents: "none" }}></i>
      </div>
    </div>
  );
}

// 🎯 Card de uma pista — mesmo visual de sempre (imagem do hipódromo,
// badge de grade, chips de local/distância/piso/direção/clima), só que
// desenhado em JSX puro em vez de vir dentro da string de HTML.
function PistaCard({ pista, climaTexto, codigoSala }) {
  const sentidoVisivel = pista.direcao === "Left" ? "Esquerda" : pista.direcao === "Right" ? "Direita" : "Reta";
  const nomeImgHipodromo = (pista.hipodromo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const estiloChip = {
    display: "inline-block",
    background: "rgba(197,160,89,0.08)",
    border: "1px solid rgba(197,160,89,0.2)",
    borderRadius: "4px",
    padding: "5px 11px",
    fontSize: "9.5pt",
    color: "#a4b3c6",
    whiteSpace: "nowrap",
  };

  // 🎯 Estado do modal do diagrama fica LOCAL no próprio card (não em
  // Agenda como um todo) — cada card abre/fecha o próprio diagrama sem
  // precisar coordenar com o resto da tela.
  const [diagramaAberto, setDiagramaAberto] = useState(false);

  return (
    <div
      className="jra-stream-card"
      style={{
        width: "100%",
        maxWidth: "420px",
        background: "#0d1624",
        border: "1px solid rgba(197, 160, 89, 0.25)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.4)",
        borderRadius: "12px",
        overflow: "hidden",
        fontFamily: "'Montserrat', sans-serif",
        color: "#f1ead4",
        position: "relative",
        marginBottom: 0,
      }}
    >
      <div style={{ position: "relative", height: "190px" }}>
        <img
          src={`/assets/img/hipodromos/${nomeImgHipodromo}.png`}
          alt={pista.hipodromo}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <span className={`lottery-card-badge${pista.grade === "G1" ? " badge-gold" : ""}`} style={{ position: "absolute", top: "10px", left: "10px" }}>
          {pista.grade}
        </span>
      </div>
      <div style={{ padding: "22px" }}>
        <RoomCodeBanner codigo={codigoSala} />
        <h4 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "14.5pt", fontWeight: 700, margin: "0 0 12px 0" }}>{pista.nome}</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
          <span style={estiloChip}>📍 {pista.hipodromo}</span>
          <span style={estiloChip}>📏 {pista.distancia_tipo} ({pista.distancia_numero}m)</span>
          <span style={estiloChip}>🌿 {pista.terreno}</span>
          <span style={estiloChip}>🧭 {sentidoVisivel}</span>
          <span style={estiloChip}>☁️ {climaTexto}</span>
        </div>

        <button
          type="button"
          onClick={() => setDiagramaAberto(true)}
          style={{
            marginTop: "14px",
            width: "100%",
            background: "rgba(197,160,89,0.08)",
            border: "1px solid rgba(197,160,89,0.35)",
            borderRadius: "6px",
            padding: "9px 12px",
            color: "#c5a059",
            fontFamily: "'Montserrat', sans-serif",
            fontSize: "9.5pt",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          📊 Ver Diagrama da Pista
        </button>
      </div>

      {diagramaAberto && (
        <ModalTestePista
          pista={{
            nome: pista.nome,
            hipodromo: pista.hipodromo,
            terrenoCurto: pista.terreno,
            distanciaNumero: pista.distancia_numero,
            distanciaCategoria: pista.distancia_tipo,
            direcao: pista.direcao,
            course_id: pista.course_id,
          }}
          aoFechar={() => setDiagramaAberto(false)}
        />
      )}
    </div>
  );
}

// 🎯 Componente do "letreiro": mede se o texto realmente vaza da caixa
// (scrollWidth > clientWidth) e, se vazar, desliza suavemente ao passar
// o mouse pra revelar o nome inteiro. Nomes curtos que já cabem não se
// mexem — só os que realmente estão cortados.
function NomeComLetreiro({ nome }) {
  const containerRef = useRef(null);
  const textoRef = useRef(null);
  const [deslocamento, setDeslocamento] = useState(0);

  function handleMouseEnter() {
    if (!containerRef.current || !textoRef.current) return;
    const vazamento = textoRef.current.scrollWidth - containerRef.current.clientWidth;
    if (vazamento > 0) {
      setDeslocamento(-(vazamento + 4)); // +4px de folga no final, pra não colar na borda
    }
  }

  function handleMouseLeave() {
    setDeslocamento(0);
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{ overflow: "hidden", whiteSpace: "nowrap", width: "100%", cursor: "default" }}
    >
      <span
        ref={textoRef}
        style={{
          display: "inline-block",
          color: "#f1ead4",
          fontSize: "11.5pt",
          fontWeight: 700,
          transform: `translateX(${deslocamento}px)`,
          transition: "transform 1.1s ease",
        }}
      >
        {nome}
      </span>
    </div>
  );
}

// 🎯 Pega a hora atual "fixada" em Brasília, não importa o fuso
// configurado no aparelho de quem está acessando. Funciona lendo os
// componentes (ano/mês/dia/hora...) já convertidos pra America/Sao_Paulo
// via Intl.DateTimeFormat, e montando um Date novo com esses valores —
// esse Date resultante pode ser usado normalmente com getDay/getHours/
// setHours/etc, porque todas as comparações da janela de check-in usam
// Dates construídos do mesmo jeito (a base "de verdade" muda, mas as
// comparações relativas entre elas continuam corretas).
function agoraEmBrasilia() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const valor = {};
  partes.forEach((p) => { if (p.type !== "literal") valor[p.type] = p.value; });

  return new Date(
    Number(valor.year), Number(valor.month) - 1, Number(valor.day),
    Number(valor.hour) % 24, Number(valor.minute), Number(valor.second)
  );
}

function calcularJanelaCheckin() {
  const agora = agoraEmBrasilia();
  const diaSemana = agora.getDay(); // 0=Dom, 1=Seg, ..., 5=Sex, 6=Sáb

  let diasDesdeSexta = diaSemana - 5;
  if (diasDesdeSexta < 0) diasDesdeSexta += 7;

  const abertura = new Date(agora);
  abertura.setDate(agora.getDate() - diasDesdeSexta);
  abertura.setHours(18, 0, 0, 0);

  const fechamento = new Date(abertura);
  fechamento.setDate(abertura.getDate() + 1); // sábado seguinte
  fechamento.setHours(15, 30, 0, 0);

  const aindaNaoAbriu = agora < abertura;
  const jaFechou = agora > fechamento;
  const dentroDoPrazo = !aindaNaoAbriu && !jaFechou;

  return { abertura, fechamento, dentroDoPrazo, aindaNaoAbriu, jaFechou };
}

function Agenda() {
  // 🎯 Estado "cru" da rodada — substitui o antigo muralHTML (string
  // pronta) por dados estruturados, que são o que a gente já tinha salvo
  // no Firestore de qualquer forma.
  const [pistas, setPistas] = useState([]);
  const [dadosRodada, setDadosRodada] = useState(null); // { clima, condicao_terreno, cenario, teto_ssr, deck_sorteado }
  const [pacoteLobbiesData, setPacoteLobbiesData] = useState({});
  const [edicaoAtiva, setEdicaoAtiva] = useState(null);

  // 🎯 PARTE 1/4 do Check-in: estados de autenticação, lista de
  // confirmados (em tempo real) e a janela de horário (recalculada a
  // cada 30s pra ficar sempre atual, mesmo sem recarregar a página).
  const [usuarioLogado, setUsuarioLogado] = useState(null);
  const [confirmados, setConfirmados] = useState([]);
  const [janelaCheckin, setJanelaCheckin] = useState(calcularJanelaCheckin());
  const [processandoCheckin, setProcessandoCheckin] = useState(false);

  // 🎯 Equivalente ao antigo ligarVigiaFirebaseMural(): observa em tempo
  // real o documento pistas_sorteadas/atual no Firestore. Dispara de novo
  // sozinho toda vez que o admin sorteia algo novo na tela de Sorteio.
  useEffect(() => {
    const docRef = doc(db, "pistas_sorteadas", "atual");

    const pararDeObservar = onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const dados = snap.data();
          setPistas(dados.pistas || []);
          setDadosRodada({
            clima: dados.clima || "",
            condicao_terreno: dados.condicao_terreno || "",
            cenario: dados.cenario || "",
            teto_ssr: dados.teto_ssr,
            deck_sorteado: dados.deck_sorteado || [],
          });
          setPacoteLobbiesData(dados.pacoteLobbiesData || {});
          setEdicaoAtiva(dados.edicaoAtiva || null);
        } else {
          setPistas([]);
          setDadosRodada(null);
          setPacoteLobbiesData({});
          setEdicaoAtiva(null);
        }
      },
      (erro) => {
        console.error("Erro no streaming de dados do Firebase:", erro);
      }
    );

    return () => pararDeObservar();
  }, []);

  // 🎯 Recalcula a janela de horário a cada 30s. Sem isso, se alguém
  // deixar a página aberta bem no instante em que o prazo abre/fecha
  // (sexta 18h ou sábado 15h30), o botão só atualizaria se a pessoa
  // desse F5 — com o intervalo, atualiza sozinho.
  useEffect(() => {
    const intervalo = setInterval(() => {
      setJanelaCheckin(calcularJanelaCheckin());
    }, 30000);
    return () => clearInterval(intervalo);
  }, []);

  // 🎯 Observa se tem alguém logado (equivalente ao padrão que já usamos
  // no Navbar). Precisamos disso pra saber se mostra "Faça login" ou o
  // botão de confirmar/cancelar de verdade (esse último vem na Parte 2).
  useEffect(() => {
    const pararDeObservar = onAuthStateChanged(auth, (usuario) => {
      setUsuarioLogado(usuario);
    });
    return () => pararDeObservar();
  }, []);

  // 🎯 Observa em tempo real quem já confirmou presença na edição ativa.
  // Cada confirmação é um documento separado (id = uid do treinador) numa
  // subcoleção — assim ninguém consegue confirmar 2x (o próprio ID do
  // documento já impede duplicata) e as Regras de Segurança conseguem
  // garantir que cada um só mexe na própria confirmação.
  useEffect(() => {
    if (!edicaoAtiva) {
      setConfirmados([]);
      return;
    }

    const pararDeObservar = onSnapshot(
      collection(db, "checkins", edicaoAtiva, "confirmados"),
      (snapshot) => {
        const lista = [];
        snapshot.forEach((docSnap) => lista.push({ uid: docSnap.id, ...docSnap.data() }));
        // Mais recentes por último (ordem de chegada)
        lista.sort((a, b) => (a.confirmadoEm?.seconds || 0) - (b.confirmadoEm?.seconds || 0));
        setConfirmados(lista);
      },
      (erro) => {
        console.error("Erro ao observar lista de check-in:", erro);
      }
    );

    return () => pararDeObservar();
  }, [edicaoAtiva]);

  // 🎯 PARTE 2/4 do Check-in: confirma ou cancela de verdade. Pra
  // confirmar, busca nome/foto do próprio documento de treinador (mesma
  // fonte que o Perfil já usa) e grava; pra cancelar, só apaga o próprio
  // documento — o ID do documento sendo o UID já garante que ninguém
  // consegue mexer na confirmação de outra pessoa (reforçado também pelas
  // Regras de Segurança).
  async function alternarCheckin(acao) {
    if (!usuarioLogado || !edicaoAtiva || processandoCheckin) return;

    setProcessandoCheckin(true);
    try {
      const refConfirmacao = doc(db, "checkins", edicaoAtiva, "confirmados", usuarioLogado.uid);

      if (acao === "cancelar") {
        await deleteDoc(refConfirmacao);
      } else {
        const perfilSnap = await getDoc(doc(db, "treinadores", usuarioLogado.uid));
        const dadosPerfil = perfilSnap.exists() ? perfilSnap.data() : {};

        await setDoc(refConfirmacao, {
          nome: dadosPerfil.nomeTreinador || dadosPerfil.usuarioID || "Treinador",
          fotoPerfil: dadosPerfil.fotoPerfil || "default_avatar.png",
          confirmadoEm: serverTimestamp(),
        });
      }
    } catch (erro) {
      console.error("Erro ao atualizar check-in:", erro);
      alert("❌ Não foi possível atualizar sua presença. Tente novamente em instantes.");
    } finally {
      setProcessandoCheckin(false);
    }
  }

  // 🎯 Valores derivados do estado cru da rodada — equivalentes ao que
  // montarMuralCompletoHTML calculava antes de montar a string de HTML.
  const climaEncontrado = dadosRodada
    ? CATALOGO_CLIMA_COMPLETO.find(
        (c) => c.clima.toLowerCase() === (dadosRodada.clima || "").toLowerCase() && c.terreno.toLowerCase() === (dadosRodada.condicao_terreno || "").toLowerCase()
      )
    : null;
  const climaTexto = climaEncontrado ? `${climaEncontrado.emoji} ${climaEncontrado.clima} (${climaEncontrado.terreno})` : "Aguardando...";

  const cenarioNome = dadosRodada?.cenario || "";
  const corCenario = CORES_CENARIO[cenarioNome] || "#c5a059";
  const cenarioEmoji = EMOJI_CENARIO[cenarioNome] || "";
  const cenarioTexto = cenarioEmoji ? `${cenarioEmoji} ${cenarioNome}` : cenarioNome || "Não definido";
  const urlImgCenario = obterUrlCenarioCloudinary(cenarioNome);

  const pistasG1 = pistas.filter((p) => p.grade === "G1");
  const pistasG2G3 = pistas.filter((p) => p.grade !== "G1");

  return (
    <main
      className="main-layout-wrapper"
      style={{ marginTop: "130px", marginBottom: "80px" }}
    >
      <div
        className="hero-content agenda-page-content"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}
      >
        {/* Cabeçalho da Página */}
        <div className="agenda-header" style={{ textAlign: "center", marginBottom: "40px", width: "100%" }}>
          <h2
            className="agenda-main-title"
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: "26pt",
              color: "#c5a059",
              textTransform: "uppercase",
              letterSpacing: "2px",
              marginBottom: "10px",
            }}
          >
            Cronograma da Semana
          </h2>
          <div
            className="agenda-title-divider"
            style={{
              width: "80px",
              height: "2px",
              background: "#c5a059",
              margin: "0 auto 15px auto",
              boxShadow: "0 0 8px #c5a059",
            }}
          ></div>
          <p
            className="agenda-subtitle"
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontSize: "10.5pt",
              color: "#a4b3c6",
              maxWidth: "600px",
              margin: "0 auto",
              lineHeight: 1.6,
            }}
          >
            Confira abaixo as corridas oficiais sorteados e a identificação das salas ativas para a rodada atual.
          </p>
        </div>

        {/* ============================================================ */}
        {/* SEÇÃO DINÂMICA: mostra o mural OU o aviso, nunca os dois       */}
        {/* ============================================================ */}
        {pistas.length > 0 ? (
          <div
            id="secaoCardsImportados"
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}
          >
            <div
              id="containerCardsStream"
              style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}
            >
              <style>{`
                #secaoCardsImportados, .agenda-page-content { max-width: 100% !important; width: 100% !important; }
                #containerCardsStream { max-width: 100% !important; width: 100% !important; padding: 0 20px; box-sizing: border-box; }
                .agenda-pyramid-grid, .agenda-pyramid-top-g1 { display: flex !important; flex-wrap: wrap; gap: 28px !important; justify-content: center; width: 100%; max-width: 1440px; margin: 0 auto 30px auto; }
                .agenda-pyramid-grid .jra-stream-card, .agenda-pyramid-top-g1 .jra-stream-card { flex: 1 1 380px; margin-bottom: 0 !important; }
                @media (max-width: 480px) { .agenda-pyramid-grid .jra-stream-card, .agenda-pyramid-top-g1 .jra-stream-card { flex: 1 1 100%; } }
              `}</style>

              <div className="agenda-pyramid-top-g1">
                {pistasG1.map((pista) => (
                  <PistaCard
                    key={pista.nome}
                    pista={pista}
                    climaTexto={climaTexto}
                    codigoSala={pacoteLobbiesData[`sala-lobby-id-${slugPista(pista.nome)}`]}
                  />
                ))}
              </div>
              <div className="agenda-pyramid-grid">
                {pistasG2G3.map((pista) => (
                  <PistaCard
                    key={pista.nome}
                    pista={pista}
                    climaTexto={climaTexto}
                    codigoSala={pacoteLobbiesData[`sala-lobby-id-${slugPista(pista.nome)}`]}
                  />
                ))}
              </div>

              {/* Cenário de Carreira */}
              <div
                className="scenario-summary-stream-card"
                style={{ width: "100%", maxWidth: "850px", background: "#0d1624", border: `2px solid ${corCenario}66`, borderRadius: "12px", padding: "30px 25px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", margin: "0 auto 30px auto", position: "relative" }}
              >
                <div className="lottery-card-badge badge-gold" style={{ display: "table", margin: "0 auto 15px auto", background: "#c5a059", color: "#0b1320", padding: "4px 14px", fontWeight: 700, fontSize: "8.5pt", borderRadius: "4px", letterSpacing: "0.5px" }}>
                  🗺️ CENÁRIO DE CARREIRA DA RODADA
                </div>
                {urlImgCenario && (
                  <img
                    src={urlImgCenario}
                    alt={cenarioNome}
                    style={{ maxWidth: "160px", width: "100%", height: "auto", display: "block", margin: "0 auto 12px auto", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <h3 style={{ fontFamily: "'Cinzel', serif", color: "#ffffff", fontSize: "20pt", margin: "0 0 10px 0", letterSpacing: "0.5px" }}>{cenarioTexto}</h3>
                <div style={{ width: "50px", height: "3px", background: corCenario, margin: "0 auto 12px auto", borderRadius: "2px", boxShadow: `0 0 8px ${corCenario}88` }}></div>
                <p style={{ fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6", fontSize: "9.5pt", margin: 0, letterSpacing: "0.3px" }}>Este será o cenário para fazer a carreira nesta rodada.</p>
              </div>

              {/* Deck Estratégico */}
              <div
                className="deck-summary-stream-card"
                style={{ width: "100%", maxWidth: "850px", background: "#0d1624", border: "2px solid rgba(197, 160, 89, 0.4)", borderRadius: "12px", padding: "30px 25px", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", margin: "0 auto", position: "relative" }}
              >
                <div className="lottery-card-badge badge-gold" style={{ display: "table", margin: "0 auto 15px auto", background: "#c5a059", color: "#0b1320", padding: "4px 12px", fontWeight: 700, fontSize: "8.5pt", borderRadius: "4px" }}>
                  🃏 DECK ESTRATÉGICO DA RODADA
                </div>
                <h3 style={{ fontFamily: "'Cinzel', serif", color: "#ffffff", fontSize: "15pt", marginBottom: "20px" }}>Support Cards Selecionados</h3>
                <div className="deck-summary-grid-3x2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "20px", maxWidth: "680px", margin: "25px auto", width: "100%" }}>
                  {(dadosRodada?.deck_sorteado || []).map((tipo, idx) => {
                    const imgNome = tipo.toLowerCase().replace("/", "");
                    return (
                      <div key={idx} className="deck-summary-slot" style={{ background: "rgba(11, 19, 32, 0.7)", border: "1px solid rgba(197, 160, 89, 0.3)", borderRadius: "8px", padding: "15px 10px", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <img src={`/assets/img/${imgNome}.png`} alt={tipo} style={{ height: "45px", marginBottom: "8px" }} />
                        <span style={{ fontSize: "10pt", fontWeight: 700, color: "#ffffff", textTransform: "uppercase" }}>{tipo}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Restrição de SSR */}
              <div
                className="ssr-limit-stream-card"
                style={{ width: "100%", maxWidth: "850px", background: "#0d1624", border: "2px solid rgba(197, 160, 89, 0.4)", borderRadius: "12px", padding: "25px", margin: "20px auto 0 auto", boxShadow: "0 10px 30px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px" }}
              >
                <img src="/assets/img/supportcard_rarity_02.png" alt="SSR" style={{ width: "56px", height: "56px", objectFit: "contain", flexShrink: 0, filter: "drop-shadow(0 0 8px rgba(197, 160, 89, 0.35))" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", letterSpacing: "0.5px", color: "#a4b3c6", textTransform: "uppercase" }}>Restrição de SSR</div>
                  <div style={{ fontFamily: "'Cinzel', serif", fontSize: "24pt", fontWeight: 700, color: "#c5a059", letterSpacing: "0.3px", lineHeight: 1.3 }}>
                    Máximo de SSR no deck:<br />{dadosRodada?.teto_ssr || 0} SSR
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================================ */}
            {/* CHECK-IN / CONFIRMAÇÃO DE PRESENÇA — PARTE 1/4               */}
            {/* ============================================================ */}
            {(() => {
              const edicaoNumCheckin = edicaoAtiva ? edicaoAtiva.replace("edicao_", "") : "--";
              const jaConfirmado = usuarioLogado ? confirmados.some((c) => c.uid === usuarioLogado.uid) : false;

              let configBotao;
              if (!usuarioLogado) {
                configBotao = { texto: "Faça login para confirmar sua presença", cor: "#5f758e", corBorda: "rgba(95, 117, 142, 0.4)", desabilitado: true };
              } else if (janelaCheckin.aindaNaoAbriu) {
                configBotao = { texto: "🔒 Inscrições Abrem na Sexta às 18h", cor: "#5f758e", corBorda: "rgba(95, 117, 142, 0.4)", desabilitado: true };
              } else if (janelaCheckin.jaFechou) {
                configBotao = { texto: "🔒 Inscrições Encerradas", cor: "#5f758e", corBorda: "rgba(95, 117, 142, 0.4)", desabilitado: true };
              } else if (jaConfirmado) {
                configBotao = { texto: "🔴 CANCELAR PRESENÇA", cor: "#ff6855", corBorda: "#ff6855", desabilitado: false, acao: "cancelar" };
              } else {
                configBotao = { texto: "🟢 CONFIRMAR PRESENÇA", cor: "#1bd39e", corBorda: "#1bd39e", desabilitado: false, acao: "confirmar" };
              }

              function formatarConfirmacao(timestamp) {
                if (!timestamp) return "";
                const data = new Date(timestamp.seconds * 1000);
                const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                const horas = String(data.getHours()).padStart(2, "0");
                const minutos = String(data.getMinutes()).padStart(2, "0");
                return `${dias[data.getDay()]}, ${horas}:${minutos}`;
              }

              return (
                <div
                  style={{
                    width: "100%",
                    maxWidth: "850px",
                    background: "rgba(11, 19, 32, 0.85)",
                    border: "1px solid rgba(197, 160, 89, 0.4)",
                    borderRadius: "16px",
                    padding: "35px 30px",
                    boxSizing: "border-box",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(197, 160, 89, 0.08)",
                  }}
                >
                  {/* Cabeçalho */}
                  <div style={{ textAlign: "center", marginBottom: "25px" }}>
                    <h3 style={{ fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "16pt", fontWeight: 700, margin: "0 0 8px 0", letterSpacing: "0.5px" }}>
                      🎟️ CONFIRMAÇÃO DE PRESENÇA — EDIÇÃO {edicaoNumCheckin}
                    </h3>
                    <p style={{ fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6", fontSize: "9.5pt", margin: 0 }}>
                      Inscrições abrem Sexta 18h e fecham Sábado às 15:30.
                    </p>
                  </div>

                  {/* Botão de ação */}
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: "25px" }}>
                    <button
                      type="button"
                      disabled={configBotao.desabilitado || processandoCheckin}
                      onClick={() => configBotao.acao && alternarCheckin(configBotao.acao)}
                      style={{
                        width: "80%",
                        maxWidth: "480px",
                        padding: "14px",
                        borderRadius: "50px",
                        background: "#0b1320",
                        border: `2px solid ${configBotao.corBorda}`,
                        color: configBotao.cor,
                        fontFamily: "'Montserrat', sans-serif",
                        fontSize: "10pt",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        cursor: configBotao.desabilitado || processandoCheckin ? "not-allowed" : "pointer",
                        transition: "all 0.2s ease",
                        opacity: processandoCheckin ? 0.6 : 1,
                      }}
                    >
                      {processandoCheckin ? "⏳ PROCESSANDO..." : configBotao.texto}
                    </button>
                  </div>

                  {/* Divisor */}
                  <div style={{ width: "100%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(197, 160, 89, 0.4), transparent)", marginBottom: "25px" }}></div>

                  {/* Lista de participantes */}
                  <div style={{ textAlign: "center", marginBottom: "18px" }}>
                    <span style={{ fontFamily: "'Montserrat', sans-serif", color: "#f1ead4", fontSize: "10.5pt", fontWeight: 700, letterSpacing: "0.5px" }}>
                      🏁 PARTICIPANTES CONFIRMADOS ({confirmados.length})
                    </span>
                  </div>

                  {confirmados.length === 0 ? (
                    <p style={{ textAlign: "center", color: "#5f758e", fontSize: "9.5pt", fontStyle: "italic", margin: 0 }}>
                      Ninguém confirmou presença ainda.
                    </p>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "14px" }}>
                      {confirmados.map((c) => (
                        <div
                          key={c.uid}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            minWidth: 0,
                            background: "rgba(13, 22, 36, 0.6)",
                            border: "1px solid rgba(197, 160, 89, 0.2)",
                            borderLeft: "3px solid #c5a059",
                            borderRadius: "10px",
                            padding: "12px 16px",
                            boxSizing: "border-box",
                            transition: "border-color 0.2s ease",
                          }}
                        >
                          <img
                            src={obterUrlAvatarCloudinary(c.fotoPerfil || "default_avatar.png")}
                            alt={c.nome}
                            style={{ width: "48px", height: "48px", borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(197, 160, 89, 0.5)", flexShrink: 0 }}
                            onError={(e) => { e.currentTarget.src = "https://placehold.co/48x48/0e1726/c5a059?text=🐎"; }}
                          />
                          <div style={{ minWidth: 0, overflow: "hidden", flex: 1 }}>
                            <NomeComLetreiro nome={c.nome} />
                            <div style={{ color: "#5f758e", fontSize: "8.5pt", marginTop: "2px" }}>
                              <i className="fa-regular fa-clock" style={{ marginRight: "4px" }}></i>
                              {formatarConfirmacao(c.confirmadoEm)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ============================================================ */}
            {/* GRUPOS A/B — só aparece depois que o admin já ENVIOU pelo     */}
            {/* menos 1 código de sala com sufixo de grupo no Passo 3/4 do    */}
            {/* Sorteio — dividir os grupos sozinho não é suficiente, senão a */}
            {/* seção apareceria pra galera antes de ter qualquer código pra  */}
            {/* mostrar.                                                      */}
            {/* ============================================================ */}
            {confirmados.some((c) => c.grupo) &&
              Object.keys(pacoteLobbiesData).some((chave) => chave.endsWith("-A") || chave.endsWith("-B")) && (
              <div
                style={{
                  width: "100%",
                  maxWidth: "850px",
                  background: "rgba(11, 19, 32, 0.85)",
                  border: "1px solid rgba(197, 160, 89, 0.4)",
                  borderRadius: "16px",
                  padding: "35px 30px",
                  boxSizing: "border-box",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(197, 160, 89, 0.08)",
                }}
              >
                <div style={{ textAlign: "center", marginBottom: "25px" }}>
                  <h3 style={{ fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "16pt", fontWeight: 700, margin: "0 0 8px 0", letterSpacing: "0.5px" }}>
                    🅰️🅱️ GRUPOS DA RODADA
                  </h3>
                  <p style={{ fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6", fontSize: "9.5pt", margin: 0 }}>
                    Como passamos de 14 confirmados, dividimos aleatoriamente em 2 grupos — cada um com sua própria sala em cada corrida.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px" }}>
                  {["A", "B"].map((letra) => {
                    const participantesGrupo = confirmados.filter((c) => c.grupo === letra);
                    const corridasDoGrupo = [...pistasG1, ...pistasG2G3];
                    return (
                      <div
                        key={letra}
                        style={{ background: "rgba(13, 22, 36, 0.6)", border: "1px solid rgba(197, 160, 89, 0.25)", borderRadius: "12px", padding: "20px", boxSizing: "border-box" }}
                      >
                        <h4 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt", fontWeight: 700, margin: "0 0 14px 0", textAlign: "center" }}>
                          Grupo {letra} <span style={{ color: "#a4b3c6", fontSize: "9.5pt", fontWeight: 400 }}>({participantesGrupo.length})</span>
                        </h4>

                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                          {corridasDoGrupo.map((pista) => {
                            const codigo = pacoteLobbiesData[`sala-lobby-id-${slugPista(pista.nome)}-${letra}`];
                            if (!codigo) return null;
                            return (
                              <div key={pista.nome}>
                                <p style={{ fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6", fontSize: "8.5pt", margin: "0 0 4px 0" }}>{pista.nome}</p>
                                <RoomCodeBanner codigo={codigo} />
                              </div>
                            );
                          })}
                        </div>

                        {participantesGrupo.length === 0 ? (
                          <p style={{ textAlign: "center", color: "#5f758e", fontSize: "9pt", fontStyle: "italic", margin: 0 }}>Ninguém nesse grupo.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {participantesGrupo.map((c) => (
                              <div key={c.uid} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <img
                                  src={obterUrlAvatarCloudinary(c.fotoPerfil || "default_avatar.png")}
                                  alt={c.nome}
                                  style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(197, 160, 89, 0.4)", flexShrink: 0 }}
                                  onError={(e) => { e.currentTarget.src = "https://placehold.co/26x26/0e1726/c5a059?text=🐎"; }}
                                />
                                <span style={{ color: "#f1ead4", fontSize: "9pt", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            id="avisoSemRodada"
            style={{
              textAlign: "center",
              padding: "60px 20px",
              background: "rgba(13, 22, 36, 0.4)",
              border: "1px dashed rgba(197, 160, 89, 0.2)",
              borderRadius: "12px",
              width: "100%",
              maxWidth: "850px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ fontSize: "32pt", marginBottom: "15px" }}>🏁</div>
            <h3 style={{ fontFamily: "'Cinzel', serif", color: "#ffffff", fontSize: "14pt", marginBottom: "8px" }}>
              Nenhuma Corrida Ativa
            </h3>
            <p style={{ fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6", fontSize: "10pt", margin: 0 }}>
              Aguardando o início do sorteio de cenários pela equipe técnica no estúdio.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

export default Agenda;