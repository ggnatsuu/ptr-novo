// 🎯 src/components/EditorEstilosGuia.jsx
// Editor do admin (Guia do Meta): personagens recomendadas e decks
// (iniciante/padrão/baleia) de cada estilo. Recebe os estilos do rascunho
// e devolve as alterações por aoMudarEstilo(estilo, alterar).

import { useState } from "react";
import SeletorPersonagens from "./SeletorPersonagens";
import SeletorCartas from "./SeletorCartas";
import IconeTipoCarta from "./IconeTipoCarta";
import { cartaPorId, roupaPorId, urlCarta, classeRaridade } from "../utils/anotacoesMeta";
import { portraitDaRoupa } from "../utils/iconeRoupa";
import { ESTILOS_GUIA } from "../utils/guiaMetaDados";
import portraitsPorNome from "../data/portraitsPorNome.json";

const NIVEIS = [
  { chave: "deck_iniciante", nome: "Iniciante", prefixo: "BEGINNER", cor: "#7fb37a" },
  { chave: "deck_padrao", nome: "Padrão", prefixo: "STANDARD", cor: "#5fa8e8" },
  { chave: "deck_baleia", nome: "Baleia", prefixo: "WHALE", cor: "#c5a059" },
];
const SLOTS = [1, 2, 3, 4, 5, "emprestimo"];
const GENERICAS = [
  { id: 12301, nome: "Speed", icone: "speed" },
  { id: 12302, nome: "Stamina", icone: "stamina" },
  { id: 12303, nome: "Power", icone: "power" },
  { id: 12304, nome: "Guts", icone: "guts" },
  { id: 12305, nome: "Wit", icone: "wit" },
];
const genericaPorId = (id) => GENERICAS.find((g) => g.id === Number(id));

const campo = { width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.2)", borderRadius: "6px", color: "#f1ead4", fontSize: "8.5pt", padding: "5px 7px", fontFamily: "'Montserrat'", outline: "none" };
const rotulo = { display: "block", color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "4px" };
const botaoIcone = (cor = "#a4b3c6", desligado = false) => ({ background: "transparent", border: "none", color: desligado ? "#3a4a5e" : cor, cursor: desligado ? "default" : "pointer", padding: "2px 4px", fontSize: "8.5pt" });

const textoPersonagem = (estrelas, tag) => `${"★".repeat(estrelas ?? 0)}${tag ? `(${tag})` : ""}`;
const fotoPersonagem = (p) => portraitDaRoupa(p.cardId ?? portraitsPorNome[p.nome]);

// Deck salvo -> 6 posições fixas (slot 1..5 + empréstimo).
const posicoesDoDeck = (deck) => SLOTS.map((slot) => (deck?.cartas ?? []).find((c) => String(c.slot) === String(slot)) ?? null);

