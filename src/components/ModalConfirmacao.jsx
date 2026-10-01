// 🎯 src/components/ModalConfirmacao.jsx
// Confirmação no visual do site (substitui o window.confirm do navegador).
// Fecha com Esc ou clicando fora; Enter confirma.

import { useEffect } from "react";

function ModalConfirmacao({ aberto, titulo, mensagem, detalhe, textoConfirmar = "Confirmar", textoCancelar = "Cancelar", perigo = false, icone = "fa-circle-question", aoConfirmar, aoCancelar }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const teclas = (e) => {
      if (e.key === "Escape") aoCancelar();
      if (e.key === "Enter") aoConfirmar();
    };
    document.addEventListener("keydown", teclas);
    return () => document.removeEventListener("keydown", teclas);
  }, [aberto, aoConfirmar, aoCancelar]);

  if (!aberto) return null;
  const cor = perigo ? "#e8806f" : "#c5a059";

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) aoCancelar(); }} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(5, 9, 16, 0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div role="dialog" aria-modal="true" style={{ width: "min(420px, 100%)", background: "linear-gradient(160deg, rgba(197, 160, 89, 0.08), #0d1624 45%)", border: `1px solid ${cor}55`, borderRadius: "14px", boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)", fontFamily: "'Montserrat', sans-serif", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: "14px", padding: "22px 22px 18px" }}>
          <span style={{ width: "44px", height: "44px", flexShrink: 0, borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", background: `${cor}1f`, border: `1px solid ${cor}55` }}>
            <i className={`fa-solid ${icone}`} style={{ color: cor, fontSize: "16pt" }}></i>
          </span>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: "2px 0 6px", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt" }}>{titulo}</h3>
            <p style={{ margin: 0, color: "#a4b3c6", fontSize: "9.5pt", lineHeight: 1.55 }}>{mensagem}</p>
            {detalhe && <p style={{ margin: "8px 0 0", color: "#5f758e", fontSize: "8.5pt", lineHeight: 1.5 }}><i className="fa-solid fa-circle-info"></i> {detalhe}</p>}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 22px", background: "rgba(11, 19, 32, 0.6)", borderTop: "1px solid rgba(164, 179, 198, 0.08)" }}>
          <button type="button" onClick={aoCancelar} style={{ background: "transparent", border: "1px solid rgba(164, 179, 198, 0.25)", color: "#a4b3c6", borderRadius: "8px", padding: "9px 16px", fontSize: "9pt", fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat'" }}>
            {textoCancelar}
          </button>
          <button type="button" autoFocus onClick={aoConfirmar} style={{ background: perigo ? "linear-gradient(135deg, #e8806f, #d0503c)" : "linear-gradient(135deg, #f3d27a, #c5a059)", border: "none", color: perigo ? "#fff" : "#0b1320", borderRadius: "8px", padding: "9px 18px", fontSize: "9pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'", boxShadow: `0 4px 14px ${cor}40` }}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ModalConfirmacao;
