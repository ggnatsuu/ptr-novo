import { useEffect, useRef, useState } from "react";
import { doc, collection, onSnapshot, setDoc, deleteDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../config/firebase";
import { obterUrlAvatarCloudinary } from "../utils/cloudinary";
import { ModalDiagramaPista, courseIdDaPista } from "./BuscadorPistas";
import MinimapaPista from "../components/MinimapaPista";

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
    <button type="button" onClick={copiar} title="Copiar código da sala" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", boxSizing: "border-box", background: "rgba(197, 160, 89, 0.08)", border: "1px dashed rgba(197, 160, 89, 0.45)", borderRadius: "8px", padding: "8px 12px", cursor: "pointer", fontFamily: "'Montserrat', sans-serif" }}>
      <span style={{ color: "#c5a059", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}><i className="fa-solid fa-key"></i> Sala</span>
      <span style={{ flex: 1, textAlign: "left", color: "#f1ead4", fontSize: "12pt", fontWeight: 800, letterSpacing: "1.5px" }}>{codigo}</span>
      <span style={{ color: copiado ? "#7fd08a" : "#c5a059", fontSize: "8pt", fontWeight: 800 }}>
        <i className={`fa-solid ${copiado ? "fa-check" : "fa-copy"}`}></i> {copiado ? "Copiado" : "Copiar"}
      </span>
    </button>
  );
}

// 🎯 Card de uma pista — mesmo visual de sempre (imagem do hipódromo,
// badge de grade, chips de local/distância/piso/direção/clima), só que
// desenhado em JSX puro em vez de vir dentro da string de HTML.
// Fita oficial da grade (imagens do jogo em public/assets/img).
const FITA_GRADE = { G1: "utx_txt_grade_ribbon_05.png", G2: "utx_txt_grade_ribbon_04.png", G3: "utx_txt_grade_ribbon_03.png" };

// Formato que o modal/busca de percurso do Buscador esperam.
function pistaNoFormatoBuscador(pista) {
  return {
    nome: pista.nome,
    hipodromo: pista.hipodromo,
    terrenoCurto: pista.terreno,
    distanciaNumero: pista.distancia_numero,
    distanciaCategoria: pista.distancia_tipo,
    direcao: pista.direcao,
    course_id: pista.course_id,
  };
}

