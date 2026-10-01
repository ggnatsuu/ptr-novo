// 🎯 src/components/TodasAnotacoesMeta.jsx
// Aba "Todas as anotações" do Guia do Meta: lista os eventos em que o
// usuário salvou anotações, com prévia dos decks, e permite abrir ou excluir.

import { useEffect, useState } from "react";
import ModalConfirmacao from "./ModalConfirmacao";
import { listarAnotacoes, excluirAnotacao, urlCarta, roupaPorId, classeRaridade } from "../utils/anotacoesMeta";
import { portraitDaRoupa } from "../utils/iconeRoupa";
import IconeTipoCarta from "./IconeTipoCarta";

const ORDEM_TIPO = { "Champions Meeting": 0, "League of Heroes": 1 };

function TodasAnotacoesMeta({ uid, eventos, aoAbrir, aoExcluir }) {
  const [lista, setLista] = useState(null); // null = carregando
  const [erro, setErro] = useState(false);
  const [paraExcluir, setParaExcluir] = useState(null);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelado = false;
    listarAnotacoes(uid)
      .then((itens) => { if (!cancelado) setLista(itens); })
      .catch((e) => { console.error("Erro ao listar as anotações:", e); if (!cancelado) setErro(true); });
    return () => { cancelado = true; };
  }, [uid]);

  const porId = new Map(eventos.map((e) => [e.id, e]));
  const itens = (lista ?? [])
    .map((a) => ({ ...a, info: porId.get(a.evento) }))
    .filter((a) => a.info && (a.memo.trim() || a.decks.some((d) => d.personagem || d.cartas.some(Boolean))))
    .sort((a, b) => (ORDEM_TIPO[a.info.tipo] ?? 9) - (ORDEM_TIPO[b.info.tipo] ?? 9) || b.info.numero - a.info.numero);

  const confirmarExclusao = async () => {
    const alvo = paraExcluir;
    setParaExcluir(null);
    try {
      await excluirAnotacao(uid, alvo.evento);
      setLista((l) => l.filter((a) => a.evento !== alvo.evento));
      aoExcluir(alvo.evento);
    } catch (e) {
      console.error("Erro ao excluir a anotação:", e);
    }
  };

  if (!uid) return <p style={{ textAlign: "center", color: "#8193a8" }}>Entre na sua conta para ver suas anotações.</p>;
  if (erro) return <p style={{ textAlign: "center", color: "#e8806f" }}>Não foi possível carregar suas anotações.</p>;
  if (lista === null) return <p style={{ textAlign: "center", color: "#c5a059" }}><i className="fa-solid fa-circle-notch fa-spin"></i> Carregando suas anotações...</p>;

  if (!itens.length) {
    return (
      <div style={{ textAlign: "center", padding: "50px 20px", background: "#0d1624", border: "1px dashed rgba(197, 160, 89, 0.3)", borderRadius: "14px" }}>
        <i className="fa-solid fa-pen-to-square" style={{ color: "#c5a059", fontSize: "26pt" }}></i>
        <h3 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", margin: "12px 0 6px" }}>Nenhuma anotação ainda</h3>
        <p style={{ color: "#8193a8", fontSize: "9.5pt", margin: 0 }}>Abra um evento, use o botão “Minhas anotações” e salve seus decks.</p>
      </div>
    );
  }

  const totalDecks = itens.reduce((n, a) => n + a.decks.filter((d) => d.personagem || d.cartas.some(Boolean)).length, 0);

  return (
    <>
      {/* RESUMO */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px", marginBottom: "16px", padding: "16px 20px", background: "radial-gradient(circle at 90% 0%, rgba(197, 160, 89, 0.14), transparent 55%), #0d1624", border: "1px solid rgba(197, 160, 89, 0.18)", borderRadius: "14px" }}>
        <span style={{ width: "46px", height: "46px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(197, 160, 89, 0.15)", border: "1px solid rgba(197, 160, 89, 0.4)" }}>
          <i className="fa-solid fa-folder-open" style={{ color: "#c5a059", fontSize: "16pt" }}></i>
        </span>
        <div style={{ flex: 1, minWidth: "200px" }}>
          <h2 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "15pt" }}>Minhas anotações</h2>
          <p style={{ margin: "2px 0 0", color: "#8193a8", fontSize: "8.5pt" }}>Seus decks salvos em cada Champions Meeting e League of Heroes.</p>
        </div>
        {[["Eventos", itens.length], ["Decks", totalDecks]].map(([rotulo, valor]) => (
          <div key={rotulo} style={{ textAlign: "center", padding: "0 10px" }}>
            <div style={{ color: "#c5a059", fontSize: "18pt", fontWeight: 800, lineHeight: 1 }}>{valor}</div>
            <div style={{ color: "#5f758e", fontSize: "7pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginTop: "4px" }}>{rotulo}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(520px, 1fr))", gap: "16px" }}>
        {itens.map((a) => {
          const e = a.info;
          const p = e.informacoes_pista;
          const corTipo = e.tipo === "League of Heroes" ? "#a98be0" : "#c5a059";
          const decks = a.decks.map((d, i) => ({ ...d, numero: i + 1 })).filter((d) => d.personagem || d.cartas.some(Boolean));
          return (
            <div key={a.evento} style={{ background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.12)", borderTop: `3px solid ${corTipo}`, borderRadius: "14px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)" }}>
              {/* TOPO */}
              <div style={{ position: "relative", padding: "14px 18px 12px", background: `linear-gradient(135deg, ${corTipo}1f, transparent 65%)` }}>
                <span aria-hidden style={{ position: "absolute", right: "14px", top: "-6px", fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "44pt", color: `${corTipo}14`, lineHeight: 1, pointerEvents: "none" }}>#{e.numero}</span>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ color: corTipo, fontSize: "7.5pt", fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" }}>{e.tipo} #{e.numero}</span>
                  {a.atualizadoEm && <span title="Última alteração" style={{ marginLeft: "auto", color: "#5f758e", fontSize: "7.5pt" }}><i className="fa-regular fa-clock"></i> {a.atualizadoEm.toLocaleDateString("pt-BR")}</span>}
                </div>
                <div style={{ position: "relative", color: "#f1ead4", fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "14pt" }}>{e.nome.replace(e.id, "").trim() || e.tipo}</div>
                <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" }}>
                  {[["fa-location-dot", p.hipodromo], ["fa-ruler-horizontal", `${String(p.distancia).replace(/m$/, "")}m · ${p.tipo_distancia}`], [p.terreno === "Dirt" ? "fa-mountain" : "fa-seedling", p.terreno]].map(([icone, texto]) => (
                    <span key={icone} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(11, 19, 32, 0.6)", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "50px", padding: "2px 10px", color: "#a4b3c6", fontSize: "8pt", fontWeight: 600 }}>
                      <i className={`fa-solid ${icone}`} style={{ color: corTipo, fontSize: "7.5pt" }}></i> {texto}
                    </span>
                  ))}
                </div>
              </div>

              {/* DECKS */}
              <div style={{ display: "grid", gap: "10px", padding: "12px 18px 14px" }}>
                {decks.map((d) => {
                  const roupa = d.personagem ? roupaPorId.get(d.personagem) : null;
                  return (
                    <div key={d.numero} style={{ display: "flex", alignItems: "stretch", gap: "10px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.08)", borderRadius: "10px", padding: "8px" }}>
                      <div style={{ width: "76px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                        <span style={{ width: "64px", height: "64px", borderRadius: "10px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 40%, rgba(197, 160, 89, 0.2), #0d1624 70%)", border: "1px solid rgba(197, 160, 89, 0.35)" }}>
                          {roupa ? <img src={portraitDaRoupa(d.personagem)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <i className="fa-solid fa-horse-head" style={{ color: "#3a4a5e", fontSize: "16pt" }}></i>}
                        </span>
                        <span style={{ color: roupa ? "#f1ead4" : "#5f758e", fontSize: "7.5pt", fontWeight: 700, width: "100%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roupa?.nome ?? `Deck ${d.numero}`}</span>
                      </div>
                      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
                        {d.cartas.map((id, j) => (
                          <span key={j} className={id ? classeRaridade(id) : undefined} style={{ "--espessura-moldura": "1.5px", position: "relative", flex: 1, minWidth: 0, aspectRatio: "3 / 4", borderRadius: "6px", overflow: "hidden", background: "rgba(13, 22, 36, 0.8)", border: `1px ${id ? "solid" : "dashed"} ${j === d.cartas.length - 1 ? "rgba(197, 160, 89, 0.6)" : "rgba(164, 179, 198, 0.15)"}`, boxShadow: id ? "0 3px 8px rgba(0, 0, 0, 0.35)" : "none" }}>
                            {id && <img src={urlCarta(id)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                            {id && <IconeTipoCarta id={id} tamanho={18} topo={3} />}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {a.memo.trim() && (
                  <div style={{ display: "flex", gap: "8px", background: "rgba(197, 160, 89, 0.06)", borderLeft: "3px solid rgba(197, 160, 89, 0.5)", borderRadius: "6px", padding: "8px 10px" }}>
                    <i className="fa-solid fa-quote-left" style={{ color: "#c5a059", fontSize: "9pt", marginTop: "2px" }}></i>
                    <p style={{ margin: 0, color: "#a4b3c6", fontSize: "8.5pt", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-line" }}>{a.memo}</p>
                  </div>
                )}
              </div>

              {/* AÇÕES */}
              <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderTop: "1px solid rgba(164, 179, 198, 0.08)", background: "rgba(11, 19, 32, 0.5)" }}>
                <span style={{ color: "#5f758e", fontSize: "8pt" }}>{decks.length} {decks.length === 1 ? "deck" : "decks"}{a.memo.trim() ? " · memo" : ""}</span>
                <button type="button" onClick={() => setParaExcluir(a)} title="Excluir estas anotações" style={{ marginLeft: "auto", background: "transparent", border: "1px solid rgba(224, 75, 55, 0.35)", color: "#e8806f", borderRadius: "8px", padding: "7px 11px", fontSize: "8.5pt", cursor: "pointer" }}>
                  <i className="fa-solid fa-trash"></i>
                </button>
                <button type="button" onClick={() => aoAbrir(a.evento)} style={{ background: "linear-gradient(135deg, #f3d27a, #c5a059)", border: "none", color: "#0b1320", borderRadius: "8px", padding: "8px 16px", fontSize: "9pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'", boxShadow: "0 4px 12px rgba(197, 160, 89, 0.25)" }}>
                  Abrir no guia <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <ModalConfirmacao
        aberto={!!paraExcluir}
        perigo
        icone="fa-trash"
        titulo="Excluir anotações?"
        mensagem={paraExcluir ? `Os decks e o memo de ${paraExcluir.info.nome} serão apagados permanentemente.` : ""}
        textoConfirmar="Excluir"
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setParaExcluir(null)}
      />
    </>
  );
}

export default TodasAnotacoesMeta;
