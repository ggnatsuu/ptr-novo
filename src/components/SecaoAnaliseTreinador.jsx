// 🎯 src/components/SecaoAnaliseTreinador.jsx
// Terceira coluna do painel do treinador: Resumo da corrida (cartões),
// Diagnóstico ("por que ganhou / por que perdeu") e Histórico no PTR.
// O que depende do replay (posição ao longo da corrida, velocidade máxima,
// bloqueios, HP no spurt) só aparece pra quem está logado; o resto vem da
// tabela e dos resultados que a página já carregou.
//  - Resultados: recebe o id da corrida (busca o replay com cache).
//  - Prévia do RankAdmin: recebe o objeto do replay direto do arquivo.

import { useEffect, useMemo, useState } from "react";
import { buscarReplay, decodificarReplay, useUsuario } from "../utils/replayCompartilhado";
import { historicoDoTreinador, metricasDaTabela, metricasDoReplay, montarDiagnostico } from "../utils/analiseTreinador";

const estiloTitulo = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: "9pt",
  fontWeight: 800,
  color: "#c5a059",
  textTransform: "uppercase",
  letterSpacing: "1px",
  margin: "0 0 10px 0",
};

const CORES_TOM = { bom: "#1bd39e", ruim: "#e8836f", neutro: "#c5a059" };

