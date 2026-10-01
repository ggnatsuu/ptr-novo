// 🎯 src/components/BuscaSkill.jsx
// Campo de busca de skill com lista suspensa (ícone + nome + raridade).
// Usado no Guia do Meta (comparar skills) e no editor do admin (acelerações).

import { useEffect, useMemo, useRef, useState } from "react";
import { catalogoSkills, caminhoIconeSkill, COR_RARIDADE_SKILL } from "../utils/skillsPista";


function BuscaSkill({ aoEscolher, ignorar = [], placeholder = "Buscar skill pelo nome..." }) {
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberta) return undefined;
    const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberta(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberta]);

  const resultados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo.length < 2) return [];
    return catalogoSkills.filter((s) => s.nome.toLowerCase().includes(termo) && !ignorar.includes(s.id)).slice(0, 40);
  }, [busca, ignorar]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.2)", borderRadius: "8px", padding: "7px 10px" }}>
        <i className="fa-solid fa-magnifying-glass" style={{ color: "#5f758e", fontSize: "8.5pt" }}></i>
        <input value={busca} onChange={(e) => { setBusca(e.target.value); setAberta(true); }} onFocus={() => setAberta(true)} placeholder={placeholder} style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1ead4", fontSize: "9.5pt", fontFamily: "'Montserrat'" }} />
      </div>
      {aberta && busca.trim().length >= 2 && (
        <div className="rolagem-dourada" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 60, maxHeight: "300px", overflowY: "auto", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "10px", boxShadow: "0 12px 30px rgba(0, 0, 0, 0.55)", padding: "4px" }}>
          {resultados.length === 0 && <p style={{ margin: "10px", color: "#5f758e", fontSize: "8.5pt", textAlign: "center" }}>Nenhuma skill encontrada.</p>}
          {resultados.map((s) => (
            <button key={s.id} type="button" onClick={() => { aoEscolher(s.id); setBusca(""); setAberta(false); }} className="linha-clicavel" style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: "6px", padding: "6px 8px", cursor: "pointer", fontFamily: "'Montserrat'" }}>
              {caminhoIconeSkill(s.iconId) ? <img src={caminhoIconeSkill(s.iconId)} alt="" style={{ width: "26px", height: "26px" }} /> : <span style={{ width: "26px" }} />}
              <span style={{ flex: 1, color: COR_RARIDADE_SKILL[s.rarity] ?? "#f1ead4", fontSize: "9pt", fontWeight: 700 }}>{s.nome}</span>
              {s.herdada && <span style={{ color: "#8193a8", fontSize: "7pt", fontWeight: 700 }}>HERDADA</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default BuscaSkill;
