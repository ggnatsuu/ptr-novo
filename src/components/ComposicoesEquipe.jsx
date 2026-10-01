// 🎯 src/components/ComposicoesEquipe.jsx
// Guia do Meta: estratégias de composição do time (3 cavalinhas).
// Cada estratégia é um cartão com 3 slots (estilo + função + personagem opcional),
// selo opcional e comentário.

import { portraitDaRoupa } from "../utils/iconeRoupa";
import { roupaPorId } from "../utils/anotacoesMeta";
import { FUNCOES_COMPOSICAO, SELOS_COMPOSICAO } from "../utils/guiaMetaDados";

const nomeRoupa = (cardId) => {
  const r = roupaPorId.get(String(cardId));
  return r ? r.nome : null;
};

function SlotComposicao({ slot }) {
  const funcao = FUNCOES_COMPOSICAO[slot.funcao];
  const foto = slot.cardId ? portraitDaRoupa(slot.cardId) : null;
  const cor = funcao?.cor ?? "#5f758e";
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", background: `linear-gradient(180deg, ${cor}14, #0b1320 70%)`, border: `1px solid ${cor}40`, borderRadius: "10px", padding: "10px 6px 8px" }}>
      <div style={{ position: "relative", width: "64px", height: "64px" }}>
        {foto ? (
          <img src={foto} alt="" style={{ width: "64px", height: "64px", borderRadius: "10px", objectFit: "cover", background: "#0d1624" }} />
        ) : (
          <div style={{ width: "64px", height: "64px", borderRadius: "10px", background: "#0d1624", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img src={`/assets/img/textures/${slot.estilo.toLowerCase()}.webp`} alt="" style={{ height: "40px" }} />
          </div>
        )}
        {foto && <img src={`/assets/img/textures/${slot.estilo.toLowerCase()}.webp`} alt="" title={slot.estilo} style={{ position: "absolute", right: "-8px", bottom: "-6px", height: "26px", filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.7))" }} />}
      </div>
      <span style={{ color: "#f1ead4", fontSize: "8.5pt", fontWeight: 800, textAlign: "center", lineHeight: 1.2, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {slot.cardId ? nomeRoupa(slot.cardId) ?? slot.estilo : slot.estilo}
      </span>
      {funcao ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: `${cor}22`, border: `1px solid ${cor}66`, color: cor, borderRadius: "999px", padding: "1px 8px", fontSize: "7.5pt", fontWeight: 800 }}>
          <i className={`fa-solid ${funcao.icone}`}></i> {funcao.nome}
        </span>
      ) : <span style={{ height: "17px" }} />}
    </div>
  );
}

function ComposicoesEquipe({ estrategias = [] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(330px, 1fr))", gap: "12px" }}>
      {estrategias.map((e, i) => {
        const selo = SELOS_COMPOSICAO[e.selo];
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "10px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderTop: `3px solid ${selo?.cor ?? "rgba(197, 160, 89, 0.5)"}`, borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#f1ead4", fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "10.5pt", flex: 1, minWidth: 0 }}>{e.titulo}</span>
              {selo && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: selo.cor, border: `1px solid ${selo.cor}66`, background: `${selo.cor}18`, borderRadius: "6px", padding: "2px 8px", fontSize: "7.5pt", fontWeight: 800, whiteSpace: "nowrap" }}>
                  <i className={`fa-solid ${selo.icone}`}></i> {selo.nome}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {e.slots.map((s, j) => <SlotComposicao key={j} slot={s} />)}
            </div>
            {e.comentario && (
              <div style={{ display: "flex", gap: "8px", color: "#a4b3c6", fontSize: "8.5pt", lineHeight: 1.5, whiteSpace: "pre-line" }}>
                <i className="fa-solid fa-comment-dots" style={{ color: "#c5a059", marginTop: "3px" }}></i>
                <span>{e.comentario}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ComposicoesEquipe;
