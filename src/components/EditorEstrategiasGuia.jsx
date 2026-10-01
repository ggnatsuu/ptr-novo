// 🎯 src/components/EditorEstrategiasGuia.jsx
// Editor do admin (Guia do Meta): estratégias de composição do time.
// Cada estratégia: título, selo, comentário e 3 slots (estilo + função + personagem opcional).

import { useState } from "react";
import SeletorPersonagens from "./SeletorPersonagens";
import ComposicoesEquipe from "./ComposicoesEquipe";
import { portraitDaRoupa } from "../utils/iconeRoupa";
import { ESTILOS_GUIA, FUNCOES_COMPOSICAO, SELOS_COMPOSICAO } from "../utils/guiaMetaDados";

const campo = { width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.2)", borderRadius: "6px", color: "#f1ead4", fontSize: "9pt", padding: "6px 8px", fontFamily: "'Montserrat'", outline: "none" };
const rotulo = { display: "block", color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "4px" };
const botaoIcone = (cor = "#a4b3c6", desligado = false) => ({ background: "transparent", border: "none", color: desligado ? "#3a4a5e" : cor, cursor: desligado ? "default" : "pointer", padding: "2px 5px", fontSize: "9pt" });
const pilula = (ativo, cor) => ({ display: "inline-flex", alignItems: "center", gap: "4px", background: ativo ? `${cor}22` : "transparent", border: `1px solid ${ativo ? `${cor}88` : "rgba(164, 179, 198, 0.15)"}`, color: ativo ? cor : "#5f758e", borderRadius: "999px", padding: "2px 8px", fontSize: "7.5pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'" });

const estrategiaNova = () => ({ titulo: "Nova estratégia", selo: null, comentario: null, slots: [0, 1, 2].map(() => ({ estilo: "Front", funcao: null, cardId: null })) });

