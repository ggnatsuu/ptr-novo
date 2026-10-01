// 🎯 src/components/PainelAnotacoesMeta.jsx
// Painel flutuante "Minhas anotações" do Guia do Meta: fica preso no canto
// inferior direito da tela (gaveta embaixo no celular) e acompanha a
// rolagem, para montar o deck olhando as recomendações. Cada deck tem a
// personagem que vai usá-lo e as 6 cartas. Um conjunto de anotações por evento.

import { useState } from "react";
import SeletorCartas from "./SeletorCartas";
import SeletorPersonagens from "./SeletorPersonagens";
import ModalConfirmacao from "./ModalConfirmacao";
import { cartaPorId, urlCarta, roupaPorId, CARTAS_POR_DECK, classeRaridade } from "../utils/anotacoesMeta";
import { portraitDaRoupa } from "../utils/iconeRoupa";
import IconeTipoCarta from "./IconeTipoCarta";
import { useTelaEstreita } from "../utils/useTelaEstreita";

const LARGURA_PAINEL = 720;

function BotaoRemover({ aoClicar }) {
  return (
    <button type="button" onClick={aoClicar} title="Remover" style={{ position: "absolute", top: "-6px", right: "-6px", width: "18px", height: "18px", borderRadius: "50%", border: "1px solid rgba(164, 179, 198, 0.4)", background: "#0d1624", color: "#a4b3c6", fontSize: "7pt", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, zIndex: 1 }}>
      <i className="fa-solid fa-xmark"></i>
    </button>
  );
}

function EspacoCarta({ id, emprestimo, aoClicar, aoRemover }) {
  const carta = id ? cartaPorId.get(id) : null;
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
      <button type="button" onClick={aoClicar} className={carta ? classeRaridade(id) : undefined} title={carta ? `${carta.nome} ${carta.titulo}` : emprestimo ? "Borrow" : "Escolher carta"} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: "100%", aspectRatio: "3 / 4", padding: 0, borderRadius: "6px", overflow: "hidden", cursor: "pointer", background: carta ? "#0b1320" : "rgba(11, 19, 32, 0.6)", border: carta ? `1px solid ${emprestimo ? "#c5a059" : "rgba(164, 179, 198, 0.25)"}` : `1px dashed ${emprestimo ? "rgba(197, 160, 89, 0.6)" : "rgba(164, 179, 198, 0.3)"}` }}>
        {carta ? (
          <>
            <img src={urlCarta(id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <IconeTipoCarta id={id} tamanho={22} topo={3} />
          </>
        ) : (
          <i className={`fa-solid ${emprestimo ? "fa-handshake" : "fa-plus"}`} style={{ color: emprestimo ? "#c5a059" : "#5f758e", fontSize: "11pt" }}></i>
        )}
      </button>
      {carta && <BotaoRemover aoClicar={aoRemover} />}
    </div>
  );
}

