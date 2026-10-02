// 🎯 src/components/HistoricoGuia.jsx
// Lista do histórico de alterações do Guia do Meta (editor do admin).

import { ACOES_HISTORICO, tempoRelativo } from "../utils/historicoGuia";

function HistoricoGuia({ entradas, mostrarEvento = true, aoAbrirEvento, vazio = "Nenhuma alteração registrada ainda." }) {
  if (!entradas) return <p style={{ margin: 0, color: "#5f758e", fontSize: "8.5pt" }}><i className="fa-solid fa-circle-notch fa-spin"></i> Carregando histórico...</p>;
  if (!entradas.length) return <p style={{ margin: 0, color: "#5f758e", fontSize: "8.5pt" }}>{vazio}</p>;
  return (
    <div style={{ display: "grid", gap: "2px" }}>
      {entradas.map((e, i) => {
        const acao = ACOES_HISTORICO[e.acao] ?? { texto: e.acao, icone: "fa-circle", cor: "#a4b3c6" };
        return (
          <div key={e.id ?? i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "7px 8px", borderRadius: "6px", background: i % 2 ? "transparent" : "rgba(164, 179, 198, 0.03)" }}>
            <span style={{ width: "24px", height: "24px", flexShrink: 0, borderRadius: "50%", background: `${acao.cor}22`, color: acao.cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "8pt" }}>
              <i className={`fa-solid ${acao.icone}`}></i>
            </span>
            <div style={{ flex: 1, minWidth: 0, fontSize: "8.5pt", lineHeight: 1.45 }}>
              <span style={{ color: "#f1ead4", fontWeight: 800 }}>{e.nome}</span>
              <span style={{ color: "#8193a8" }}> {acao.texto} </span>
              {mostrarEvento && (
                aoAbrirEvento && e.acao !== "excluiu"
                  ? <button type="button" onClick={() => aoAbrirEvento(e.evento)} style={{ background: "none", border: "none", padding: 0, color: "#c5a059", fontWeight: 800, cursor: "pointer", fontSize: "8.5pt", fontFamily: "'Montserrat'" }}>{e.evento}</button>
                  : <span style={{ color: "#c5a059", fontWeight: 800 }}>{e.evento}</span>
              )}
              {e.secoes?.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "3px" }}>
                  {e.secoes.map((s) => <span key={s} style={{ border: "1px solid rgba(164, 179, 198, 0.2)", color: "#a4b3c6", borderRadius: "4px", padding: "0 5px", fontSize: "7pt", fontWeight: 700 }}>{s}</span>)}
                </div>
              )}
            </div>
            <span title={e.quando.toLocaleString("pt-BR")} style={{ color: "#5f758e", fontSize: "7.5pt", whiteSpace: "nowrap" }}>{tempoRelativo(e.quando)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default HistoricoGuia;
