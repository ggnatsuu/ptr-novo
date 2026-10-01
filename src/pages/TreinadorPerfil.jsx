// 🎯 src/pages/TreinadorPerfil.jsx
// Página pública de um treinador (/treinador/:nome): cabeçalho, números,
// evolução no Rank Geral edição a edição, personagens, histórico de
// corridas e conquistas. Usa o resumo das corridas (1 leitura).

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../config/firebase";
import { useCorridas } from "../utils/resumoCorridas";
import { idConquistas } from "../utils/conquistas/leve";
import { obterUrlImagemPersonagem, obterUrlTrofeuCloudinary } from "../utils/cloudinary";
import FotoTreinador from "../components/FotoTreinador";
import TituloTreinador from "../components/TituloTreinador";
import PainelConquistas from "../components/PainelConquistas";
import { RARIDADES } from "../data/conquistas";

const PONTOS_POR_POSICAO = { 1: 12, 2: 10, 3: 9, 4: 8, 5: 7, 6: 6, 7: 5, 8: 4, 9: 3 };
const pontosDaPosicao = (pos) => PONTOS_POR_POSICAO[pos] ?? (pos >= 10 && pos <= 18 ? 2 : 0);
const ESTRATEGIAS = { runner: "Front Runner", leader: "Pace Chaser", betweener: "Late Surger", chaser: "End Closer" };
const NOME_NIVEL = { iniciante: "Iniciante", entusiasta: "Entusiasta", especialista: "Especialista", oshi: "Oshi" };
const CORES_PODIO = { 1: "#c5a059", 2: "#a4b3c6", 3: "#cd7f32" };
const COR_NIVEL = { iniciante: RARIDADES.bronze.cor, entusiasta: RARIDADES.prata.cor, especialista: RARIDADES.ouro.cor, oshi: RARIDADES.platina.cor };
const EDICOES_VISIVEIS = 5;

// Pílula da posição: cheia no pódio, contorno nas demais.
function PilulaPosicao({ posicao, tamanho = "9pt" }) {
  const cor = CORES_PODIO[posicao];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: "34px", height: "24px", borderRadius: "6px", flexShrink: 0, fontSize: tamanho, fontWeight: 800, background: cor ?? "transparent", color: cor ? "#0b1320" : posicao <= 9 ? "#f1ead4" : "#5f758e", border: cor ? "none" : "1px solid rgba(164, 179, 198, 0.2)" }}>
      {posicao}º
    </span>
  );
}
const numeroEdicao = (id) => Number(String(id ?? "").replace(/\D/g, "")) || 0;
const chave = (nome) => String(nome ?? "").toLowerCase().trim();

