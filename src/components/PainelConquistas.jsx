// 🎯 src/components/PainelConquistas.jsx
// Tela de conquistas do cartão do treinador: todas as do catálogo por
// categoria (desbloqueadas na cor da raridade, bloqueadas apagadas) e os
// níveis por personagem com a barra até o próximo nível.

import { CATEGORIAS, CONQUISTAS, RARIDADES } from "../data/conquistas";
import { NIVEIS_PERSONAGEM } from "../utils/conquistas/leve";

const NOME_NIVEL = { iniciante: "Iniciante", entusiasta: "Entusiasta", especialista: "Especialista", oshi: "Oshi" };

function PainelConquistas({ docConquistas }) {
  const obtidas = new Map((docConquistas?.conquistas ?? []).map((q) => [q.tag, q]));
  Object.entries(docConquistas?.manuais ?? {}).forEach(([tag, info]) => obtidas.set(tag, { tag, manual: true, ...info }));
  const personagens = docConquistas?.personagens ?? [];
  const niveisCrescentes = [...NIVEIS_PERSONAGEM].reverse();

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", display: "flex", flexDirection: "column", gap: "22px" }}>
      <p style={{ margin: 0, color: "#a4b3c6", fontSize: "10pt" }}>
        <strong style={{ color: "#c5a059", fontSize: "13pt" }}>{obtidas.size}</strong> de {CONQUISTAS.length} desbloqueadas
      </p>

      {personagens.length > 0 && (
        <div>
          <p style={{ margin: "0 0 10px 0", color: "#c5a059", fontWeight: 800, fontSize: "9pt", letterSpacing: "1px", textTransform: "uppercase" }}>Personagens</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "8px" }}>
            {personagens.map((p) => {
              const proximo = niveisCrescentes.find((n) => n.edicoes > p.edicoes);
              return (
                <div key={p.personagem} style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "8px", padding: "8px 10px" }}>
                  <div style={{ color: "#f1ead4", fontWeight: 700, fontSize: "9.5pt" }}>{p.personagem}</div>
                  <div style={{ color: "#c5a059", fontSize: "8.5pt", fontWeight: 700 }}>{NOME_NIVEL[p.nivel]} · {p.edicoes} edições</div>
                  {proximo && (
                    <div style={{ height: "4px", background: "rgba(164, 179, 198, 0.15)", borderRadius: "2px", marginTop: "5px" }} title={`${proximo.edicoes - p.edicoes} edição(ões) para ${NOME_NIVEL[proximo.nivel]}`}>
                      <div style={{ width: `${(p.edicoes / proximo.edicoes) * 100}%`, height: "100%", background: "#c5a059", borderRadius: "2px" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Object.entries(CATEGORIAS).map(([chave, categoria]) => {
        const itens = CONQUISTAS.filter((c) => c.categoria === chave);
        return (
          <div key={chave}>
            <p style={{ margin: "0 0 10px 0", color: "#c5a059", fontWeight: 800, fontSize: "9pt", letterSpacing: "1px", textTransform: "uppercase" }}>
              <i className={`fa-solid fa-${categoria.icone}`}></i> {categoria.nome} ({itens.filter((c) => obtidas.has(c.tag)).length}/{itens.length})
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "8px" }}>
              {itens.map((c) => {
                const q = obtidas.get(c.tag);
                const cor = RARIDADES[c.raridade].cor;
                return (
                  <div key={c.tag} title={c.descricao} style={{ display: "flex", gap: "10px", alignItems: "flex-start", background: "#0b1320", border: `1px solid ${q ? cor : "rgba(164, 179, 198, 0.1)"}`, borderRadius: "8px", padding: "8px 10px", opacity: q ? 1 : 0.4 }}>
                    <i className={`fa-solid fa-${c.icone}`} style={{ color: q ? cor : "#5f758e", fontSize: "14pt", width: "20px", textAlign: "center", marginTop: "2px" }}></i>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#f1ead4", fontWeight: 700, fontSize: "9pt" }}>{c.nome}</div>
                      <div style={{ color: cor, fontSize: "7.5pt", fontWeight: 700 }}>{RARIDADES[c.raridade].nome}{c.tipo === "conquista" ? ` · ${c.titulo}` : ""}</div>
                      <div style={{ color: "#8193a8", fontSize: "7.5pt", lineHeight: 1.4 }}>
                        {q ? (q.manual ? "Concedida pela organização" : `Ed. ${String(q.edicaoId ?? "").replace(/\D/g, "")}${q.pista ? ` · ${q.pista}` : ""}`) : c.descricao}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default PainelConquistas;
