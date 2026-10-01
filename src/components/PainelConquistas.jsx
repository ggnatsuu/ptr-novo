// 🎯 src/components/PainelConquistas.jsx
// Tela de conquistas do cartão do treinador: todas as do catálogo por
// categoria (desbloqueadas na cor da raridade, bloqueadas apagadas) e os
// níveis por personagem com a barra até o próximo nível. Com "aoEquipar",
// dá pra clicar numa desbloqueada (ou num nível de personagem) e equipar o
// título dela.

import { useState } from "react";
import { CATEGORIAS, CONQUISTAS, RARIDADES } from "../data/conquistas";
import { NIVEIS_PERSONAGEM } from "../utils/conquistas/leve";
import { resolverTitulo } from "../utils/conquistas/titulos";

const NOME_NIVEL = { iniciante: "Iniciante", entusiasta: "Entusiasta", especialista: "Especialista", oshi: "Oshi" };

function PainelConquistas({ docConquistas, tituloEquipado, aoEquipar }) {
  const [selecionado, setSelecionado] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const obtidas = new Map((docConquistas?.conquistas ?? []).map((q) => [q.tag, q]));
  Object.entries(docConquistas?.manuais ?? {}).forEach(([tag, info]) => obtidas.set(tag, { tag, manual: true, ...info }));
  const personagens = docConquistas?.personagens ?? [];
  const niveisCrescentes = [...NIVEIS_PERSONAGEM].reverse();

  const equipado = resolverTitulo(tituloEquipado, docConquistas);
  const escolhido = resolverTitulo(selecionado, docConquistas);
  const podeEquipar = Boolean(aoEquipar);
  const contorno = (id, cor) => (id === selecionado ? { outline: `2px solid ${cor}`, outlineOffset: "1px" } : {});

  async function equipar(id) {
    setSalvando(true);
    await aoEquipar(id);
    setSalvando(false);
    setSelecionado(null);
  }

  const estiloBotao = (ativo, cor = "#c5a059") => ({ background: ativo ? "rgba(197, 160, 89, 0.15)" : "transparent", border: `1px solid ${ativo ? cor : "rgba(164, 179, 198, 0.25)"}`, color: ativo ? cor : "#5f758e", borderRadius: "6px", padding: "7px 14px", cursor: ativo ? "pointer" : "not-allowed", fontSize: "8.5pt", fontWeight: 700, fontFamily: "'Montserrat', sans-serif", textTransform: "uppercase" });

  return (
    <div style={{ fontFamily: "'Montserrat', sans-serif", display: "flex", flexDirection: "column", gap: "22px" }}>
      <p style={{ margin: 0, color: "#a4b3c6", fontSize: "10pt" }}>
        <strong style={{ color: "#c5a059", fontSize: "13pt" }}>{obtidas.size}</strong> de {CONQUISTAS.length} desbloqueadas
      </p>

      {podeEquipar && (
        <div style={{ position: "sticky", top: 0, zIndex: 2, background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.35)", borderRadius: "10px", padding: "12px 14px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 16px" }}>
          <div style={{ flex: "1 1 220px", fontSize: "9pt", color: "#a4b3c6", lineHeight: 1.6 }}>
            <div>
              Equipado:{" "}
              {equipado ? <strong style={{ color: equipado.cor, fontStyle: "italic" }}>{equipado.texto}</strong> : <span style={{ color: "#5f758e" }}>nenhum</span>}
            </div>
            <div>
              {escolhido
                ? <>Selecionado: <strong style={{ color: escolhido.cor, fontStyle: "italic" }}>{escolhido.texto}</strong></>
                : <span style={{ color: "#8193a8" }}>Clique numa conquista desbloqueada ou num nível de personagem para escolher o título.</span>}
            </div>
          </div>
          <button type="button" disabled={!escolhido || salvando || selecionado === tituloEquipado} onClick={() => equipar(selecionado)} style={estiloBotao(Boolean(escolhido) && !salvando && selecionado !== tituloEquipado)}>
            <i className={`fa-solid ${salvando ? "fa-spinner fa-spin" : "fa-check"}`}></i> Equipar título
          </button>
          {equipado && (
            <button type="button" disabled={salvando} onClick={() => equipar("")} style={estiloBotao(!salvando, "#e04b37")}>
              Remover
            </button>
          )}
        </div>
      )}

      {personagens.length > 0 && (
        <div>
          <p style={{ margin: "0 0 10px 0", color: "#c5a059", fontWeight: 800, fontSize: "9pt", letterSpacing: "1px", textTransform: "uppercase" }}>Personagens</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "8px" }}>
            {personagens.map((p) => {
              const proximo = niveisCrescentes.find((n) => n.edicoes > p.edicoes);
              const niveisObtidos = niveisCrescentes.filter((n) => n.edicoes <= p.edicoes);
              return (
                <div key={p.personagem} style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "8px", padding: "8px 10px" }}>
                  <div style={{ color: "#f1ead4", fontWeight: 700, fontSize: "9.5pt" }}>{p.personagem}</div>
                  <div style={{ color: "#c5a059", fontSize: "8.5pt", fontWeight: 700 }}>{NOME_NIVEL[p.nivel]} · {p.edicoes} edições</div>
                  {proximo && (
                    <div style={{ height: "4px", background: "rgba(164, 179, 198, 0.15)", borderRadius: "2px", marginTop: "5px" }} title={`${proximo.edicoes - p.edicoes} edição(ões) para ${NOME_NIVEL[proximo.nivel]}`}>
                      <div style={{ width: `${(p.edicoes / proximo.edicoes) * 100}%`, height: "100%", background: "#c5a059", borderRadius: "2px" }} />
                    </div>
                  )}
                  {podeEquipar && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "7px" }}>
                      {niveisObtidos.map((n) => {
                        const id = `p:${p.personagem}|${n.nivel}`;
                        const t = resolverTitulo(id, docConquistas);
                        return (
                          <button key={id} type="button" onClick={() => setSelecionado(id)} title={t?.texto} style={{ background: id === tituloEquipado ? "rgba(197, 160, 89, 0.15)" : "transparent", border: `1px solid ${t?.cor}`, color: t?.cor, borderRadius: "4px", padding: "2px 7px", fontSize: "7.5pt", fontWeight: 700, cursor: "pointer", ...contorno(id, t?.cor) }}>
                            {id === tituloEquipado && <i className="fa-solid fa-check"></i>} {NOME_NIVEL[n.nivel]}
                          </button>
                        );
                      })}
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
                const id = `c:${c.tag}`;
                const clicavel = podeEquipar && q;
                return (
                  <div
                    key={c.tag}
                    title={c.descricao}
                    onClick={clicavel ? () => setSelecionado(id) : undefined}
                    style={{ position: "relative", display: "flex", gap: "10px", alignItems: "flex-start", background: "#0b1320", border: `1px solid ${q ? cor : "rgba(164, 179, 198, 0.1)"}`, borderRadius: "8px", padding: "8px 10px", opacity: q ? 1 : 0.4, cursor: clicavel ? "pointer" : "default", ...contorno(id, cor) }}
                  >
                    <i className={`fa-solid fa-${c.icone}`} style={{ color: q ? cor : "#5f758e", fontSize: "14pt", width: "20px", textAlign: "center", marginTop: "2px" }}></i>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#f1ead4", fontWeight: 700, fontSize: "9pt" }}>{c.nome}</div>
                      <div style={{ color: cor, fontSize: "7.5pt", fontWeight: 700 }}>{RARIDADES[c.raridade].nome}{c.tipo === "conquista" ? ` · ${c.titulo}` : ""}</div>
                      <div style={{ color: "#8193a8", fontSize: "7.5pt", lineHeight: 1.4 }}>
                        {q ? (q.manual ? "Concedida pela organização" : `Ed. ${String(q.edicaoId ?? "").replace(/\D/g, "")}${q.pista ? ` · ${q.pista}` : ""}`) : c.descricao}
                      </div>
                    </div>
                    {podeEquipar && id === tituloEquipado && (
                      <span style={{ position: "absolute", top: "6px", right: "8px", color: cor, fontSize: "7pt", fontWeight: 800, textTransform: "uppercase" }}>
                        <i className="fa-solid fa-check"></i> Equipado
                      </span>
                    )}
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