function EditorEstilosGuia({ estilos, aoMudarEstilo }) {
  const [estilo, setEstilo] = useState(ESTILOS_GUIA[0]);
  const [escolhendoPersonagem, setEscolhendoPersonagem] = useState(false);
  const [escolhendoCarta, setEscolhendoCarta] = useState(null); // { nivel, slot }

  const dados = estilos?.[estilo] ?? {};
  const personagens = (dados.personagens_recomendadas ?? []).filter((p) => p.nome && p.nome !== "N/A");

  // ---- Personagens ----
  const mudarPersonagens = (alterar) => aoMudarEstilo(estilo, (e) => { e.personagens_recomendadas = alterar(personagens.map((p) => ({ ...p }))); });
  const mudarPersonagem = (i, mudancas) => mudarPersonagens((l) => {
    l[i] = { ...l[i], ...mudancas };
    l[i].texto = textoPersonagem(l[i].estrelas, l[i].tag);
    return l;
  });
  const moverPersonagem = (i, delta) => mudarPersonagens((l) => {
    const j = i + delta;
    if (j >= 0 && j < l.length) [l[i], l[j]] = [l[j], l[i]];
    return l;
  });
  const adicionarPersonagem = (cardId) => {
    const r = roupaPorId.get(cardId);
    setEscolhendoPersonagem(false);
    if (!r) return;
    const nome = r.variante ? `${r.nome} (${r.variante})` : r.nome;
    mudarPersonagens((l) => [...l, { nome, cardId, lancamento: null, estrelas: 3, tag: null, texto: textoPersonagem(3, null) }]);
  };

  // ---- Decks ----
  const mudarDeck = (nivel, alterar) => aoMudarEstilo(estilo, (e) => {
    const deck = e[nivel.chave] ?? { titulo: `${nivel.prefixo} - ${estilo.toUpperCase()}`, cartas: [] };
    const posicoes = alterar(posicoesDoDeck(deck).map((c) => (c ? { ...c } : null)));
    e[nivel.chave] = { ...deck, cartas: posicoes.map((c, i) => (c ? { ...c, slot: SLOTS[i] } : null)).filter(Boolean) };
  });
  const mudarObservacao = (nivel, texto) => aoMudarEstilo(estilo, (e) => {
    const deck = e[nivel.chave] ?? { cartas: [] };
    const base = (deck.titulo ?? `${nivel.prefixo} - ${estilo.toUpperCase()}`).split(" - ").slice(0, 2).join(" - ");
    e[nivel.chave] = { ...deck, titulo: texto ? `${base} - ${texto}` : base };
  });
  const definirCarta = (nivel, i, id) => mudarDeck(nivel, (p) => {
    const nome = genericaPorId(id) ? `${genericaPorId(id).nome} (Qualquer)` : cartaPorId.get(id)?.nome ?? null;
    p[i] = { ...(p[i] ?? { nota: null, obrigatorio: false, alternativa: null }), id, nome, lancamento: p[i]?.id === id ? p[i].lancamento : null };
    return p;
  });
  const mudarCarta = (nivel, i, mudancas) => mudarDeck(nivel, (p) => { if (p[i]) p[i] = { ...p[i], ...mudancas }; return p; });

  return (
    <div>
      {/* Abas de estilo */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "14px" }}>
        {ESTILOS_GUIA.map((e) => (
          <button key={e} type="button" onClick={() => setEstilo(e)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: e === estilo ? "rgba(197, 160, 89, 0.15)" : "#0b1320", border: `1px solid ${e === estilo ? "rgba(197, 160, 89, 0.6)" : "rgba(164, 179, 198, 0.15)"}`, color: e === estilo ? "#f1ead4" : "#8193a8", borderRadius: "8px", padding: "6px 12px", cursor: "pointer", fontWeight: 800, fontSize: "9pt", fontFamily: "'Montserrat'" }}>
            <img src={`/assets/img/textures/${e.toLowerCase()}.webp`} alt="" style={{ height: "22px" }} /> {e}
          </button>
        ))}
      </div>

      {/* PERSONAGENS */}
      <span style={rotulo}><i className="fa-solid fa-user"></i> Personagens recomendadas</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px", marginBottom: "20px" }}>
        {personagens.map((p, i) => (
          <div key={`${p.nome}-${i}`} style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "10px", padding: "8px", display: "flex", flexDirection: "column", alignItems: "center", gap: "5px" }}>
            <div style={{ display: "flex", width: "100%", justifyContent: "space-between" }}>
              <span>
                <button type="button" title="Mover para a esquerda" disabled={i === 0} onClick={() => moverPersonagem(i, -1)} style={botaoIcone("#a4b3c6", i === 0)}><i className="fa-solid fa-chevron-left"></i></button>
                <button type="button" title="Mover para a direita" disabled={i === personagens.length - 1} onClick={() => moverPersonagem(i, 1)} style={botaoIcone("#a4b3c6", i === personagens.length - 1)}><i className="fa-solid fa-chevron-right"></i></button>
              </span>
              <button type="button" title="Remover" onClick={() => mudarPersonagens((l) => l.filter((_, j) => j !== i))} style={botaoIcone("#e8806f")}><i className="fa-solid fa-xmark"></i></button>
            </div>
            {fotoPersonagem(p) ? <img src={fotoPersonagem(p)} alt="" style={{ width: "64px", height: "64px", borderRadius: "8px", objectFit: "cover" }} /> : <i className="fa-solid fa-user" style={{ fontSize: "24pt", color: "#3a4a5e", height: "64px", lineHeight: "64px" }}></i>}
            <span style={{ color: "#f1ead4", fontSize: "8pt", fontWeight: 700, textAlign: "center", lineHeight: 1.25, minHeight: "20px" }}>{p.nome}</span>
            <div style={{ display: "flex" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" title={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => mudarPersonagem(i, { estrelas: n })} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "0 1px", fontSize: "13pt", lineHeight: 1, color: n <= (p.estrelas ?? 0) ? (p.estrelas >= 4 ? "#ff6b5b" : "#f3c75a") : "#2c3a4c" }}>★</button>
              ))}
            </div>
            <input value={p.tag ?? ""} onChange={(e) => mudarPersonagem(i, { tag: e.target.value || null })} placeholder="Tag (ex.: RA)" style={{ ...campo, textAlign: "center" }} />
          </div>
        ))}
        <button type="button" onClick={() => setEscolhendoPersonagem(true)} style={{ minHeight: "150px", background: "transparent", border: "1px dashed rgba(197, 160, 89, 0.4)", borderRadius: "10px", color: "#c5a059", cursor: "pointer", fontWeight: 700, fontSize: "9pt", fontFamily: "'Montserrat'" }}>
          <i className="fa-solid fa-plus" style={{ fontSize: "14pt", display: "block", marginBottom: "6px" }}></i> Adicionar personagem
        </button>
      </div>

      {/* DECKS */}
      <span style={rotulo}><i className="fa-solid fa-layer-group"></i> Decks</span>
      <div style={{ display: "grid", gap: "12px" }}>
        {NIVEIS.map((nivel) => {
          const deck = dados[nivel.chave];
          const posicoes = posicoesDoDeck(deck);
          const observacao = deck?.titulo?.split(" - ").slice(2).join(" - ") ?? "";
          return (
            <div key={nivel.chave} style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.1)", borderLeft: `3px solid ${nivel.cor}`, borderRadius: "10px", padding: "10px 12px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                <span style={{ color: nivel.cor, fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "11pt", minWidth: "90px" }}>{nivel.nome}</span>
                <input value={observacao} onChange={(e) => mudarObservacao(nivel, e.target.value)} placeholder="Observação abaixo do nível (opcional)" style={{ ...campo, flex: "1 1 220px", width: "auto" }} />
                {deck?.cartas?.length > 0 && (
                  <button type="button" onClick={() => mudarDeck(nivel, () => SLOTS.map(() => null))} style={{ background: "transparent", border: "1px solid rgba(232, 128, 111, 0.4)", color: "#e8806f", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "8pt", fontWeight: 700, fontFamily: "'Montserrat'" }}>
                    <i className="fa-solid fa-eraser"></i> Limpar deck
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" }}>
                {posicoes.map((c, i) => {
                  const generica = c && genericaPorId(c.id);
                  const emprestimo = SLOTS[i] === "emprestimo";
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                      <span style={{ color: emprestimo ? "#c5a059" : "#5f758e", fontSize: "7pt", fontWeight: 800, letterSpacing: "0.5px" }}>{emprestimo ? "BORROW" : `SLOT ${SLOTS[i]}`}</span>
                      <button type="button" onClick={() => setEscolhendoCarta({ nivel, slot: i })} title={c ? `${c.nome ?? c.id} — clique para trocar` : "Escolher carta"} className={`cartao-perfil ${c && !generica ? classeRaridade(c.id) : ""}`} style={{ position: "relative", width: "100%", aspectRatio: "3 / 4", padding: 0, borderRadius: "8px", overflow: "hidden", cursor: "pointer", background: "#0d1624", border: c ? `1px solid ${emprestimo ? "rgba(197, 160, 89, 0.6)" : "rgba(164, 179, 198, 0.15)"}` : "1px dashed rgba(164, 179, 198, 0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {!c ? <i className="fa-solid fa-plus" style={{ color: "#5f758e", fontSize: "16pt" }}></i>
                          : generica ? <img src={`/assets/img/textures/${generica.icone}.webp`} alt="" style={{ width: "50px" }} />
                            : <>
                              <img src={urlCarta(c.id)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              <IconeTipoCarta id={c.id} />
                            </>}
                      </button>
                      <div style={{ display: "flex", justifyContent: "center", gap: "3px" }}>
                        {GENERICAS.map((g) => (
                          <button key={g.id} type="button" title={`${g.nome} qualquer`} onClick={() => definirCarta(nivel, i, g.id)} style={{ background: c?.id === g.id ? "rgba(197, 160, 89, 0.2)" : "transparent", border: "none", borderRadius: "4px", padding: "1px", cursor: "pointer" }}>
                            <img src={`/assets/img/textures/${g.icone}.webp`} alt="" style={{ width: "18px", display: "block" }} />
                          </button>
                        ))}
                      </div>
                      {c && (
                        <>
                          <span style={{ color: "#a4b3c6", fontSize: "7.5pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome ?? c.id}</span>
                          <input value={c.nota ?? ""} onChange={(e) => mudarCarta(nivel, i, { nota: e.target.value || null })} placeholder="Nota (ex.: 2 Golds)" style={{ ...campo, color: c.obrigatorio ? "#ff8a7d" : "#f1ead4" }} />
                          <input value={c.alternativa ?? ""} onChange={(e) => mudarCarta(nivel, i, { alternativa: e.target.value || null })} placeholder="Alternativa" style={campo} />
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: "4px", color: c.obrigatorio ? "#ff8a7d" : "#8193a8", fontSize: "7.5pt", fontWeight: 700, cursor: "pointer" }}>
                              <input type="checkbox" checked={!!c.obrigatorio} onChange={(e) => mudarCarta(nivel, i, { obrigatorio: e.target.checked })} /> Obrigatória
                            </label>
                            <button type="button" title="Tirar a carta" onClick={() => mudarDeck(nivel, (p) => { p[i] = null; return p; })} style={botaoIcone("#e8806f")}><i className="fa-solid fa-trash"></i></button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: "8px 0 0", color: "#5f758e", fontSize: "7.5pt" }}>Os ícones de status abaixo de cada slot colocam uma carta genérica (“qualquer Speed”, etc.). Nota de carta obrigatória aparece em vermelho no guia.</p>

      <SeletorPersonagens aberto={escolhendoPersonagem} aoFechar={() => setEscolhendoPersonagem(false)} aoEscolher={adicionarPersonagem} />
      <SeletorCartas
        aberto={!!escolhendoCarta}
        aoFechar={() => setEscolhendoCarta(null)}
        aoEscolher={(id) => { definirCarta(escolhendoCarta.nivel, escolhendoCarta.slot, id); setEscolhendoCarta(null); }}
      />
    </div>
  );
}

export default EditorEstilosGuia;
