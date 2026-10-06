import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocs, setDoc, deleteField, collection, onSnapshot, writeBatch, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { bancoCorridas, bancoG1 } from "../data/bancos-corridas";

// 🎯 As roletas de Clima, Humor e Cenário são visualmente idênticas por
// baixo dos panos (mesma física de giro, mesmo jeito de desenhar as
// fatias no canvas) — só muda cor/texto de cada fatia. Em vez de repetir
// esse código 3 vezes (como o site antigo fazia em 3 IIFEs separadas),
// extraí num par de funções compartilhadas.
function desenharRoletaGenerica(canvas, listaFatias, obterCor, obterTexto) {
  if (!canvas || listaFatias.length === 0) return;
  const ctx = canvas.getContext("2d");
  const numFatias = listaFatias.length;
  const anguloFatia = (2 * Math.PI) / numFatias;
  const raio = canvas.width / 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  listaFatias.forEach((item, i) => {
    const anguloInicio = i * anguloFatia - Math.PI / 2;
    const anguloFim = anguloInicio + anguloFatia;

    ctx.beginPath();
    ctx.moveTo(raio, raio);
    ctx.arc(raio, raio, raio - 2, anguloInicio, anguloFim);
    ctx.fillStyle = obterCor(item);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0b1320";
    ctx.stroke();

    ctx.save();
    ctx.translate(raio, raio);
    ctx.rotate(anguloInicio + anguloFatia / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";

    // 🎯 TEXTO DINÂMICO: encolhe a fonte automaticamente se o texto for
    // grande demais pra caber sem invadir o miolo da roleta (mesmo cálculo
    // que já usávamos na roleta de Cenário do site antigo, agora aplicado
    // nas 3 roletas de uma vez).
    const margemExterna = 18;
    const margemInterna = 40;
    const pontoInicioTexto = raio - margemExterna;
    const espacoDisponivel = pontoInicioTexto - margemInterna;

    const textoCompleto = obterTexto(item);
    let tamanhoFonte = 20;
    ctx.font = `bold ${tamanhoFonte}px Montserrat`;
    let larguraTexto = ctx.measureText(textoCompleto).width;

    if (larguraTexto > espacoDisponivel) {
      tamanhoFonte = Math.max(10, Math.floor(tamanhoFonte * (espacoDisponivel / larguraTexto)));
      ctx.font = `bold ${tamanhoFonte}px Montserrat`;
    }

    ctx.fillText(textoCompleto, pontoInicioTexto, 6);
    ctx.restore();
  });

  ctx.beginPath();
  ctx.arc(raio, raio, 26, 0, 2 * Math.PI);
  ctx.fillStyle = "#0b1320";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#c5a059";
  ctx.stroke();
}

// 🎯 Calcula e aplica a rotação física necessária pra parar exatamente
// na fatia vencedora (mesma matemática das 3 roletas originais).
function girarCanvasParaIndice(canvasEl, anguloAcumuladoRef, indiceVencedor, totalFatias, tempoGiro, voltas) {
  const grausPorFatia = 360 / totalFatias;
  const inicioGomoGraus = indiceVencedor * grausPorFatia;
  const offsetGomo = (0.05 + Math.random() * 0.9) * grausPorFatia;
  const destinoGraus = inicioGomoGraus + offsetGomo;
  const voltasGraus = 360 * voltas;
  const restoRotacaoAnterior = anguloAcumuladoRef.current % 360;

  anguloAcumuladoRef.current += voltasGraus + (360 - destinoGraus) - restoRotacaoAnterior;

  canvasEl.style.transition = `transform ${tempoGiro}ms cubic-bezier(0.1, 0.8, 0.1, 1)`;
  canvasEl.style.transform = `rotate(${anguloAcumuladoRef.current}deg)`;
}

function embaralharArray(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// 🎯 Transforma o nome de uma pista num id de DOM estável (sem acento,
// minúsculo, espaços viram hífen). Usado como id do banner de "ID Lobby"
// de cada card — baseado no NOME da pista, não na posição dela na lista,
// pra dar pra adicionar uma pista extra depois sem bagunçar os ids das
// pistas que já foram publicadas antes.
function slugPista(nome) {
  return (nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// 🎯 Monta o HTML de UM card de pista pro mural da Agenda. Extraído de
// dentro de gerarEstruturaCardsAgenda() pra poder ser reaproveitado
// também na hora de adicionar uma pista extra fora do sorteio normal.
function construirCardPistaHTML(pista, idChaveSala, climaTextoQuadro) {
  const sentidoVisivel = pista.direcao === "Left" ? "Esquerda" : pista.direcao === "Right" ? "Direita" : "Reta";
  const nomeImgHipodromoCard = pista.hipodromo.toLowerCase().replace(/[^a-z0-9]/g, "");
  const estiloChip = "display:inline-block; background: rgba(197,160,89,0.08); border: 1px solid rgba(197,160,89,0.2); border-radius: 4px; padding: 5px 11px; font-size: 9.5pt; color: #a4b3c6; white-space: nowrap;";

  return `
        <div class="jra-stream-card" style="width: 100%; max-width: 420px; background: #0d1624; border: 1px solid rgba(197, 160, 89, 0.25); box-shadow: 0 8px 20px rgba(0,0,0,0.4); border-radius: 12px; overflow: hidden; font-family: 'Montserrat', sans-serif; color: #f1ead4; position: relative; margin-bottom: 0;">
          <div style="position: relative; height: 190px;">
            <img src="/assets/img/hipodromos/${nomeImgHipodromoCard}.png" style="width: 100%; height: 100%; object-fit: cover; display: block;">
            <span class="lottery-card-badge${pista.grade === "G1" ? " badge-gold" : ""}" style="position: absolute; top: 10px; left: 10px;">${pista.grade}</span>
          </div>
          <div style="padding: 22px;">
            <div id="${idChaveSala}" class="jra-room-id-banner" style="display: none; margin-bottom: 14px; background: rgba(197, 160, 89, 0.08); border: 1px dashed rgba(197, 160, 89, 0.4); padding: 8px 12px; border-radius: 4px; box-sizing: border-box; width: 100%; cursor: pointer;"></div>
            <h4 style="font-family: 'Cinzel', serif; color: #f1ead4; font-size: 14.5pt; font-weight: 700; margin: 0 0 12px 0;">${pista.nome}</h4>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              <span style="${estiloChip}">📍 ${pista.hipodromo}</span>
              <span style="${estiloChip}">📏 ${pista.distancia_tipo} (${pista.distancia_numero}m)</span>
              <span style="${estiloChip}">🌿 ${pista.terreno}</span>
              <span style="${estiloChip}">🧭 ${sentidoVisivel}</span>
              <span style="${estiloChip}">☁️ ${climaTextoQuadro}</span>
            </div>
          </div>
        </div>`;
}

// 🎯 Catálogo único de todas as pistas possíveis (G1 + G2/G3/Listed),
// sem duplicatas, em ordem alfabética — usado na busca do painel
// "Adicionar Pista Extra". Mesmo padrão do listaUnicasPistas do
// TrainerCardModal.jsx.
const catalogoCompletoPistas = [...bancoCorridas, ...bancoG1]
  .filter((p, idx, self) => p && p.nome && self.findIndex((t) => t.nome.trim() === p.nome.trim()) === idx)
  .sort((a, b) => a.nome.localeCompare(b.nome));

// 🎯 PARTE 4/7: Deck de Support Cards — a roleta mais complexa de todas.
// Tem uma regra de negócio real por trás (o "motor" que decide qual carta
// pode sair em cada pull), não só sorteio puro:
//  - Limite de 2 cartas "Pal/Group" no deck inteiro.
//  - Regra do Grand Live: garante que Speed e Wit apareçam pelo menos uma
//    vez até o 6º pull, se nenhuma delas tiver saído até então.
//  - Sem Grand Live: garante que Speed apareça pelo menos uma vez até o 6º pull.
// Também tem desfazer-última-carta, reset com confirmação, e shuffle.
// Fita oficial da grade (a mesma da Agenda/Buscador).
const FITA_GRADE = { G1: "utx_txt_grade_ribbon_05.png", G2: "utx_txt_grade_ribbon_04.png", G3: "utx_txt_grade_ribbon_03.png" };

// Topo + chips do cartão de pista do sorteio. Sem pista: "selado" (ou o
// nome piscando enquanto a roleta gira).
function VisualPistaSorteio({ pista, rodando, textoRolando, textoVazio }) {
  if (rodando || !pista) {
    return (
      <div className={`sorteio-pista-topo vazio${rodando ? " rodando" : ""}`}>
        <i className={`fa-solid ${rodando ? "fa-dice fa-spin" : "fa-lock"}`}></i>
        <span>{rodando ? textoRolando : textoVazio}</span>
      </div>
    );
  }
  const sentido = pista.direcao === "Left" ? "Esquerda" : pista.direcao === "Right" ? "Direita" : "Reta";
  const imgHipodromo = (pista.hipodromo || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const grade = pista.grade || "G3";
  return (
    <div className="sorteio-pista-revelada">
      <div className="sorteio-pista-topo">
        <img src={`/assets/img/hipodromos/${imgHipodromo}.png`} alt={pista.hipodromo} className="sorteio-pista-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        {FITA_GRADE[grade] ? <img src={`/assets/img/${FITA_GRADE[grade]}`} alt={grade} className="sorteio-pista-fita" /> : <span className="sorteio-pista-grade">{grade}</span>}
        <h4 className="sorteio-pista-nome">{pista.nome}</h4>
      </div>
      <div className="sorteio-pista-chips">
        <span><i className="fa-solid fa-location-dot"></i> {pista.hipodromo}</span>
        <span><i className="fa-solid fa-ruler-horizontal"></i> {pista.distancia}</span>
        <span><i className="fa-solid fa-seedling"></i> {pista.terreno}</span>
        <span><i className="fa-solid fa-rotate"></i> {sentido}</span>
      </div>
    </div>
  );
}

function Sorteio() {
  const navigate = useNavigate();

  // 🎯 "verificando" | "negado-login" | "negado-permissao" | "liberado"
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

  // 🎯 Configuração do calendário
  const [edicao, setEdicao] = useState(1);
  const [mes, setMes] = useState("janeiro");
  const [semana, setSemana] = useState("early");
  const [estacao, setEstacao] = useState("spring");

  // ==========================================================================
  // PISTAS G1 (seleção manual, 2 slots com dedup entre eles)
  // ==========================================================================
  const [selectG1, setSelectG1] = useState({ 1: "", 2: "" });
  const [pistasG1Sorteadas, setPistasG1Sorteadas] = useState({ 1: null, 2: null });

  function opcoesG1Disponiveis(indice) {
    const outroIndice = indice === 1 ? 2 : 1;
    const nomeUsadoNoOutroSlot = pistasG1Sorteadas[outroIndice]?.nome;
    return [...bancoG1]
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .filter((p) => p.nome !== nomeUsadoNoOutroSlot);
  }

  function handleSelecionarG1(indice, nomeEscolhido) {
    setSelectG1((s) => ({ ...s, [indice]: nomeEscolhido }));
    const pista = bancoG1.find((c) => c.nome === nomeEscolhido) || null;
    setPistasG1Sorteadas((p) => ({ ...p, [indice]: pista }));
  }

  // ==========================================================================
  // PISTAS G2/G3 (4 slots, roleta de "nomes piscando")
  // ==========================================================================
  const [pistasSorteadas, setPistasSorteadas] = useState({ 1: null, 2: null, 3: null, 4: null });
  const [rodandoPista, setRodandoPista] = useState({ 1: false, 2: false, 3: false, 4: false });
  const [textoRolando, setTextoRolando] = useState({ 1: "", 2: "", 3: "", 4: "" });
  const [revelado3, setRevelado3] = useState(false);
  const [revelado4, setRevelado4] = useState(false);

  function obterCorridasFiltradas() {
    return bancoCorridas.filter((c) => c.mes === mes && c.semana === semana);
  }

  async function iniciarRoletaPista(numeroPista) {
    if (rodandoPista[numeroPista]) return;

    const disponiveis = obterCorridasFiltradas();
    const opcoesValidas = disponiveis.filter((c) => {
      return Object.keys(pistasSorteadas).every((id) => {
        if (parseInt(id) === numeroPista) return true;
        return !pistasSorteadas[id] || c.nome !== pistasSorteadas[id].nome;
      });
    });

    if (opcoesValidas.length === 0) return;

    setRodandoPista((r) => ({ ...r, [numeroPista]: true }));

    let tempoExecucao = 0;
    const tempoTotalMisterio = 3000;
    let velocidadeGiro = 100;

    while (tempoExecucao < tempoTotalMisterio) {
      const pistaAleatoria = opcoesValidas[Math.floor(Math.random() * opcoesValidas.length)];
      setTextoRolando((t) => ({ ...t, [numeroPista]: pistaAleatoria.nome }));

      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, velocidadeGiro));
      tempoExecucao += velocidadeGiro;
      if (tempoExecucao > tempoTotalMisterio * 0.5) velocidadeGiro = 200;
      if (tempoExecucao > tempoTotalMisterio * 0.8) velocidadeGiro = 400;
    }

    const resultadoOficial = opcoesValidas[Math.floor(Math.random() * opcoesValidas.length)];
    setPistasSorteadas((p) => ({ ...p, [numeroPista]: resultadoOficial }));
    setRodandoPista((r) => ({ ...r, [numeroPista]: false }));
  }

  const contagemPistasPreenchidas = Object.values(pistasSorteadas).filter((p) => p !== null).length;

  // ==========================================================================
  // ROLETA DE CLIMA
  // ==========================================================================
  const coresClima = { Sunny: "#e67e22", Cloudy: "#7f8c8d", Rainy: "#2980b9", Snowy: "#3498db" };
  const condicoesBaseClima = [
    { clima: "Sunny", terreno: "Good", emoji: "☀️" },
    { clima: "Sunny", terreno: "Firm", emoji: "☀️" },
    { clima: "Cloudy", terreno: "Firm", emoji: "☁️" },
    { clima: "Cloudy", terreno: "Good", emoji: "☁️" },
    { clima: "Rainy", terreno: "Soft", emoji: "🌧️" },
    { clima: "Rainy", terreno: "Heavy", emoji: "⛈️" },
  ];
  const condicoesInverno = [
    { clima: "Snowy", terreno: "Soft", emoji: "❄️" },
    { clima: "Snowy", terreno: "Good", emoji: "❄️" },
  ];

  const canvasClimaRef = useRef(null);
  const anguloClimaRef = useRef(0);
  const [climaFatias, setClimaFatias] = useState(condicoesBaseClima);
  const [climaRodando, setClimaRodando] = useState(false);
  const [climaResultado, setClimaResultado] = useState(null);
  const [climaAura, setClimaAura] = useState("");

  // 🎯 Reconstrói as fatias sempre que a estação mudar (equivalente ao
  // antigo listener de "change" no #selectEstacao)
  useEffect(() => {
    setClimaFatias(estacao === "winter" ? [...condicoesBaseClima, ...condicoesInverno] : [...condicoesBaseClima]);
  }, [estacao]);

  useEffect(() => {
    desenharRoletaGenerica(canvasClimaRef.current, climaFatias, (i) => coresClima[i.clima] || "#2c3e50", (i) => `${i.emoji} ${i.clima} | ${i.terreno}`);
    // 🎯 statusAcesso entra na dependência de propósito: o canvas só existe
    // de verdade no DOM depois que a trava de admin libera o acesso, então
    // precisamos redesenhar quando isso mudar (senão o primeiro desenho
    // aponta pra um canvasRef.current ainda nulo, da tela de "Verificando...").
  }, [climaFatias, statusAcesso]);

  function embaralharClima() {
    if (climaRodando) return;
    canvasClimaRef.current.style.transition = "none";
    canvasClimaRef.current.style.transform = "rotate(0deg)";
    anguloClimaRef.current = 0;
    setClimaAura("");
    setClimaResultado(null);
    setClimaFatias((f) => embaralharArray(f));
  }

  function girarClima() {
    if (climaRodando) return;
    setClimaRodando(true);
    setClimaAura("");
    setClimaResultado(null);

    const indiceVencedor = Math.floor(Math.random() * climaFatias.length);
    const vencedor = climaFatias[indiceVencedor];
    girarCanvasParaIndice(canvasClimaRef.current, anguloClimaRef, indiceVencedor, climaFatias.length, 4000, 5);

    setTimeout(() => {
      setClimaResultado(vencedor);
      setClimaAura(`env-${vencedor.clima.toLowerCase()}`);
      setClimaRodando(false);
    }, 4000);
  }

  // ==========================================================================
  // ROLETA DE HUMOR
  // ==========================================================================
  const coresHumor = { Great: "#f2457d", Good: "#e69a40", Normal: "#e6d03f" };
  const listaFatiasHumorBase = [
    { humor: "Great", emoji: "🧡" }, { humor: "Good", emoji: "🙂" }, { humor: "Normal", emoji: "😐" },
    { humor: "Great", emoji: "🧡" }, { humor: "Good", emoji: "🙂" }, { humor: "Normal", emoji: "😐" },
    { humor: "Great", emoji: "🧡" }, { humor: "Good", emoji: "🙂" }, { humor: "Normal", emoji: "😐" },
  ];

  const canvasHumorRef = useRef(null);
  const anguloHumorRef = useRef(0);
  const [humorFatias, setHumorFatias] = useState(listaFatiasHumorBase);
  const [humorRodando, setHumorRodando] = useState(false);
  const [humorResultado, setHumorResultado] = useState(null);
  const [humorAura, setHumorAura] = useState("");

  useEffect(() => {
    desenharRoletaGenerica(canvasHumorRef.current, humorFatias, (i) => coresHumor[i.humor], (i) => `${i.emoji} ${i.humor}`);
  }, [humorFatias, statusAcesso]);

  function embaralharHumor() {
    if (humorRodando) return;
    canvasHumorRef.current.style.transition = "none";
    canvasHumorRef.current.style.transform = "rotate(0deg)";
    anguloHumorRef.current = 0;
    setHumorAura("");
    setHumorResultado(null);
    setHumorFatias((f) => embaralharArray(f));
  }

  function girarHumor() {
    if (humorRodando) return;
    setHumorRodando(true);
    setHumorAura("");
    setHumorResultado(null);

    const indiceVencedor = Math.floor(Math.random() * humorFatias.length);
    const vencedor = humorFatias[indiceVencedor];
    girarCanvasParaIndice(canvasHumorRef.current, anguloHumorRef, indiceVencedor, humorFatias.length, 4000, 5);

    setTimeout(() => {
      setHumorResultado(vencedor);
      setHumorAura(`aura-${vencedor.humor.toLowerCase()}`);
      setHumorRodando(false);
    }, 4000);
  }

  // ==========================================================================
  // ROLETA DE CENÁRIO DE CARREIRA (com pesos/porcentagens)
  // ==========================================================================
  const coresCenario = { "URA Finale": "#c0392b", "Unity Cup": "#2980b9", "Trackblazer": "#e67e22", "Grand Concerto": "#8e44ad", "Livre": "#34495e" };
  const classesGlowCenario = { "URA Finale": "cenario-ura-finale", "Unity Cup": "cenario-unity-cup", "Trackblazer": "cenario-trackblazer", "Grand Concerto": "cenario-grand-concerto", "Livre": "cenario-livre" };
  const pesosCenarios = { "URA Finale": 10, "Unity Cup": 10, "Trackblazer": 5, "Grand Concerto": 65, "Livre": 10 };

  // 🎯 CLOUDINARY: pasta "cenarios", mesma conta usada pros troféus (k1qj4qrm)
  const CLOUDINARY_CLOUD_NAME_CENARIO = "k1qj4qrm";

  // 🎯 Mapa direto (em vez de sanitização automática) — nomes de arquivo
  // confirmados na pasta "cenarios" do Cloudinary. "Livre" fica de fora
  // de propósito até vocês subirem uma arte pra ele.
  const arquivosCenarioCloudinary = {
    "URA Finale": "urafinale",
    "Unity Cup": "unitycup",
    "Trackblazer": "trackblazer",
    "Grand Concerto": "grandconcert",
  };

  function obterUrlCenarioCloudinary(nomeCenario) {
    const arquivo = arquivosCenarioCloudinary[nomeCenario];
    if (!arquivo) return "";
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME_CENARIO}/image/upload/f_auto,q_auto/${arquivo}.png`;
  }
  const listaFatiasCenarioBase = [
    { cenario: "URA Finale", emoji: "🏅" }, { cenario: "Unity Cup", emoji: "🤝" }, { cenario: "Trackblazer", emoji: "🔥" }, { cenario: "Grand Concerto", emoji: "🎻" }, { cenario: "Livre", emoji: "🎲" },
    { cenario: "URA Finale", emoji: "🏅" }, { cenario: "Unity Cup", emoji: "🤝" }, { cenario: "Trackblazer", emoji: "🔥" }, { cenario: "Grand Concerto", emoji: "🎻" }, { cenario: "Livre", emoji: "🎲" },
  ];

  const canvasCenarioRef = useRef(null);
  const anguloCenarioRef = useRef(0);
  const [cenarioFatias, setCenarioFatias] = useState(listaFatiasCenarioBase);
  const [cenarioRodando, setCenarioRodando] = useState(false);
  const [cenarioResultado, setCenarioResultado] = useState(null);
  const [cenarioGlow, setCenarioGlow] = useState("");

  useEffect(() => {
    desenharRoletaGenerica(canvasCenarioRef.current, cenarioFatias, (i) => coresCenario[i.cenario] || "#2c3e50", (i) => `${i.emoji} ${i.cenario}`);
  }, [cenarioFatias, statusAcesso]);

  function sortearCenarioComPesos() {
    const totalPeso = Object.values(pesosCenarios).reduce((soma, p) => soma + p, 0);
    let rand = Math.random() * totalPeso;
    for (const [cenario, peso] of Object.entries(pesosCenarios)) {
      if (rand < peso) return cenario;
      rand -= peso;
    }
    return Object.keys(pesosCenarios)[0];
  }

  function embaralharCenario() {
    if (cenarioRodando) return;
    canvasCenarioRef.current.style.transition = "none";
    canvasCenarioRef.current.style.transform = "rotate(0deg)";
    anguloCenarioRef.current = 0;
    setCenarioGlow("");
    setCenarioResultado(null);
    setCenarioFatias((f) => embaralharArray(f));
  }

  function girarCenario() {
    if (cenarioRodando) return;
    setCenarioRodando(true);
    setCenarioGlow("");
    setCenarioResultado(null);

    const cenarioGanhadorNome = sortearCenarioComPesos();
    const indicesCompativeis = cenarioFatias
      .map((item, i) => (item.cenario === cenarioGanhadorNome ? i : -1))
      .filter((i) => i !== -1);
    const indiceVencedor = indicesCompativeis[Math.floor(Math.random() * indicesCompativeis.length)];
    const vencedor = cenarioFatias[indiceVencedor];

    girarCanvasParaIndice(canvasCenarioRef.current, anguloCenarioRef, indiceVencedor, cenarioFatias.length, 4000, 5);

    setTimeout(() => {
      setCenarioResultado(vencedor);
      setCenarioGlow(classesGlowCenario[vencedor.cenario] || "");
      setCenarioRodando(false);
    }, 4000);
  }

  // ==========================================================================
  // DECK DE SUPPORT CARDS (a roleta mais complexa)
  // ==========================================================================
  const coresAtributos = { Speed: "#33b4ff", Stamina: "#ff6855", Power: "#ffa31b", Guts: "#ff88ae", Wit: "#1bd39e", "Pal/Group": "#faed7c" };
  const listaFatiasCartasBase = [
    { tipo: "Speed", emoji: "👟" }, { tipo: "Stamina", emoji: "🔥" },
    { tipo: "Power", emoji: "💪" }, { tipo: "Guts", emoji: "✊" },
    { tipo: "Wit", emoji: "🎓" }, { tipo: "Pal/Group", emoji: "👥" },
    { tipo: "Speed", emoji: "👟" }, { tipo: "Stamina", emoji: "🔥" },
    { tipo: "Power", emoji: "💪" }, { tipo: "Guts", emoji: "✊" },
    { tipo: "Wit", emoji: "🎓" }, { tipo: "Pal/Group", emoji: "👥" },
  ];

  const canvasCartasRef = useRef(null);
  const anguloCartasRef = useRef(0);
  const imagensAtributosRef = useRef({});
  const [imagensAtributosCarregadas, setImagensAtributosCarregadas] = useState(false);

  const [cartasFatias, setCartasFatias] = useState(listaFatiasCartasBase);
  const [rodandoCartas, setRodandoCartas] = useState(false);
  const [cliqueAtual, setCliqueAtual] = useState(1);
  const [grandLiveAtivo, setGrandLiveAtivo] = useState(false);
  const [historicoTipos, setHistoricoTipos] = useState([]);
  const [contadoresAtributos, setContadoresAtributos] = useState({ Speed: 0, Stamina: 0, Power: 0, Guts: 0, Wit: 0, "Pal/Group": 0 });
  const [deckResultados, setDeckResultados] = useState({ 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
  const [modalResetAberto, setModalResetAberto] = useState(false);
  const [mostrarShuffleConcluidoCartas, setMostrarShuffleConcluidoCartas] = useState(false);

  // Pré-carrega as imagens dos atributos (usadas na roleta em vez de emoji)
  useEffect(() => {
    const tipos = Object.keys(coresAtributos);
    let restantes = tipos.length;
    tipos.forEach((tipo) => {
      const img = new Image();
      const finalizarCarregamento = () => {
        restantes--;
        if (restantes === 0) setImagensAtributosCarregadas(true);
      };
      img.onload = finalizarCarregamento;
      img.onerror = finalizarCarregamento;
      img.src = `/assets/img/${tipo.toLowerCase().replace("/", "")}.png`;
      imagensAtributosRef.current[tipo] = img;
    });
  }, []);

  function desenharCanvasCartas(canvas, listaFatias) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const numFatias = listaFatias.length;
    const anguloFatia = (2 * Math.PI) / numFatias;
    const raio = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    listaFatias.forEach((item, i) => {
      const anguloInicio = i * anguloFatia - Math.PI / 2;
      const anguloFim = anguloInicio + anguloFatia;

      ctx.beginPath();
      ctx.moveTo(raio, raio);
      ctx.arc(raio, raio, raio, anguloInicio, anguloFim);
      ctx.fillStyle = coresAtributos[item.tipo];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0b1320";
      ctx.stroke();

      ctx.save();
      ctx.translate(raio, raio);
      ctx.rotate(anguloInicio + anguloFatia / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const distanciaTexto = raio * 0.6;
      const tamanhoImagem = Math.max(20, raio * 0.09);
      const espacamento = tamanhoImagem * 0.35;

      const fonteTexto = "bold 20px Montserrat";
      ctx.font = fonteTexto;
      const larguraTexto = ctx.measureText(item.tipo).width;

      const posicaoImagemA = distanciaTexto - larguraTexto / 2 - espacamento - tamanhoImagem / 2;
      const posicaoImagemB = distanciaTexto + larguraTexto / 2 + espacamento + tamanhoImagem / 2;

      const img = imagensAtributosRef.current[item.tipo];
      const imagemPronta = imagensAtributosCarregadas && img && img.complete && img.naturalWidth > 0;

      if (imagemPronta) {
        ctx.drawImage(img, posicaoImagemA - tamanhoImagem / 2, -tamanhoImagem / 2, tamanhoImagem, tamanhoImagem);
        ctx.drawImage(img, posicaoImagemB - tamanhoImagem / 2, -tamanhoImagem / 2, tamanhoImagem, tamanhoImagem);
      } else {
        ctx.font = `${Math.round(tamanhoImagem * 0.8)}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(item.emoji, posicaoImagemA, 0);
        ctx.fillText(item.emoji, posicaoImagemB, 0);
      }

      ctx.fillStyle = "#ffffff";
      ctx.font = fonteTexto;
      ctx.fillText(item.tipo, distanciaTexto, 0);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(raio, raio, 32, 0, 2 * Math.PI);
    ctx.fillStyle = "#0b1320";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#c5a059";
    ctx.stroke();
  }

  useEffect(() => {
    desenharCanvasCartas(canvasCartasRef.current, cartasFatias);
  }, [cartasFatias, imagensAtributosCarregadas, statusAcesso]);

  // 🎯 Equivalente ao antigo calcularItemSorteado(): decide qual carta pode
  // sair nesse pull, respeitando o limite de Pal/Group e a garantia de
  // Speed/Wit até o fim da rodada.
  function calcularItemSorteado() {
    let poolValido = [...cartasFatias];

    if (contadoresAtributos["Pal/Group"] >= 2) {
      poolValido = poolValido.filter((item) => item.tipo !== "Pal/Group");
    }

    if (grandLiveAtivo) {
      const nenhumaNas4Primeiras = contadoresAtributos["Speed"] === 0 && contadoresAtributos["Wit"] === 0;

      if (nenhumaNas4Primeiras) {
        if (cliqueAtual === 5) {
          poolValido = poolValido.filter((item) => item.tipo === "Wit");
        } else if (cliqueAtual === 6) {
          poolValido = poolValido.filter((item) => item.tipo === "Speed");
        }
        const gomoEscolhido = poolValido[Math.floor(Math.random() * poolValido.length)];
        return cartasFatias.findIndex((obj) => obj.tipo === gomoEscolhido.tipo && poolValido.includes(obj));
      }

      if (cliqueAtual === 6) {
        if (contadoresAtributos["Speed"] > 0 && contadoresAtributos["Wit"] === 0) {
          poolValido = poolValido.filter((item) => item.tipo === "Wit");
        } else if (contadoresAtributos["Wit"] > 0 && contadoresAtributos["Speed"] === 0) {
          poolValido = poolValido.filter((item) => item.tipo === "Speed");
        }
      }
    } else {
      if (cliqueAtual === 6 && contadoresAtributos["Speed"] === 0) {
        poolValido = poolValido.filter((item) => item.tipo === "Speed");
      }
    }

    const gomoEscolhido = poolValido[Math.floor(Math.random() * poolValido.length)];
    const indicesPossiveis = [];
    cartasFatias.forEach((obj, idx) => {
      if (obj.tipo === gomoEscolhido.tipo) indicesPossiveis.push(idx);
    });
    return indicesPossiveis[Math.floor(Math.random() * indicesPossiveis.length)];
  }

  function girarCarta() {
    if (rodandoCartas || cliqueAtual > 6) return;

    setRodandoCartas(true);

    const indiceVencedor = calcularItemSorteado();
    const vencedor = cartasFatias[indiceVencedor];
    const pullDesteGiro = cliqueAtual;

    girarCanvasParaIndice(canvasCartasRef.current, anguloCartasRef, indiceVencedor, cartasFatias.length, 4000, 5);

    setTimeout(() => {
      setHistoricoTipos((h) => [...h, vencedor.tipo]);
      setContadoresAtributos((c) => ({ ...c, [vencedor.tipo]: c[vencedor.tipo] + 1 }));
      setDeckResultados((d) => ({ ...d, [pullDesteGiro]: vencedor }));
      setCliqueAtual(pullDesteGiro + 1);
      setRodandoCartas(false);
    }, 4000);
  }

  function embaralharCartas() {
    if (rodandoCartas) return;
    canvasCartasRef.current.style.transition = "none";
    canvasCartasRef.current.style.transform = "rotate(0deg)";
    anguloCartasRef.current = 0;
    setCartasFatias((f) => embaralharArray(f));

    setMostrarShuffleConcluidoCartas(true);
    setTimeout(() => setMostrarShuffleConcluidoCartas(false), 1200);
  }

  // 🎯 Equivalente ao antigo resetarUltimaCarta(): desfaz só o último pull
  function desfazerUltimaCarta() {
    if (rodandoCartas || cliqueAtual <= 1 || historicoTipos.length === 0) return;

    const indiceAlvo = cliqueAtual - 1;
    const ultimoTipo = historicoTipos[historicoTipos.length - 1];

    setHistoricoTipos((h) => h.slice(0, -1));
    setContadoresAtributos((c) => ({ ...c, [ultimoTipo]: Math.max(0, c[ultimoTipo] - 1) }));
    setDeckResultados((d) => ({ ...d, [indiceAlvo]: null }));
    setCliqueAtual(indiceAlvo);
  }

  // 🎯 Equivalente ao antigo executingResetCartas(): limpa tudo
  function resetCompletoCartas() {
    if (canvasCartasRef.current) {
      canvasCartasRef.current.style.transition = "none";
      canvasCartasRef.current.style.transform = "rotate(0deg)";
    }
    anguloCartasRef.current = 0;
    setCliqueAtual(1);
    setHistoricoTipos([]);
    setContadoresAtributos({ Speed: 0, Stamina: 0, Power: 0, Guts: 0, Wit: 0, "Pal/Group": 0 });
    setDeckResultados({ 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
    setModalResetAberto(false);
  }

  // 🎯 Alternar o Grand Live sempre força um reset completo (mesmo
  // comportamento do site antigo — mudar a regra no meio da rodada
  // deixaria o deck já sorteado inconsistente com a nova regra)
  function alternarGrandLive() {
    if (rodandoCartas) return;
    setGrandLiveAtivo((g) => !g);
    resetCompletoCartas();
  }

  // ==========================================================================
  // TETO... digo, MÁXIMO DE CARTAS SSR
  // ==========================================================================
  const coresFatiasSSR = ["#e04b37", "#f06a3d", "#f2954a", "#f0b23f", "#e0c23f", "#b8c24a", "#f0c674"];

  const canvasSSRRef = useRef(null);
  const anguloSSRRef = useRef(0);
  const idAnimacaoRainbowRef = useRef(null);
  const [fatiasSSR, setFatiasSSR] = useState([0, 1, 2, 3, 4, 5, 6]);

  // 🎯 Pesos de probabilidade por valor de Máximo SSR (mesma distribuição
  // já aplicada no site antigo — soma dá 100, mas não precisa ser exato,
  // a função abaixo normaliza sozinha com base no total).
  const pesosSSR = {
    0: 10,
    1: 10,
    2: 22,
    3: 30,
    4: 20,
    5: 5,
    6: 3,
  };

  // 🎯 Sorteia um valor respeitando os pesos acima: soma todos os pesos,
  // sorteia um número dentro desse total, e "caminha" pelas fatias
  // descontando peso até achar onde o número sorteado caiu.
  function sortearValorSSRComPesos() {
    const totalPeso = Object.values(pesosSSR).reduce((soma, p) => soma + p, 0);
    let rand = Math.random() * totalPeso;
    for (const [valor, peso] of Object.entries(pesosSSR)) {
      if (rand < peso) return parseInt(valor, 10);
      rand -= peso;
    }
    return 0; // Fallback de segurança, nunca deveria chegar aqui
  }
  const [rodandoSSR, setRodandoSSR] = useState(false);
  const [resultadoSSR, setResultadoSSR] = useState(null);
  const [auraSSR, setAuraSSR] = useState("");

  function desenharCanvasSSR(canvas, lista) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const numFatias = lista.length;
    const anguloFatia = (2 * Math.PI) / numFatias;
    const raio = canvas.width / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    lista.forEach((valor, i) => {
      const anguloInicio = i * anguloFatia - Math.PI / 2;
      const anguloFim = anguloInicio + anguloFatia;

      ctx.beginPath();
      ctx.moveTo(raio, raio);
      ctx.arc(raio, raio, raio, anguloInicio, anguloFim);
      ctx.fillStyle = coresFatiasSSR[valor];
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#0b1320";
      ctx.stroke();

      ctx.save();
      ctx.translate(raio, raio);
      ctx.rotate(anguloInicio + anguloFatia / 2);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f1ead4";
      ctx.font = "bold 20px Montserrat";
      ctx.fillText(`MÁX: ${valor} SSR`, raio - 40, 0);
      ctx.restore();
    });

    // Aura arco-íris pulsante na fatia "6" (a mais rara)
    lista.forEach((valor, i) => {
      if (valor !== 6) return;
      const anguloInicio = i * anguloFatia - Math.PI / 2;
      const anguloFim = anguloInicio + anguloFatia;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(raio, raio);
      ctx.lineTo(raio + Math.cos(anguloInicio) * (raio - 4), raio + Math.sin(anguloInicio) * (raio - 4));
      ctx.arc(raio, raio, raio - 4, anguloInicio, anguloFim);
      ctx.lineTo(raio, raio);

      const deslocamentoCor = (Date.now() / 8) % 360;
      const x1 = raio + Math.cos(anguloInicio) * raio;
      const y1 = raio + Math.sin(anguloInicio) * raio;
      const x2 = raio + Math.cos(anguloFim) * raio;
      const y2 = raio + Math.sin(anguloFim) * raio;
      const gradienteContorno = ctx.createLinearGradient(x1, y1, x2, y2);

      gradienteContorno.addColorStop(0.0, `hsl(${deslocamentoCor}, 100%, 50%)`);
      gradienteContorno.addColorStop(0.2, `hsl(${(deslocamentoCor + 60) % 360}, 100%, 50%)`);
      gradienteContorno.addColorStop(0.4, `hsl(${(deslocamentoCor + 120) % 360}, 100%, 50%)`);
      gradienteContorno.addColorStop(0.6, `hsl(${(deslocamentoCor + 180) % 360}, 100%, 50%)`);
      gradienteContorno.addColorStop(0.8, `hsl(${(deslocamentoCor + 240) % 360}, 100%, 50%)`);
      gradienteContorno.addColorStop(1.0, `hsl(${(deslocamentoCor + 300) % 360}, 100%, 50%)`);

      ctx.strokeStyle = gradienteContorno;
      ctx.lineWidth = 7;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(raio, raio, 32, 0, 2 * Math.PI);
    ctx.fillStyle = "#0b1320";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#c5a059";
    ctx.stroke();
  }

  // 🎯 Loop contínuo (requestAnimationFrame) só pra manter o brilho
  // arco-íris da fatia "6" pulsando sem parar
  useEffect(() => {
    if (statusAcesso !== "liberado") return;

    function cicloAnimacaoSSR() {
      desenharCanvasSSR(canvasSSRRef.current, fatiasSSR);
      idAnimacaoRainbowRef.current = requestAnimationFrame(cicloAnimacaoSSR);
    }
    cicloAnimacaoSSR();

    return () => {
      if (idAnimacaoRainbowRef.current) cancelAnimationFrame(idAnimacaoRainbowRef.current);
    };
  }, [fatiasSSR, statusAcesso]);

  const [mostrarCardMixedSSR, setMostrarCardMixedSSR] = useState(false);

  function embaralharSSR() {
    if (rodandoSSR) return;
    canvasSSRRef.current.style.transition = "none";
    canvasSSRRef.current.style.transform = "rotate(0deg)";
    anguloSSRRef.current = 0;
    setAuraSSR("");
    setResultadoSSR(null);

    // Embaralha a ordem das fatias (a cor segue o valor, e o giro acha a
    // fatia vencedora pelo índice, então o sorteio continua igual).
    setFatiasSSR((f) => embaralharArray(f));
    setMostrarCardMixedSSR(true);
    setTimeout(() => setMostrarCardMixedSSR(false), 1200);
  }

  function girarSSR() {
    if (rodandoSSR) return;
    setRodandoSSR(true);
    setAuraSSR("");
    setResultadoSSR(null);

    // 🎯 Sorteia o VALOR primeiro (respeitando os pesos), e só depois
    // acha em qual fatia da roda esse valor está pra saber onde parar
    // visualmente. Como cada valor (0-6) aparece só uma vez na lista
    // de fatias, basta achar o índice dele.
    const valorVencedor = sortearValorSSRComPesos();
    const indiceVencedor = fatiasSSR.indexOf(valorVencedor);
    girarCanvasParaIndice(canvasSSRRef.current, anguloSSRRef, indiceVencedor, fatiasSSR.length, 4000, 6);

    setTimeout(() => {
      setResultadoSSR(valorVencedor);
      setAuraSSR(valorVencedor >= 5 ? "ssr-glorioso" : valorVencedor <= 1 ? "ssr-alerta" : "ssr-padrao");
      setRodandoSSR(false);
    }, 4000);
  }

  // ==========================================================================
  // QUADRO OFICIAL DA RODADA
  // ==========================================================================
  // 🎯 Diferente do site antigo (que precisava ler o texto de dentro do
  // DOM pra montar essa tabela), aqui já temos tudo guardado limpo em
  // estado — então é só montar a lista de linhas direto a partir dele.
  const dataHojeFormatada = new Date().toLocaleDateString("pt-BR");

  const tiposDoDeckPreenchidos = [1, 2, 3, 4, 5, 6].filter((n) => deckResultados[n]).map((n) => deckResultados[n].tipo);

  const linhasQuadro = [];
  if (pistasG1Sorteadas[1]) linhasQuadro.push({ pista: pistasG1Sorteadas[1], grade: "G1" });
  if (pistasG1Sorteadas[2]) linhasQuadro.push({ pista: pistasG1Sorteadas[2], grade: "G1" });
  if (pistasSorteadas[1]) linhasQuadro.push({ pista: pistasSorteadas[1], grade: pistasSorteadas[1].grade || "G3" });
  if (pistasSorteadas[2]) linhasQuadro.push({ pista: pistasSorteadas[2], grade: pistasSorteadas[2].grade || "G3" });
  if (pistasSorteadas[3] && revelado3) linhasQuadro.push({ pista: pistasSorteadas[3], grade: pistasSorteadas[3].grade || "G3" });
  if (pistasSorteadas[4] && revelado4) linhasQuadro.push({ pista: pistasSorteadas[4], grade: pistasSorteadas[4].grade || "G3" });


  // ==========================================================================
  // PARTE 7/7 (FINAL): EXPORTAR / PUBLICAR
  // ==========================================================================
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);
  const [listaChavesSalasAtual, setListaChavesSalasAtual] = useState([]);
  const [mostrarPainelIDs, setMostrarPainelIDs] = useState(false);
  const [valoresIDsLobby, setValoresIDsLobby] = useState({});

  // 🎯 Recupera o Passo 2 (painel de IDs de sala) se a página for
  // recarregada depois de já ter publicado. Sem isso, o painel some da
  // tela mesmo com o dado já salvo no Firestore — só reaparecia se você
  // publicasse tudo de novo. Também recupera os IDs que já tinham sido
  // digitados, se a pessoa já tiver preenchido algum antes de recarregar.
  useEffect(() => {
    async function recuperarPainelIDsSalvo() {
      try {
        const snap = await getDoc(doc(db, "pistas_sorteadas", "atual"));
        if (snap.exists()) {
          const dados = snap.data();
          setPistasPublicadasAtuais(dados.pistas || []);
          setEdicaoAtivaDoc(dados.edicaoAtiva || null);

          if (dados.mapaChavesSalas) {
            const listaRecuperada = JSON.parse(dados.mapaChavesSalas);
            setListaChavesSalasAtual(listaRecuperada);
            setMostrarPainelIDs(true);

            if (dados.pacoteLobbiesData) {
              setValoresIDsLobby(dados.pacoteLobbiesData);
            }
          }
        }
      } catch (erro) {
        console.error("Erro ao recuperar painel de IDs de sala salvo:", erro);
      }
    }
    recuperarPainelIDsSalvo();
  }, []);
  const [enviandoIDs, setEnviandoIDs] = useState(false);
  const [pistasPublicadasAtuais, setPistasPublicadasAtuais] = useState([]);

  // ==========================================================================
  // GRUPOS A/B — pra quando o check-in passar de 14 confirmados e precisar
  // dividir os inscritos em 2 salas separadas por corrida. Ver seção 3 do
  // regulamento não, ver pendência combinada com o usuário: cada corrida
  // ganha um código por grupo (Grupo A e Grupo B), sorteado aleatoriamente
  // a partir de quem confirmou presença na edição ativa.
  // ==========================================================================
  const [edicaoAtivaDoc, setEdicaoAtivaDoc] = useState(null);
  const [confirmadosEdicaoAtiva, setConfirmadosEdicaoAtiva] = useState([]);
  const [dividindoGrupos, setDividindoGrupos] = useState(false);

  // 🎯 Mesmo padrão de listener em tempo real que a Agenda já usa pra
  // mostrar "PARTICIPANTES CONFIRMADOS" — aqui é só pra saber quantos são
  // (decidir se vale a pena dividir em grupos) e pra gravar o campo
  // "grupo" em cada confirmação.
  useEffect(() => {
    if (!edicaoAtivaDoc) {
      setConfirmadosEdicaoAtiva([]);
      return;
    }
    const pararDeObservar = onSnapshot(
      collection(db, "checkins", edicaoAtivaDoc, "confirmados"),
      (snapshot) => {
        const lista = [];
        snapshot.forEach((docSnap) => lista.push({ uid: docSnap.id, ...docSnap.data() }));
        setConfirmadosEdicaoAtiva(lista);
      },
      (erro) => console.error("Erro ao observar confirmados (grupos):", erro)
    );
    return () => pararDeObservar();
  }, [edicaoAtivaDoc]);

  // 🎯 Não guardamos um "gruposAtivos" separado em lugar nenhum — se
  // dividiu, pelo menos um confirmado já tem o campo "grupo" gravado.
  // Deriva do próprio dado, evita mais um flag pra manter sincronizado.
  const gruposJaDivididos = confirmadosEdicaoAtiva.some((c) => c.grupo);
  const totalGrupoA = confirmadosEdicaoAtiva.filter((c) => c.grupo === "A").length;
  const totalGrupoB = confirmadosEdicaoAtiva.filter((c) => c.grupo === "B").length;

  // 🎯 Embaralha e divide o mais igual possível (ex: 15 pessoas -> 8/7).
  // Sobrescreve o campo "grupo" de todo mundo, mesmo quem já tinha um —
  // clicar de novo é o jeito de "sortear de novo" caso o admin não goste
  // da divisão.
  async function dividirEmGrupos() {
    if (!edicaoAtivaDoc) {
      alert("⚠️ Nenhuma edição ativa encontrada — publique o sorteio (Passo 1) antes.");
      return;
    }
    if (confirmadosEdicaoAtiva.length === 0) {
      alert("⚠️ Ainda não há ninguém confirmado nessa edição.");
      return;
    }
    if (!window.confirm(`Dividir os ${confirmadosEdicaoAtiva.length} confirmados em Grupo A e Grupo B aleatoriamente?`)) return;

    setDividindoGrupos(true);
    try {
      const embaralhados = [...confirmadosEdicaoAtiva].sort(() => Math.random() - 0.5);
      const metade = Math.ceil(embaralhados.length / 2);
      const grupoA = embaralhados.slice(0, metade);
      const grupoB = embaralhados.slice(metade);

      const lote = writeBatch(db);
      grupoA.forEach((c) => lote.update(doc(db, "checkins", edicaoAtivaDoc, "confirmados", c.uid), { grupo: "A" }));
      grupoB.forEach((c) => lote.update(doc(db, "checkins", edicaoAtivaDoc, "confirmados", c.uid), { grupo: "B" }));
      await lote.commit();

      alert(`✅ Divididos: ${grupoA.length} no Grupo A, ${grupoB.length} no Grupo B. Agora o Passo 3 pede 1 código por corrida PARA CADA grupo.`);
    } catch (erro) {
      console.error("Erro ao dividir em grupos:", erro);
      alert("❌ Erro ao dividir em grupos. Tente novamente.");
    } finally {
      setDividindoGrupos(false);
    }
  }

  async function desfazerGrupos() {
    if (!edicaoAtivaDoc) return;
    if (!window.confirm("Desfazer a divisão em grupos? Volta a valer 1 código só por corrida (não por grupo).")) return;
    setDividindoGrupos(true);
    try {
      const lote = writeBatch(db);
      confirmadosEdicaoAtiva.forEach((c) => lote.update(doc(db, "checkins", edicaoAtivaDoc, "confirmados", c.uid), { grupo: deleteField() }));
      await lote.commit();
    } catch (erro) {
      console.error("Erro ao desfazer grupos:", erro);
      alert("❌ Erro ao desfazer grupos.");
    } finally {
      setDividindoGrupos(false);
    }
  }

  // ==========================================================================
  // 🎯 Adicionar manualmente alguém que esqueceu de confirmar presença
  // sozinho, mas precisa entrar num grupo (ex: chegou depois, ou confirmou
  // por fora). Busca no cadastro geral de treinadores (coleção completa,
  // carregada só quando o admin realmente começa a buscar) e cria/atualiza
  // o próprio documento de check-in dela com o grupo escolhido — o mesmo
  // formato que o check-in normal grava.
  // ==========================================================================
  const [todosTreinadores, setTodosTreinadores] = useState([]);
  const [carregandoTreinadores, setCarregandoTreinadores] = useState(false);
  const [buscaTreinadorManual, setBuscaTreinadorManual] = useState("");
  const [adicionandoManualUid, setAdicionandoManualUid] = useState(null);

  async function carregarTodosTreinadoresSeNecessario() {
    if (todosTreinadores.length > 0 || carregandoTreinadores) return;
    setCarregandoTreinadores(true);
    try {
      const snapshot = await getDocs(collection(db, "treinadores"));
      const lista = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return { uid: docSnap.id, nome: d.nomeTreinador || d.usuarioID || "Treinador", fotoPerfil: d.fotoPerfil || "default_avatar.png" };
      });
      setTodosTreinadores(lista);
    } catch (erro) {
      console.error("Erro ao carregar cadastro de treinadores:", erro);
    } finally {
      setCarregandoTreinadores(false);
    }
  }

  const uidsJaConfirmados = new Set(confirmadosEdicaoAtiva.map((c) => c.uid));
  const resultadosBuscaTreinadorManual =
    buscaTreinadorManual.trim() === ""
      ? []
      : todosTreinadores
          .filter((t) => !uidsJaConfirmados.has(t.uid) && t.nome.toLowerCase().includes(buscaTreinadorManual.toLowerCase().trim()))
          .slice(0, 8);

  async function adicionarTreinadorManualmenteAoGrupo(treinador, letra) {
    if (!edicaoAtivaDoc) return;
    setAdicionandoManualUid(treinador.uid);
    try {
      await setDoc(doc(db, "checkins", edicaoAtivaDoc, "confirmados", treinador.uid), {
        nome: treinador.nome,
        fotoPerfil: treinador.fotoPerfil,
        confirmadoEm: serverTimestamp(),
        grupo: letra,
      });
      setBuscaTreinadorManual("");
    } catch (erro) {
      console.error("Erro ao adicionar treinador manualmente:", erro);
      alert("❌ Erro ao adicionar esse treinador. Tente novamente.");
    } finally {
      setAdicionandoManualUid(null);
    }
  }

  // 🎯 Quando os grupos estão divididos, o Passo 3 (IDs de sala) precisa
  // de 2 campos por corrida em vez de 1 — um código por grupo. O nome da
  // corrida usado no lookup de grade (enviarIDsSalasDinamicas) continua
  // puro, sem o sufixo do grupo, senão a comparação com
  // pistasG1Sorteadas/pistasSorteadas para de bater.
  const listaChavesSalasParaInputs = gruposJaDivididos
    ? listaChavesSalasAtual.flatMap(({ idChave, nomeCorrida }) => [
        { idChave: `${idChave}-A`, nomeCorrida, grupo: "A" },
        { idChave: `${idChave}-B`, nomeCorrida, grupo: "B" },
      ])
    : listaChavesSalasAtual;

  // 🎯 Equivalente ao antigo processarObjetoParaFirestore(): limpa as
  // strings brutas do banco de corridas e calcula os números
  function processarObjetoParaFirestore(pistaObjeto, gradeForcada) {
    let textoDistancia = pistaObjeto.distancia || "Medium";
    let numeroDistancia = 2000;
    const encontrarNumero = textoDistancia.match(/\d+/);
    if (encontrarNumero) numeroDistancia = parseInt(encontrarNumero[0]);

    let tipoDistancia = "Medium";
    if (textoDistancia.toLowerCase().includes("sprint")) tipoDistancia = "Sprint";
    if (textoDistancia.toLowerCase().includes("mile")) tipoDistancia = "Mile";
    if (textoDistancia.toLowerCase().includes("long")) tipoDistancia = "Long";

    let tipoTerreno = "Turf";
    if (pistaObjeto.terreno.toLowerCase().includes("dirt") || pistaObjeto.terreno.toLowerCase().includes("terra")) {
      tipoTerreno = "Dirt";
    }

    return {
      nome: pistaObjeto.nome,
      grade: gradeForcada,
      hipodromo: pistaObjeto.hipodromo || "Tokyo",
      distancia_tipo: tipoDistancia,
      distancia_numero: numeroDistancia,
      direcao: pistaObjeto.direcao || "Right",
      terreno: tipoTerreno,
      // 🎯 ID exato do percurso no jogo — usado pelo diagrama e, no futuro,
      // pra conferir se a sala da corrida foi criada no percurso certo.
      course_id: pistaObjeto.courseId ?? null,
    };
  }

  // 🎯 Notificação pro Discord via Worker (fire-and-forget: não deve travar a UI)
  async function enviarSorteioParaDiscord(payload) {
    try {
      const usuario = auth.currentUser;
      if (!usuario) {
        console.warn("Discord: usuário não autenticado, envio pulado.");
        return;
      }

      const configSnap = await getDoc(doc(db, "config", "discord"));
      const workerToken = configSnap.exists() ? configSnap.data().workerToken : null;
      if (!workerToken) {
        console.warn("Discord: workerToken não encontrado em config/discord.");
        return;
      }

      const resposta = await fetch("https://pocolordstr-discord.felipe-a-silva754.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Token": workerToken },
        body: JSON.stringify(payload),
      });

      if (!resposta.ok) {
        console.error("Discord: o Worker retornou erro", resposta.status, await resposta.text());
      }
    } catch (erro) {
      console.error("Discord: falha ao notificar (não crítico):", erro.message);
    }
  }

  async function enviarSalasParaDiscord(edicaoNum, salas) {
    try {
      const usuario = auth.currentUser;
      if (!usuario) return;

      const configSnap = await getDoc(doc(db, "config", "discord"));
      const workerToken = configSnap.exists() ? configSnap.data().workerToken : null;
      if (!workerToken) return;

      const resposta = await fetch("https://pocolordstr-discord.felipe-a-silva754.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Token": workerToken },
        body: JSON.stringify({ tipo: "salas", edicao: edicaoNum, salas }),
      });

      if (!resposta.ok) {
        console.error("Discord: Worker recusou envio de salas", resposta.status, await resposta.text());
      }
    } catch (erro) {
      console.error("Discord: falha ao notificar salas (não crítico):", erro.message);
    }
  }

  // 🎯 Monta o HTML completo do mural (cards de pista + resumo de cenário +
  // resumo de deck) a partir de uma lista de pistas JÁ no formato salvo no
  // Firestore, mais os dados "congelados" da rodada (clima, cenário, deck,
  // teto de SSR). Extraída de dentro do antigo gerarEstruturaCardsAgenda()
  // pra poder ser chamada de novo depois — ao adicionar uma pista extra,
  // por exemplo — sem precisar repetir o sorteio inteiro.
  function montarMuralCompletoHTML(pistasArray, dadosRodada) {
    let htmlCardsG1 = [];
    let htmlCardsG2G3 = "";
    let listaChavesSalasLobby = [];

    // 🎯 clima/condicao_terreno são salvos em minúsculo no Firestore — aqui
    // a gente reencontra a fatia original (com emoji e capitalização certa)
    // pra reconstruir o mesmo texto que aparecia no chip "☁️" do card.
    const catalogoClima = [...condicoesBaseClima, ...condicoesInverno];
    const climaEncontrado = catalogoClima.find(
      (c) =>
        c.clima.toLowerCase() === (dadosRodada.clima || "").toLowerCase() &&
        c.terreno.toLowerCase() === (dadosRodada.condicao_terreno || "").toLowerCase()
    );
    const climaTextoReconstruido = climaEncontrado
      ? `${climaEncontrado.emoji} ${climaEncontrado.clima} (${climaEncontrado.terreno})`
      : "Aguardando...";

    pistasArray.forEach((pista) => {
      const idChaveSala = `sala-lobby-id-${slugPista(pista.nome)}`;
      listaChavesSalasLobby.push({ idChave: idChaveSala, nomeCorrida: pista.nome });
      const cardHTML = construirCardPistaHTML(pista, idChaveSala, climaTextoReconstruido);
      if (pista.grade === "G1") { htmlCardsG1.push(cardHTML); } else { htmlCardsG2G3 += cardHTML; }
    });

    let slotsDeckHTML = "";
    (dadosRodada.deck_sorteado || []).forEach((tipo) => {
      const imgNome = tipo.toLowerCase().replace("/", "");
      slotsDeckHTML += `<div class="deck-summary-slot" style="background: rgba(11, 19, 32, 0.7); border: 1px solid rgba(197, 160, 89, 0.3); border-radius: 8px; padding: 15px 10px; display: flex; flex-direction: column; align-items: center;"><img src="/assets/img/${imgNome}.png" style="height: 45px; margin-bottom: 8px;"><span style="font-size: 10pt; font-weight: 700; color: #ffffff; text-transform: uppercase;">${tipo}</span></div>`;
    });

    const cenarioNomeAtual = dadosRodada.cenario || "";
    // 🎯 O nome do cenário é salvo puro no Firestore (sem emoji) — busca a
    // fatia original só pra recuperar o emoji certo na hora de reconstruir.
    const fatiaCenario = listaFatiasCenarioBase.find((f) => f.cenario === cenarioNomeAtual);
    const corCenarioHex = coresCenario[cenarioNomeAtual] || "#c5a059";
    const cenarioTextoAtual = fatiaCenario ? `${fatiaCenario.emoji} ${cenarioNomeAtual}` : cenarioNomeAtual || "Não definido";

    const urlImgCenarioMural = obterUrlCenarioCloudinary(cenarioNomeAtual);
    const imgCenarioMuralHTML = urlImgCenarioMural
      ? `<img src="${urlImgCenarioMural}" alt="${cenarioNomeAtual}" style="max-width: 160px; width: 100%; height: auto; display: block; margin: 0 auto 12px auto; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));" onerror="this.style.display='none';">`
      : "";

    const htmlFinalMural = `
      <style>
        #secaoCardsImportados, .agenda-page-content { max-width: 100% !important; width: 100% !important; }
        #containerCardsStream { max-width: 100% !important; width: 100% !important; padding: 0 20px; box-sizing: border-box; }
        .agenda-pyramid-grid, .agenda-pyramid-top-g1 { display: flex !important; flex-wrap: wrap; gap: 28px !important; justify-content: center; width: 100%; max-width: 1440px; margin: 0 auto 30px auto; }
        .agenda-pyramid-grid .jra-stream-card, .agenda-pyramid-top-g1 .jra-stream-card { flex: 1 1 380px; margin-bottom: 0 !important; }
        @media (max-width: 480px) { .agenda-pyramid-grid .jra-stream-card, .agenda-pyramid-top-g1 .jra-stream-card { flex: 1 1 100%; } }
      </style>
      <div class="agenda-pyramid-top-g1">${htmlCardsG1.join("")}</div>
      <div class="agenda-pyramid-grid">${htmlCardsG2G3}</div>
      <div class="scenario-summary-stream-card" style="width: 100%; max-width: 850px; background: #0d1624; border: 2px solid ${corCenarioHex}66; border-radius: 12px; padding: 30px 25px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); margin: 0 auto 30px auto;">
        <div class="lottery-card-badge badge-gold" style="display: table; margin: 0 auto 15px auto; background: #c5a059; color: #0b1320; padding: 4px 14px; font-weight: 700; font-size: 8.5pt; border-radius: 4px; letter-spacing: 0.5px;">🗺️ CENÁRIO DE CARREIRA DA RODADA</div>
        ${imgCenarioMuralHTML}
        <h3 style="font-family: 'Cinzel', serif; color: #ffffff; font-size: 20pt; margin: 0 0 10px 0; letter-spacing: 0.5px;">${cenarioTextoAtual}</h3>
        <div style="width: 50px; height: 3px; background: ${corCenarioHex}; margin: 0 auto 12px auto; border-radius: 2px; box-shadow: 0 0 8px ${corCenarioHex}88;"></div>
        <p style="font-family: 'Montserrat', sans-serif; color: #a4b3c6; font-size: 9.5pt; margin: 0; letter-spacing: 0.3px;">Este será o cenário para fazer a carreira nesta rodada.</p>
      </div>
      <div class="deck-summary-stream-card" style="width: 100%; max-width: 850px; background: #0d1624; border: 2px solid rgba(197, 160, 89, 0.4); border-radius: 12px; padding: 30px 25px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); margin: 0 auto;">
        <div class="lottery-card-badge badge-gold" style="display: table; margin: 0 auto 15px auto; background: #c5a059; color: #0b1320; padding: 4px 12px; font-weight: 700; font-size: 8.5pt; border-radius: 4px;">🃏 DECK ESTRATÉGICO DA RODADA</div>
        <h3 style="font-family: 'Cinzel', serif; color: #ffffff; font-size: 15pt; margin-bottom: 20px;">Support Cards Selecionados</h3>
        <div class="deck-summary-grid-3x2" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 680px; margin: 25px auto; width: 100%;">${slotsDeckHTML}</div>
      </div>
      <div class="ssr-limit-stream-card" style="width: 100%; max-width: 850px; background: #0d1624; border: 2px solid rgba(197, 160, 89, 0.4); border-radius: 12px; padding: 25px; margin: 20px auto 0 auto; box-shadow: 0 10px 30px rgba(0,0,0,0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;">
        <img src="/assets/img/supportcard_rarity_02.png" alt="SSR" style="width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; filter: drop-shadow(0 0 8px rgba(197, 160, 89, 0.35));">
        <div style="text-align: center;">
          <div style="font-family: 'Montserrat', sans-serif; font-size: 8.5pt; letter-spacing: 0.5px; color: #a4b3c6; text-transform: uppercase;">Restrição de SSR</div>
          <div style="font-family: 'Cinzel', serif; font-size: 24pt; font-weight: 700; color: #c5a059; letter-spacing: 0.3px; line-height: 1.3;">Máximo de SSR no deck:<br>${dadosRodada.teto_ssr || 0} SSR</div>
        </div>
      </div>`;

    return { htmlFinalMural, listaChavesSalasLobby };
  }

  // 🎯 Equivalente ao antigo gerarEstruturaCardsAgenda(): monta o HTML do
  // mural, grava nos dois documentos do Firestore e dispara o Discord
  async function gerarEstruturaCardsAgenda() {
    let listaJSONPistasBanco = [];

    for (let idG1 = 1; idG1 <= 2; idG1++) {
      if (pistasG1Sorteadas[idG1]) {
        listaJSONPistasBanco.push(processarObjetoParaFirestore(pistasG1Sorteadas[idG1], "G1"));
      }
    }
    const revelados = { 1: true, 2: true, 3: revelado3, 4: revelado4 };
    for (let id = 1; id <= 4; id++) {
      if (pistasSorteadas[id] && revelados[id]) {
        listaJSONPistasBanco.push(processarObjetoParaFirestore(pistasSorteadas[id], pistasSorteadas[id].grade || "G3"));
      }
    }

    if (listaJSONPistasBanco.length === 0) {
      alert("⚠️ Sorteie pelo menos um circuito primeiro!");
      return;
    }

    setSalvandoAgenda(true);

    const cenarioNomeAtual = cenarioResultado ? cenarioResultado.cenario : "";
    const dadosRodadaAtual = {
      clima: climaResultado ? climaResultado.clima.toLowerCase() : "",
      condicao_terreno: climaResultado ? climaResultado.terreno.toLowerCase() : "",
      cenario: cenarioNomeAtual,
      teto_ssr: resultadoSSR !== null ? resultadoSSR : 0,
      deck_sorteado: tiposDoDeckPreenchidos,
    };

    const { htmlFinalMural, listaChavesSalasLobby } = montarMuralCompletoHTML(listaJSONPistasBanco, dadosRodadaAtual);

    try {
      const dataHoje = new Date().toLocaleDateString("pt-BR");
      const idDocumentoEdicao = `edicao_${edicao}`;

      const pacotePayloadCompleto = {
        data: dataHoje,
        estacao,
        ...dadosRodadaAtual,
        pistas: listaJSONPistasBanco,
        muralBaseHTML: htmlFinalMural,
      };

      await setDoc(doc(db, "pistas_sorteadas", idDocumentoEdicao), pacotePayloadCompleto, { merge: true });

      await setDoc(
        doc(db, "pistas_sorteadas", "atual"),
        {
          edicaoAtiva: idDocumentoEdicao,
          ...pacotePayloadCompleto,
          mapaChavesSalas: JSON.stringify(listaChavesSalasLobby),
        },
        { merge: true }
      );

      enviarSorteioParaDiscord({
        edicao,
        estacao,
        clima: climaResultado ? climaResultado.clima : "",
        condicao_terreno: climaResultado ? climaResultado.terreno : "",
        cenario: cenarioNomeAtual,
        humor: humorResultado ? humorResultado.humor : "",
        teto_ssr: resultadoSSR !== null ? resultadoSSR : 0,
        deck_sorteado: tiposDoDeckPreenchidos,
        pistas: listaJSONPistasBanco,
      });

      setListaChavesSalasAtual(listaChavesSalasLobby);
      setMostrarPainelIDs(true);
      setPistasPublicadasAtuais(listaJSONPistasBanco);
      alert(`🛰️ Edição ${edicao} gravada com sucesso!`);
    } catch (error) {
      console.error("Erro ao salvar no Firebase:", error);
      alert("❌ Erro ao conectar com o banco de dados.");
    } finally {
      setSalvandoAgenda(false);
    }
  }

  // ==========================================================================
  // ADICIONAR PISTA EXTRA (fora do momento do sorteio)
  // ==========================================================================
  // 🎯 Busca/seleção de uma pista extra pra somar na edição já publicada,
  // sem precisar sortear tudo de novo. Lê o documento "atual" direto do
  // Firestore (não usa o estado local de clima/cenário/deck da tela, porque
  // esse estado é só da sessão do navegador — se a página foi recarregada,
  // ele estaria vazio mesmo com uma rodada publicada rolando).
  const [buscaPistaExtra, setBuscaPistaExtra] = useState("");
  const [pistaExtraSelecionada, setPistaExtraSelecionada] = useState(null);
  const [adicionandoPistaExtra, setAdicionandoPistaExtra] = useState(false);
  const [sugestoesPistaExtraAbertas, setSugestoesPistaExtraAbertas] = useState(false);

  // 🎯 Sem texto digitado: mostra as primeiras pistas do catálogo completo
  // (já vem em ordem alfabética). Com texto: filtra normalmente. Assim a
  // caixa abre com opções assim que a pessoa clica no campo, sem precisar
  // digitar nada primeiro.
  const resultadosBuscaPistaExtra =
    buscaPistaExtra.trim().length === 0
      ? catalogoCompletoPistas.slice(0, 8)
      : catalogoCompletoPistas.filter((p) => p.nome.toLowerCase().includes(buscaPistaExtra.toLowerCase().trim())).slice(0, 8);

  async function adicionarPistaExtra() {
    if (!pistaExtraSelecionada) {
      alert("⚠️ Selecione uma pista na busca antes de adicionar.");
      return;
    }

    setAdicionandoPistaExtra(true);
    try {
      const snapAtual = await getDoc(doc(db, "pistas_sorteadas", "atual"));
      if (!snapAtual.exists() || !snapAtual.data().edicaoAtiva) {
        alert("⚠️ Não há nenhuma edição publicada no momento — publique uma rodada primeiro.");
        return;
      }
      const dadosAtual = snapAtual.data();
      const pistasExistentes = dadosAtual.pistas || [];

      const jaExiste = pistasExistentes.some((p) => p.nome.trim().toLowerCase() === pistaExtraSelecionada.nome.trim().toLowerCase());
      if (jaExiste) {
        alert(`⚠️ "${pistaExtraSelecionada.nome}" já está na edição atual.`);
        return;
      }

      const novaPista = processarObjetoParaFirestore(pistaExtraSelecionada, pistaExtraSelecionada.grade || "G3");
      const novasPistas = [...pistasExistentes, novaPista];

      const { htmlFinalMural, listaChavesSalasLobby } = montarMuralCompletoHTML(novasPistas, {
        clima: dadosAtual.clima,
        condicao_terreno: dadosAtual.condicao_terreno,
        cenario: dadosAtual.cenario,
        teto_ssr: dadosAtual.teto_ssr,
        deck_sorteado: dadosAtual.deck_sorteado,
      });

      const atualizacao = {
        pistas: novasPistas,
        muralBaseHTML: htmlFinalMural,
        mapaChavesSalas: JSON.stringify(listaChavesSalasLobby),
      };

      await setDoc(doc(db, "pistas_sorteadas", dadosAtual.edicaoAtiva), { pistas: novasPistas, muralBaseHTML: htmlFinalMural }, { merge: true });
      await setDoc(doc(db, "pistas_sorteadas", "atual"), atualizacao, { merge: true });

      // 🎯 Atualiza o painel de IDs de sala local pra já mostrar o campo
      // vazio da pista nova, sem precisar recarregar a página.
      setListaChavesSalasAtual(listaChavesSalasLobby);
      setMostrarPainelIDs(true);
      setPistasPublicadasAtuais(novasPistas);

      setPistaExtraSelecionada(null);
      setBuscaPistaExtra("");
      alert(`🛰️ "${novaPista.nome}" adicionada à Edição ${dadosAtual.edicaoAtiva.replace("edicao_", "")} com sucesso!`);
    } catch (error) {
      console.error("Erro ao adicionar pista extra:", error);
      alert("❌ Erro ao conectar com o banco de dados.");
    } finally {
      setAdicionandoPistaExtra(false);
    }
  }

  // 🎯 Remove uma pista da edição já publicada, sem apagar nenhum resultado
  // que já tenha sido lançado pra ela (isso mexe só na lista "ativa" do
  // sorteio — a coleção resultados_partidas nem é tocada).
  const [removendoPistaExtra, setRemovendoPistaExtra] = useState(null);

  async function removerPistaExtra(pistaParaRemover) {
    const confirmado = window.confirm(
      `Remover "${pistaParaRemover.nome}" da edição atual?\n\nIsso só tira ela do sorteio/mural ativo — se algum resultado já tiver sido lançado pra essa pista, ele continua salvo no histórico normalmente.`
    );
    if (!confirmado) return;

    setRemovendoPistaExtra(pistaParaRemover.nome);
    try {
      const snapAtual = await getDoc(doc(db, "pistas_sorteadas", "atual"));
      if (!snapAtual.exists() || !snapAtual.data().edicaoAtiva) {
        alert("⚠️ Não há nenhuma edição publicada no momento.");
        return;
      }
      const dadosAtual = snapAtual.data();
      const pistasExistentes = dadosAtual.pistas || [];
      const novasPistas = pistasExistentes.filter(
        (p) => p.nome.trim().toLowerCase() !== pistaParaRemover.nome.trim().toLowerCase()
      );

      if (novasPistas.length === pistasExistentes.length) {
        alert("⚠️ Essa pista não foi encontrada na edição atual (talvez já tenha sido removida em outra aba).");
        return;
      }

      const { htmlFinalMural, listaChavesSalasLobby } = montarMuralCompletoHTML(novasPistas, {
        clima: dadosAtual.clima,
        condicao_terreno: dadosAtual.condicao_terreno,
        cenario: dadosAtual.cenario,
        teto_ssr: dadosAtual.teto_ssr,
        deck_sorteado: dadosAtual.deck_sorteado,
      });

      // 🎯 Se já existia um ID de Lobby cadastrado pra essa pista, apaga
      // só essa chave do mapa — precisa ser um caminho com ponto + deleteField()
      // porque setDoc com merge:true NÃO apaga chaves de dentro de um mapa,
      // só sobrescreve/soma (senão o ID antigo ficaria "fantasma" salvo).
      const idChaveRemovida = `sala-lobby-id-${slugPista(pistaParaRemover.nome)}`;

      await setDoc(doc(db, "pistas_sorteadas", dadosAtual.edicaoAtiva), { pistas: novasPistas, muralBaseHTML: htmlFinalMural }, { merge: true });
      await setDoc(
        doc(db, "pistas_sorteadas", "atual"),
        {
          pistas: novasPistas,
          muralBaseHTML: htmlFinalMural,
          mapaChavesSalas: JSON.stringify(listaChavesSalasLobby),
          [`pacoteLobbiesData.${idChaveRemovida}`]: deleteField(),
        },
        { merge: true }
      );

      setPistasPublicadasAtuais(novasPistas);
      setListaChavesSalasAtual(listaChavesSalasLobby);
      setValoresIDsLobby((v) => {
        const copia = { ...v };
        delete copia[idChaveRemovida];
        return copia;
      });

      alert(`🗑️ "${pistaParaRemover.nome}" removida da edição atual.`);
    } catch (error) {
      console.error("Erro ao remover pista:", error);
      alert("❌ Erro ao conectar com o banco de dados.");
    } finally {
      setRemovendoPistaExtra(null);
    }
  }

  // 🎯 Equivalente ao antigo enviarIDsSalasDinamicas()
  async function enviarIDsSalasDinamicas() {
    setEnviandoIDs(true);
    let pacoteIDs = {};
    let salasParaDiscord = [];

    listaChavesSalasParaInputs.forEach(({ idChave, nomeCorrida, grupo }) => {
      const valor = (valoresIDsLobby[idChave] || "").trim();
      if (valor === "") return;
      pacoteIDs[idChave] = valor;

      let gradeCorrida = "G3";
      const ehG1 = [1, 2].some((idG1) => pistasG1Sorteadas[idG1] && pistasG1Sorteadas[idG1].nome === nomeCorrida);
      if (ehG1) {
        gradeCorrida = "G1";
      } else {
        for (let id = 1; id <= 4; id++) {
          if (pistasSorteadas[id] && pistasSorteadas[id].nome === nomeCorrida) {
            gradeCorrida = pistasSorteadas[id].grade || "G3";
            break;
          }
        }
      }
      // 🎯 "grupo" só existe quando os grupos A/B estão ativos — o Worker
      // do Discord já usa esse campo pra rotular as 2 mensagens da mesma
      // corrida ("— Grupo A" / "— Grupo B"), sem quebrar nada pra quem
      // ainda não usa grupos (campo simplesmente ausente).
      salasParaDiscord.push({ nome: nomeCorrida, grade: gradeCorrida, codigo: valor, ...(grupo ? { grupo } : {}) });
    });

    try {
      await setDoc(doc(db, "pistas_sorteadas", "atual"), { pacoteLobbiesData: pacoteIDs }, { merge: true });

      if (salasParaDiscord.length > 0) {
        enviarSalasParaDiscord(edicao, salasParaDiscord);
      }

      alert("🛰️ IDs de Lobbies distribuídos globalmente!");
    } catch (error) {
      console.error(error);
      alert("❌ Erro ao enviar IDs.");
    } finally {
      setEnviandoIDs(false);
    }
  }
  // TELAS DE BLOQUEIO (mesmo padrão do RankAdmin.jsx)
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
        ? "Esta área é exclusiva da Comissão Executiva da PTR. Por favor, realize o login com uma credencial autorizada."
        : "Sua licença atual de Treinador não possui nível de acesso administrativo para gerenciar ou visualizar os sorteios oficiais.";

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

  // ==========================================================================
  // PAINEL DE SORTEIO DE VERDADE
  // ==========================================================================
  return (
    <>
      <main className="main-layout-wrapper">
        <div className="hero-content lottery-page-content">
          <div className="sorteio-cabecalho">
            <div className="sorteio-sobretitulo"><i className="fa-solid fa-dice"></i> Admin · Edição {edicao || "--"}</div>
            <h2 className="sorteio-titulo">Gerador de Cenários</h2>
            <p className="sorteio-descricao">Defina o calendário e acione os sorteadores para revelar as pistas da rodada ao vivo.</p>
          </div>

          {/* Painel de Configuração Manual do Calendário */}
          <div className="calendar-config-panel">
            <div className="config-group" style={{ maxWidth: "120px" }}>
              <label htmlFor="inputEdicao"><i className="fa-solid fa-hashtag"></i> Edição</label>
              <input
                type="number"
                id="inputEdicao"
                className="custom-select"
                min="1"
                value={edicao}
                onChange={(e) => setEdicao(e.target.value)}
                style={{ textAlign: "center", backgroundImage: "none" }}
              />
            </div>

            <div className="config-group">
              <label htmlFor="selectMes"><i className="fa-solid fa-calendar-days"></i> Mês</label>
              <select id="selectMes" className="custom-select" value={mes} onChange={(e) => setMes(e.target.value)}>
                <option value="janeiro">Janeiro</option>
                <option value="fevereiro">Fevereiro</option>
                <option value="marco">Março</option>
                <option value="abril">Abril</option>
                <option value="maio">Maio</option>
                <option value="junho">Junho</option>
                <option value="julho">Julho</option>
                <option value="agosto">Agosto</option>
                <option value="setembro">Setembro</option>
                <option value="outubro">Outubro</option>
                <option value="novembro">Novembro</option>
                <option value="dezembro">Dezembro</option>
              </select>
            </div>

            <div className="config-group">
              <label htmlFor="selectSemana"><i className="fa-solid fa-calendar-week"></i> Semana</label>
              <select id="selectSemana" className="custom-select" value={semana} onChange={(e) => setSemana(e.target.value)}>
                <option value="early">Early (Início)</option>
                <option value="late">Late (Final)</option>
              </select>
            </div>

            <div className="config-group">
              <label htmlFor="selectEstacao"><i className="fa-solid fa-leaf"></i> Estação</label>
              <select id="selectEstacao" className="custom-select" value={estacao} onChange={(e) => setEstacao(e.target.value)}>
                <option value="spring">Spring (Primavera)</option>
                <option value="summer">Summer (Verão)</option>
                <option value="fall">Fall (Outono)</option>
                <option value="winter">Winter (Inverno)</option>
              </select>
            </div>
          </div>

          {/* ESTRUTURA EM PIRÂMIDE */}
          <div className="pyramid-layout-container">
            {/* FILEIRA TOP: G1 (2 slots) */}
            <div className="pyramid-row row-top" style={{ display: "flex", flexWrap: "wrap", gap: "25px", justifyContent: "center" }}>
              {[1, 2].map((indice) => (
                <div key={indice} className={`lottery-card dynamic-card manual-g1-card sorteio-pista${pistasG1Sorteadas[indice] ? " g1" : ""}`}>
                  <div className="sorteio-pista-rotulo"><i className="fa-solid fa-crown"></i> G1 #{indice}</div>
                  <VisualPistaSorteio pista={pistasG1Sorteadas[indice]} textoVazio="Escolha a G1 abaixo" />
                  <select
                    className="custom-select sorteio-pista-select"
                    value={selectG1[indice]}
                    onChange={(e) => handleSelecionarG1(indice, e.target.value)}
                  >
                    <option value="">Escolher G1...</option>
                    {opcoesG1Disponiveis(indice).map((p) => (
                      <option key={p.nome} value={p.nome}>{p.nome}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* FILEIRA DO MEIO: G2/G3 #1 e #2 */}
            <div className="pyramid-row row-middle">
              {[
                { numero: 1, badge: "Circuito Alpha" },
                { numero: 2, badge: "Circuito Beta" },
              ].map(({ numero, badge }) => (
                <div key={numero} className={`lottery-card dynamic-card sorteio-pista`}>
                  <div className="sorteio-pista-rotulo"><i className="fa-solid fa-flag-checkered"></i> {badge} · G2/G3 #{numero}</div>
                  <VisualPistaSorteio pista={pistasSorteadas[numero]} rodando={rodandoPista[numero]} textoRolando={textoRolando[numero]} textoVazio="Selado" />
                  <button
                    className="sorteio-pista-sortear"
                    onClick={() => iniciarRoletaPista(numero)}
                    disabled={rodandoPista[numero]}
                  >
                    <i className="fa-solid fa-dice"></i> {pistasSorteadas[numero] ? "Sortear de novo" : "Sortear"}
                  </button>
                </div>
              ))}
            </div>

            {/* Painel de ativação discreto (revela #3 e #4) */}
            <div className="pyramid-row row-activation-controls" style={{ margin: "-10px 0", gap: "25px" }}>
              <div style={{ flex: 1, maxWidth: "320px", display: "flex", justifyContent: "center" }}>
                <button
                  className={`btn-minimal-reveal${revelado3 ? " active-reveal" : ""}`}
                  title="Revelar Pista #3"
                  onClick={() => setRevelado3((r) => !r)}
                >
                  <i className={`fa-solid ${revelado3 ? "fa-eye" : "fa-eye-slash"}`}></i>{" "}
                  {revelado3 ? "Pista #3 Ativa" : "Expansão #3"}
                </button>
              </div>
              <div style={{ flex: 1, maxWidth: "320px", display: "flex", justifyContent: "center" }}>
                <button
                  className={`btn-minimal-reveal${revelado4 ? " active-reveal" : ""}`}
                  title="Revelar Pista #4"
                  onClick={() => setRevelado4((r) => !r)}
                >
                  <i className={`fa-solid ${revelado4 ? "fa-eye" : "fa-eye-slash"}`}></i>{" "}
                  {revelado4 ? "Pista #4 Ativa" : "Expansão #4"}
                </button>
              </div>
            </div>

            {/* FILEIRA DE BAIXO: G2/G3 #3 e #4 (ocultas por padrão) */}
            <div className="pyramid-row row-bottom-tier">
              {[
                { numero: 3, badge: "Circuito Gamma", revelado: revelado3 },
                { numero: 4, badge: "Circuito Delta", revelado: revelado4 },
              ].map(({ numero, badge, revelado }) => (
                <div key={numero} className={`lottery-card dynamic-card sorteio-pista ${revelado ? "card-revealed" : "card-hidden"}`}>
                  <div className="sorteio-pista-rotulo"><i className="fa-solid fa-flag-checkered"></i> {badge} · G2/G3 #{numero}</div>
                  <VisualPistaSorteio pista={pistasSorteadas[numero]} rodando={rodandoPista[numero]} textoRolando={textoRolando[numero]} textoVazio="Selado" />
                  <button
                    className="sorteio-pista-sortear"
                    onClick={() => iniciarRoletaPista(numero)}
                    disabled={rodandoPista[numero]}
                  >
                    <i className="fa-solid fa-dice"></i> {pistasSorteadas[numero] ? "Sortear de novo" : "Sortear"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {contagemPistasPreenchidas > 0 && (
            <p style={{ textAlign: "center", color: "#8193a8", fontSize: "8.5pt", marginTop: "15px", fontFamily: "'Montserrat', sans-serif" }}>
              <i className="fa-solid fa-circle-check" style={{ color: "#7fd08a" }}></i> {contagemPistasPreenchidas} de 4 pistas G2/G3 sorteadas
            </p>
          )}

          {/* CLIMA + HUMOR + CENÁRIO */}
          <div className="weather-section-container sorteio-roletas">
            <div className="sorteio-roletas-grid">

              {/* CLIMA */}
              <div className="sorteio-roleta-cartao">
                <div className="sorteio-secao-cabecalho">
                  <div className="sorteio-secao-titulo"><i className="fa-solid fa-cloud-sun-rain"></i> Condições da Rodada</div>
                  <p>Acione a engrenagem para definir o ecossistema e clima.</p>
                </div>
                <div className="roulette-wrapper" style={{ position: "relative", width: "450px", height: "450px", margin: "0 auto" }}>
                  <div className="wheel-pointer" style={{ position: "absolute", top: "-18px", left: "50%", transform: "translateX(-50%)", fontSize: "30pt", color: "#c5a059", textShadow: "0 3px 12px rgba(0,0,0,0.9)", zIndex: 10, pointerEvents: "none" }}>▼</div>
                  <canvas
                    ref={(el) => {
                      canvasClimaRef.current = el;
                      if (el) desenharRoletaGenerica(el, climaFatias, (i) => coresClima[i.clima] || "#2c3e50", (i) => `${i.emoji} ${i.clima} | ${i.terreno}`);
                    }}
                    width="450"
                    height="450"
                    style={{ borderRadius: "50%", border: "3px solid rgba(197, 160, 89, 0.3)", boxShadow: "0 0 35px rgba(0,0,0,0.8)", display: "block" }}
                  ></canvas>
                </div>
                <div className={`lottery-card dynamic-card highlight-dark-card weather-card ${climaAura}`}>
                  <div className="lottery-card-badge badge-gold">Condição da pista</div>
                  <div className="lottery-result-box" style={{ minHeight: "80px", width: "100%" }}>
                    {climaRodando ? (
                      <span style={{ fontFamily: "'Montserrat'", fontSize: "10pt", color: "#a4b3c6", fontWeight: 600, letterSpacing: "1px" }}>ROLETA EM MOVIMENTO...</span>
                    ) : climaResultado ? (
                      <div className="result-pista-info" style={{ animation: "sorteioRevelar 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2)", textAlign: "center", width: "100%" }}>
                        <h4 style={{ color: "#c5a059", fontFamily: "'Montserrat', sans-serif" }}>{climaResultado.emoji} {climaResultado.clima}</h4>
                        <span style={{ fontSize: "8.5pt", fontWeight: "bold", background: "rgba(197, 160, 89, 0.15)", color: "#c5a059", padding: "4px 14px", borderRadius: "50px", display: "inline-block", marginTop: "5px", border: "1px solid rgba(197, 160, 89, 0.3)" }}>
                          TERRENO: {climaResultado.terreno}
                        </span>
                      </div>
                    ) : (
                      <span className="result-placeholder mysterious-text">Aguardando Comando...</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "5px", width: "100%" }}>
                    <button className="btn-minimal-reveal" style={{ flex: 1 }} onClick={embaralharClima} disabled={climaRodando}>
                      <i className="fa-solid fa-shuffle"></i> SHUFFLE
                    </button>
                    <button className="btn-trigger-lottery individual-trigger" style={{ flex: 2 }} onClick={girarClima} disabled={climaRodando}>
                      <i className="fa-solid fa-play"></i> SORTEAR
                    </button>
                  </div>
                </div>
              </div>

              {/* HUMOR */}
              <div className="sorteio-roleta-cartao">
                <div className="sorteio-secao-cabecalho">
                  <div className="sorteio-secao-titulo"><i className="fa-solid fa-face-smile"></i> Humor da Uma Musume</div>
                  <p>Defina o estado mental e o bônus de status das corredoras.</p>
                </div>
                <div className="roulette-wrapper" style={{ position: "relative", width: "450px", height: "450px", margin: "0 auto" }}>
                  <div className="wheel-pointer" style={{ position: "absolute", top: "-18px", left: "50%", transform: "translateX(-50%)", fontSize: "30pt", color: "#c5a059", textShadow: "0 3px 12px rgba(0,0,0,0.9)", zIndex: 10, pointerEvents: "none" }}>▼</div>
                  <canvas
                    ref={(el) => {
                      canvasHumorRef.current = el;
                      if (el) desenharRoletaGenerica(el, humorFatias, (i) => coresHumor[i.humor], (i) => `${i.emoji} ${i.humor}`);
                    }}
                    width="450"
                    height="450"
                    style={{ borderRadius: "50%", border: "3px solid rgba(197, 160, 89, 0.3)", boxShadow: "0 0 35px rgba(0,0,0,0.8)", display: "block" }}
                  ></canvas>
                </div>
                <div className={`lottery-card dynamic-card highlight-dark-card weather-card ${humorAura}`}>
                  <div className="lottery-card-badge badge-gold">Estado de espírito</div>
                  <div className="lottery-result-box" style={{ minHeight: "80px", width: "100%" }}>
                    {humorRodando ? (
                      <span style={{ fontFamily: "'Montserrat'", fontSize: "10pt", color: "#a4b3c6", fontWeight: 600, letterSpacing: "1px" }}>SORTEANDO HUMOR...</span>
                    ) : humorResultado ? (
                      <div className="result-pista-info" style={{ animation: "sorteioRevelar 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2)", textAlign: "center", width: "100%" }}>
                        <img src={`/assets/img/${humorResultado.humor.toLowerCase()}.png`} alt={humorResultado.humor} style={{ maxWidth: "80px", display: "block", margin: "0 auto 10px auto" }} />
                        <h4 style={{ color: "#c5a059", fontFamily: "'Montserrat', sans-serif", fontSize: "14pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px", margin: 0 }}>{humorResultado.humor}</h4>
                      </div>
                    ) : (
                      <span className="result-placeholder mysterious-text">Aguardando Comando...</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "5px", width: "100%" }}>
                    <button className="btn-minimal-reveal" style={{ flex: 1 }} onClick={embaralharHumor} disabled={humorRodando}>
                      <i className="fa-solid fa-shuffle"></i> SHUFFLE
                    </button>
                    <button className="btn-trigger-lottery individual-trigger" style={{ flex: 2 }} onClick={girarHumor} disabled={humorRodando}>
                      <i className="fa-solid fa-play"></i> SORTEAR
                    </button>
                  </div>
                </div>
              </div>

              {/* CENÁRIO */}
              <div className="sorteio-roleta-cartao">
                <div className="sorteio-secao-cabecalho">
                  <div className="sorteio-secao-titulo"><i className="fa-solid fa-map"></i> Cenário de Carreira</div>
                  <p>Sorteie o cenário de treino que definirá a rodada.</p>
                </div>
                <div className="roulette-wrapper" style={{ position: "relative", width: "450px", height: "450px", margin: "0 auto" }}>
                  <div className="wheel-pointer" style={{ position: "absolute", top: "-18px", left: "50%", transform: "translateX(-50%)", fontSize: "30pt", color: "#c5a059", textShadow: "0 3px 12px rgba(0,0,0,0.9)", zIndex: 10, pointerEvents: "none" }}>▼</div>
                  <canvas
                    ref={(el) => {
                      canvasCenarioRef.current = el;
                      if (el) desenharRoletaGenerica(el, cenarioFatias, (i) => coresCenario[i.cenario] || "#2c3e50", (i) => `${i.emoji} ${i.cenario}`);
                    }}
                    width="450"
                    height="450"
                    style={{ borderRadius: "50%", border: "3px solid rgba(197, 160, 89, 0.3)", boxShadow: "0 0 35px rgba(0,0,0,0.8)", display: "block" }}
                  ></canvas>
                </div>
                <div className={`lottery-card dynamic-card highlight-dark-card weather-card ${cenarioGlow}`}>
                  <div className="lottery-card-badge badge-gold">Cenário sorteado</div>
                  <div className="lottery-result-box" style={{ minHeight: "80px", width: "100%" }}>
                    {cenarioRodando ? (
                      <span style={{ fontFamily: "'Montserrat'", fontSize: "10pt", color: "#a4b3c6", fontWeight: 600, letterSpacing: "1px" }}>SORTEANDO CENÁRIO...</span>
                    ) : cenarioResultado ? (
                      <div className="result-pista-info" style={{ animation: "sorteioRevelar 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2)", textAlign: "center", width: "100%" }}>
                        {obterUrlCenarioCloudinary(cenarioResultado.cenario) && (
                          <img
                            src={obterUrlCenarioCloudinary(cenarioResultado.cenario)}
                            alt={cenarioResultado.cenario}
                            style={{ maxWidth: "180px", width: "100%", height: "auto", display: "block", margin: "0 auto 10px auto", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        )}
                        <h4 style={{ color: "#c5a059", fontFamily: "'Montserrat', sans-serif", fontSize: "14pt", fontWeight: 700, margin: "0 0 6px 0", textTransform: "uppercase", letterSpacing: "1px" }}>
                          {cenarioResultado.emoji} {cenarioResultado.cenario}
                        </h4>
                        <span style={{ fontSize: "8.5pt", fontWeight: "bold", background: "rgba(197, 160, 89, 0.15)", color: "#c5a059", padding: "4px 14px", borderRadius: "50px", display: "inline-block", marginTop: "5px", border: "1px solid rgba(197, 160, 89, 0.3)" }}>
                          CENÁRIO CONFIRMADO
                        </span>
                      </div>
                    ) : (
                      <span className="result-placeholder mysterious-text">Aguardando Comando...</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "12px", marginTop: "5px", width: "100%" }}>
                    <button className="btn-minimal-reveal" style={{ flex: 1 }} onClick={embaralharCenario} disabled={cenarioRodando}>
                      <i className="fa-solid fa-shuffle"></i> SHUFFLE
                    </button>
                    <button className="btn-trigger-lottery individual-trigger" style={{ flex: 2 }} onClick={girarCenario} disabled={cenarioRodando}>
                      <i className="fa-solid fa-play"></i> SORTEAR
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* MECÂNICA DE SUPPORT CARDS */}
          <section className="advanced-calendar-section sorteio-secao">
            <div className="calendar-section-inner">
              <div className="sorteio-secao-cabecalho">
                <div className="sorteio-secao-titulo"><i className="fa-solid fa-layer-group"></i> Mecânica de Support Cards</div>
                <p>Defina a distribuição de atributos do deck estratégico realizando os 6 pulls da rodada.</p>
              </div>

              <div className="deck-cards-center-zone">
                {/* COLUNA ESQUERDA: roleta + botões */}
                <div className="roulette-side-column">
                  <div className="deck-roulette-container">
                    <div className="roulette-arrow-pointer"></div>
                    <canvas ref={(el) => { canvasCartasRef.current = el; if (el) desenharCanvasCartas(el, cartasFatias); }} width="580" height="580"></canvas>
                  </div>

                  <div className="action-zone" style={{ marginTop: "25px", display: "flex", gap: "12px", justifyContent: "center", alignItems: "center", width: "100%", maxWidth: "580px", marginBottom: 0 }}>
                    <button type="button" className="btn-reroll-individual" style={{ flex: 1, padding: "14px", fontSize: "10pt", whiteSpace: "nowrap" }} onClick={embaralharCartas} disabled={rodandoCartas}>
                      <i className="fa-solid fa-shuffle"></i> SHUFFLE
                    </button>

                    <button
                      type="button"
                      className="btn-trigger-lottery"
                      style={{ flex: 2, marginTop: 0, padding: "14px 20px", whiteSpace: "nowrap", opacity: cliqueAtual > 6 ? 0.5 : 1 }}
                      onClick={girarCarta}
                      disabled={rodandoCartas || cliqueAtual > 6}
                    >
                      {cliqueAtual > 6 ? "RODADA FINALIZADA" : <><i className="fa-solid fa-dice"></i> REALIZAR PULL ({cliqueAtual}/6)</>}
                    </button>

                    <button
                      type="button"
                      className="btn-reroll-individual btn-reroll-gold"
                      style={{ flex: 1, padding: "14px", fontSize: "10pt", whiteSpace: "nowrap", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "6px" }}
                      onClick={desfazerUltimaCarta}
                      disabled={rodandoCartas || cliqueAtual <= 1}
                    >
                      <i className="fa-solid fa-rotate-left"></i> Desfazer Última
                    </button>

                    <button
                      type="button"
                      className="btn-reroll-individual btn-reroll-gold"
                      style={{ flex: 1, padding: "14px", fontSize: "10pt", whiteSpace: "nowrap", display: "inline-flex", justifyContent: "center", alignItems: "center", gap: "6px" }}
                      onClick={() => setModalResetAberto(true)}
                      disabled={rodandoCartas}
                    >
                      <i className="fa-solid fa-rotate-right"></i> RESET GERAL
                    </button>
                  </div>
                </div>

                {/* COLUNA DIREITA: grid 2x3 dos 6 slots */}
                <div className="deck-side-grid-container">
                  {[1, 2, 3, 4, 5, 6].map((num) => {
                    const resultado = deckResultados[num];
                    const nomeImagem = resultado ? resultado.tipo.toLowerCase().replace("/", "") : "";
                    const classeGlow = resultado ? `glow-${nomeImagem}` : "";
                    const vazioEEmShuffle = !resultado && num >= cliqueAtual && mostrarShuffleConcluidoCartas;

                    return (
                      <div key={num} className={`deck-slot-wrapper ${classeGlow}`}>
                        <div className="deck-slot-badge">Carta {num}</div>
                        <div className="deck-slot-inner-box">
                          {resultado ? (
                            <div className="result-pista-info" style={{ animation: "sorteioRevelar 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2)", textAlign: "center", width: "100%" }}>
                              <img src={`/assets/img/${nomeImagem}.png`} alt={resultado.tipo} style={{ maxHeight: "45px", display: "block", margin: "0 auto 5px auto", filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.5))" }} />
                              <h4 style={{ color: "#c5a059", fontFamily: "'Montserrat', sans-serif", fontSize: "11pt", fontWeight: 700, textTransform: "uppercase", margin: 0, letterSpacing: "0.5px" }}>
                                {resultado.tipo}
                              </h4>
                            </div>
                          ) : vazioEEmShuffle ? (
                            <div className="deck-slot-placeholder-text" style={{ color: "#c5a059" }}>🎲 SHUFFLE CONCLUÍDO</div>
                          ) : (
                            <div className="deck-slot-placeholder-text">AGUARDANDO CARTA...</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PAINEL DE CENÁRIOS (toggle de regra do Grand Live) */}
              <div className="scenarios-horizontal-footer-column">
                <div className="scenarios-panel-badge">Cenários de temporada</div>
                <div className="scenarios-grid-horizontal">
                  <button type="button" className={`btn-scenario-item${grandLiveAtivo ? " active-reveal" : ""}`} onClick={alternarGrandLive} disabled={rodandoCartas}>
                    <span className="scenario-name">Grand Live</span>
                    <span className="status-indicator-off" style={grandLiveAtivo ? { color: "#0b1320" } : undefined}>
                      {grandLiveAtivo ? "[ATIVADO]" : "[DESLIGADO]"}
                    </span>
                  </button>
                  {["Grand Masters", "Project L'arc", "UAF Ready Go", "Great Food Festival", "Hashire!", "Twinkle Legends", "Design Your Island", "Hot Spring", "Beyond Dreams"].map((nome) => (
                    <button key={nome} type="button" className="btn-scenario-item" disabled>{nome}</button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* MODAL DE CONFIRMAÇÃO DE RESET */}
          {modalResetAberto && (
            <div className="lottery-modal" style={{ display: "flex" }} onClick={(e) => { if (e.target === e.currentTarget) setModalResetAberto(false); }}>
              <div className="lottery-modal-content lottery-card" style={{ maxWidth: "400px" }}>
                <button className="modal-close-btn" onClick={() => setModalResetAberto(false)}>&times;</button>

                <div className="lottery-card-badge badge-gold" style={{ position: "static", margin: "0 auto 15px auto", display: "table" }}>⚠️ Confirmação</div>
                <div className="lottery-icon-wrapper" style={{ marginBottom: "10px", color: "#c5a059" }}>🔄</div>
                <h3>Resetar Rodada?</h3>
                <p style={{ fontSize: "9.5pt", color: "#a4b3c6", marginBottom: "25px", padding: "0 10px", lineHeight: 1.6 }}>
                  Tem certeza que deseja limpar o histórico e resetar todos os 6 slots de Support Cards? O progresso atual será perdido.
                </p>

                <div style={{ display: "flex", gap: "15px", justifyContent: "center", width: "100%" }}>
                  <button type="button" className="btn-minimal-reveal" style={{ padding: "12px 24px", borderRadius: "50px" }} onClick={() => setModalResetAberto(false)}>
                    CANCELAR
                  </button>
                  <button type="button" className="btn-trigger-lottery" style={{ marginTop: 0, padding: "12px 28px", borderRadius: "50px" }} onClick={resetCompletoCartas}>
                    SIM, RESETAR
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LIMITAÇÃO DE CARTAS SSR */}
          <section className="advanced-calendar-section sorteio-secao">
            <div className="calendar-section-inner">
              <div className="sorteio-secao-cabecalho">
                <div className="sorteio-secao-titulo"><i className="fa-solid fa-gem"></i> Limitação de Cartas SSR</div>
                <p>Defina o máximo de cartas de raridade SSR permitidas na composição do deck estratégico.</p>
              </div>

              <div className="deck-cards-center-zone" style={{ justifyContent: "center", alignItems: "center", width: "100%" }}>
                <div className="roulette-side-column">
                  <div className="deck-roulette-container">
                    <div className="roulette-arrow-pointer"></div>
                    <canvas ref={(el) => { canvasSSRRef.current = el; if (el) desenharCanvasSSR(el, fatiasSSR); }} width="580" height="580"></canvas>
                  </div>

                  <div className="action-zone">
                    <button type="button" className="btn-reroll-individual" onClick={embaralharSSR} disabled={rodandoSSR}>
                      <i className="fa-solid fa-shuffle"></i> SHUFFLE
                    </button>
                    <button type="button" className="btn-trigger-lottery" onClick={girarSSR} disabled={rodandoSSR}>
                      <i className="fa-solid fa-play"></i> SORTEAR MÁXIMO SSR
                    </button>
                  </div>
                </div>

                <div className={`scenarios-side-column ${auraSSR}`} style={{ minHeight: "auto", padding: "25px 20px 20px 20px" }}>
                  <div className="scenarios-panel-badge">Veredito da raridade</div>
                  <div className="deck-slot-inner-box" style={{ minHeight: "90px", background: "rgba(0, 0, 0, 0.25)", border: "1px dashed rgba(197, 160, 89, 0.25)", display: "flex", justifyContent: "center", alignItems: "center" }}>
                    {rodandoSSR ? (
                      <div className="deck-slot-placeholder-text">DEFININDO RESTRIÇÃO...</div>
                    ) : mostrarCardMixedSSR ? (
                      <div className="deck-slot-placeholder-text" style={{ color: "#c5a059" }}>🎲 CARD MIXED</div>
                    ) : resultadoSSR !== null ? (
                      <div className="result-pista-info" style={{ animation: "sorteioRevelar 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2)", textAlign: "center", width: "100%" }}>
                        <h4 style={{ color: "#c5a059", fontFamily: "'Montserrat', sans-serif", fontSize: "16pt", fontWeight: 800, textTransform: "uppercase", margin: 0, letterSpacing: "0.5px" }}>
                          Máximo SSR: {resultadoSSR}
                        </h4>
                      </div>
                    ) : (
                      <div className="deck-slot-placeholder-text">AGUARDANDO SORTEIO...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* QUADRO OFICIAL DA RODADA */}
          <section className="advanced-calendar-section sorteio-secao">
            <div className="calendar-section-inner">
              <div className="sorteio-secao-cabecalho">
                <div className="sorteio-secao-titulo"><i className="fa-solid fa-table-list"></i> Quadro Oficial da Rodada</div>
                <p>Tudo o que foi sorteado até agora: pistas, clima, humor, cenário, deck e limite de SSR.</p>
              </div>

              {/* O que é igual pra rodada inteira fica num resumo só; a tabela lista as pistas */}
              {/* Resumo em blocos coloridos, no mesmo estilo da Agenda e do Guia do Meta */}
              {(() => {
                const est = { spring: "Spring", summer: "Summer", fall: "Fall", winter: "Winter" }[estacao] || estacao;
                const clima = climaResultado?.clima;
                const condicao = climaResultado?.terreno;
                const humor = humorResultado?.humor;
                const cenario = cenarioResultado?.cenario;
                const blocos = [
                  ["fa-calendar-day", "Data", dataHojeFormatada, "#c5a059"],
                  ["fa-calendar-week", "Calendário", `Ed. ${edicao} · ${mes.charAt(0).toUpperCase() + mes.slice(1)} · ${semana === "early" ? "Early" : "Late"}`, "#c5a059"],
                  [{ Spring: "fa-spa", Summer: "fa-sun", Fall: "fa-leaf", Winter: "fa-snowflake" }[est] ?? "fa-calendar", "Estação", est, { Spring: "#f59ac0", Summer: "#f0a040", Fall: "#e07a3a", Winter: "#8fd3f4" }[est] ?? "#a4b3c6"],
                  [{ Sunny: "fa-sun", Cloudy: "fa-cloud", Rainy: "fa-cloud-rain", Snowy: "fa-snowflake" }[clima] ?? "fa-cloud-sun", "Clima", clima, { Sunny: "#f3d27a", Cloudy: "#b8c4d4", Rainy: "#5fa8e8", Snowy: "#d9eefc" }[clima] ?? "#a4b3c6"],
                  ["fa-droplet", "Condição", condicao, { Firm: "#4fc76a", Good: "#a5d65a", Soft: "#f0a040", Heavy: "#e85d5d" }[condicao] ?? "#a4b3c6"],
                  ["fa-face-smile", "Humor", humor, { Great: "#f2457d", Good: "#f0a040", Normal: "#e3c43a", Bad: "#5fa8e8", Awful: "#a98be0" }[humor] ?? "#a4b3c6"],
                  ["fa-map", "Cenário", cenario, (cenario && coresCenario[cenario] && cenario !== "Livre") ? coresCenario[cenario] : "#8193a8"],
                  ["fa-gem", "Máx. SSR", resultadoSSR !== null ? String(resultadoSSR) : null, "#c39bff"],
                ];
                return (
                  <div className="sorteio-quadro-blocos">
                    {blocos.map(([icone, rotulo, valor, cor]) => (
                      <div key={rotulo} className="sorteio-quadro-bloco" style={{ background: `linear-gradient(135deg, ${cor}14, #0b1320 75%)`, borderColor: `${cor}33` }}>
                        <span className="sorteio-quadro-bloco-icone" style={{ background: `${cor}22`, borderColor: `${cor}55` }}>
                          <i className={`fa-solid ${icone}`} style={{ color: cor }}></i>
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div className="sorteio-quadro-bloco-rotulo">{rotulo}</div>
                          <div className={`sorteio-quadro-bloco-valor${valor ? "" : " pendente"}`}>{valor || "Aguardando"}</div>
                        </div>
                      </div>
                    ))}
                    <div className="sorteio-quadro-bloco deck" style={{ background: "linear-gradient(135deg, #1bd39e14, #0b1320 75%)", borderColor: "#1bd39e33" }}>
                      <span className="sorteio-quadro-bloco-icone" style={{ background: "#1bd39e22", borderColor: "#1bd39e55" }}>
                        <i className="fa-solid fa-layer-group" style={{ color: "#1bd39e" }}></i>
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="sorteio-quadro-bloco-rotulo">Deck</div>
                        {tiposDoDeckPreenchidos.length === 0 ? (
                          <div className="sorteio-quadro-bloco-valor pendente">Aguardando</div>
                        ) : (
                          <div style={{ display: "flex", gap: "3px", marginTop: "2px" }}>
                            {tiposDoDeckPreenchidos.map((tipo, i) => (
                              <img key={i} src={`/assets/img/${tipo.toLowerCase().replace("/", "")}.png`} title={tipo} alt={tipo} style={{ height: "18px" }} />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="sorteio-quadro">
                <table className="report-table-premium">
                  <thead>
                    <tr>
                      <th>Grade</th>
                      <th style={{ textAlign: "left" }}>Pista</th>
                      <th>Hipódromo</th>
                      <th>Distância</th>
                      <th>Terreno</th>
                      <th>Direção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasQuadro.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ color: "#5f758e", padding: "30px", fontStyle: "italic" }}>
                          Nenhuma pista definida ainda.
                        </td>
                      </tr>
                    ) : (
                      linhasQuadro.map(({ pista, grade }, index) => (
                        <tr key={index}>
                          <td style={{ width: "70px" }}>
                            {FITA_GRADE[grade] ? <img src={`/assets/img/${FITA_GRADE[grade]}`} alt={grade} style={{ height: "16px", display: "block", margin: "0 auto" }} /> : grade}
                          </td>
                          <td style={{ textAlign: "left", fontWeight: 700, color: "#f1ead4" }}>{pista.nome}</td>
                          <td>{pista.hipodromo}</td>
                          <td>{pista.distancia}</td>
                          <td>{pista.terreno}</td>
                          <td>{pista.direcao === "Left" ? "Esquerda" : pista.direcao === "Right" ? "Direita" : "Reta"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* ZONA DE CONTROLE: PUBLICAR */}
          <div className="sorteio-passos">
            <div className="sorteio-secao-cabecalho">
              <div className="sorteio-secao-titulo"><i className="fa-solid fa-paper-plane"></i> Publicar na Agenda</div>
              <p>Siga os passos na ordem: publicar a rodada, dividir grupos (se precisar), enviar os IDs das salas e ajustar pistas.</p>
            </div>
            <div style={{ textAlign: "center", marginBottom: "25px", borderBottom: "1px dashed rgba(197, 160, 89, 0.15)", paddingBottom: "20px" }}>
              <div className="sorteio-passo-titulo"><span>1</span> Publicar a rodada</div>
              <p style={{ color: "#a4b3c6", fontSize: "9pt", marginBottom: "15px" }}>Envie os cenários e decks sorteados para fixar o mural público na Agenda.</p>
              <button
                type="button"
                className="btn-trigger-lottery"
                style={{ width: "100%", background: "#c5a059", color: "#0b1320", fontWeight: 800, borderRadius: "50px", opacity: salvandoAgenda ? 0.6 : 1 }}
                onClick={gerarEstruturaCardsAgenda}
                disabled={salvandoAgenda}
              >
                <i className="fa-solid fa-layer-group"></i> {salvandoAgenda ? "PUBLICANDO..." : "GERAR E FIXAR CARDS NA AGENDA"}
              </button>
            </div>

            {mostrarPainelIDs && (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {/* ============================================================ */}
                {/* PASSO 2: DIVIDIR EM GRUPOS A/B (opcional, torneio público)    */}
                {/* ============================================================ */}
                <div style={{ borderBottom: "1px dashed rgba(197, 160, 89, 0.15)", paddingBottom: "20px", marginBottom: "5px" }}>
                  <div className="sorteio-passo-titulo"><span>2</span> Dividir em grupos <em>opcional</em></div>
                  <p style={{ color: "#a4b3c6", fontSize: "9pt", marginBottom: "15px", textAlign: "center" }}>
                    Se passar de 14 confirmados, divide aleatoriamente em Grupo A e Grupo B — cada corrida ganha
                    uma sala (e um código) por grupo no Passo 3. Confirmados na edição atual: <strong style={{ color: "#f1ead4" }}>{confirmadosEdicaoAtiva.length}</strong>.
                  </p>

                  {gruposJaDivididos && (
                    <>
                      <p style={{ color: "#1bd39e", fontSize: "9pt", textAlign: "center", marginBottom: "15px" }}>
                        <i className="fa-solid fa-circle-check"></i> Já dividido: Grupo A com {totalGrupoA}, Grupo B com {totalGrupoB}.
                      </p>

                      {/* 🎯 Preview dos nomes de cada grupo, pra conferir sem precisar abrir a Agenda em outra aba */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "15px" }}>
                        {["A", "B"].map((letra) => (
                          <div
                            key={letra}
                            style={{ background: "rgba(13, 22, 36, 0.6)", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "10px", padding: "12px", maxHeight: "170px", overflowY: "auto" }}
                          >
                            <p style={{ color: "#c5a059", fontSize: "8.5pt", fontWeight: 700, textAlign: "center", margin: "0 0 8px 0", letterSpacing: "0.5px" }}>
                              GRUPO {letra}
                            </p>
                            {confirmadosEdicaoAtiva
                              .filter((c) => c.grupo === letra)
                              .map((c) => (
                                <p key={c.uid} style={{ color: "#f1ead4", fontSize: "8.5pt", margin: "0 0 5px 0", textAlign: "center" }}>
                                  {c.nome}
                                </p>
                              ))}
                          </div>
                        ))}
                      </div>

                      {/* 🎯 Adicionar manualmente quem esqueceu de confirmar sozinho */}
                      <div style={{ marginBottom: "15px" }}>
                        <p style={{ color: "#a4b3c6", fontSize: "8.5pt", textAlign: "center", marginBottom: "8px" }}>
                          Alguém não confirmou sozinho mas precisa entrar num grupo? Busca no cadastro:
                        </p>
                        <input
                          type="text"
                          placeholder="Buscar treinador pelo nome..."
                          value={buscaTreinadorManual}
                          onFocus={carregarTodosTreinadoresSeNecessario}
                          onChange={(e) => setBuscaTreinadorManual(e.target.value)}
                          style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Montserrat', sans-serif", fontSize: "9.5pt", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "10px 14px", boxSizing: "border-box" }}
                        />

                        {buscaTreinadorManual.trim() !== "" && (
                          <div style={{ marginTop: "8px", background: "rgba(13, 22, 36, 0.6)", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "10px", overflow: "hidden" }}>
                            {carregandoTreinadores ? (
                              <p style={{ color: "#a4b3c6", fontSize: "8.5pt", textAlign: "center", padding: "12px", margin: 0 }}>Carregando cadastro...</p>
                            ) : resultadosBuscaTreinadorManual.length === 0 ? (
                              <p style={{ color: "#5f758e", fontSize: "8.5pt", textAlign: "center", padding: "12px", margin: 0, fontStyle: "italic" }}>
                                Nenhum treinador encontrado (ou já está confirmado).
                              </p>
                            ) : (
                              resultadosBuscaTreinadorManual.map((t) => (
                                <div
                                  key={t.uid}
                                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid rgba(197, 160, 89, 0.1)", gap: "8px", flexWrap: "wrap" }}
                                >
                                  <span style={{ color: "#f1ead4", fontSize: "9pt" }}>{t.nome}</span>
                                  <div style={{ display: "flex", gap: "6px" }}>
                                    <button
                                      type="button"
                                      disabled={adicionandoManualUid === t.uid}
                                      onClick={() => adicionarTreinadorManualmenteAoGrupo(t, "A")}
                                      style={{ background: "transparent", border: "1px solid rgba(197, 160, 89, 0.5)", color: "#c5a059", borderRadius: "50px", padding: "5px 12px", fontSize: "8pt", fontWeight: 700, cursor: adicionandoManualUid === t.uid ? "not-allowed" : "pointer" }}
                                    >
                                      + GRUPO A
                                    </button>
                                    <button
                                      type="button"
                                      disabled={adicionandoManualUid === t.uid}
                                      onClick={() => adicionarTreinadorManualmenteAoGrupo(t, "B")}
                                      style={{ background: "transparent", border: "1px solid rgba(164, 179, 198, 0.4)", color: "#a4b3c6", borderRadius: "50px", padding: "5px 12px", fontSize: "8pt", fontWeight: 700, cursor: adicionandoManualUid === t.uid ? "not-allowed" : "pointer" }}
                                    >
                                      + GRUPO B
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn-trigger-lottery"
                      style={{ flex: 1, minWidth: "220px", background: "#c5a059", color: "#0b1320", fontWeight: 800, borderRadius: "50px", opacity: dividindoGrupos ? 0.6 : 1 }}
                      onClick={dividirEmGrupos}
                      disabled={dividindoGrupos}
                    >
                      <i className="fa-solid fa-shuffle"></i>{" "}
                      {dividindoGrupos ? "DIVIDINDO..." : gruposJaDivididos ? "SORTEAR GRUPOS DE NOVO" : "DIVIDIR EM GRUPOS A/B"}
                    </button>
                    {gruposJaDivididos && (
                      <button
                        type="button"
                        className="btn-trigger-lottery"
                        style={{ flex: 1, minWidth: "180px", background: "transparent", color: "#a4b3c6", border: "2px solid rgba(164,179,198,0.4)", fontWeight: 800, borderRadius: "50px", opacity: dividindoGrupos ? 0.6 : 1 }}
                        onClick={desfazerGrupos}
                        disabled={dividindoGrupos}
                      >
                        <i className="fa-solid fa-rotate-left"></i> DESFAZER GRUPOS
                      </button>
                    )}
                  </div>
                </div>

                <div className="sorteio-passo-titulo"><span>3</span> IDs das salas <em>no dia da corrida</em></div>
                <p style={{ color: "#a4b3c6", fontSize: "9pt", marginBottom: "15px", textAlign: "center" }}>
                  Insira o código numérico gerado em cada sala individual aberta no jogo.
                  {gruposJaDivididos && " Com grupos ativos, cada corrida pede 2 códigos — um por grupo."}
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {listaChavesSalasParaInputs.map(({ idChave, nomeCorrida, grupo }) => (
                    <div key={idChave} style={{ display: "flex", flexDirection: "column", gap: "5px", textAlign: "left", width: "100%" }}>
                      <label style={{ color: "#ffffff", fontSize: "9pt", fontWeight: 600 }}>
                        <i className="fa-solid fa-key" style={{ color: "#c5a059" }}></i> {nomeCorrida}{grupo ? ` — Grupo ${grupo}` : ""}
                      </label>
                      <input
                        type="text"
                        className="custom-select"
                        placeholder="Digite o ID..."
                        style={{ backgroundColor: "#0b1320", textAlign: "center", padding: "10px" }}
                        value={valoresIDsLobby[idChave] || ""}
                        onChange={(e) => setValoresIDsLobby((v) => ({ ...v, [idChave]: e.target.value.toUpperCase() }))}
                      />
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn-trigger-lottery"
                  style={{ width: "100%", background: "transparent", color: "#c5a059", border: "2px solid #c5a059", fontWeight: 800, borderRadius: "50px", marginTop: "10px", opacity: enviandoIDs ? 0.6 : 1 }}
                  onClick={enviarIDsSalasDinamicas}
                  disabled={enviandoIDs}
                >
                  <i className="fa-solid fa-satellite-dish"></i> {enviandoIDs ? "ENVIANDO..." : "INJETAR IDS NAS SALAS DA AGENDA"}
                </button>

                {/* ============================================================ */}
                {/* PASSO 4: GERENCIAR PISTAS DA EDIÇÃO (adicionar/remover)       */}
                {/* ============================================================ */}
                <div style={{ borderTop: "1px dashed rgba(197, 160, 89, 0.15)", marginTop: "15px", paddingTop: "20px" }}>
                  <div className="sorteio-passo-titulo"><span>4</span> Gerenciar pistas da edição</div>
                  <p style={{ color: "#a4b3c6", fontSize: "9pt", marginBottom: "15px", textAlign: "center" }}>
                    Adicione ou remova uma corrida da edição já publicada, sem sortear tudo de novo. O clima, cenário e deck da rodada continuam os mesmos.
                  </p>

                  {pistasPublicadasAtuais.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "18px" }}>
                      {pistasPublicadasAtuais.map((p) => (
                        <div
                          key={p.nome}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
                            background: "rgba(11, 19, 32, 0.7)", border: "1px solid rgba(197, 160, 89, 0.2)",
                            borderRadius: "8px", padding: "10px 14px",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                            {FITA_GRADE[p.grade]
                              ? <img src={`/assets/img/${FITA_GRADE[p.grade]}`} alt={p.grade} style={{ height: "16px", flexShrink: 0 }} />
                              : <span style={{ flexShrink: 0, color: "#8193a8", fontSize: "8pt", fontWeight: 800 }}>{p.grade}</span>}
                            <span style={{ color: "#f1ead4", fontSize: "9.5pt", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {p.nome}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removerPistaExtra(p)}
                            disabled={removendoPistaExtra === p.nome}
                            style={{
                              flexShrink: 0, background: "transparent", border: "1px solid rgba(255,77,77,0.5)",
                              color: "#ff4d4d", borderRadius: "6px", padding: "6px 10px", fontSize: "8pt",
                              fontWeight: 700, cursor: "pointer", opacity: removendoPistaExtra === p.nome ? 0.5 : 1,
                              display: "flex", alignItems: "center", gap: "6px",
                            }}
                          >
                            <i className="fa-solid fa-trash"></i> {removendoPistaExtra === p.nome ? "REMOVENDO..." : "REMOVER"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ position: "relative", width: "100%" }}>
                    <input
                      type="text"
                      className="custom-select"
                      placeholder="Buscar pista pelo nome..."
                      style={{ backgroundColor: "#0b1320", padding: "10px 14px", width: "100%", boxSizing: "border-box" }}
                      value={pistaExtraSelecionada ? pistaExtraSelecionada.nome : buscaPistaExtra}
                      onFocus={() => setSugestoesPistaExtraAbertas(true)}
                      onBlur={() => setTimeout(() => setSugestoesPistaExtraAbertas(false), 150)}
                      onChange={(e) => {
                        setBuscaPistaExtra(e.target.value);
                        setPistaExtraSelecionada(null);
                        setSugestoesPistaExtraAbertas(true);
                      }}
                    />

                    {sugestoesPistaExtraAbertas && !pistaExtraSelecionada && resultadosBuscaPistaExtra.length > 0 && (
                      <div
                        style={{
                          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
                          background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "8px",
                          boxShadow: "0 10px 25px rgba(0,0,0,0.5)", maxHeight: "220px", overflowY: "auto",
                        }}
                      >
                        {resultadosBuscaPistaExtra.map((p) => (
                          <div
                            key={p.nome}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setPistaExtraSelecionada(p); setBuscaPistaExtra(""); setSugestoesPistaExtraAbertas(false); }}
                            style={{
                              padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between",
                              alignItems: "center", gap: "10px", borderBottom: "1px solid rgba(164,179,198,0.08)",
                            }}
                          >
                            <span style={{ color: "#f1ead4", fontSize: "9.5pt" }}>{p.nome}</span>
                            <span style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 700, flexShrink: 0 }}>{p.grade} · {p.hipodromo}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="btn-trigger-lottery"
                    style={{ width: "100%", background: "#c5a059", color: "#0b1320", fontWeight: 800, borderRadius: "50px", marginTop: "12px", opacity: adicionandoPistaExtra || !pistaExtraSelecionada ? 0.6 : 1 }}
                    onClick={adicionarPistaExtra}
                    disabled={adicionandoPistaExtra || !pistaExtraSelecionada}
                  >
                    <i className="fa-solid fa-circle-plus"></i>{" "}
                    {adicionandoPistaExtra ? "ADICIONANDO..." : pistaExtraSelecionada ? `ADICIONAR "${pistaExtraSelecionada.nome.toUpperCase()}"` : "SELECIONE UMA PISTA ACIMA"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

export default Sorteio;