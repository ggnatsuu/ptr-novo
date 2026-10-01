// 🎯 src/components/TabelaResultado.jsx
// Tabela detalhada de telemetria de uma corrida (posição, personagem, tempo,
// estilo, largada, last spurt, HP, duelo, downhill, pace, WT). Clicar numa
// linha com dados de treinador abre o painel embaixo dela — quem usa a
// tabela diz o que vai no painel (montarPainel).
// Usada no Resultados (corridas da PTR) e no Replay de Corrida (ferramenta).

import { Fragment, useEffect, useRef, useState } from "react";
import { obterUrlImagemPersonagem } from "../utils/cloudinary";
import { iconeDaRoupa } from "../utils/iconeRoupa";
import { useTelaEstreita } from "../utils/useTelaEstreita";

// Estilo base de toda célula — cada coluna sobrescreve só o que precisa.
const estiloCelulaBase = {
  padding: "18px 16px",
  textAlign: "center",
  verticalAlign: "middle",
  fontSize: "10.5pt",
  fontFamily: "'Montserrat', sans-serif",
};

const CORES_STYLE = { FRONT: "#3498db", PACE: "#2ecc71", LATE: "#f39c12", END: "#e74c3c" };

// No celular, as 3 primeiras colunas (posição, número, personagem) ficam
// fixas enquanto o resto da tabela rola pro lado. Largura e posição de cada uma:
const COLUNAS_FIXAS = [
  { esquerda: 0, largura: 44 },
  { esquerda: 44, largura: 38 },
  { esquerda: 82, largura: 150 },
];
const estiloColunaFixa = (i, fundo) => ({
  position: "sticky",
  left: COLUNAS_FIXAS[i].esquerda,
  zIndex: 1,
  background: fundo,
  width: COLUNAS_FIXAS[i].largura,
  minWidth: COLUNAS_FIXAS[i].largura,
  maxWidth: COLUNAS_FIXAS[i].largura,
  padding: i < 2 ? "14px 4px" : "14px 8px 14px 6px",
  ...(i === 2 ? { boxShadow: "6px 0 8px -6px rgba(0, 0, 0, 0.8)" } : {}),
});

// Campos de telemetria podem vir vazios (null) — ex: colunas que o upload do
// arquivo de corrida não conseguiu calcular. Mostra "-" nesses casos.
function mostrar(valor, sufixo = "") {
  if (valor === null || valor === undefined || valor === "") return "-";
  return `${valor}${sufixo}`;
}

// Faixas de cor do WT: até -0.3 é verde (bom), entre -0.35 e -0.4 é dourado
// (atenção), o resto (pior que -0.4, ou entre -0.3 e -0.35) fica vermelho.
function corWT(valor) {
  if (valor === null || valor === undefined) return "#a4b3c6";
  if (valor >= -0.3) return "#1bd39e";
  if (valor <= -0.35 && valor >= -0.4) return "#c5a059";
  return "#e04b37";
}

const COLUNAS = ["FINISH", "NO.", "CHARACTER", "TIME", "STYLE", "DELAY", "LAST SPURT", "HP RESULT", "DUEL", "DOWNHILL", "PACE", "WT"];

