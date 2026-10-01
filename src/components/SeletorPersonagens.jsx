// 🎯 src/components/SeletorPersonagens.jsx
// Janela para escolher a personagem (roupa) de um deck: busca por nome,
// variante ou título da roupa. Lista em data/roupasPersonagens.json e
// portraits em public/assets/img/portrait/<card_id>.webp.

import { useEffect, useMemo, useState } from "react";
import { roupasPersonagens } from "../utils/anotacoesMeta";
import { portraitDaRoupa } from "../utils/iconeRoupa";

function SeletorPersonagens({ aberto, aoFechar, aoEscolher }) {
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto, aoFechar]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return roupasPersonagens.filter((r) => !termo || `${r.nome} ${r.variante ?? ""} ${r.epiteto}`.toLowerCase().includes(termo));
  }, [busca]);

  if (!aberto) return null;

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(5, 9, 16, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ width: "min(1240px, 100%)", height: "min(880px, 100%)", display: "flex", flexDirection: "column", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "14px", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)", overflow: "hidden", fontFamily: "'Montserrat', sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
          <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt" }}>Escolher personagem</h3>
          <span style={{ color: "#5f758e", fontSize: "8.5pt" }}>{lista.length} roupas</span>
          <button type="button" onClick={aoFechar} title="Fechar (Esc)" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#8193a8", fontSize: "14pt", cursor: "pointer" }}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "8px", padding: "8px 12px" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: "#5f758e" }}></i>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou roupa (ex.: Oguri, Christmas)..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1ead4", fontSize: "10pt", fontFamily: "'Montserrat'" }} />
          </div>
        </div>
        <div className="rolagem-dourada" style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px", alignContent: "start" }}>
          {lista.length === 0 && <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#5f758e", fontSize: "9pt" }}>Nenhuma personagem encontrada.</p>}
          {lista.map((r) => (
            <button key={r.id} type="button" onClick={() => aoEscolher(r.id)} title={`${r.nome} [${r.epiteto}]`} className="cartao-perfil" style={{ display: "flex", flexDirection: "column", alignItems: "center", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "10px", padding: "8px 6px", cursor: "pointer", fontFamily: "'Montserrat'" }}>
              <img src={portraitDaRoupa(r.id)} alt="" loading="lazy" style={{ width: "120px", height: "120px", objectFit: "cover" }} />
              <span style={{ color: "#f1ead4", fontSize: "9.5pt", fontWeight: 700, marginTop: "6px", width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.nome}</span>
              <span style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 600, width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.variante ?? " "}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SeletorPersonagens;