function EspacoPersonagem({ id, aoClicar, aoRemover }) {
  const roupa = id ? roupaPorId.get(id) : null;
  return (
    <div style={{ position: "relative", width: "104px", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button type="button" onClick={aoClicar} title={roupa ? `${roupa.nome} [${roupa.epiteto}]` : "Escolher personagem"} style={{ width: "104px", height: "116px", padding: 0, borderRadius: "10px", overflow: "hidden", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: roupa ? "radial-gradient(circle at 50% 40%, rgba(197, 160, 89, 0.2), #0b1320 70%)" : "rgba(11, 19, 32, 0.6)", border: roupa ? "1px solid rgba(197, 160, 89, 0.5)" : "1px dashed rgba(197, 160, 89, 0.45)" }}>
        {roupa ? (
          <img src={portraitDaRoupa(id)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 800, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
            <i className="fa-solid fa-horse-head" style={{ fontSize: "18pt" }}></i> Personagem
          </span>
        )}
      </button>
      {roupa && <BotaoRemover aoClicar={aoRemover} />}
      <span style={{ marginTop: "4px", width: "100%", textAlign: "center", color: roupa ? "#f1ead4" : "transparent", fontSize: "8.5pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {roupa ? roupa.nome : "-"}
      </span>
    </div>
  );
}

function PainelAnotacoesMeta({ evento, anotacao, aoMudar, aberto, aoAbrir, aoFechar, deckAtivo, aoEscolherDeck, aviso, estadoSalvar, aoSalvar }) {
  const estreita = useTelaEstreita();
  const [alvoCarta, setAlvoCarta] = useState(null); // { deck, indice }
  const [alvoPersonagem, setAlvoPersonagem] = useState(null); // índice do deck
  const [confirmarLimpar, setConfirmarLimpar] = useState(false);

  const mudarDeck = (d, alteracao) => {
    aoMudar({ ...anotacao, decks: anotacao.decks.map((deck, i) => (i === d ? { ...deck, ...alteracao(deck) } : deck)) });
  };
  const definirCarta = (d, indice, id) => mudarDeck(d, (deck) => ({ cartas: deck.cartas.map((c, j) => (j === indice ? id : c)) }));
  const definirPersonagem = (d, id) => mudarDeck(d, () => ({ personagem: id }));
  const deckVazio = { personagem: null, cartas: Array(CARTAS_POR_DECK).fill(null) };
  const limparDeck = (d) => mudarDeck(d, () => deckVazio);
  const temAlgo = anotacao.decks.some((deck) => deck.personagem || deck.cartas.some(Boolean));
  const limparTudo = () => {
    aoMudar({ ...anotacao, decks: anotacao.decks.map(() => deckVazio) });
    setConfirmarLimpar(false);
  };
  const estiloLimpar = { display: "inline-flex", alignItems: "center", gap: "5px", background: "transparent", border: "1px solid rgba(224, 75, 55, 0.35)", color: "#e8806f", borderRadius: "6px", padding: "3px 8px", fontSize: "7.5pt", fontWeight: 700, cursor: "pointer", fontFamily: "'Montserrat'" };

  if (!aberto) {
    return (
      <button type="button" onClick={aoAbrir} style={{ position: "fixed", right: "20px", bottom: "20px", zIndex: 900, display: "flex", alignItems: "center", gap: "8px", background: "linear-gradient(135deg, #f3d27a, #c5a059)", color: "#0b1320", border: "none", borderRadius: "50px", padding: "12px 20px", fontSize: "10pt", fontWeight: 800, cursor: "pointer", boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px rgba(197, 160, 89, 0.35)", fontFamily: "'Montserrat'" }}>
        <i className="fa-solid fa-pen-to-square"></i> Minhas anotações
      </button>
    );
  }

  const posicao = estreita
    ? { left: 0, right: 0, bottom: 0, height: "70vh", borderRadius: "14px 14px 0 0" }
    : { right: "16px", bottom: "16px", width: `${LARGURA_PAINEL}px`, maxHeight: "calc(100vh - 110px)", borderRadius: "14px" };

  return (
    <>
      <aside style={{ position: "fixed", zIndex: 900, ...posicao, display: "flex", flexDirection: "column", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.4)", boxShadow: "0 16px 48px rgba(0, 0, 0, 0.6)", fontFamily: "'Montserrat', sans-serif", overflow: "hidden" }}>
        {/* CABEÇALHO */}
        <div onClick={aoFechar} title="Clique para minimizar" className="linha-clicavel" style={{ cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px", borderBottom: "1px solid rgba(164, 179, 198, 0.1)", background: "linear-gradient(135deg, rgba(197, 160, 89, 0.14), transparent)" }}>
          <i className="fa-solid fa-pen-to-square" style={{ color: "#c5a059", fontSize: "13pt" }}></i>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#f1ead4", fontFamily: "'Cinzel', serif", fontWeight: 800, fontSize: "12pt" }}>Minhas anotações</div>
            <div style={{ color: "#8193a8", fontSize: "8.5pt", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {evento.nome}
              {estadoSalvar === "pendente" && <span style={{ color: "#f0a040", fontWeight: 700 }}> · não salvo</span>}
            </div>
          </div>
          <button type="button" aria-label="Minimizar" style={{ marginLeft: "auto", background: "transparent", border: "1px solid rgba(164, 179, 198, 0.2)", borderRadius: "6px", color: "#a4b3c6", width: "32px", height: "32px", cursor: "pointer" }}>
            <i className="fa-solid fa-minus"></i>
          </button>
        </div>

        {/* CONTEÚDO */}
        <div className="rolagem-dourada" style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "grid", gap: "14px", alignContent: "start" }}>
          {anotacao.decks.map((deck, d) => (
            <div key={d} onClick={() => aoEscolherDeck(d)} style={{ background: d === deckAtivo ? "linear-gradient(135deg, rgba(197, 160, 89, 0.1), #0b1320 60%)" : "#0b1320", border: `1px solid ${d === deckAtivo ? "#c5a059" : "rgba(164, 179, 198, 0.1)"}`, boxShadow: d === deckAtivo ? "0 0 14px rgba(197, 160, 89, 0.18)" : "none", borderRadius: "10px", padding: "10px 12px", cursor: d === deckAtivo ? "default" : "pointer", transition: "border-color 0.15s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#c5a059", fontSize: "8.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>Deck {d + 1}</span>
                  {d === deckAtivo ? (
                    <span title="As cartas e personagens clicadas na página entram neste deck" style={{ background: "#c5a059", color: "#0b1320", borderRadius: "4px", padding: "1px 6px", fontSize: "6.5pt", fontWeight: 800, letterSpacing: "0.5px" }}>
                      <i className="fa-solid fa-crosshairs"></i> SELECIONADO
                    </span>
                  ) : (
                    <span style={{ color: "#5f758e", fontSize: "7pt" }}>clique para selecionar</span>
                  )}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ color: "#5f758e", fontSize: "8pt" }}>{deck.cartas.filter(Boolean).length}/{CARTAS_POR_DECK} cartas</span>
                  {(deck.personagem || deck.cartas.some(Boolean)) && (
                    <button type="button" onClick={() => limparDeck(d)} title="Limpar este deck" style={estiloLimpar}>
                      <i className="fa-solid fa-eraser"></i> Limpar
                    </button>
                  )}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <EspacoPersonagem id={deck.personagem} aoClicar={() => setAlvoPersonagem(d)} aoRemover={() => definirPersonagem(d, null)} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "8px" }}>
                  {deck.cartas.map((id, i) => (
                    <EspacoCarta key={i} id={id} emprestimo={i === CARTAS_POR_DECK - 1} aoClicar={() => setAlvoCarta({ deck: d, indice: i })} aoRemover={() => definirCarta(d, i, null)} />
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div>
            <div style={{ color: "#c5a059", fontSize: "8.5pt", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>Memo</div>
            <textarea value={anotacao.memo} onChange={(e) => aoMudar({ ...anotacao, memo: e.target.value })} placeholder="Ideias, skills, status que quer bater..." rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "8px", color: "#f1ead4", fontSize: "9.5pt", padding: "8px 10px", fontFamily: "'Montserrat'", outline: "none" }} />
          </div>
        </div>

        {/* DICA / AVISO */}
        <div style={{ padding: "8px 16px", borderTop: "1px solid rgba(164, 179, 198, 0.1)", fontSize: "8pt", minHeight: "18px", color: aviso ? (aviso.tipo === "aviso" ? "#f0a040" : "#7fd08a") : "#5f758e", background: aviso ? (aviso.tipo === "aviso" ? "rgba(240, 160, 64, 0.08)" : "rgba(79, 199, 106, 0.08)") : "transparent", transition: "background 0.2s" }}>
          {aviso ? (
            <><i className={`fa-solid ${aviso.tipo === "aviso" ? "fa-triangle-exclamation" : "fa-circle-check"}`}></i> {aviso.texto}</>
          ) : (
            <><i className="fa-solid fa-lightbulb"></i> Clique nas cartas e personagens da página para enviar ao deck selecionado.</>
          )}
        </div>

        {/* RODAPÉ */}
        <div style={{ display: "flex", gap: "8px", padding: "10px 16px", borderTop: "1px solid rgba(164, 179, 198, 0.1)" }}>
          <button type="button" onClick={() => setConfirmarLimpar(true)} disabled={!temAlgo} title="Limpar cartas e personagens dos 3 decks" style={{ ...estiloLimpar, padding: "10px 14px", fontSize: "9pt", opacity: temAlgo ? 1 : 0.4, cursor: temAlgo ? "pointer" : "not-allowed" }}>
            <i className="fa-solid fa-rotate-left"></i> Limpar tudo
          </button>
          {(() => {
            const pode = estadoSalvar === "pendente" || estadoSalvar === "erro";
            const textos = {
              "sem-login": ["fa-lock", "Entre na conta para salvar"],
              carregando: ["fa-circle-notch fa-spin", "Carregando..."],
              salvando: ["fa-circle-notch fa-spin", "Salvando..."],
              pendente: ["fa-floppy-disk", "Salvar alterações"],
              erro: ["fa-rotate-right", "Tentar salvar de novo"],
              salvo: ["fa-circle-check", "Tudo salvo"],
            };
            const [icone, texto] = textos[estadoSalvar] ?? textos.salvo;
            return (
              <button type="button" onClick={pode ? aoSalvar : undefined} disabled={!pode} style={{ flex: 1, background: pode ? "linear-gradient(135deg, #f3d27a, #c5a059)" : estadoSalvar === "salvo" ? "rgba(79, 199, 106, 0.1)" : "rgba(197, 160, 89, 0.1)", border: `1px solid ${pode ? "transparent" : estadoSalvar === "salvo" ? "rgba(79, 199, 106, 0.35)" : "rgba(197, 160, 89, 0.3)"}`, color: pode ? "#0b1320" : estadoSalvar === "salvo" ? "#7fd08a" : "#8193a8", borderRadius: "8px", padding: "10px", fontSize: "10pt", fontWeight: 800, cursor: pode ? "pointer" : "default", fontFamily: "'Montserrat'", boxShadow: pode ? "0 4px 14px rgba(197, 160, 89, 0.3)" : "none" }}>
                <i className={`fa-solid ${icone}`}></i> {texto}
              </button>
            );
          })()}
        </div>
      </aside>

      <SeletorCartas
        aberto={!!alvoCarta}
        aoFechar={() => setAlvoCarta(null)}
        aoEscolher={(id) => { definirCarta(alvoCarta.deck, alvoCarta.indice, id); setAlvoCarta(null); }}
      />
      <ModalConfirmacao
        aberto={confirmarLimpar}
        perigo
        icone="fa-rotate-left"
        titulo="Limpar todos os decks?"
        mensagem={`As cartas e personagens dos ${anotacao.decks.length} decks de ${evento.nome} serão removidas.`}
        detalhe="O memo continua como está."
        textoConfirmar="Limpar tudo"
        aoConfirmar={limparTudo}
        aoCancelar={() => setConfirmarLimpar(false)}
      />
      <SeletorPersonagens
        aberto={alvoPersonagem !== null}
        aoFechar={() => setAlvoPersonagem(null)}
        aoEscolher={(id) => { definirPersonagem(alvoPersonagem, id); setAlvoPersonagem(null); }}
      />
    </>
  );
}

export default PainelAnotacoesMeta;