function TabelaResultado({ classificacao, dadosTreinadores, chave, montarPainel }) {
  // Linha com o painel aberto ("chave-numero").
  const [linhaAberta, setLinhaAberta] = useState(null);

  // Celular: o painel fica dentro da tabela (que é larga e rola pro lado);
  // ele "gruda" na parte visível com a largura da caixa.
  const estreito = useTelaEstreita();
  const scrollRef = useRef(null);
  const [larguraVisivel, setLarguraVisivel] = useState(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const observador = new ResizeObserver(([entrada]) => setLarguraVisivel(entrada.contentRect.width));
    observador.observe(el);
    return () => observador.disconnect();
  }, [chave]);

  return (
    <div ref={scrollRef} className="quadro-table-scroll" style={{ width: "100%", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", boxShadow: "0 8px 25px rgba(0,0,0,0.5)", boxSizing: "border-box", overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: "1350px", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {COLUNAS.map((titulo, i) => (
              <th
                key={titulo}
                style={{
                  background: "#0b1320",
                  color: "#c5a059",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  padding: "20px 16px",
                  borderBottom: "2px solid rgba(197, 160, 89, 0.3)",
                  fontSize: "9.5pt",
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  fontFamily: "'Montserrat', sans-serif",
                  ...(estreito && i < 3 ? { ...estiloColunaFixa(i, "#0b1320"), zIndex: 2, textAlign: i === 2 ? "left" : "center" } : {}),
                }}
              >
                {estreito && titulo === "FINISH" ? "#" : titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...(classificacao || [])]
            .sort((a, b) => a.posicao - b.posicao)
            .map((linha) => {
              const corPosicao = linha.posicao === 1 ? "#c5a059" : linha.posicao === 2 ? "#a4b3c6" : linha.posicao === 3 ? "#cd7f32" : "#f1ead4";
              const corStyle = CORES_STYLE[linha.style] || "#a4b3c6";
              // Só corridas enviadas pelo arquivo do jogo têm os dados do painel.
              const dadosTreinador = dadosTreinadores?.find((d) => d.numero === linha.numero);
              const temPainel = Boolean(dadosTreinador && montarPainel);
              const chaveLinha = `${chave}-${linha.numero}`;
              const aberta = temPainel && linhaAberta === chaveLinha;
              const npc = !linha.treinador;
              // Fundo sólido das colunas fixas (no celular), no mesmo tom da linha.
              const fundoFixo = aberta ? "#171c22" : linha.posicao <= 3 ? "#0f1726" : "#0d1624";
              const icone = iconeDaRoupa(dadosTreinador?.cardId) || obterUrlImagemPersonagem(linha.personagem);

              return (
                <Fragment key={linha.numero}>
                  <tr
                    onClick={temPainel ? () => setLinhaAberta(aberta ? null : chaveLinha) : undefined}
                    title={temPainel ? "Clique para ver skills, aptidões e deck" : undefined}
                    style={{ borderBottom: "1px solid rgba(164, 179, 198, 0.1)", background: aberta ? "rgba(197, 160, 89, 0.08)" : linha.posicao <= 3 ? "rgba(197, 160, 89, 0.03)" : "transparent", cursor: temPainel ? "pointer" : "default", opacity: npc ? 0.75 : 1 }}
                  >
                    <td style={{ ...estiloCelulaBase, color: corPosicao, fontWeight: 800, fontSize: estreito ? "12pt" : "14pt", ...(estreito ? estiloColunaFixa(0, fundoFixo) : {}) }}>{linha.posicao}</td>
                    <td style={{ ...estiloCelulaBase, color: "#a4b3c6", fontSize: "10.5pt", ...(estreito ? estiloColunaFixa(1, fundoFixo) : {}) }}>{linha.numero}</td>
                    <td style={{ ...estiloCelulaBase, textAlign: "left", ...(estreito ? estiloColunaFixa(2, fundoFixo) : {}) }}>
                      <div style={{ display: "flex", alignItems: "center", gap: estreito ? "6px" : "10px" }}>
                        {icone && (
                          <img
                            src={icone}
                            alt={linha.personagem}
                            style={{
                              width: estreito ? "28px" : "36px", height: estreito ? "28px" : "36px", borderRadius: "50%", objectFit: "cover", flexShrink: 0,
                              // O ícone da roupa já vem com a moldura dourada do jogo.
                              border: iconeDaRoupa(dadosTreinador?.cardId) ? "none" : "1px solid rgba(197, 160, 89, 0.4)",
                            }}
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, color: "#f1ead4", fontSize: estreito ? "9.5pt" : "11pt", ...(estreito ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : {}) }}>{linha.personagem}</div>
                          <div style={{ fontSize: estreito ? "8pt" : "9pt", color: npc ? "#5f758e" : "#c5a059", ...(estreito ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : {}) }}>[{linha.treinador ?? "NPC"}]</div>
                        </div>
                      </div>
                    </td>
                    <td style={estiloCelulaBase}>
                      <div style={{ color: "#f1ead4", fontWeight: 600, fontSize: "10.5pt" }}>{linha.tempo}</div>
                      {linha.distancia_diff !== null && linha.distancia_diff !== undefined && <div style={{ fontSize: "9pt", color: "#5f758e" }}>+{linha.distancia_diff}m</div>}
                    </td>
                    <td style={estiloCelulaBase}>
                      <span style={{ background: `${corStyle}22`, color: corStyle, border: `1px solid ${corStyle}55`, borderRadius: "50px", padding: "5px 14px", fontSize: "9pt", fontWeight: 700 }}>
                        {linha.style}
                      </span>
                    </td>
                    <td style={estiloCelulaBase}>
                      <div style={{ color: "#f1ead4", fontSize: "10pt" }}>{linha.start_delay_ms}ms</div>
                      <div style={{ fontSize: "9pt", color: linha.start_delay_status === "Late" ? "#e04b37" : "#1bd39e" }}>{linha.start_delay_status}</div>
                    </td>
                    <td style={estiloCelulaBase}>
                      <div style={{ fontSize: "9pt", color: "#a4b3c6" }}>Delay: <span style={{ color: "#f1ead4" }}>{mostrar(linha.last_spurt_delay_m, "m")}</span></div>
                      <div style={{ fontSize: "9pt", color: "#a4b3c6" }}>Speed: <span style={{ color: "#f1ead4" }}>{mostrar(linha.last_spurt_speed)}</span></div>
                    </td>
                    <td style={estiloCelulaBase}>
                      <div style={{ color: linha.hp_status === "Survived" ? "#1bd39e" : "#e04b37", fontWeight: 700, fontSize: "10pt" }}>
                        {linha.hp_status}{linha.hp_status === "Died" && linha.hp_m_diff ? ` (${linha.hp_m_diff}m)` : ""}
                      </div>
                      <div style={{ fontSize: "9pt", color: "#a4b3c6" }}>
                        {linha.hp_val === null || linha.hp_val === undefined ? "-" : `${linha.hp_val} HP (${mostrar(linha.hp_pct, "%")})`}
                      </div>
                    </td>
                    <td style={{ ...estiloCelulaBase, color: "#a4b3c6", fontSize: "10.5pt" }}>{mostrar(linha.duel_s, "s")}</td>
                    <td style={estiloCelulaBase}>
                      <div style={{ color: "#f1ead4", fontSize: "10pt" }}>{mostrar(linha.downhill_s, "s")}</div>
                      <div style={{ fontSize: "8.5pt", color: "#a4b3c6" }}>{linha.downhill_detail}</div>
                    </td>
                    <td style={estiloCelulaBase}>
                      <div style={{ color: "#1bd39e", fontSize: "9.5pt" }}>↑ {mostrar(linha.pace_up_s, "s")}</div>
                      <div style={{ color: "#e04b37", fontSize: "9.5pt" }}>↓ {mostrar(linha.pace_down_s, "s")}</div>
                    </td>
                    <td style={{ ...estiloCelulaBase, color: corWT(linha.wt_s), fontWeight: 700, fontSize: "11pt" }}>{mostrar(linha.wt_s, "m")}</td>
                  </tr>
                  {aberta && (
                    <tr>
                      <td colSpan={COLUNAS.length} style={{ padding: 0 }}>
                        <div style={estreito && larguraVisivel ? { position: "sticky", left: 0, width: larguraVisivel } : undefined}>
                          {montarPainel(linha, dadosTreinador)}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

export default TabelaResultado;