function EditorEstrategiasGuia({ estrategias = [], aoMudar }) {
  const [escolhendo, setEscolhendo] = useState(null); // { e, s }

  const mudarLista = (alterar) => aoMudar(alterar(estrategias.map((e) => ({ ...e, slots: e.slots.map((s) => ({ ...s })) }))));
  const mudarEstrategia = (i, mudancas) => mudarLista((l) => { l[i] = { ...l[i], ...mudancas }; return l; });
  const mudarSlot = (i, j, mudancas) => mudarLista((l) => { l[i].slots[j] = { ...l[i].slots[j], ...mudancas }; return l; });
  const mover = (i, delta) => mudarLista((l) => {
    const j = i + delta;
    if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]];
    return l;
  });

  return (
    <div>
      <div style={{ display: "grid", gap: "12px" }}>
        {estrategias.map((e, i) => (
          <div key={i} style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderTop: `3px solid ${SELOS_COMPOSICAO[e.selo]?.cor ?? "rgba(197, 160, 89, 0.5)"}`, borderRadius: "10px", padding: "10px 12px" }}>
            {/* Cabeçalho: título, ordem, duplicar, remover */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
              <span style={{ minWidth: "22px", height: "22px", borderRadius: "50%", background: "linear-gradient(135deg, #f3d27a, #c5a059)", color: "#0b1320", fontSize: "8pt", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
              <input value={e.titulo ?? ""} onChange={(ev) => mudarEstrategia(i, { titulo: ev.target.value })} placeholder="Título (ex.: Front duplo com RA)" style={{ ...campo, flex: 1, fontWeight: 700 }} />
              <button type="button" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)} style={botaoIcone("#a4b3c6", i === 0)}><i className="fa-solid fa-chevron-up"></i></button>
              <button type="button" title="Descer" disabled={i === estrategias.length - 1} onClick={() => mover(i, 1)} style={botaoIcone("#a4b3c6", i === estrategias.length - 1)}><i className="fa-solid fa-chevron-down"></i></button>
              <button type="button" title="Duplicar" onClick={() => mudarLista((l) => [...l.slice(0, i + 1), { ...l[i], slots: l[i].slots.map((s) => ({ ...s })), titulo: `${l[i].titulo ?? ""} (cópia)` }, ...l.slice(i + 1)])} style={botaoIcone()}><i className="fa-solid fa-clone"></i></button>
              <button type="button" title="Remover" onClick={() => mudarLista((l) => l.filter((_, j) => j !== i))} style={botaoIcone("#e8806f")}><i className="fa-solid fa-trash"></i></button>
            </div>

            {/* Selo */}
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
              <span style={{ ...rotulo, margin: 0 }}>Selo</span>
              <button type="button" onClick={() => mudarEstrategia(i, { selo: null })} style={pilula(!e.selo, "#a4b3c6")}>Nenhum</button>
              {Object.entries(SELOS_COMPOSICAO).map(([chave, s]) => (
                <button key={chave} type="button" onClick={() => mudarEstrategia(i, { selo: chave })} style={pilula(e.selo === chave, s.cor)}><i className={`fa-solid ${s.icone}`}></i> {s.nome}</button>
              ))}
            </div>

            {/* Slots */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px", marginBottom: "10px" }}>
              {e.slots.map((s, j) => (
                <div key={j} style={{ background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.1)", borderRadius: "8px", padding: "8px", display: "grid", gap: "6px" }}>
                  <span style={{ ...rotulo, margin: 0 }}>Slot {j + 1}</span>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {ESTILOS_GUIA.map((est) => (
                      <button key={est} type="button" title={est} onClick={() => mudarSlot(i, j, { estilo: est })} style={{ background: s.estilo === est ? "rgba(197, 160, 89, 0.18)" : "transparent", border: `1px solid ${s.estilo === est ? "rgba(197, 160, 89, 0.6)" : "transparent"}`, borderRadius: "6px", padding: "2px", cursor: "pointer", opacity: s.estilo === est ? 1 : 0.45 }}>
                        <img src={`/assets/img/textures/${est.toLowerCase()}.webp`} alt={est} style={{ height: "24px", display: "block" }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {Object.entries(FUNCOES_COMPOSICAO).map(([chave, f]) => (
                      <button key={chave} type="button" onClick={() => mudarSlot(i, j, { funcao: s.funcao === chave ? null : chave })} style={pilula(s.funcao === chave, f.cor)}><i className={`fa-solid ${f.icone}`}></i> {f.nome}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button type="button" onClick={() => setEscolhendo({ e: i, s: j })} title="Escolher personagem (opcional)" style={{ width: "40px", height: "40px", padding: 0, borderRadius: "8px", border: s.cardId ? "1px solid rgba(197, 160, 89, 0.4)" : "1px dashed rgba(164, 179, 198, 0.3)", background: "#0b1320", cursor: "pointer", overflow: "hidden", flexShrink: 0 }}>
                      {s.cardId ? <img src={portraitDaRoupa(s.cardId)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <i className="fa-solid fa-user-plus" style={{ color: "#5f758e" }}></i>}
                    </button>
                    <span style={{ flex: 1, color: "#8193a8", fontSize: "7.5pt" }}>{s.cardId ? "Personagem sugerida" : "Sem personagem (mostra só o estilo)"}</span>
                    {s.cardId && <button type="button" title="Tirar personagem" onClick={() => mudarSlot(i, j, { cardId: null })} style={botaoIcone("#e8806f")}><i className="fa-solid fa-xmark"></i></button>}
                  </div>
                </div>
              ))}
            </div>

            <textarea value={e.comentario ?? ""} onChange={(ev) => mudarEstrategia(i, { comentario: ev.target.value || null })} rows={2} placeholder="Comentário (ex.: o RA puxa o ritmo e segura as outras Fronts)" style={{ ...campo, resize: "vertical" }} />
          </div>
        ))}
      </div>

      <button type="button" onClick={() => mudarLista((l) => [...l, estrategiaNova()])} style={{ width: "100%", marginTop: "12px", background: "transparent", border: "1px dashed rgba(197, 160, 89, 0.4)", borderRadius: "10px", color: "#c5a059", cursor: "pointer", fontWeight: 700, fontSize: "9pt", padding: "10px", fontFamily: "'Montserrat'" }}>
        <i className="fa-solid fa-plus"></i> Adicionar estratégia
      </button>

      {estrategias.length > 0 && (
        <div style={{ marginTop: "16px" }}>
          <span style={rotulo}><i className="fa-solid fa-eye"></i> Prévia no guia</span>
          <ComposicoesEquipe estrategias={estrategias} />
        </div>
      )}

      <SeletorPersonagens
        aberto={!!escolhendo}
        aoFechar={() => setEscolhendo(null)}
        aoEscolher={(cardId) => { mudarSlot(escolhendo.e, escolhendo.s, { cardId }); setEscolhendo(null); }}
      />
    </div>
  );
}

export default EditorEstrategiasGuia;
