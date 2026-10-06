// 🎯 src/pages/GuiaMeta.jsx
// Guia do Meta (ferramenta Pocolord): decks e personagens recomendados por
// Champions Meeting / League of Heroes. Dados de src/data/metaPvp.json,
// carregado só quando a página abre.

import { useMemo, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { obterUrlImagemPersonagem } from "../utils/cloudinary";
import MinimapaPista from "../components/MinimapaPista";
import AceleracoesPista from "../components/AceleracoesPista";
import PainelAnotacoesMeta from "../components/PainelAnotacoesMeta";
import TodasAnotacoesMeta from "../components/TodasAnotacoesMeta";
import IconeTipoCarta from "../components/IconeTipoCarta";
import ComposicoesEquipe from "../components/ComposicoesEquipe";
import DiagramaPistaGuia from "../components/DiagramaPistaGuia";
import { calcularRegioesSkill, catalogoSkillsPorId, ESTRATEGIA_POR_ESTILO } from "../utils/skillsPista";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebase";
import { anotacaoVazia, cartaPorId, classeRaridade, carregarAnotacao, gravarAnotacao, assinaturaAnotacao, lerEventoAtual, definirEventoAtual } from "../utils/anotacoesMeta";
import { useNivelAcesso } from "../utils/nivelAcesso";
import { carregarIndice, carregarEvento, importarJsonParaFirebase } from "../utils/guiaMetaDados";
import { portraitDaRoupa } from "../utils/iconeRoupa";
import portraitsPorNome from "../data/portraitsPorNome.json";
import courseData from "../uma-skill-tools/data/course_data.json";
import { tracknames } from "../data/pistasCourseData";

const SEM_ACELERACOES = [];

// Nome do hipódromo na planilha -> nome nos dados do jogo.
const ALIAS_HIPODROMO = { Chukyo: "Chuukyo" };
// Quando há mais de um traçado (interno/externo), o externo (course 3) é o usado nesses eventos.
function acharCourseId(pista) {
  const nome = ALIAS_HIPODROMO[pista.hipodromo] ?? pista.hipodromo;
  const idPista = Object.keys(tracknames).find((k) => tracknames[k][1] === nome);
  if (!idPista) return null;
  const distancia = parseInt(pista.distancia, 10);
  const superficie = pista.terreno === "Dirt" ? 2 : 1;
  const opcoes = Object.entries(courseData)
    .filter(([, c]) => String(c.raceTrackId) === idPista && c.distance === distancia && c.surface === superficie)
    .sort(([, a], [, b]) => b.course - a.course);
  return opcoes[0]?.[0] ?? null;
}

const ESTILOS = [
  { chave: "Front", nome: "Front Runner" },
  { chave: "Pace", nome: "Pace Chaser" },
  { chave: "Late", nome: "Late Surger" },
  { chave: "End", nome: "End Closer" },
];
const NIVEIS_DECK = [
  { chave: "deck_iniciante", nome: "Iniciante", cor: "#7fb37a" },
  { chave: "deck_padrao", nome: "Padrão", cor: "#5fa8e8" },
  { chave: "deck_baleia", nome: "Baleia", cor: "#c5a059" },
];
const STATUS = [
  { chave: "speed", nome: "Speed", cor: "#4ea3f5" },
  { chave: "stamina", nome: "Stamina", cor: "#e85d5d" },
  { chave: "power", nome: "Power", cor: "#f0a040" },
  { chave: "guts", nome: "Guts", cor: "#e27ab6" },
  { chave: "wit", nome: "Wit", cor: "#4fc76a" },
];
// IDs genéricos da planilha ("qualquer carta de ...").
const GENERICAS = {
  12301: { nome: "Speed", cor: "#4ea3f5", icone: "speed" },
  12302: { nome: "Stamina", cor: "#e85d5d", icone: "stamina" },
  12303: { nome: "Power", cor: "#f0a040", icone: "power" },
  12304: { nome: "Guts", cor: "#e27ab6", icone: "guts" },
  12305: { nome: "Wit", cor: "#4fc76a", icone: "wit" },
};

// Arte completa da carta (300x400) em public/assets/img/cartas.
const urlCarta = (id) => `/assets/img/cartas/${id}.webp`;
// Separa "1100+1 Gold" em valor e skills de recuperação exigidas ("+1 Gold", "+1 white").
function separarRecover(valor) {
  if (!valor) return { valor: "—", recovers: [] };
  const recovers = [...String(valor).matchAll(/\+\s*(\d+)\s*(gold|white)/gi)].map((m) => ({ qtd: m[1], tipo: m[2].toLowerCase() }));
  return { valor: String(valor).replace(/\+\s*\d+\s*(gold|white)/gi, "").trim() || "—", recovers };
}

// Selo de skill de recuperação ("+1 Gold" nos status = sempre Gold de recover).
function SeloRecover({ qtd, tipo }) {
  const gold = tipo === "gold";
  if (qtd === "0") {
    return <span title="Não precisa de skill de recuperação" style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px solid rgba(164, 179, 198, 0.3)", color: "#8193a8", borderRadius: "4px", padding: "1px 7px", fontSize: "7.5pt", fontWeight: 800 }}><i className="fa-solid fa-heart-crack"></i> Sem recover</span>;
  }
  return (
    <span title={`Precisa de ${qtd} skill de recuperação ${gold ? "dourada" : "branca"}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: gold ? "linear-gradient(135deg, #f3d27a, #c5a059)" : "#d9dee6", color: "#0b1320", borderRadius: "4px", padding: "1px 7px", fontSize: "7.5pt", fontWeight: 800, boxShadow: gold ? "0 0 8px rgba(243, 210, 122, 0.45)" : "none" }}>
      <i className="fa-solid fa-heart-pulse"></i> +{qtd} {gold ? "Gold" : "White"} recover
    </span>
  );
}

const t = (v) => v; // dados da pista mantidos em inglês, como no jogo

const estiloCaixa = { background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.18)", borderRadius: "12px", padding: "18px 20px", marginBottom: "16px" };
const estiloTitulo = { margin: "0 0 12px", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "12pt" };
const estiloEtiqueta = { display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid rgba(197, 160, 89, 0.3)", background: "rgba(197, 160, 89, 0.08)", color: "#d8c08a", borderRadius: "50px", padding: "5px 14px", fontSize: "9.5pt", fontWeight: 700 };
const estiloRotulo = { color: "#5f758e", fontSize: "7pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px" };

// Imagem da personagem: tenta o nome exato e depois sem a variante "(Valentine)".
function FotoPersonagem({ nome, cardId: idRoupa, tamanho = 64 }) {
  const cardId = idRoupa ?? portraitsPorNome[nome];
  const url = (cardId && portraitDaRoupa(cardId)) || obterUrlImagemPersonagem(nome) || obterUrlImagemPersonagem(nome.replace(/\s*\(.*\)\s*$/, ""));
  return url ? (
    <img src={url} alt="" style={{ width: tamanho, height: tamanho, borderRadius: "10px", objectFit: "cover", background: "#0b1320" }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
  ) : (
    <div style={{ width: tamanho, height: tamanho, borderRadius: "10px", background: "#0b1320", display: "flex", alignItems: "center", justifyContent: "center", color: "#5f758e" }}>
      <i className="fa-solid fa-horse-head"></i>
    </div>
  );
}

const LARGURA_CARTA = 128;

function Carta({ carta, emprestimo, aoAdicionar }) {
  const [falhou, setFalhou] = useState(false);
  const generica = GENERICAS[carta.id];
  const adicionavel = aoAdicionar && !generica && carta.id;
  return (
    <div title={[adicionavel ? "Clique para adicionar ao seu deck" : null, carta.nome, carta.nota, carta.alternativa].filter(Boolean).join(" · ")} onClick={adicionavel ? () => aoAdicionar(carta.id, emprestimo) : undefined} className={adicionavel ? "item-adicionavel" : undefined} style={{ width: LARGURA_CARTA, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div className={`cartao-perfil ${generica ? "" : classeRaridade(carta.id)}`} style={{ position: "relative", width: "100%", aspectRatio: "3 / 4", borderRadius: "8px", overflow: "hidden", background: generica ? `linear-gradient(160deg, ${generica.cor}2e, #0b1320 75%)` : "#0b1320", border: `${emprestimo ? 2 : 1}px solid ${emprestimo ? "#c5a059" : "rgba(164, 179, 198, 0.18)"}`, boxShadow: emprestimo ? "0 0 12px rgba(197, 160, 89, 0.3)" : "0 4px 10px rgba(0, 0, 0, 0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {generica ? (
          <img src={`/assets/img/textures/${generica.icone}.webp`} alt={generica.nome} style={{ width: "56px", height: "56px", objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))" }} />
        ) : !falhou && carta.id ? (
          <img src={urlCarta(carta.id)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={() => setFalhou(true)} />
        ) : (
          <i className="fa-solid fa-id-card" style={{ fontSize: "18pt", color: "#5f758e" }}></i>
        )}
        {!generica && carta.id && <IconeTipoCarta id={carta.id} tamanho={30} topo={emprestimo ? 24 : 5} />}
        {adicionavel && (
          <span className="sobreposicao-adicionar" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11, 19, 32, 0.55)", borderRadius: "inherit", pointerEvents: "none" }}>
            <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg, #f3d27a, #c5a059)", color: "#0b1320", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13pt", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)" }}><i className="fa-solid fa-plus"></i></span>
          </span>
        )}
        {emprestimo && (
          <span style={{ position: "absolute", top: 0, left: 0, right: 0, background: "linear-gradient(90deg, #c5a059, #f3d27a)", color: "#0b1320", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "0.6px", textAlign: "center", padding: "3px 0" }}>
            <i className="fa-solid fa-handshake"></i> BORROW
          </span>
        )}
      </div>
      <div style={{ color: "#f1ead4", fontSize: "9pt", fontWeight: 700, marginTop: "6px", textAlign: "center", width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {generica ? `Qualquer ${generica.nome}` : carta.nome}
      </div>
      {carta.nota && (
        <div style={{ color: carta.obrigatorio ? "#ff8a7d" : "#8193a8", fontSize: "8.5pt", fontWeight: 700, textAlign: "center", lineHeight: 1.3, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{carta.nota}</div>
      )}
      {carta.alternativa && <div style={{ color: "#5f758e", fontSize: "7.5pt", fontStyle: "italic", textAlign: "center", lineHeight: 1.3, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{carta.alternativa}</div>}
    </div>
  );
}

function Deck({ titulo, subtitulo, cartas, cor, aoAdicionar, aoCopiar }) {
  if (!cartas?.length) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.1)", borderLeft: `3px solid ${cor}`, borderRadius: "10px", overflow: "hidden" }}>
      <div style={{ flex: "0 0 130px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px", padding: "12px 14px", background: `linear-gradient(90deg, ${cor}14, transparent)` }}>
        <span style={{ color: cor, fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "11pt", lineHeight: 1.2 }}>{titulo}</span>
        {subtitulo && <span style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 600, lineHeight: 1.35 }}>{subtitulo}</span>}
        {aoCopiar && (
          <button type="button" onClick={aoCopiar} title="Copiar as 6 cartas para o deck selecionado no painel" style={{ marginTop: "6px", alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "5px", background: `${cor}1a`, border: `1px solid ${cor}66`, color: cor, borderRadius: "6px", padding: "4px 9px", fontSize: "7.5pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'" }}>
            <i className="fa-solid fa-copy"></i> Copiar deck
          </button>
        )}
      </div>
      <div style={{ flex: "1 1 500px", display: "flex", flexWrap: "wrap", gap: "12px", padding: "14px 16px" }}>
        {cartas.map((c, i) => <Carta key={i} carta={c} emprestimo={c.slot === "emprestimo"} aoAdicionar={aoAdicionar} />)}
      </div>
    </div>
  );
}

// Ranking "Front>>Blaze>=End>Late>Pace" -> itens e operadores.
const iconeEstilo = (estilo) => `/assets/img/textures/${estilo.toLowerCase()}.webp`;
const COR_ESTILO = { Front: "#f0a040", Pace: "#5fa8e8", Late: "#a98be0", End: "#4fc76a" };
function lerRanking(texto) {
  return texto.split(/\s*(>+=?|=)\s*/).filter(Boolean).map((parte) => {
    if (/^(>+=?|=)$/.test(parte)) return { operador: parte };
    const [, nome, nota] = parte.match(/^(.*?)\s*(\(.*\))?$/);
    const normal = nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase();
    const estilo = COR_ESTILO[normal] ? normal : null;
    return { nome: estilo ?? nome, estilo, nota, cor: COR_ESTILO[normal] ?? "#c5a059" };
  });
}
// "Secret Stats: Sta and Gut" -> chaves de STATUS; o resto do texto continua como nota.
const ABREV_STATUS = { spd: "speed", spe: "speed", sta: "stamina", pow: "power", pwr: "power", gut: "guts", wit: "wit", int: "wit" };
function lerStatusSecreto(texto) {
  const m = texto?.match(/secret stats?\s*:\s*([^.\n]+)/i);
  if (!m) return { secretos: [], resto: texto };
  const secretos = m[1].split(/\s*(?:and|,|\+|&)\s*/i)
    .map((p) => ABREV_STATUS[p.trim().toLowerCase().slice(0, 3)])
    .filter(Boolean);
  return { secretos, resto: texto.replace(m[0], "").trim() };
}

const siglaEvento = (e) => (e.tipo === "League of Heroes" ? "LoH" : "CM");
const nomeCurto = (e) => e.nome.replace(e.id, "").trim() || e.tipo;
const resumoPista = (e) => {
  const p = e.informacoes_pista;
  return `${p.hipodromo} · ${String(p.distancia).replace(/m$/, "")}m · ${t(p.terreno)}`;
};
const incompleto = (e) => !e.status_recomendados?.speed || e.status_recomendados.speed === "wip";
const ABAS_EVENTO = ["Champions Meeting", "League of Heroes"];

// Seletor de evento: botão com o evento atual, setas anterior/próximo e
// painel com abas CM/LoH e busca por nome, número, hipódromo ou distância.
// Evento que a página abre: o atual (se visível); senão o CM mais recente com status definidos.
function eventoPadrao(eventos, atual) {
  const visiveis = eventos.filter((e) => !e.oculto);
  if (atual && visiveis.some((e) => e.id === atual)) return atual;
  const cms = visiveis.filter((e) => e.tipo === "Champions Meeting");
  const completo = [...cms].reverse().find((e) => e.status_recomendados?.speed && e.status_recomendados.speed !== "wip");
  return (completo ?? cms.at(-1) ?? visiveis.at(-1) ?? eventos.at(-1))?.id ?? null;
}

function SeletorEvento({ eventos, atual, aoEscolher, eventoAtual }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState(atual.tipo);
  const [busca, setBusca] = useState("");
  const ref = useRef(null);
  const listaRef = useRef(null);

  // Ao abrir, centraliza o evento atual na lista.
  useEffect(() => {
    const lista = listaRef.current;
    const el = lista?.querySelector("[data-selecionado]");
    if (el) lista.scrollTop = el.offsetTop - lista.clientHeight / 2 + el.clientHeight / 2;
  }, [aberto, aba]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  // Ordem cronológica dentro do mesmo tipo, para as setas.
  const mesmoTipo = eventos.filter((e) => e.tipo === atual.tipo).sort((a, b) => a.numero - b.numero);
  const pos = mesmoTipo.findIndex((e) => e.id === atual.id);
  const anterior = mesmoTipo[pos - 1];
  const proximo = mesmoTipo[pos + 1];

  const termo = busca.trim().toLowerCase();
  const lista = eventos
    .filter((e) => e.tipo === aba)
    .filter((e) => !termo || `${e.nome} ${resumoPista(e)} ${e.informacoes_pista.tipo_distancia}`.toLowerCase().includes(termo))
    .sort((a, b) => a.numero - b.numero);

  const estiloSeta = (ativo) => ({ width: "36px", background: "#0b1320", border: "1px solid rgba(197, 160, 89, 0.3)", color: ativo ? "#c5a059" : "#3a4a5e", cursor: ativo ? "pointer" : "default", borderRadius: "8px" });

  return (
    <div ref={ref} className="seletor-evento" style={{ position: "relative", display: "flex", gap: "6px", alignItems: "stretch" }}>
      <button type="button" title={anterior?.nome ?? ""} disabled={!anterior} onClick={() => aoEscolher(anterior.id)} style={estiloSeta(!!anterior)}>
        <i className="fa-solid fa-chevron-left"></i>
      </button>
      <button type="button" onClick={() => { setAba(atual.tipo); setAberto((v) => !v); }} style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "250px", textAlign: "left", background: "#0b1320", border: `1px solid ${aberto ? "#c5a059" : "rgba(197, 160, 89, 0.3)"}`, borderRadius: "10px", padding: "7px 12px", cursor: "pointer", fontFamily: "'Montserrat'" }}>
        <span style={{ background: "rgba(197, 160, 89, 0.15)", color: "#c5a059", borderRadius: "6px", padding: "4px 7px", fontSize: "8pt", fontWeight: 800, whiteSpace: "nowrap" }}>{siglaEvento(atual)} #{atual.numero}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", color: "#f1ead4", fontSize: "9.5pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nomeCurto(atual)}</span>
          <span style={{ display: "block", color: "#5f758e", fontSize: "7.5pt" }}>{resumoPista(atual)}</span>
        </span>
        <i className={`fa-solid fa-chevron-${aberto ? "up" : "down"}`} style={{ color: "#c5a059", fontSize: "8pt" }}></i>
      </button>
      <button type="button" title={proximo?.nome ?? ""} disabled={!proximo} onClick={() => aoEscolher(proximo.id)} style={estiloSeta(!!proximo)}>
        <i className="fa-solid fa-chevron-right"></i>
      </button>

      {aberto && (
        <div className="dropdown-evento" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, width: "min(440px, calc(100vw - 32px))", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "12px", boxShadow: "0 16px 40px rgba(0, 0, 0, 0.55)", overflow: "hidden" }}>
          <div style={{ display: "flex", borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
            {ABAS_EVENTO.map((valor) => (
              <button key={valor} type="button" onClick={() => setAba(valor)} style={{ flex: 1, background: "transparent", border: "none", borderBottom: `2px solid ${aba === valor ? "#c5a059" : "transparent"}`, color: aba === valor ? "#c5a059" : "#8193a8", padding: "12px 0", fontSize: "10pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'" }}>
                {valor}
              </button>
            ))}
          </div>
          <div style={{ padding: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "8px", padding: "6px 10px" }}>
              <i className="fa-solid fa-magnifying-glass" style={{ color: "#5f758e", fontSize: "8.5pt" }}></i>
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, número, hipódromo..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1ead4", fontSize: "10.5pt", fontFamily: "'Montserrat'" }} />
            </div>
          </div>
          <div ref={listaRef} className="rolagem-dourada" style={{ position: "relative", height: "440px", overflowY: "auto", padding: "0 6px 6px" }}>
            {lista.length === 0 && <p style={{ margin: "12px", color: "#5f758e", fontSize: "8.5pt", textAlign: "center" }}>Nenhum evento encontrado.</p>}
            {lista.map((e) => {
              const selecionado = e.id === atual.id;
              return (
                <button key={e.id} type="button" data-selecionado={selecionado || undefined} onClick={() => { aoEscolher(e.id); setAberto(false); setBusca(""); }} className="linha-clicavel" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", background: selecionado ? "rgba(197, 160, 89, 0.12)" : "transparent", border: "none", borderRadius: "8px", padding: "7px 8px", cursor: "pointer", fontFamily: "'Montserrat'" }}>
                  <span style={{ width: "42px", color: selecionado ? "#c5a059" : "#8193a8", fontSize: "11pt", fontWeight: 800 }}>#{e.numero}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: "#f1ead4", fontSize: "11pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nomeCurto(e)}</span>
                    <span style={{ display: "block", color: "#5f758e", fontSize: "9pt" }}>{resumoPista(e)}</span>
                  </span>
                  {e.id === eventoAtual && <span style={{ background: "#c5a059", color: "#0b1320", borderRadius: "4px", padding: "0 6px", fontSize: "7.5pt", fontWeight: 800 }}>ATUAL</span>}
                  {e.oculto && <span style={{ border: "1px solid rgba(232, 128, 111, 0.5)", color: "#e8806f", borderRadius: "4px", padding: "0 5px", fontSize: "7.5pt", fontWeight: 800 }}><i className="fa-solid fa-eye-slash"></i> OCULTO</span>}
                  {incompleto(e) && <span style={{ border: "1px solid rgba(164, 179, 198, 0.25)", color: "#8193a8", borderRadius: "4px", padding: "0 5px", fontSize: "7.5pt", fontWeight: 800 }}>EM ANDAMENTO</span>}
                  {selecionado && <i className="fa-solid fa-check" style={{ color: "#c5a059", fontSize: "9pt" }}></i>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GuiaMeta() {
  const [dados, setDados] = useState(null);
  const [idEscolhido, setIdEvento] = useState("");
  const [estilo, setEstilo] = useState("Front");
  // Anotações pessoais por evento (por enquanto só na memória; salvar vem depois).
  const [anotacoes, setAnotacoes] = useState({});
  const [painelAberto, setPainelAberto] = useState(false);
  const [deckAtivo, setDeckAtivo] = useState(0);
  const [visao, setVisao] = useState("guia"); // "guia" | "anotacoes"
  const [diagramaAberto, setDiagramaAberto] = useState(false);
  // O diagrama continua montado durante a animação de fechar (senão o painel encolhe vazio).
  const [diagramaMontado, setDiagramaMontado] = useState(false);
  const alternarDiagrama = () => {
    if (!diagramaAberto) setDiagramaMontado(true);
    setDiagramaAberto(!diagramaAberto);
  };
  const [parametros] = useSearchParams();
  const eventoDaUrl = parametros.get("evento"); // ?evento=CM #20 (vindo do editor)
  const [eventoAtual, setEventoAtual] = useState(null);
  const nivel = useNivelAcesso();
  const ehAdmin = nivel === "admin";
  // Evento oculto (pelo editor) não abre para quem não é admin: cai no evento padrão.
  const bloqueado = dados && nivel !== undefined && !ehAdmin && dados.eventos.find((e) => e.id === idEscolhido)?.oculto;
  const idEvento = bloqueado ? eventoPadrao(dados.eventos, eventoAtual) : idEscolhido;
  const marcarComoAtual = async () => {
    try {
      await definirEventoAtual(idEvento);
      setEventoAtual(idEvento);
    } catch (erro) {
      console.error("Erro ao definir o evento atual:", erro);
    }
  };
  // Firestore: assinatura do que está salvo por evento (undefined = ainda não carregado).
  const [uid, setUid] = useState(null);
  const [salvas, setSalvas] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (u) => setUid(u?.uid ?? null)), []);
  useEffect(() => {
    if (!uid || !idEvento || salvas[idEvento] !== undefined) return undefined;
    let cancelado = false;
    carregarAnotacao(uid, idEvento)
      .then((dados) => {
        if (cancelado) return;
        // Se a pessoa já mexeu antes de carregar, mantém o que está na tela.
        if (dados) setAnotacoes((a) => (a[idEvento] ? a : { ...a, [idEvento]: dados }));
        setSalvas((sv) => ({ ...sv, [idEvento]: assinaturaAnotacao(dados) }));
      })
      .catch((erro) => {
        console.error("Erro ao carregar as anotações:", erro);
        if (!cancelado) setSalvas((sv) => ({ ...sv, [idEvento]: assinaturaAnotacao(null) }));
      });
    return () => { cancelado = true; };
  }, [uid, idEvento, salvas]);
  // Aviso do navegador ao sair com alterações não salvas.
  useEffect(() => {
    const pendente = Object.entries(anotacoes).some(([id, a]) => salvas[id] !== undefined && assinaturaAnotacao(a) !== salvas[id]);
    if (!pendente) return undefined;
    const aoSair = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [anotacoes, salvas]);
  const [aviso, setAviso] = useState(null); // { texto, tipo }
  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    window.scrollTo(0, 0);
    Promise.all([carregarIndice(), lerEventoAtual()]).then(([d, atual]) => {
      setDados(d);
      setEventoAtual(atual);
      // Abre no evento atual (definido pelo admin); sem ele, no CM mais recente com status definidos.
      if (eventoDaUrl && d.eventos.some((e) => e.id === eventoDaUrl)) return setIdEvento(eventoDaUrl);
      return setIdEvento(eventoPadrao(d.eventos, atual));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na abertura da página
  }, []);

  // Eventos ocultos (pelo editor) só aparecem para admin.
  const eventosVisiveis = useMemo(() => (dados ? dados.eventos.filter((e) => ehAdmin || !e.oculto) : []), [dados, ehAdmin]);

  // Conteúdo completo do evento escolhido (lido sob demanda, com cache).
  const [eventosCompletos, setEventosCompletos] = useState({});
  const [erroEvento, setErroEvento] = useState(null);
  const [ultimoCarregado, setUltimoCarregado] = useState(null);
  useEffect(() => {
    if (!dados || !idEvento || eventosCompletos[idEvento]) return undefined;
    let cancelado = false;
    carregarEvento(idEvento)
      .then((e) => {
        if (cancelado) return;
        if (e) {
          setEventosCompletos((m) => ({ ...m, [idEvento]: e }));
          setUltimoCarregado(idEvento);
        }
        else setErroEvento(idEvento);
      })
      .catch((erro) => { console.error("Erro ao carregar o evento:", erro); if (!cancelado) setErroEvento(idEvento); });
    return () => { cancelado = true; };
  }, [dados, idEvento, eventosCompletos]);
  // Enquanto o próximo evento carrega, continua mostrando o anterior (sem piscar a página).
  const evento = eventosCompletos[idEvento] ?? eventosCompletos[ultimoCarregado];
  const carregandoEvento = !eventosCompletos[idEvento] && erroEvento !== idEvento;

  const [importando, setImportando] = useState(false);
  const importarDados = async () => {
    setImportando(true);
    try {
      const total = await importarJsonParaFirebase();
      window.alert(`${total} eventos importados para o Firebase. A página vai recarregar.`);
      window.location.reload();
    } catch (erro) {
      console.error("Erro ao importar o Guia do Meta:", erro);
      window.alert("Não foi possível importar. Confira a regra do Firestore para guia_meta_eventos.");
      setImportando(false);
    }
  };

  if (dados && !evento && erroEvento === idEvento) {
    return (
      <main className="main-layout-wrapper" style={{ marginTop: "130px", minHeight: "60vh", textAlign: "center", color: "#e8806f" }}>
        <i className="fa-solid fa-triangle-exclamation"></i> Não foi possível carregar este evento.
      </main>
    );
  }
  if (!dados || !evento) {
    return (
      <main className="main-layout-wrapper" style={{ marginTop: "130px", minHeight: "60vh", textAlign: "center", color: "#c5a059" }}>
        <i className="fa-solid fa-circle-notch fa-spin"></i> Carregando guia...
      </main>
    );
  }

  // Ações do painel "Minhas anotações" disparadas pelas recomendações.
  const anotacaoAtual = anotacoes[evento.id] ?? anotacaoVazia();
  const salvarAnotacao = (nova) => setAnotacoes((a) => ({ ...a, [evento.id]: nova }));
  const avisar = (texto, tipo = "ok") => setAviso({ texto, tipo });
  const nomeDeck = `Deck ${deckAtivo + 1}`;
  const salvoAtual = salvas[evento.id];
  const estadoSalvar = !uid ? "sem-login" : salvoAtual === undefined ? "carregando" : salvando ? "salvando" : erroSalvar ? "erro" : assinaturaAnotacao(anotacaoAtual) !== salvoAtual ? "pendente" : "salvo";
  const salvarNoFirebase = async () => {
    if (!uid || salvando) return;
    setSalvando(true);
    setErroSalvar(false);
    try {
      await gravarAnotacao(uid, evento, anotacaoAtual);
      setSalvas((sv) => ({ ...sv, [evento.id]: assinaturaAnotacao(anotacaoAtual) }));
      avisar("Anotações salvas.");
    } catch (erro) {
      console.error("Erro ao salvar as anotações:", erro);
      setErroSalvar(true);
      avisar("Não foi possível salvar. Tente de novo.", "aviso");
    } finally {
      setSalvando(false);
    }
  };
  const trocarDeckAtivo = (alteracao) => salvarAnotacao({ ...anotacaoAtual, decks: anotacaoAtual.decks.map((d, i) => (i === deckAtivo ? { ...d, ...alteracao(d) } : d)) });
  const adicionarCarta = (id, emprestimo) => {
    const cartas = anotacaoAtual.decks[deckAtivo].cartas;
    if (cartas.includes(id)) return avisar(`Essa carta já está no ${nomeDeck}.`, "aviso");
    const ultimo = cartas.length - 1;
    const livres = cartas.map((c, i) => (c ? null : i)).filter((i) => i !== null);
    const normais = livres.filter((i) => i !== ultimo);
    const espaco = emprestimo && livres.includes(ultimo) ? ultimo : normais[0] ?? (livres.includes(ultimo) ? ultimo : null);
    if (espaco === null) return avisar(`O ${nomeDeck} está cheio. Remova uma carta ou escolha outro deck.`, "aviso");
    trocarDeckAtivo((d) => ({ cartas: d.cartas.map((c, i) => (i === espaco ? id : c)) }));
    return avisar(`${cartaPorId.get(id)?.nome ?? "Carta"} adicionada ao ${nomeDeck}${espaco === ultimo ? " (Borrow)" : ""}.`);
  };
  const copiarDeck = (cartasRecomendadas) => {
    const novas = Array(anotacaoAtual.decks[deckAtivo].cartas.length).fill(null);
    cartasRecomendadas.forEach((c) => {
      if (!c.id || GENERICAS[c.id]) return;
      const i = c.slot === "emprestimo" ? novas.length - 1 : Number(c.slot) - 1;
      if (i >= 0 && i < novas.length) novas[i] = c.id;
    });
    trocarDeckAtivo(() => ({ cartas: novas }));
    avisar(`Deck copiado para o ${nomeDeck}.`);
  };
  const escolherPersonagem = (nome, cardId) => {
    const id = cardId ?? portraitsPorNome[nome];
    if (!id) return avisar("Não encontrei a roupa dessa personagem.", "aviso");
    trocarDeckAtivo(() => ({ personagem: id }));
    return avisar(`${nome} definida no ${nomeDeck}.`);
  };

  const pista = evento.informacoes_pista;
  const courseId = acharCourseId(pista);
  const st = evento.status_recomendados;
  const dadosEstilo = evento.estilos?.[estilo];
  const dadosCorrida = courseId ? courseData[courseId] : null;
  const skillsNoDiagrama = diagramaMontado && dadosCorrida
    ? (dadosEstilo?.aceleracoes ?? []).map((id) => catalogoSkillsPorId.get(String(id))).filter(Boolean).map((sk) => ({
      ...sk, ...calcularRegioesSkill(dadosCorrida, sk.id, ESTRATEGIA_POR_ESTILO[estilo] ?? 2),
    }))
    : [];
  const alternativas = [st.alternativa_1, st.alternativa_2].filter((a) => a && (a.stamina || a.guts));

  return (
    <div className="guia-layout">
    <main className="main-layout-wrapper" style={{ marginTop: "130px", padding: "0 16px 60px", fontFamily: "'Montserrat', sans-serif", maxWidth: "1200px", flex: "0 1 1200px", minWidth: 0 }}>
      {ehAdmin && dados.origem === "json" && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginBottom: "14px", padding: "12px 16px", background: "rgba(240, 160, 64, 0.08)", border: "1px dashed rgba(240, 160, 64, 0.5)", borderRadius: "10px", color: "#f0a040", fontSize: "9pt" }}>
          <i className="fa-solid fa-database"></i>
          <span style={{ flex: 1, minWidth: "220px" }}>Só admin vê: o guia ainda está lendo o JSON da planilha. Importe para o Firebase para poder editar sem deploy.</span>
          <button type="button" onClick={importarDados} disabled={importando} style={{ background: "linear-gradient(135deg, #f3d27a, #c5a059)", border: "none", color: "#0b1320", borderRadius: "8px", padding: "8px 14px", fontSize: "9pt", fontWeight: 800, cursor: importando ? "wait" : "pointer", fontFamily: "'Montserrat'" }}>
            {importando ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Importando...</> : <><i className="fa-solid fa-cloud-arrow-up"></i> Importar dados da planilha</>}
          </button>
        </div>
      )}
      {carregandoEvento && (
        <div style={{ position: "fixed", top: "84px", left: "50%", transform: "translateX(-50%)", zIndex: 950, background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.4)", borderRadius: "50px", padding: "6px 16px", color: "#c5a059", fontSize: "9pt", fontWeight: 700, boxShadow: "0 6px 18px rgba(0, 0, 0, 0.5)" }}>
          <i className="fa-solid fa-circle-notch fa-spin"></i> Carregando evento...
        </div>
      )}

      {/* ABAS: guia do evento x todas as anotações */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
        {[["guia", "fa-book-open", "Guia do evento"], ["anotacoes", "fa-folder-open", "Todas as minhas anotações"]].map(([valor, icone, texto]) => (
          <button key={valor} type="button" onClick={() => { setVisao(valor); window.scrollTo(0, 0); }} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${visao === valor ? "#c5a059" : "transparent"}`, color: visao === valor ? "#c5a059" : "#8193a8", padding: "10px 14px", marginBottom: "-1px", fontSize: "10pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'" }}>
            <i className={`fa-solid ${icone}`}></i> {texto}
          </button>
        ))}
      </div>

      {visao === "anotacoes" ? (
        <TodasAnotacoesMeta
          uid={uid}
          eventos={dados.eventos}
          aoAbrir={(id) => { setIdEvento(id); setVisao("guia"); setPainelAberto(true); window.scrollTo(0, 0); }}
          aoExcluir={(id) => {
            setAnotacoes((an) => { const resto = { ...an }; delete resto[id]; return resto; });
            setSalvas((sv) => ({ ...sv, [id]: assinaturaAnotacao(null) }));
          }}
        />
      ) : (
      <>
      {/* CABEÇALHO DO EVENTO */}
      <div style={{ ...estiloCaixa, padding: 0, position: "relative", background: "radial-gradient(circle at 85% 0%, rgba(197, 160, 89, 0.16), transparent 55%), #0d1624" }}>
        <span aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: "12px", pointerEvents: "none" }}><span style={{ position: "absolute", right: "18px", top: "-18px", fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "96pt", color: "rgba(197, 160, 89, 0.06)", pointerEvents: "none", lineHeight: 1 }}>#{evento.numero}</span></span>
        <div style={{ position: "relative", zIndex: 5, display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", padding: "22px 26px 18px" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase" }}>
              <i className="fa-solid fa-book-open"></i> Guia do Meta · {evento.tipo} #{evento.numero}
            </div>
            <h1 style={{ margin: "6px 0 8px", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "24pt", fontWeight: 800, lineHeight: 1.1 }}>
              {evento.nome.replace(evento.id, "").trim() || evento.tipo}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              <span style={estiloEtiqueta}><i className="fa-solid fa-layer-group"></i> {evento.cenario}</span>
              {evento.periodo_especial && <span style={estiloEtiqueta}><i className="fa-solid fa-star"></i> {evento.periodo_especial.replace(/[()]/g, "")}</span>}
            </div>
          </div>
          <div className="coluna-seletor-evento" style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            <SeletorEvento eventos={eventosVisiveis} atual={dados.eventos.find((e) => e.id === idEvento) ?? evento} aoEscolher={setIdEvento} eventoAtual={eventoAtual} />
            {ehAdmin && evento.oculto && <span style={{ ...estiloEtiqueta, borderColor: "rgba(232, 128, 111, 0.5)", color: "#e8806f" }}><i className="fa-solid fa-eye-slash"></i> Oculto para os membros</span>}
            {evento.id === eventoAtual ? (
              <span style={{ ...estiloEtiqueta, background: "rgba(197, 160, 89, 0.18)", color: "#f3d27a" }}><i className="fa-solid fa-calendar-check"></i> Evento atual</span>
            ) : (
              <span style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                {eventoAtual && (
                  <button type="button" onClick={() => setIdEvento(eventoAtual)} style={{ ...estiloEtiqueta, cursor: "pointer", fontFamily: "'Montserrat'" }}>
                    <i className="fa-solid fa-rotate-left"></i> Voltar ao atual ({eventoAtual})
                  </button>
                )}
                {ehAdmin && (
                  <button type="button" onClick={marcarComoAtual} title="Só admin: a página passa a abrir neste evento para todos" style={{ ...estiloEtiqueta, borderStyle: "dashed", cursor: "pointer", fontFamily: "'Montserrat'" }}>
                    <i className="fa-solid fa-thumbtack"></i> Definir como atual
                  </button>
                )}
              </span>
            )}
          </div>
        </div>

        {/* PISTA */}
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", borderTop: "1px solid rgba(164, 179, 198, 0.08)", borderBottom: "1px solid rgba(164, 179, 198, 0.08)", background: "rgba(11, 19, 32, 0.5)" }}>
          <div style={{ flex: "1 1 420px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", alignContent: "center", gap: "10px", padding: "16px 18px" }}>
          {[
            ["fa-location-dot", "Hipódromo", pista.hipodromo, null, "#c5a059"],
            ["fa-ruler-horizontal", "Distância", `${String(pista.distancia).replace(/m$/, "")}m`, pista.tipo_distancia, "#5fa8e8"],
            [pista.terreno === "Dirt" ? "fa-mountain" : "fa-seedling", "Terreno", t(pista.terreno), null, pista.terreno === "Dirt" ? "#c48a55" : "#4fc76a"],
            [{ Left: "fa-rotate-left", Right: "fa-rotate-right" }[pista.direcao] ?? "fa-arrow-up", "Direção", t(pista.direcao), null, "#a98be0"],
            [{ Spring: "fa-spa", Summer: "fa-sun", Fall: "fa-leaf", Winter: "fa-snowflake" }[pista.estacao] ?? "fa-calendar", "Estação", t(pista.estacao), null, { Spring: "#f59ac0", Summer: "#f0a040", Fall: "#e07a3a", Winter: "#8fd3f4" }[pista.estacao] ?? "#a4b3c6"],
            [{ Sunny: "fa-sun", Cloudy: "fa-cloud", Rainy: "fa-cloud-rain", Snowy: "fa-snowflake" }[pista.clima] ?? "fa-shuffle", "Clima", t(pista.clima), null, { Sunny: "#f3d27a", Cloudy: "#b8c4d4", Rainy: "#5fa8e8", Snowy: "#d9eefc" }[pista.clima] ?? "#a4b3c6"],
            ["fa-droplet", "Condição", t(pista.condicao_pista), null, { Firm: "#4fc76a", Good: "#a5d65a", Soft: "#f0a040", Heavy: "#e85d5d" }[pista.condicao_pista] ?? "#a4b3c6"],
          ].map(([icone, rotulo, valor, extra, cor]) => (
            <div key={rotulo} className="cartao-perfil" style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", background: `linear-gradient(135deg, ${cor}14, #0b1320 75%)`, border: `1px solid ${cor}33`, borderRadius: "10px" }}>
              <span style={{ width: "38px", height: "38px", flexShrink: 0, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: `${cor}22`, border: `1px solid ${cor}55`, boxShadow: `0 0 12px ${cor}22` }}>
                <i className={`fa-solid ${icone}`} style={{ color: cor, fontSize: "14pt" }}></i>
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...estiloRotulo, color: "#8193a8" }}>{rotulo}</div>
                <div style={{ color: "#f1ead4", fontSize: "11.5pt", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {valor}{extra && <span style={{ color: cor, fontWeight: 700, fontSize: "8.5pt" }}> · {extra}</span>}
                </div>
              </div>
            </div>
          ))}
          </div>
          <div style={{ flex: "0 1 340px", minWidth: "260px", borderLeft: "1px solid rgba(164, 179, 198, 0.08)", padding: "12px 16px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {courseId ? (
              <>
                <MinimapaPista courseId={courseId} marcadores={[]} />
                <button type="button" onClick={alternarDiagrama} style={{ alignSelf: "center", marginTop: "10px", display: "inline-flex", alignItems: "center", gap: "6px", background: diagramaAberto ? "linear-gradient(135deg, #f3d27a, #c5a059)" : "rgba(197, 160, 89, 0.1)", border: "1px solid rgba(197, 160, 89, 0.5)", color: diagramaAberto ? "#0b1320" : "#c5a059", borderRadius: "8px", padding: "6px 14px", cursor: "pointer", fontWeight: 800, fontSize: "8.5pt", fontFamily: "'Montserrat'" }}>
                  <i className="fa-solid fa-chart-area"></i> {diagramaAberto ? "Fechar diagrama" : "Diagrama da Pista"}
                </button>
              </>
            ) : (
              <div style={{ textAlign: "center", color: "#5f758e", fontSize: "8.5pt", padding: "30px 0" }}>
                <i className="fa-solid fa-map" style={{ fontSize: "16pt", display: "block", marginBottom: "6px" }}></i>
                Traçado indisponível para {pista.hipodromo}.
              </div>
            )}
          </div>
        </div>

        {/* STATUS */}
        <div style={{ position: "relative", padding: "16px 26px 20px" }}>
          <div style={{ ...estiloRotulo, marginBottom: "10px" }}>Status recomendados</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
            {STATUS.map((s) => (
              <div key={s.chave} style={{ display: "flex", alignItems: "center", gap: "10px", background: `linear-gradient(135deg, ${s.cor}1f, #0b1320 70%)`, border: `1px solid ${s.cor}40`, borderBottom: `3px solid ${s.cor}`, borderRadius: "10px", padding: "10px 12px" }}>
                <img src={`/assets/img/${s.chave}.png`} alt="" style={{ width: "28px", height: "28px", objectFit: "contain", flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: s.cor, fontSize: "7.5pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.nome}</div>
                  {(() => {
                    const { valor, recovers } = separarRecover(st[s.chave]);
                    return (
                      <>
                        <div style={{ color: "#f1ead4", fontSize: "13pt", fontWeight: 800, lineHeight: 1.2 }}>{valor}</div>
                        {recovers.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                            {recovers.map((rc) => <SeloRecover key={rc.tipo} {...rc} />)}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
          {alternativas.map((a, i) => (
            <div key={i} style={{ marginTop: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ ...estiloRotulo, color: "#c5a059" }}><i className="fa-solid fa-code-branch"></i> Build alternativa</span>
                <span style={{ flex: 1, height: "1px", background: "rgba(197, 160, 89, 0.25)" }}></span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "10px" }}>
                {STATUS.map((s) => (s.chave === "stamina" || s.chave === "guts") ? (
                  <div key={s.chave} style={{ display: "flex", alignItems: "center", gap: "10px", background: `linear-gradient(135deg, ${s.cor}1f, #0b1320 70%)`, border: `1px solid ${s.cor}40`, borderBottom: `3px solid ${s.cor}`, borderRadius: "10px", padding: "10px 12px" }}>
                    <img src={`/assets/img/${s.chave}.png`} alt="" style={{ width: "28px", height: "28px", objectFit: "contain", flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: s.cor, fontSize: "7.5pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px" }}>{s.nome}</div>
                      <div style={{ color: "#f1ead4", fontSize: "13pt", fontWeight: 800, lineHeight: 1.2 }}>{separarRecover(a[s.chave]).valor}</div>
                      {s.chave === "stamina" && separarRecover(a.rotulo).recovers.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "4px" }}>
                          {separarRecover(a.rotulo).recovers.map((rc) => <SeloRecover key={rc.tipo} {...rc} />)}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={s.chave} style={{ display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed rgba(164, 179, 198, 0.15)", borderRadius: "10px", color: "#5f758e", fontSize: "8pt", fontWeight: 700, minHeight: "52px" }}>
                    {s.nome} igual
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* META */}
      {(() => {
        const desc = evento.descricao ?? {};
        const { secretos, resto } = lerStatusSecreto(desc.curta);
        const nota = resto?.replace(/^\*+\s*/, "").trim();
        if (!desc.ranking_estilos && !secretos.length && !nota && !desc.analise_meta) return null;
        return (
          <div style={estiloCaixa}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
              {desc.ranking_estilos && (
                <div style={{ flex: "2 1 380px" }}>
                  <div style={{ ...estiloRotulo, marginBottom: "8px" }}><i className="fa-solid fa-ranking-star"></i> Ranking de estilos</div>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                    {(() => {
                      let posicao = 0;
                      return lerRanking(desc.ranking_estilos).map((item, i) => {
                        if (item.operador) {
                          // Mesmo conjunto de ícones, tamanho e cor pra todos; muda só a forma.
                          const forte = item.operador.replace("=", "").length;
                          const op = item.operador === "=" ? { icone: "fa-equals", cor: "#8193a8", titulo: "Empatados" }
                            : item.operador.endsWith("=") ? { icone: "fa-greater-than-equal", cor: "#8193a8", titulo: "Igual ou acima" }
                              : forte >= 2 ? { icone: "fa-angles-right", cor: "#8193a8", titulo: "Bem acima" }
                                : { icone: "fa-angle-right", cor: "#8193a8", titulo: "Acima" };
                          return <i key={i} className={`fa-solid ${op.icone}`} title={op.titulo} style={{ color: op.cor, fontSize: "14pt", width: "18px", textAlign: "center" }}></i>;
                        }
                        posicao += 1;
                        const primeiro = posicao === 1;
                        return (
                          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: `linear-gradient(135deg, ${item.cor}${primeiro ? "33" : "1a"}, #0b1320 80%)`, border: `1px solid ${item.cor}${primeiro ? "aa" : "55"}`, borderRadius: "12px", padding: "8px 16px", boxShadow: primeiro ? `0 0 14px ${item.cor}33` : "none" }}>
                            <span style={{ color: item.cor, fontSize: primeiro ? "15pt" : "12pt", fontWeight: 800 }}>{primeiro ? <i className="fa-solid fa-crown"></i> : `${posicao}º`}</span>
                            {item.estilo ? (
                              <img src={iconeEstilo(item.estilo)} alt={item.estilo} title={item.estilo} style={{ height: primeiro ? "50px" : "44px", width: "auto" }} />
                            ) : (
                              <span style={{ color: "#f1ead4", fontSize: primeiro ? "15pt" : "13.5pt", fontWeight: 800 }}>{item.nome}</span>
                            )}
                            {item.nota && <span style={{ color: "#8193a8", fontSize: "8pt", fontWeight: 600 }}>{item.nota}</span>}
                          </span>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
              {secretos.length > 0 && (
                <div style={{ flex: "1 1 220px" }}>
                  <div style={{ ...estiloRotulo, marginBottom: "8px" }}><i className="fa-solid fa-user-secret"></i> Status secreto</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {secretos.map((chave) => {
                      const st = STATUS.find((x) => x.chave === chave);
                      return (
                        <span key={chave} style={{ display: "inline-flex", alignItems: "center", gap: "10px", background: `linear-gradient(135deg, ${st.cor}26, #0b1320 80%)`, border: `1px solid ${st.cor}66`, borderBottom: `3px solid ${st.cor}`, borderRadius: "12px", padding: "12px 18px" }}>
                          <img src={`/assets/img/${st.chave}.png`} alt="" style={{ width: "32px", height: "32px", objectFit: "contain" }} />
                          <span style={{ color: st.cor, fontSize: "14pt", fontWeight: 800 }}>{st.nome}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {(nota || desc.analise_meta) && (
              <div style={{ marginTop: "14px", paddingTop: "12px", borderTop: "1px solid rgba(164, 179, 198, 0.08)", display: "grid", gap: "6px" }}>
                {nota && <p style={{ margin: 0, color: "#a4b3c6", fontSize: "9pt", lineHeight: 1.6 }}><i className="fa-solid fa-circle-info" style={{ color: "#5f758e" }}></i> {nota}</p>}
                {desc.analise_meta && <p style={{ margin: 0, color: "#a4b3c6", fontSize: "9pt", lineHeight: 1.6 }}><strong style={{ color: "#f1ead4" }}>Análise do meta:</strong> {desc.analise_meta}</p>}
              </div>
            )}
          </div>
        );
      })()}

      {/* ESTRATÉGIAS DE COMPOSIÇÃO */}
      {evento.estrategias?.length > 0 && (
        <div style={estiloCaixa}>
          <h3 style={{ ...estiloTitulo, display: "flex", alignItems: "center", gap: "8px" }}>
            <i className="fa-solid fa-chess" style={{ color: "#c5a059" }}></i> Estratégias de composição
          </h3>
          <ComposicoesEquipe estrategias={evento.estrategias} />
        </div>
      )}

      {/* ABAS DE ESTILO */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" }}>
        {ESTILOS.map((e) => (
          <button key={e.chave} type="button" onClick={() => setEstilo(e.chave)} style={{ flex: "1 1 120px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: estilo === e.chave ? "#c5a059" : "#0d1624", color: estilo === e.chave ? "#0b1320" : "#a4b3c6", border: `1px solid ${estilo === e.chave ? "#c5a059" : "rgba(197, 160, 89, 0.2)"}`, borderRadius: "8px", padding: "9px 10px", fontWeight: 800, fontSize: "9pt", cursor: "pointer", fontFamily: "'Montserrat'" }}>
            <img src={iconeEstilo(e.chave)} alt="" style={{ height: "24px", width: "auto" }} /> {e.nome}
          </button>
        ))}
      </div>

      {dadosEstilo && (
        <>
          {/* PERSONAGENS */}
          <div style={estiloCaixa}>
            <h3 style={estiloTitulo}>Personagens recomendadas</h3>
            {dadosEstilo.personagens_recomendadas?.filter((p) => p.nome && p.nome !== "N/A").length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "10px" }}>
                {dadosEstilo.personagens_recomendadas.filter((p) => p.nome && p.nome !== "N/A").map((p, i) => (
                  <div key={i} onClick={painelAberto ? () => escolherPersonagem(p.nome, p.cardId) : undefined} title={painelAberto ? "Clique para usar no seu deck" : undefined} className={`cartao-perfil${painelAberto ? " item-adicionavel" : ""}`} style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "10px", padding: "10px 6px", textAlign: "center" }}>
                    <FotoPersonagem nome={p.nome} cardId={p.cardId} tamanho={88} />
                    {painelAberto && (
                      <span className="sobreposicao-adicionar" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(11, 19, 32, 0.55)", borderRadius: "inherit", pointerEvents: "none" }}>
                        <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "linear-gradient(135deg, #f3d27a, #c5a059)", color: "#0b1320", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13pt", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)" }}><i className="fa-solid fa-plus"></i></span>
                      </span>
                    )}
                    {/* Nome e variante numa área de altura fixa, pra alinhar as estrelas */}
                    <div style={{ height: "34px", marginTop: "6px", display: "flex", flexDirection: "column", justifyContent: "flex-start" }}>
                      <div style={{ color: "#f1ead4", fontSize: "8.5pt", fontWeight: 700, lineHeight: 1.2 }}>{p.nome.replace(/\s*\(.*\)\s*$/, "")}</div>
                      {/\(.*\)/.test(p.nome) && <div style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 600, lineHeight: 1.3 }}>{p.nome.match(/\((.*)\)/)[1]}</div>}
                    </div>
                    <div style={{ marginTop: "auto", paddingTop: "6px", display: "flex", alignItems: "center", gap: "4px", minHeight: "24px" }}>
                      {p.estrelas ? (
                        <span style={{ color: p.estrelas >= 4 ? "#ff6b5b" : "#f3c75a", fontSize: "14pt", letterSpacing: "1px", lineHeight: 1, textShadow: `0 0 8px ${p.estrelas >= 4 ? "rgba(255, 107, 91, 0.55)" : "rgba(243, 199, 90, 0.45)"}` }}>
                          {"★".repeat(p.estrelas)}
                        </span>
                      ) : null}
                      {p.tag && <span style={{ border: "1px solid rgba(164, 179, 198, 0.3)", color: "#a4b3c6", borderRadius: "5px", padding: "1px 6px", fontSize: "9pt", fontWeight: 800 }}>{p.tag}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p style={{ margin: 0, color: "#5f758e", fontSize: "9pt" }}>Sem recomendação para este estilo.</p>}
            <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid rgba(164, 179, 198, 0.08)" }}>
              <div style={{ ...estiloRotulo, marginBottom: "8px" }}><i className="fa-solid fa-bolt"></i> Aceleração</div>
              <AceleracoesPista
                key={`${evento.id}-${estilo}`}
                dadosCorrida={courseId ? courseData[courseId] : null}
                estilo={estilo}
                recomendadas={dadosEstilo.aceleracoes ?? SEM_ACELERACOES}
                textoAntigo={dadosEstilo.rec_accel}
                comentario={dadosEstilo.comentario_accel}
              />
            </div>
          </div>

          {/* DECKS */}
          <div style={estiloCaixa}>
            <h3 style={estiloTitulo}>Decks</h3>
            <div style={{ display: "grid", gap: "10px" }}>
              {NIVEIS_DECK.map((n) => {
                const deck = dadosEstilo[n.chave];
                const extra = deck?.titulo?.split(" - ").slice(2).join(" - ");
                return <Deck key={n.chave} titulo={n.nome} subtitulo={extra} cartas={deck?.cartas} cor={n.cor} aoAdicionar={painelAberto ? adicionarCarta : null} aoCopiar={painelAberto && deck?.cartas ? () => copiarDeck(deck.cartas) : null} />;
              })}
            </div>
            <p style={{ margin: "10px 0 0", color: "#5f758e", fontSize: "8pt" }}>
              <span style={{ color: "#ff8a7d", fontWeight: 800 }}>Nota em vermelho</span> = carta obrigatória · passe o mouse na carta para ver os detalhes
            </p>
          </div>
        </>
      )}

      </>
      )}

      {visao === "guia" && <p style={{ textAlign: "center", color: "#5f758e", fontSize: "7.5pt", marginTop: "20px" }}>
        Fonte: {dados.fonte}. <Link to="/pistas" style={{ color: "#c5a059" }}>Buscador de Pistas</Link>
      </p>}

      {visao === "guia" && <PainelAnotacoesMeta
        evento={evento}
        anotacao={anotacaoAtual}
        aoMudar={salvarAnotacao}
        deckAtivo={deckAtivo}
        aoEscolherDeck={setDeckAtivo}
        aviso={aviso}
        estadoSalvar={estadoSalvar}
        aoSalvar={salvarNoFirebase}
        aberto={painelAberto}
        aoAbrir={() => setPainelAberto(true)}
        aoFechar={() => setPainelAberto(false)}
      />}
    </main>

    {/* DIAGRAMA DA PISTA (painel lateral) */}
    <aside className={`painel-diagrama-guia${diagramaAberto && visao === "guia" ? " aberto" : ""}`} aria-hidden={!diagramaAberto} onTransitionEnd={(e) => { if (e.target === e.currentTarget && !diagramaAberto && (e.propertyName === "width" || e.propertyName === "transform")) setDiagramaMontado(false); }}>
      <div className="painel-diagrama-guia-conteudo">
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
          <h3 style={{ ...estiloTitulo, margin: 0, flex: 1 }}><i className="fa-solid fa-chart-area" style={{ color: "#c5a059" }}></i> Diagrama da Pista</h3>
          <button type="button" onClick={() => setDiagramaAberto(false)} title="Fechar" style={{ background: "transparent", border: "none", color: "#8193a8", fontSize: "14pt", cursor: "pointer" }}><i className="fa-solid fa-xmark"></i></button>
        </div>
        <p style={{ margin: "0 0 12px", color: "#8193a8", fontSize: "8.5pt" }}>
          {pista.hipodromo} · {pista.distancia}m · {pista.terreno}
          {skillsNoDiagrama.length > 0 && <> · acelerações de <span style={{ color: "#c5a059", fontWeight: 700 }}>{estilo}</span> marcadas</>}
        </p>
        {diagramaMontado && dadosCorrida && <DiagramaPistaGuia dadosCorrida={dadosCorrida} skills={skillsNoDiagrama} />}
        <p style={{ margin: "8px 0 0", color: "#5f758e", fontSize: "7.5pt" }}>Barra cheia = duração da skill · tracejado = onde ela pode ativar · passe o mouse para ver trecho, fase e inclinação.</p>
      </div>
    </aside>
    </div>
  );
}

export default GuiaMeta;