const estiloCaixa = { background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "12px", padding: "20px 22px", boxSizing: "border-box" };
const estiloTitulo = { margin: "0 0 14px 0", color: "#c5a059", fontFamily: "'Cinzel', serif", fontSize: "11pt", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" };

// Posição no Rank Geral ao fim de cada edição (acumulado).
function evolucaoNoRank(corridas, alvo) {
  const edicoes = [...new Set(corridas.map((c) => c.edicaoId))].sort((a, b) => numeroEdicao(a) - numeroEdicao(b));
  const totais = {};
  const pontos = [];
  edicoes.forEach((edicaoId) => {
    corridas.filter((c) => c.edicaoId === edicaoId).forEach((c) => {
      (c.classificacao ?? []).forEach((l) => {
        if (!l.treinador) return;
        const k = chave(l.treinador);
        const t = (totais[k] ??= { prestigio: 0, primeiros: 0, segundos: 0 });
        const pos = Number(l.posicao);
        t.prestigio += 300 + pontosDaPosicao(pos);
        if (pos === 1) t.primeiros++;
        if (pos === 2) t.segundos++;
      });
    });
    if (!totais[alvo]) return;
    const ordem = Object.entries(totais).sort(([, a], [, b]) => b.prestigio - a.prestigio || b.primeiros - a.primeiros || b.segundos - a.segundos);
    pontos.push({ edicao: numeroEdicao(edicaoId), posicao: ordem.findIndex(([k]) => k === alvo) + 1, total: ordem.length });
  });
  return pontos;
}

function GraficoEvolucao({ pontos, corridasPorEdicao = {} }) {
  const [foco, setFoco] = useState(null);
  if (pontos.length < 2) return <p style={{ color: "#5f758e", fontSize: "9pt", margin: 0 }}>Precisa de pelo menos 2 edições para mostrar a evolução.</p>;
  const L = 720, A = 240, m = { e: 40, d: 24, t: 30, b: 34 };
  const pior = Math.max(...pontos.map((p) => p.posicao), 5);
  const x = (i) => m.e + (i / (pontos.length - 1)) * (L - m.e - m.d);
  const y = (pos) => m.t + ((pos - 1) / (pior - 1)) * (A - m.t - m.b);
  const linha = pontos.map((p, i) => `${x(i)},${y(p.posicao)}`).join(" ");
  const area = `${x(0)},${A - m.b} ${linha} ${x(pontos.length - 1)},${A - m.b}`;
  const posicoes = Array.from({ length: pior }, (_, i) => i + 1);
  const p = foco !== null ? pontos[foco] : null;
  const anterior = foco > 0 ? pontos[foco - 1] : null;
  const variacao = p && anterior ? anterior.posicao - p.posicao : 0;
  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setFoco(null)}>
    <svg viewBox={`0 0 ${L} ${A}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Posição no Rank Geral por edição">
      <defs>
        <linearGradient id="evolucaoArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c5a059" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#c5a059" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* faixa do pódio */}
      <rect x={m.e} y={y(1) - 10} width={L - m.e - m.d} height={y(3) - y(1) + 20} fill="rgba(197, 160, 89, 0.05)" rx="6" />
      <text x={L - m.d} y={y(1) - 14} textAnchor="end" fill="rgba(197, 160, 89, 0.55)" fontSize="9" fontWeight="700" fontFamily="Montserrat" letterSpacing="1">PÓDIO</text>
      {posicoes.map((pos) => (
        <g key={pos}>
          <line x1={m.e} x2={L - m.d} y1={y(pos)} y2={y(pos)} stroke="rgba(164, 179, 198, 0.07)" />
          {(pos === 1 || pos === pior || (pos % 3 === 0 && pior - pos >= 2)) && (
            <text x={m.e - 12} y={y(pos) + 4} textAnchor="end" fill="#5f758e" fontSize="10" fontFamily="Montserrat">{pos}º</text>
          )}
        </g>
      ))}
      <polygon points={area} fill="url(#evolucaoArea)" />
      {p && <line x1={x(foco)} x2={x(foco)} y1={m.t - 12} y2={A - m.b} stroke="rgba(197, 160, 89, 0.35)" strokeDasharray="3 4" />}
      <polyline points={linha} fill="none" stroke="#c5a059" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pontos.map((ponto, i) => {
        const cor = CORES_PODIO[ponto.posicao];
        const pt = ponto;
        return (
          <g key={pt.edicao}>
            {i === foco && <circle cx={x(i)} cy={y(pt.posicao)} r="16" fill="none" stroke={cor ?? "#c5a059"} strokeOpacity="0.4" strokeWidth="2" />}
            <circle cx={x(i)} cy={y(pt.posicao)} r="11" fill={cor ?? "#0d1624"} stroke={cor ?? "#c5a059"} strokeWidth="2" />
            <text x={x(i)} y={y(pt.posicao) + 3.5} textAnchor="middle" fill={cor ? "#0b1320" : "#f1ead4"} fontSize="10" fontWeight="800" fontFamily="Montserrat">{pt.posicao}</text>
            <text x={x(i)} y={A - 10} textAnchor="middle" fill={i === foco ? "#c5a059" : "#5f758e"} fontSize="10" fontWeight={i === foco ? 800 : 400} fontFamily="Montserrat">{pt.edicao}</text>
            {/* área de hover: a coluna inteira da edição */}
            <rect x={x(i) - (L - m.e - m.d) / (pontos.length - 1) / 2} y={0} width={(L - m.e - m.d) / (pontos.length - 1)} height={A} fill="transparent" onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)} />
          </g>
        );
      })}
      <text x={m.e - 12} y={A - 10} textAnchor="end" fill="#5f758e" fontSize="9" fontFamily="Montserrat">Ed.</text>
    </svg>
    {p && (
      <div style={{
        position: "absolute", pointerEvents: "none", zIndex: 2,
        left: `${(x(foco) / L) * 100}%`, top: `${(y(p.posicao) / A) * 100}%`,
        transform: `translate(${foco > pontos.length / 2 ? "calc(-100% - 22px)" : "22px"}, -50%)`,
        background: "rgba(11, 19, 32, 0.96)", border: `1px solid ${CORES_PODIO[p.posicao] ?? "rgba(197, 160, 89, 0.45)"}`, borderRadius: "10px",
        padding: "10px 12px", minWidth: "170px", boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)", fontFamily: "'Montserrat', sans-serif",
      }}>
        <div style={{ color: "#5f758e", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1px" }}>EDIÇÃO {p.edicao}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", margin: "2px 0 6px" }}>
          <span style={{ color: CORES_PODIO[p.posicao] ?? "#f1ead4", fontSize: "16pt", fontWeight: 800 }}>{p.posicao}º</span>
          <span style={{ color: "#8193a8", fontSize: "8pt" }}>de {p.total}</span>
          {anterior && variacao !== 0 && (
            <span style={{ marginLeft: "auto", color: variacao > 0 ? "#1bd39e" : "#e04b37", fontSize: "8.5pt", fontWeight: 800 }}>{variacao > 0 ? `▲${variacao}` : `▼${-variacao}`}</span>
          )}
        </div>
        {(corridasPorEdicao[p.edicao] ?? []).map((c, i) => (
          <div key={i} style={{ display: "flex", gap: "8px", fontSize: "8pt", color: "#a4b3c6", lineHeight: 1.6 }}>
            <span style={{ width: "24px", fontWeight: 800, color: CORES_PODIO[c.posicao] ?? "#f1ead4" }}>{c.posicao}º</span>
            <span style={{ whiteSpace: "nowrap" }}>{c.pista}</span>
          </div>
        ))}
      </div>
    )}
    </div>
  );
}

function Numero({ valor, rotulo, cor = "#f1ead4" }) {
  return (
    <div style={{ textAlign: "center", minWidth: "90px", flex: "1 1 90px" }}>
      <div style={{ color: cor, fontSize: "18pt", fontWeight: 800, lineHeight: 1.1 }}>{valor}</div>
      <div style={{ color: "#5f758e", fontSize: "7.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginTop: "4px" }}>{rotulo}</div>
    </div>
  );
}

function TreinadorPerfil() {
  const { nome: nomeUrl } = useParams();
  const alvo = chave(decodeURIComponent(nomeUrl ?? ""));
  const corridasCarregadas = useCorridas();
  const [perfil, setPerfil] = useState(null);
  const [docConquistas, setDocConquistas] = useState(null);
  const [todasEdicoes, setTodasEdicoes] = useState(false);

  // Corridas dele, em ordem (edição, pista do sorteio).
  const dados = useMemo(() => {
    if (!corridasCarregadas) return null;
    const minhas = corridasCarregadas
      .map((c) => ({ c, linha: (c.classificacao ?? []).find((l) => chave(l.treinador) === alvo) }))
      .filter((x) => x.linha)
      .map(({ c, linha }) => ({ edicao: numeroEdicao(c.edicaoId), ordem: c.ordemPista ?? 0, pista: c.pistaNome, grade: c.grade, grupo: c.grupo, personagem: linha.personagem, posicao: Number(linha.posicao), nome: linha.treinador }))
      .sort((a, b) => a.edicao - b.edicao || a.ordem - b.ordem);
    if (minhas.length === 0) return { vazio: true };

    // Nome exibido = grafia mais usada.
    const grafias = {};
    minhas.forEach((m) => { grafias[m.nome] = (grafias[m.nome] ?? 0) + 1; });
    const nome = Object.entries(grafias).sort((a, b) => b[1] - a[1])[0][0];

    const evolucao = evolucaoNoRank(corridasCarregadas, alvo);
    const porPersonagem = {};
    minhas.forEach((m) => {
      if (!m.personagem) return;
      const p = (porPersonagem[m.personagem] ??= { nome: m.personagem, corridas: 0, vitorias: 0, podios: 0 });
      p.corridas++;
      if (m.posicao === 1) p.vitorias++;
      if (m.posicao <= 3) p.podios++;
    });
    const trofeus = {};
    minhas.filter((m) => m.posicao === 1 && m.pista).forEach((m) => {
      const t = (trofeus[m.pista] ??= { pista: m.pista, grade: m.grade, edicoes: [] });
      t.edicoes.push(m.edicao);
    });
    const porEdicao = {};
    minhas.forEach((m) => { (porEdicao[m.edicao] ??= []).push(m); });

    return {
      nome,
      corridas: minhas.length,
      vitorias: minhas.filter((m) => m.posicao === 1).length,
      podios: minhas.filter((m) => m.posicao <= 3).length,
      posMedia: Math.round((minhas.reduce((s, m) => s + m.posicao, 0) / minhas.length) * 10) / 10,
      prestigio: minhas.reduce((s, m) => s + 300 + pontosDaPosicao(m.posicao), 0),
      rank: evolucao.at(-1)?.posicao,
      evolucao,
      melhor: evolucao.length ? Math.min(...evolucao.map((p) => p.posicao)) : null,
      trofeus: Object.values(trofeus).sort((a, b) => b.edicoes.length - a.edicoes.length || Math.max(...b.edicoes) - Math.max(...a.edicoes)),
      personagens: Object.values(porPersonagem).sort((a, b) => b.corridas - a.corridas || b.vitorias - a.vitorias),
      edicoes: Object.entries(porEdicao).map(([ed, lista]) => ({ edicao: Number(ed), lista })).sort((a, b) => b.edicao - a.edicao),
    };
  }, [corridasCarregadas, alvo]);

  // Abre sempre do topo (vindo do Rank, a página estava rolada).
  useEffect(() => { window.scrollTo(0, 0); }, [alvo]);

  // Perfil (estratégia) e conquistas.
  const nomeExibido = dados?.nome;
  useEffect(() => {
    if (!nomeExibido) return;
    let vivo = true;
    getDocs(query(collection(db, "treinadores"), where("nomeTreinador", "==", nomeExibido)))
      .then((snap) => { if (vivo) setPerfil(snap.empty ? {} : snap.docs[0].data()); })
      .catch(() => { if (vivo) setPerfil({}); });
    getDoc(doc(db, "conquistas", idConquistas(nomeExibido)))
      .then((snap) => { if (vivo) setDocConquistas(snap.exists() ? snap.data() : null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [nomeExibido]);

  const niveis = new Map((docConquistas?.personagens ?? []).map((p) => [p.personagem, p.nivel]));

  return (
    <main className="main-layout-wrapper" style={{ marginTop: "130px", padding: "0 16px 60px", fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ maxWidth: "1000px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px", fontVariantNumeric: "tabular-nums" }}>
        <Link to="/rank" style={{ color: "#a4b3c6", fontSize: "9pt", textDecoration: "none" }}>
          <i className="fa-solid fa-arrow-left"></i> Rank Geral
        </Link>

        {!dados ? (
          <p style={{ color: "#c5a059", textAlign: "center", padding: "60px 0" }}><i className="fa-solid fa-circle-notch fa-spin"></i> Carregando...</p>
        ) : dados.vazio ? (
          <p style={{ color: "#a4b3c6", textAlign: "center", padding: "60px 0" }}>Nenhuma corrida encontrada para esse treinador.</p>
        ) : (
          <>
            {/* CABEÇALHO */}
            <div style={{ ...estiloCaixa, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "22px" }}>
              <FotoTreinador nome={dados.nome} tamanho={96} corBorda={CORES_PODIO[dados.rank] ?? "#c5a059"} />
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <h1 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "22pt", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>{dados.nome}</h1>
                <TituloTreinador nome={dados.nome} tamanho="10.5pt" estilo={{ margin: "2px 0 8px" }} />
                <div style={{ color: "#a4b3c6", fontSize: "9.5pt", fontWeight: 600 }}>
                  {dados.rank && <><span style={{ color: CORES_PODIO[dados.rank] ?? "#c5a059", fontWeight: 800 }}>{dados.rank}º</span> no Rank Geral · </>}
                  <span style={{ color: "#c5a059", fontWeight: 800 }}>{dados.prestigio.toLocaleString("pt-BR")}</span> pts
                  {perfil?.estrategia && <> · {ESTRATEGIAS[perfil.estrategia]}</>}
                </div>
              </div>
            </div>

            {/* NÚMEROS */}
            <div style={{ ...estiloCaixa, display: "flex", flexWrap: "wrap", gap: "16px 8px", justifyContent: "space-around" }}>
              <Numero valor={dados.corridas} rotulo="Corridas" />
              <Numero valor={dados.vitorias} rotulo="Vitórias" cor="#c5a059" />
              <Numero valor={dados.podios} rotulo="Pódios" />
              <Numero valor={`${Math.round((dados.vitorias / dados.corridas) * 100)}%`} rotulo="Win rate" />
              <Numero valor={dados.posMedia.toLocaleString("pt-BR")} rotulo="Posição média" />
            </div>

            {/* EVOLUÇÃO */}
            <div style={estiloCaixa}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: "6px 16px", marginBottom: "6px" }}>
                <h2 style={{ ...estiloTitulo, margin: 0 }}>Posição no Rank Geral por edição</h2>
                <span style={{ color: "#8193a8", fontSize: "8.5pt" }}>
                  Atual <strong style={{ color: CORES_PODIO[dados.rank] ?? "#f1ead4" }}>{dados.rank}º</strong> · Melhor <strong style={{ color: CORES_PODIO[dados.melhor] ?? "#f1ead4" }}>{dados.melhor}º</strong>
                </span>
              </div>
              <GraficoEvolucao pontos={dados.evolucao} corridasPorEdicao={Object.fromEntries(dados.edicoes.map((e) => [e.edicao, e.lista]))} />
            </div>

            {/* TROFÉUS */}
            {dados.trofeus.length > 0 && (
              <div style={estiloCaixa}>
                <h2 style={estiloTitulo}>Troféus <span style={{ color: "#5f758e", fontFamily: "'Montserrat'", fontSize: "9pt" }}>({dados.vitorias})</span></h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
                  {dados.trofeus.map((t) => {
                    // Só o troféu de destaque do cartão (o primeiro slot válido entre as pistas vencidas).
                    const equipado = chave((perfil?.trofeusEquipados ?? []).find((e) => e && e !== "Bloqueado" && dados.trofeus.some((x) => chave(x.pista) === chave(e)))) === chave(t.pista);
                    return (
                      <div key={t.pista} className="cartao-perfil" style={{ position: "relative", background: "radial-gradient(circle at 50% 38%, rgba(197, 160, 89, 0.16), #0b1320 68%)", border: `1px solid ${equipado ? "#c5a059" : "rgba(164, 179, 198, 0.12)"}`, borderRadius: "12px", padding: "16px 10px 12px", textAlign: "center" }}>
                        {equipado && <i className="fa-solid fa-star" title="Troféu de destaque do cartão" style={{ position: "absolute", top: "9px", left: "10px", color: "#c5a059", fontSize: "9pt" }}></i>}
                        {t.edicoes.length > 1 && (
                          <span style={{ position: "absolute", top: "8px", right: "10px", color: "#c5a059", fontSize: "9pt", fontWeight: 800 }}>×{t.edicoes.length}</span>
                        )}
                        <img src={obterUrlTrofeuCloudinary(t.pista)} alt="" style={{ height: "86px", width: "auto", maxWidth: "100%", objectFit: "contain", filter: "drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5))" }} onError={(e) => { e.currentTarget.src = "https://placehold.co/86x86/0e1726/c5a059?text=%F0%9F%8F%86"; }} />
                        <div style={{ color: "#f1ead4", fontSize: "8.5pt", fontWeight: 700, marginTop: "10px", lineHeight: 1.3 }}>{t.pista}</div>
                        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", marginTop: "6px" }}>
                          {t.grade && <span style={{ border: "1px solid rgba(197, 160, 89, 0.4)", color: "#c5a059", borderRadius: "4px", padding: "1px 6px", fontSize: "7pt", fontWeight: 800 }}>{t.grade}</span>}
                          <span style={{ color: "#5f758e", fontSize: "7.5pt", fontWeight: 600 }}>Ed. {t.edicoes.join(", ")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PERSONAGENS */}
            <div style={estiloCaixa}>
              <h2 style={estiloTitulo}>Personagens</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                {dados.personagens.map((p) => {
                  const nivel = niveis.get(p.nome);
                  const corNivel = COR_NIVEL[nivel];
                  return (
                    <div key={p.nome} className="cartao-perfil" style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "10px", padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <img src={obterUrlImagemPersonagem(p.nome)} alt="" style={{ width: "42px", height: "42px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#0d1624", border: `2px solid ${corNivel ?? "rgba(164, 179, 198, 0.2)"}` }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ color: "#f1ead4", fontWeight: 700, fontSize: "9.5pt", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</div>
                          {nivel ? (
                            <span style={{ color: corNivel, fontSize: "7.5pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{NOME_NIVEL[nivel]}</span>
                          ) : (
                            <span style={{ color: "#5f758e", fontSize: "7.5pt" }}>{Math.round((p.corridas / dados.corridas) * 100)}% das corridas</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", marginTop: "10px", paddingTop: "8px", borderTop: "1px solid rgba(164, 179, 198, 0.08)" }}>
                        {[["Corridas", p.corridas, "#f1ead4"], ["Vitórias", p.vitorias, p.vitorias ? "#c5a059" : "#5f758e"], ["Pódios", p.podios, p.podios ? "#f1ead4" : "#5f758e"]].map(([rotulo, valor, cor]) => (
                          <div key={rotulo} style={{ flex: 1, textAlign: "center" }}>
                            <div style={{ color: cor, fontSize: "11pt", fontWeight: 800 }}>{valor}</div>
                            <div style={{ color: "#5f758e", fontSize: "6.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{rotulo}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* HISTÓRICO */}
            <div style={estiloCaixa}>
              <h2 style={estiloTitulo}>Histórico de corridas</h2>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {(todasEdicoes ? dados.edicoes : dados.edicoes.slice(0, EDICOES_VISIVEIS)).map(({ edicao, lista }, indice) => {
                  const noRank = dados.evolucao.find((e) => e.edicao === edicao)?.posicao;
                  return (
                    <div key={edicao} style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "center", padding: "12px 0", borderTop: indice ? "1px solid rgba(164, 179, 198, 0.08)" : "none" }}>
                      <div style={{ width: "86px", flexShrink: 0 }}>
                        <div style={{ color: "#f1ead4", fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "11pt" }}>Ed. {edicao}</div>
                        {noRank && <div style={{ color: "#5f758e", fontSize: "7.5pt", fontWeight: 600 }}>{noRank}º no rank</div>}
                      </div>
                      <div style={{ flex: "1 1 400px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "8px" }}>
                        {lista.map((m, i) => (
                          <div key={i} className="cartao-perfil" title={`${m.pista ?? ""}${m.grupo ? ` (Grupo ${m.grupo})` : ""}`} style={{ display: "flex", alignItems: "center", gap: "10px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "8px", padding: "6px 10px 6px 8px", minWidth: 0 }}>
                            <PilulaPosicao posicao={m.posicao} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ color: "#f1ead4", fontSize: "8.5pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.pista}</div>
                              <div style={{ color: "#8193a8", fontSize: "7.5pt", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.grade ? `${m.grade} · ` : ""}{m.personagem}</div>
                            </div>
                            {m.personagem && <img src={obterUrlImagemPersonagem(m.personagem)} alt="" style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", flexShrink: 0, background: "#0d1624" }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {dados.edicoes.length > EDICOES_VISIVEIS && (
                <button type="button" onClick={() => setTodasEdicoes((v) => !v)} style={{ display: "block", margin: "12px auto 0", background: "transparent", border: "1px solid rgba(197, 160, 89, 0.4)", color: "#c5a059", borderRadius: "50px", padding: "7px 18px", fontSize: "8.5pt", fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat'" }}>
                  {todasEdicoes ? "Mostrar menos" : `Mostrar todas (${dados.edicoes.length} edições)`} <i className={`fa-solid fa-chevron-${todasEdicoes ? "up" : "down"}`}></i>
                </button>
              )}
            </div>

            {/* CONQUISTAS */}
            <div style={estiloCaixa}>
              <h2 style={estiloTitulo}>Conquistas</h2>
              <PainelConquistas docConquistas={docConquistas} somenteObtidas semPersonagens />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default TreinadorPerfil;