function PistaCard({ pista, climaTexto, codigoSala, aoAbrirDiagrama }) {
  const sentidoVisivel = pista.direcao === "Left" ? "Esquerda" : pista.direcao === "Right" ? "Direita" : "Reta";
  const nomeImgHipodromo = (pista.hipodromo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ehG1 = pista.grade === "G1";
  const courseId = pista.course_id ?? courseIdDaPista(pistaNoFormatoBuscador(pista));
  // Ícones coloridos com as mesmas cores dos blocos do topo (e do Guia do Meta)
  const ehDirt = /dirt/i.test(pista.terreno || "");
  const climaBase = (climaTexto || "").split(" ")[0];
  const chips = [
    { icone: "fa-location-dot", cor: "#c5a059", texto: pista.hipodromo },
    { icone: "fa-ruler-horizontal", cor: "#5fa8e8", texto: `${pista.distancia_numero}m`, extra: pista.distancia_tipo },
    { icone: ehDirt ? "fa-mountain" : "fa-seedling", cor: ehDirt ? "#c48a55" : "#4fc76a", texto: pista.terreno },
    { icone: pista.direcao === "Left" ? "fa-rotate-left" : pista.direcao === "Right" ? "fa-rotate-right" : "fa-arrow-up", cor: "#a98be0", texto: sentidoVisivel },
    { icone: { Sunny: "fa-sun", Cloudy: "fa-cloud", Rainy: "fa-cloud-rain", Snowy: "fa-snowflake" }[climaBase] ?? "fa-cloud-sun", cor: { Sunny: "#f3d27a", Cloudy: "#b8c4d4", Rainy: "#5fa8e8", Snowy: "#d9eefc" }[climaBase] ?? "#a4b3c6", texto: climaTexto },
  ];

  return (
    <div className="agenda-corrida-card" style={{ background: "#0d1624", border: `1px solid ${ehG1 ? "rgba(197, 160, 89, 0.45)" : "rgba(164, 179, 198, 0.12)"}`, borderRadius: "12px", overflow: "hidden", fontFamily: "'Montserrat', sans-serif", display: "flex", flexDirection: "column", boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
      {/* Imagem do hipódromo com nome por cima */}
      <div style={{ position: "relative", height: "150px" }}>
        <img src={`/assets/img/hipodromos/${nomeImgHipodromo}.png`} alt={pista.hipodromo} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(13, 22, 36, 0.1) 30%, #0d1624 100%)" }} />
        {FITA_GRADE[pista.grade]
          ? <img src={`/assets/img/${FITA_GRADE[pista.grade]}`} alt={pista.grade} style={{ position: "absolute", top: "10px", left: 0, height: "22px", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" }} />
          : <span style={{ position: "absolute", top: "10px", left: "10px", background: "rgba(11, 19, 32, 0.85)", color: "#f1ead4", borderRadius: "6px", padding: "3px 9px", fontSize: "8.5pt", fontWeight: 900 }}>{pista.grade}</span>}
        <h4 style={{ position: "absolute", left: "16px", right: "16px", bottom: "8px", margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "14pt", fontWeight: 700, lineHeight: 1.2, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>{pista.nome}</h4>
      </div>

      <div style={{ padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: "12px", flex: 1 }}>
        <RoomCodeBanner codigo={codigoSala} />
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" }}>
            {chips.map((c) => (
              <span key={c.texto + c.icone} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: `linear-gradient(135deg, ${c.cor}14, #0b1320 80%)`, border: `1px solid ${c.cor}33`, borderRadius: "7px", padding: "4px 9px", color: "#f1ead4", fontSize: "8.5pt", fontWeight: 700, whiteSpace: "nowrap" }}>
                <i className={`fa-solid ${c.icone}`} style={{ color: c.cor, fontSize: "8pt" }}></i> {c.texto}
                {c.extra && <em style={{ fontStyle: "normal", color: "#8193a8", fontWeight: 600 }}>{c.extra}</em>}
              </span>
            ))}
          </div>
          {courseId && (
            <div style={{ flex: "0 0 130px" }}>
              <MinimapaPista courseId={String(courseId)} marcadores={[]} />
            </div>
          )}
        </div>
        <button type="button" onClick={aoAbrirDiagrama} style={{ marginTop: "auto", width: "100%", background: "rgba(197, 160, 89, 0.08)", border: "1px solid rgba(197, 160, 89, 0.4)", borderRadius: "8px", padding: "9px 12px", color: "#c5a059", fontFamily: "inherit", fontSize: "9pt", fontWeight: 800, cursor: "pointer" }}>
          <i className="fa-solid fa-chart-area"></i> Diagrama da Pista
        </button>
      </div>

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

  let diasDesdeQuarta = diaSemana - 3;
  if (diasDesdeQuarta < 0) diasDesdeQuarta += 7;

  const abertura = new Date(agora);
  abertura.setDate(agora.getDate() - diasDesdeQuarta);
  abertura.setHours(18, 0, 0, 0);

  const fechamento = new Date(abertura);
  fechamento.setDate(abertura.getDate() + 3); // sábado seguinte
  fechamento.setHours(15, 30, 0, 0);

  const aindaNaoAbriu = agora < abertura;
  const jaFechou = agora > fechamento;
  const dentroDoPrazo = !aindaNaoAbriu && !jaFechou;

  // Já fechou nesta semana: a próxima abertura é a quarta seguinte.
  const proximaAbertura = new Date(abertura);
  if (jaFechou) proximaAbertura.setDate(abertura.getDate() + 7);

  return { agora, abertura, proximaAbertura, fechamento, dentroDoPrazo, aindaNaoAbriu, jaFechou };
}

// "2d 4h", "3h 12min", "8min"
function formatarFalta(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m}min`;
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
  const [listaConfirmadosAberta, setListaConfirmadosAberta] = useState(false);
  const [pistaTeste, setPistaTeste] = useState(null); // corrida aberta no modal do diagrama
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
            estacao: dados.estacao || "",
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
  // (quarta 18h ou sábado 15h30), o botão só atualizaria se a pessoa
  // desse F5 — com o intervalo, atualiza sozinho.
  useEffect(() => {
    const intervalo = setInterval(() => {
      setJanelaCheckin(calcularJanelaCheckin());
    }, 15000);
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
    if (!edicaoAtiva) return undefined;

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

  const cenarioNome = dadosRodada?.cenario || "";
  const corCenario = CORES_CENARIO[cenarioNome] || "#c5a059";
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
        <div style={{ width: "calc(100% - 40px)", maxWidth: "1100px", margin: "0 auto 28px", boxSizing: "border-box", fontFamily: "'Montserrat', sans-serif" }}>
          <div style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase" }}>
            <i className="fa-solid fa-calendar-days"></i> Agenda{edicaoAtiva ? ` · Edição ${edicaoAtiva.replace("edicao_", "")}` : ""}
          </div>
          <h1 style={{ margin: "4px 0 12px", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "24pt" }}>Cronograma da Semana</h1>
          {/* Condições da rodada em blocos, no mesmo estilo do Guia do Meta */}
          {pistas.length > 0 && (() => {
            const estacao = (dadosRodada?.estacao || "").charAt(0).toUpperCase() + (dadosRodada?.estacao || "").slice(1);
            const clima = climaEncontrado?.clima || dadosRodada?.clima || "";
            const condicao = climaEncontrado?.terreno || dadosRodada?.condicao_terreno || "";
            const blocos = [
              [{ Spring: "fa-spa", Summer: "fa-sun", Fall: "fa-leaf", Winter: "fa-snowflake" }[estacao] ?? "fa-calendar", "Estação", estacao, { Spring: "#f59ac0", Summer: "#f0a040", Fall: "#e07a3a", Winter: "#8fd3f4" }[estacao] ?? "#a4b3c6"],
              [{ Sunny: "fa-sun", Cloudy: "fa-cloud", Rainy: "fa-cloud-rain", Snowy: "fa-snowflake" }[clima] ?? "fa-cloud-sun", "Clima", clima, { Sunny: "#f3d27a", Cloudy: "#b8c4d4", Rainy: "#5fa8e8", Snowy: "#d9eefc" }[clima] ?? "#a4b3c6"],
              ["fa-droplet", "Condição", condicao, { Firm: "#4fc76a", Good: "#a5d65a", Soft: "#f0a040", Heavy: "#e85d5d" }[condicao] ?? "#a4b3c6"],
              ["fa-map", "Cenário", cenarioNome, corCenario],
              ["fa-flag-checkered", "Corridas", String(pistas.length), "#c5a059"],
              ["fa-gem", "Máx. SSR", String(dadosRodada?.teto_ssr ?? 0), "#c39bff"],
            ];
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "10px" }}>
                {blocos.map(([icone, rotulo, valor, cor]) => (
                  <div key={rotulo} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: `linear-gradient(135deg, ${cor}14, #0b1320 75%)`, border: `1px solid ${cor}33`, borderRadius: "10px", minWidth: 0 }}>
                    <span style={{ width: "38px", height: "38px", flexShrink: 0, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: `${cor}22`, border: `1px solid ${cor}55`, boxShadow: `0 0 12px ${cor}22` }}>
                      <i className={`fa-solid ${icone}`} style={{ color: cor, fontSize: "14pt" }}></i>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>{rotulo}</div>
                      <div style={{ color: valor ? "#f1ead4" : "#5f758e", fontSize: "11.5pt", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{valor || "A definir"}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>

        {/* ============================================================ */}
        {/* SEÇÃO DINÂMICA: mostra o mural OU o aviso, nunca os dois       */}
        {/* ============================================================ */}
        {pistas.length > 0 ? (
          <div
            id="secaoCardsImportados"
            style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}
          >
            {/* CHECK-IN — no topo: é o que a galera procura primeiro */}
            {(() => {
              const edicaoNumCheckin = edicaoAtiva ? edicaoAtiva.replace("edicao_", "") : "--";
              const jaConfirmado = usuarioLogado ? confirmados.some((c) => c.uid === usuarioLogado.uid) : false;
              const faltaFechar = janelaCheckin.fechamento - janelaCheckin.agora;
              const status = !janelaCheckin.dentroDoPrazo
                ? { texto: `Abre em ${formatarFalta(janelaCheckin.proximaAbertura - janelaCheckin.agora)}`, cor: "#8193a8", icone: "fa-lock" }
                : faltaFechar < 3600000
                  ? { texto: `Fecha em ${formatarFalta(faltaFechar)}`, cor: "#f0a040", icone: "fa-hourglass-half" }
                  : { texto: `Aberto · fecha em ${formatarFalta(faltaFechar)}`, cor: "#7fd08a", icone: "fa-door-open" };

              let configBotao;
              if (!usuarioLogado) configBotao = { texto: "Faça login para confirmar", cor: "#5f758e", desabilitado: true, icone: "fa-right-to-bracket" };
              else if (!janelaCheckin.dentroDoPrazo) configBotao = { texto: janelaCheckin.aindaNaoAbriu ? "Ainda não abriu" : "Encerrado", cor: "#5f758e", desabilitado: true, icone: "fa-lock" };
              else if (jaConfirmado) configBotao = { texto: "Cancelar presença", cor: "#e8806f", desabilitado: false, acao: "cancelar", icone: "fa-xmark" };
              else configBotao = { texto: "Confirmar presença", cor: "#1bd39e", desabilitado: false, acao: "confirmar", icone: "fa-check" };

              function formatarConfirmacao(timestamp) {
                if (!timestamp) return "";
                const data = new Date(timestamp.seconds * 1000);
                const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
                return `${dias[data.getDay()]}, ${String(data.getHours()).padStart(2, "0")}:${String(data.getMinutes()).padStart(2, "0")}`;
              }
              const desabilitado = configBotao.desabilitado || processandoCheckin;

              return (
                <div style={{ width: "100%", maxWidth: "1100px", background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.1)", borderLeft: `4px solid ${status.cor}`, borderRadius: "12px", padding: "16px 20px", boxSizing: "border-box", fontFamily: "'Montserrat', sans-serif" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "14px 22px" }}>
                    <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                      <div style={{ color: "#8193a8", fontSize: "8.5pt", fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                        <i className="fa-solid fa-ticket" style={{ color: "#c5a059" }}></i> Check-in · Edição {edicaoNumCheckin}
                      </div>
                      <div style={{ marginTop: "6px", color: status.cor, fontSize: "11pt", fontWeight: 800 }}>
                        <i className={`fa-solid ${status.icone}`}></i> {status.texto}
                      </div>
                      <div style={{ color: "#5f758e", fontSize: "8pt", marginTop: "2px" }}>Inscrições: quarta 18h → sábado 15:30</div>
                    </div>

                    {/* Pílula: avatares + contagem numa linha só (estilos zerados pra não herdar o CSS global de botão) */}
                    <button type="button" onClick={() => setListaConfirmadosAberta((v) => !v)} disabled={confirmados.length === 0} title="Ver quem confirmou" style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.14)", borderRadius: "999px", padding: "5px 14px 5px 6px", margin: 0, outline: "none", boxShadow: "none", cursor: confirmados.length ? "pointer" : "default", fontFamily: "inherit", lineHeight: 1 }}>
                      {confirmados.length > 0 && (
                        <div style={{ display: "flex" }}>
                          {confirmados.slice(0, 6).map((c, i) => (
                            <img key={c.uid} src={obterUrlAvatarCloudinary(c.fotoPerfil || "default_avatar.png")} alt="" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", border: "2px solid #0b1320", marginLeft: i ? "-9px" : 0 }} onError={(e) => { e.currentTarget.src = "https://placehold.co/30x30/0e1726/c5a059?text=🐎"; }} />
                          ))}
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "baseline", gap: "5px", whiteSpace: "nowrap" }}>
                        <strong style={{ color: "#f1ead4", fontSize: "13pt", fontWeight: 800 }}>{confirmados.length}</strong>
                        <small style={{ color: "#8193a8", fontSize: "8.5pt", fontWeight: 700 }}>confirmado{confirmados.length === 1 ? "" : "s"}</small>
                      </div>
                      {confirmados.length > 0 && <i className={`fa-solid fa-chevron-${listaConfirmadosAberta ? "up" : "down"}`} style={{ color: "#8193a8", fontSize: "8pt" }}></i>}
                    </button>

                    <button
                      type="button"
                      disabled={desabilitado}
                      onClick={() => configBotao.acao && alternarCheckin(configBotao.acao)}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "11px 22px", borderRadius: "999px", background: desabilitado ? "transparent" : `${configBotao.cor}1f`, border: `1.5px solid ${configBotao.cor}`, color: configBotao.cor, fontFamily: "inherit", fontSize: "9.5pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", cursor: desabilitado ? "not-allowed" : "pointer", opacity: processandoCheckin ? 0.6 : 1 }}
                    >
                      <i className={`fa-solid ${processandoCheckin ? "fa-circle-notch fa-spin" : configBotao.icone}`}></i>
                      {processandoCheckin ? "Processando..." : configBotao.texto}
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", marginTop: "14px", padding: "10px 12px", background: "rgba(197, 160, 89, 0.06)", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", color: "#a4b3c6", fontSize: "8.5pt", lineHeight: 1.5 }}>
                    <i className="fa-solid fa-circle-info" style={{ color: "#c5a059", marginTop: "3px" }}></i>
                    <span>
                      O check-in é uma <strong style={{ color: "#f1ead4" }}>declaração de intenção</strong> de correr a PTR. <strong style={{ color: "#f1ead4" }}>Não precisa ter a personagem pronta</strong> para se inscrever.
                      Se não puder correr no dia, é só <strong style={{ color: "#f1ead4" }}>cancelar o check-in</strong>.
                    </span>
                  </div>

                  {listaConfirmadosAberta && confirmados.length > 0 && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "8px", marginTop: "16px", paddingTop: "14px", borderTop: "1px solid rgba(164, 179, 198, 0.08)" }}>
                      {confirmados.map((c) => (
                        <div key={c.uid} style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "8px", padding: "8px 10px" }}>
                          <img src={obterUrlAvatarCloudinary(c.fotoPerfil || "default_avatar.png")} alt={c.nome} style={{ width: "34px", height: "34px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid rgba(197, 160, 89, 0.5)", flexShrink: 0 }} onError={(e) => { e.currentTarget.src = "https://placehold.co/34x34/0e1726/c5a059?text=🐎"; }} />
                          <div style={{ minWidth: 0, overflow: "hidden", flex: 1 }}>
                            <NomeComLetreiro nome={c.nome} />
                            <div style={{ color: "#5f758e", fontSize: "7.5pt", marginTop: "1px" }}><i className="fa-regular fa-clock"></i> {formatarConfirmacao(c.confirmadoEm)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <div
              id="containerCardsStream"
              style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "40px" }}
            >
              <style>{`
                #secaoCardsImportados, .agenda-page-content { max-width: 100% !important; width: 100% !important; }
                #containerCardsStream { max-width: 100% !important; width: 100% !important; padding: 0 20px; box-sizing: border-box; }
                /* G1 numa linha, G2/G3 na de baixo — mesma grade de 2 colunas pra alinhar */
                .agenda-corridas-grid { display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 1100px; margin: 0 auto; }
                .agenda-corridas-grid > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
                .agenda-corridas-grid > div:first-child { grid-template-columns: 1fr; } /* G1 na largura toda */
                @media (max-width: 720px) { .agenda-corridas-grid > div { grid-template-columns: 1fr; } }
              `}</style>

              <div className="agenda-corridas-grid">
              <div>
                {pistasG1.map((pista) => (
                  <PistaCard
                    key={pista.nome}
                    pista={pista}
                    climaTexto={climaEncontrado ? `${climaEncontrado.clima} (${climaEncontrado.terreno})` : "A definir"}
                    codigoSala={pacoteLobbiesData[`sala-lobby-id-${slugPista(pista.nome)}`]}
                    aoAbrirDiagrama={() => setPistaTeste(pista)}
                  />
                ))}
              </div>
              <div>
                {pistasG2G3.map((pista) => (
                  <PistaCard
                    key={pista.nome}
                    pista={pista}
                    climaTexto={climaEncontrado ? `${climaEncontrado.clima} (${climaEncontrado.terreno})` : "A definir"}
                    codigoSala={pacoteLobbiesData[`sala-lobby-id-${slugPista(pista.nome)}`]}
                    aoAbrirDiagrama={() => setPistaTeste(pista)}
                  />
                ))}
              </div>

              </div>

              {/* Regras da rodada: cenário, deck e limite de SSR */}
              <div style={{ width: "100%", maxWidth: "1100px", background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "12px", padding: "18px 20px", boxSizing: "border-box", fontFamily: "'Montserrat', sans-serif" }}>
                <div style={{ color: "#8193a8", fontSize: "8.5pt", fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", marginBottom: "14px" }}>
                  <i className="fa-solid fa-scroll" style={{ color: "#c5a059" }}></i> Regras da rodada
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px" }}>
                  {/* Cenário */}
                  <div style={{ background: "#0b1320", border: `1px solid ${corCenario}55`, borderTop: `3px solid ${corCenario}`, borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", textAlign: "center" }}>
                    <span style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>Cenário de carreira</span>
                    {urlImgCenario
                      ? <img src={urlImgCenario} alt={cenarioNome} style={{ maxWidth: "120px", width: "100%", height: "auto" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      : <i className="fa-solid fa-dice" style={{ fontSize: "30pt", color: corCenario }}></i>}
                    <span style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt", fontWeight: 700 }}>{cenarioNome || "Não definido"}</span>
                  </div>
                  {/* Deck */}
                  <div style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>Deck da rodada</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", width: "100%" }}>
                      {(dadosRodada?.deck_sorteado || []).map((tipo, idx) => (
                        <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "8px", padding: "8px 4px" }}>
                          <img src={`/assets/img/${tipo.toLowerCase().replace("/", "")}.png`} alt={tipo} style={{ height: "30px" }} />
                          <span style={{ fontSize: "7.5pt", fontWeight: 800, color: "#f1ead4", textTransform: "uppercase" }}>{tipo}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Limite de SSR */}
                  <div style={{ background: "#0b1320", border: "1px solid rgba(197, 160, 89, 0.3)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", textAlign: "center" }}>
                    <span style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>Máximo de SSR no deck</span>
                    <img src="/assets/img/supportcard_rarity_02.png" alt="SSR" style={{ width: "44px", height: "44px", objectFit: "contain" }} />
                    <span style={{ fontFamily: "'Cinzel', serif", color: "#c5a059", fontSize: "26pt", fontWeight: 700, lineHeight: 1 }}>{dadosRodada?.teto_ssr || 0}</span>
                  </div>
                </div>
              </div>
            </div>


            {/* ============================================================ */}
            {/* GRUPOS A/B — só aparece depois que o admin já ENVIOU pelo     */}
            {/* menos 1 código de sala com sufixo de grupo no Passo 3/4 do    */}
            {/* Sorteio — dividir os grupos sozinho não é suficiente, senão a */}
            {/* seção apareceria pra galera antes de ter qualquer código pra  */}
            {/* mostrar.                                                      */}
            {/* ============================================================ */}
            {confirmados.some((c) => c.grupo) &&
              Object.keys(pacoteLobbiesData).some((chave) => chave.endsWith("-A") || chave.endsWith("-B")) && (
              <div style={{ width: "100%", maxWidth: "1100px", background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "12px", padding: "18px 20px", boxSizing: "border-box", fontFamily: "'Montserrat', sans-serif" }}>
                <div style={{ color: "#8193a8", fontSize: "8.5pt", fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase" }}>
                  <i className="fa-solid fa-people-group" style={{ color: "#c5a059" }}></i> Grupos da rodada
                </div>
                <p style={{ margin: "6px 0 16px", color: "#5f758e", fontSize: "8.5pt" }}>
                  Passamos de 14 confirmados: a galera foi dividida em 2 grupos, cada um com sua sala em cada corrida.
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px" }}>
                  {["A", "B"].map((letra) => {
                    const participantesGrupo = confirmados.filter((c) => c.grupo === letra);
                    const meuGrupo = usuarioLogado && participantesGrupo.some((c) => c.uid === usuarioLogado.uid);
                    const corridasDoGrupo = [...pistasG1, ...pistasG2G3];
                    return (
                      <div key={letra} style={{ background: "#0b1320", border: `1px solid ${meuGrupo ? "rgba(197, 160, 89, 0.55)" : "rgba(164, 179, 198, 0.12)"}`, borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ width: "34px", height: "34px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", background: meuGrupo ? "linear-gradient(135deg, #f3d27a, #c5a059)" : "rgba(197, 160, 89, 0.12)", color: meuGrupo ? "#0b1320" : "#c5a059", fontFamily: "'Cinzel', serif", fontSize: "15pt", fontWeight: 700 }}>{letra}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "12pt", fontWeight: 700 }}>Grupo {letra}</div>
                            <div style={{ color: "#8193a8", fontSize: "8pt", fontWeight: 700 }}>{participantesGrupo.length} participante{participantesGrupo.length === 1 ? "" : "s"}</div>
                          </div>
                          {meuGrupo && <span style={{ background: "rgba(197, 160, 89, 0.12)", border: "1px solid rgba(197, 160, 89, 0.45)", color: "#c5a059", borderRadius: "999px", padding: "3px 10px", fontSize: "7.5pt", fontWeight: 800, textTransform: "uppercase" }}>Seu grupo</span>}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {corridasDoGrupo.map((pista) => {
                            const codigo = pacoteLobbiesData[`sala-lobby-id-${slugPista(pista.nome)}-${letra}`];
                            if (!codigo) return null;
                            return (
                              <div key={pista.nome}>
                                <div style={{ color: "#8193a8", fontSize: "8pt", fontWeight: 700, margin: "0 0 4px" }}>{FITA_GRADE[pista.grade] && <img src={`/assets/img/${FITA_GRADE[pista.grade]}`} alt={pista.grade} style={{ height: "13px", verticalAlign: "middle", marginRight: "6px" }} />}{pista.nome}</div>
                                <RoomCodeBanner codigo={codigo} />
                              </div>
                            );
                          })}
                        </div>

                        {participantesGrupo.length === 0 ? (
                          <p style={{ textAlign: "center", color: "#5f758e", fontSize: "8.5pt", fontStyle: "italic", margin: 0 }}>Ninguém nesse grupo.</p>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "6px", paddingTop: "12px", borderTop: "1px solid rgba(164, 179, 198, 0.08)" }}>
                            {participantesGrupo.map((c) => (
                              <div key={c.uid} style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                                <img
                                  src={obterUrlAvatarCloudinary(c.fotoPerfil || "default_avatar.png")}
                                  alt={c.nome}
                                  style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", border: `1.5px solid ${usuarioLogado?.uid === c.uid ? "#c5a059" : "rgba(164, 179, 198, 0.25)"}`, flexShrink: 0 }}
                                  onError={(e) => { e.currentTarget.src = "https://placehold.co/26x26/0e1726/c5a059?text=🐎"; }}
                                />
                                <span style={{ color: "#f1ead4", fontSize: "8.5pt", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nome}</span>
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
          <div id="avisoSemRodada" style={{ textAlign: "center", padding: "50px 20px", background: "#0d1624", border: "1px dashed rgba(197, 160, 89, 0.25)", borderRadius: "12px", width: "100%", maxWidth: "1100px", boxSizing: "border-box", fontFamily: "'Montserrat', sans-serif" }}>
            <i className="fa-solid fa-flag-checkered" style={{ color: "#c5a059", fontSize: "26pt", marginBottom: "14px" }}></i>
            <h3 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "14pt", margin: "0 0 8px" }}>Nenhuma corrida ativa</h3>
            <p style={{ color: "#8193a8", fontSize: "9.5pt", margin: 0 }}>Aguardando o sorteio da rodada pela equipe.</p>
          </div>
        )}
      </div>
      {pistaTeste && <ModalDiagramaPista pista={pistaNoFormatoBuscador(pistaTeste)} aoFechar={() => setPistaTeste(null)} />}
    </main>
  );
}

export default Agenda;