const fmt = (n, casas = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

function Cartao({ rotulo, valor, detalhe, children, destaque }) {
  return (
    <div style={{ background: "#0d1624", border: `1px solid ${destaque ? "rgba(197, 160, 89, 0.45)" : "rgba(164, 179, 198, 0.12)"}`, borderRadius: "8px", padding: "10px 12px", minWidth: 0 }}>
      <div style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px" }}>{rotulo}</div>
      <div style={{ color: destaque ? "#c5a059" : "#f1ead4", fontSize: "14pt", fontWeight: 800, lineHeight: 1.25, marginTop: "2px" }}>{valor}</div>
      {detalhe && <div style={{ color: "#8193a8", fontSize: "8.5pt", marginTop: "1px" }}>{detalhe}</div>}
      {children}
    </div>
  );
}

// Mini linha da posição ao longo da corrida (1º no topo).
function LinhaPosicao({ posicoes, total }) {
  const L = 200;
  const A = 34;
  const tMax = posicoes[posicoes.length - 1].t || 1;
  const pontos = posicoes.map((p) => `${((p.t / tMax) * L).toFixed(1)},${(2 + ((p.pos - 1) / Math.max(1, total - 1)) * (A - 4)).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" style={{ width: "100%", height: "34px", display: "block", marginTop: "6px" }}>
      <line x1="0" x2={L} y1="2" y2="2" stroke="rgba(197, 160, 89, 0.25)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <polyline points={pontos} fill="none" stroke="#c5a059" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SecaoAnaliseTreinador({ dados, linha, corrida, todasCorridas, corridaId, replay }) {
  const usuario = useUsuario();
  const chave = corridaId ?? replay;
  const [carga, setCarga] = useState({ chave: null, raceData: null });

  // Métricas do replay: só pra logados (ou com o replay em mãos, no RankAdmin).
  const podeCarregar = Boolean(replay) || (Boolean(usuario) && Boolean(corridaId));
  useEffect(() => {
    if (!podeCarregar) return undefined;
    let cancelado = false;
    (replay ? Promise.resolve(replay) : buscarReplay(corridaId))
      .then((r) => (r ? decodificarReplay(r) : null))
      .then((raceData) => { if (!cancelado) setCarga({ chave, raceData }); })
      .catch((erro) => console.error("Erro ao carregar a análise do treinador:", erro));
    return () => { cancelado = true; };
  }, [chave, corridaId, replay, podeCarregar]);

  const distancia = corrida?.condicoesArquivo?.distancia ?? replay?.condicoes?.distancia ?? null;
  const raceData = carga.chave === chave ? carga.raceData : null;
  const mReplay = useMemo(() => (raceData ? metricasDoReplay(raceData, linha.numero, distancia) : null), [raceData, linha.numero, distancia]);
  const mTabela = metricasDaTabela(linha, dados, corrida?.classificacao ?? []);
  const diagnostico = montarDiagnostico({ linha, dados, distancia, tabela: mTabela, replay: mReplay });
  const historico = todasCorridas ? historicoDoTreinador(todasCorridas, linha.treinador, corridaId) : null;

  const posicaoFinal = mReplay?.posFinal ?? linha.posicao;
  const totalCorrida = mReplay?.total ?? corrida?.classificacao?.length ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "22px", fontFamily: "'Montserrat', sans-serif" }}>
      {/* RESUMO */}
      <div>
        <p style={estiloTitulo}>Resumo da corrida</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px" }}>
          <Cartao
            rotulo="Posição"
            valor={mReplay ? `${mReplay.posInicio}º → ${posicaoFinal}º` : `${posicaoFinal}º`}
            detalhe={totalCorrida ? `de ${totalCorrida}${mReplay ? ` • melhor: ${mReplay.melhorPos}º` : ""}` : null}
            destaque={posicaoFinal === 1}
          >
            {mReplay && <LinhaPosicao posicoes={mReplay.posicoes} total={mReplay.total} />}
          </Cartao>
          <Cartao
            rotulo="Last spurt"
            valor={mTabela.spurtKmh !== null ? `${fmt(mTabela.spurtKmh, 1)} km/h` : "—"}
            detalhe={mTabela.rankSpurt ? `${mTabela.rankSpurt}º mais rápido de ${mTabela.totalSpurt}` : null}
            destaque={mTabela.rankSpurt === 1}
          />
          {mReplay && <Cartao rotulo="Velocidade máxima" valor={`${fmt(mReplay.vMaxKmh, 1)} km/h`} detalhe={`aos ${fmt(mReplay.dVMax)} m`} />}
          <Cartao
            rotulo="Skills"
            valor={mTabela.skillsTotal ? `${mTabela.skillsUsadas}/${mTabela.skillsTotal}` : "—"}
            detalhe={mTabela.skillsTotal ? `${fmt((mTabela.skillsUsadas / mTabela.skillsTotal) * 100)}% ativadas${mTabela.skillsFalhaWit ? ` • ${mTabela.skillsFalhaWit} no Wit` : ""}` : null}
          />
          {mReplay && (
            <Cartao
              rotulo="Bloqueios"
              valor={mReplay.bloqueios.vezes ? `${mReplay.bloqueios.vezes}×` : "Nenhum"}
              detalhe={mReplay.bloqueios.vezes ? `≈${fmt(mReplay.bloqueios.segundos, 1)} s bloqueado` : "pista livre a corrida toda"}
            />
          )}
          {mReplay && mReplay.hpNoSpurtPct !== null && (
            <Cartao rotulo="HP no início do spurt" valor={`${fmt(mReplay.hpNoSpurtPct)}%`} detalhe={`${fmt(mReplay.hpNoSpurt)} HP`} />
          )}
        </div>
        {!mReplay && !replay && usuario === null && (
          <p style={{ color: "#5f758e", fontSize: "8.5pt", fontStyle: "italic", margin: "8px 0 0 0" }}>
            🔒 Entre na Área do Treinador para ver posição ao longo da corrida, velocidade máxima, bloqueios e HP no spurt.
          </p>
        )}
      </div>

      {/* DIAGNÓSTICO */}
      {diagnostico.length > 0 && (
        <div>
          <p style={estiloTitulo}>Diagnóstico</p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {diagnostico.map((item) => (
              <div key={item.texto} style={{ display: "flex", gap: "8px", alignItems: "flex-start", background: "#0d1624", borderLeft: `3px solid ${CORES_TOM[item.tom]}`, borderRadius: "4px", padding: "7px 10px", color: "#d9d2bd", fontSize: "9.5pt", lineHeight: 1.45 }}>
                <span>{item.icone}</span>
                <span>{item.texto}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HISTÓRICO */}
      {historico && historico.corridas > 0 && (
        <div>
          <p style={estiloTitulo}>Histórico no PTR</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px", marginBottom: "10px" }}>
            {[
              ["Corridas", historico.corridas],
              ["Vitórias", historico.vitorias],
              ["Top 3", historico.top3],
              ["Média", historico.media !== null ? `${fmt(historico.media, 1)}º` : "—"],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} style={{ background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "6px", padding: "6px 4px", textAlign: "center" }}>
                <div style={{ color: "#f1ead4", fontSize: "12pt", fontWeight: 800 }}>{valor}</div>
                <div style={{ color: "#8193a8", fontSize: "7.5pt", fontWeight: 700, textTransform: "uppercase" }}>{rotulo}</div>
              </div>
            ))}
          </div>
          {historico.ultimas.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {historico.ultimas.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 2px", borderBottom: "1px solid rgba(164, 179, 198, 0.07)", fontSize: "9pt" }}>
                  <span style={{ width: "34px", textAlign: "center", color: c.posicao === 1 ? "#c5a059" : c.posicao <= 3 ? "#1bd39e" : "#f1ead4", fontWeight: 800, fontSize: "11pt" }}>{c.posicao}º</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#f1ead4", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.pista}{c.grupo ? ` (${c.grupo})` : ""}</div>
                    <div style={{ color: "#8193a8", fontSize: "8pt" }}>Ed. {c.edicao} • {c.personagem}{c.total ? ` • de ${c.total}` : ""}</div>
                  </div>
                  {c.grade && <span style={{ color: c.grade === "G1" ? "#c5a059" : "#8193a8", fontSize: "8pt", fontWeight: 700 }}>{c.grade}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "#5f758e", fontSize: "8.5pt", fontStyle: "italic", margin: 0 }}>Primeira corrida registrada no PTR.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default SecaoAnaliseTreinador;
