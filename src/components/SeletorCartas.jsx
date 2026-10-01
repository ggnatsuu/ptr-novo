// 🎯 src/components/SeletorCartas.jsx
// Janela para escolher uma carta de suporte: busca por nome/título, filtro
// de tipo e de raridade. Dados em data/cartasSuporte.json e imagens em
// public/assets/img/cartas/<id>.webp.

import { useEffect, useMemo, useState } from "react";
import { TIPOS_CARTA, cartasSuporte, urlCarta, classeRaridade } from "../utils/anotacoesMeta";

const RARIDADES = ["SSR", "SR", "R"];


function SeletorCartas({ aberto, aoFechar, aoEscolher }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState(null);
  const [raridade, setRaridade] = useState("SSR");

  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto, aoFechar]);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return cartasSuporte
      .filter((c) => (!tipo || c.tipo === tipo) && (!raridade || c.raridade === raridade))
      .filter((c) => !termo || `${c.nome} ${c.titulo}`.toLowerCase().includes(termo))
      .sort((a, b) => b.id - a.id);
  }, [busca, tipo, raridade]);

  if (!aberto) return null;

  const estiloFiltro = (ativo, cor = "#c5a059") => ({
    display: "inline-flex", alignItems: "center", gap: "6px", background: ativo ? `${cor}26` : "#0b1320",
    border: `1px solid ${ativo ? cor : "rgba(164, 179, 198, 0.2)"}`, color: ativo ? cor : "#8193a8",
    borderRadius: "8px", padding: "5px 10px", fontSize: "8.5pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'",
  });

  return (
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(5, 9, 16, 0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ width: "min(1240px, 100%)", height: "min(880px, 100%)", display: "flex", flexDirection: "column", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "14px", boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)", overflow: "hidden", fontFamily: "'Montserrat', sans-serif" }}>
        {/* TOPO */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
          <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt" }}>Escolher carta</h3>
          <span style={{ color: "#5f758e", fontSize: "8.5pt" }}>{lista.length} cartas</span>
          <button type="button" onClick={aoFechar} title="Fechar (Esc)" style={{ marginLeft: "auto", background: "transparent", border: "none", color: "#8193a8", fontSize: "14pt", cursor: "pointer" }}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* FILTROS */}
        <div style={{ display: "grid", gap: "10px", padding: "12px 18px", borderBottom: "1px solid rgba(164, 179, 198, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "8px", padding: "8px 12px" }}>
            <i className="fa-solid fa-magnifying-glass" style={{ color: "#5f758e" }}></i>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou título da carta..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1ead4", fontSize: "10pt", fontFamily: "'Montserrat'" }} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" }}>
            {TIPOS_CARTA.map((t) => (
              <button key={t.chave} type="button" onClick={() => setTipo(tipo === t.chave ? null : t.chave)} style={estiloFiltro(tipo === t.chave, t.cor)}>
                {t.icone ? <img src={t.icone} alt="" style={{ width: "16px", height: "16px" }} /> : <i className={`fa-solid ${t.faIcone}`}></i>}
                {t.chave}
              </button>
            ))}
            <span style={{ width: "1px", height: "22px", background: "rgba(164, 179, 198, 0.2)", margin: "0 4px" }}></span>
            {RARIDADES.map((r) => (
              <button key={r} type="button" onClick={() => setRaridade(raridade === r ? null : r)} style={estiloFiltro(raridade === r)}>{r}</button>
            ))}
          </div>
        </div>

        {/* LISTA */}
        <div className="rolagem-dourada" style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px", alignContent: "start" }}>
          {lista.length === 0 && <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "#5f758e", fontSize: "9pt" }}>Nenhuma carta encontrada.</p>}
          {lista.map((c) => {
            const t = TIPOS_CARTA.find((x) => x.chave === c.tipo);
            return (
              <button key={c.id} type="button" onClick={() => aoEscolher(c.id)} title={`${c.nome} ${c.titulo}`} className="cartao-perfil" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "center", fontFamily: "'Montserrat'" }}>
                <span className={classeRaridade(c.id)} style={{ position: "relative", display: "block", aspectRatio: "3 / 4", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(164, 179, 198, 0.18)", background: "#0b1320" }}>
                  <img src={urlCarta(c.id)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", top: "5px", left: "5px", display: "flex", filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8))" }}>
                    {t?.icone ? <img src={t.icone} alt={c.tipo} title={c.tipo} style={{ width: "32px", height: "32px" }} /> : <i className={`fa-solid ${t?.faIcone}`} title={c.tipo} style={{ color: t?.cor, fontSize: "18pt" }}></i>}
                  </span>
                </span>
                <span style={{ color: "#f1ead4", fontSize: "9.5pt", fontWeight: 700, marginTop: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default SeletorCartas;
