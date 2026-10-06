// 🎯 src/components/ChanceVitoria.jsx
// "Chance de vitória": pega as builds do arquivo de corrida (as mesmas do
// replay) e simula a corrida inteira X vezes no motor honse-sim, num Web
// Worker. Mostra quantas vezes cada uma ganhou, ficou no top 3 e a posição
// média, e compara com o que aconteceu de verdade.

import { useEffect, useMemo, useRef, useState } from "react";
import { replayParaSimulacao } from "../utils/simulador/replayParaSimulacao";
import { fotoCorredora } from "../utils/simulador/corredoras";
import "../styles/chanceVitoria.css";

const pct = (x) => `${(x * 100).toFixed(1)}%`;

function ChanceVitoria({ dados }) {
  const entrada = useMemo(() => replayParaSimulacao(dados), [dados]);
  const [vezes, setVezes] = useState(500);
  const [progresso, setProgresso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);

  // O motor simula de 2 a 12 corredoras (o campo do LoH). Dá pra escolher
  // quais do replay entram; com mais de 12 no arquivo, começa com as 12
  // primeiras colocadas.
  const MAXIMO = 12;
  const [selecionadas, setSelecionadas] = useState(() => new Set(
    [...entrada.corredoras].sort((x, y) => (x.posicaoReal ?? 99) - (y.posicaoReal ?? 99)).slice(0, MAXIMO).map((c) => c.numero)
  ));
  const escolhidas = entrada.corredoras.filter((c) => selecionadas.has(c.numero));
  const demais = escolhidas.length > MAXIMO;
  const podeRodar = entrada.courseId && escolhidas.length >= 2 && !demais;
  function alternar(numero) {
    setSelecionadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(numero)) novo.delete(numero); else novo.add(numero);
      return novo;
    });
  }

  function rodar() {
    worker.current?.terminate();
    const w = new Worker(new URL("../utils/simulador/comparador.worker.js", import.meta.url), { type: "module" });
    worker.current = w;
    setErro(null);
    setProgresso(0);
    w.onmessage = ({ data }) => {
      if (data.tipo === "progresso") setProgresso(data.feito / data.total);
      if (data.tipo === "fim") { setResultado({ ...data.resultado, usadas: escolhidas }); setProgresso(null); w.terminate(); }
      if (data.tipo === "erro") { setErro(data.mensagem); setProgresso(null); w.terminate(); }
    };
    w.onerror = (e) => { setErro(e.message || "Falha ao carregar o simulador."); setProgresso(null); };
    w.postMessage({ tipo: "corrida", ...entrada, corredoras: escolhidas, vezes, semente: Math.floor(Math.random() * 2 ** 30) });
  }

  const linhas = resultado
    ? resultado.usadas.map((c, i) => ({ ...c, ...resultado.corredoras[i] })).sort((x, y) => y.chance - x.chance || x.posicaoMedia - y.posicaoMedia)
    : [];
  const vencedoraReal = linhas.find((l) => l.posicaoReal === 1);
  const favorita = linhas[0];
  const ignoradas = Object.entries(resultado?.skillsIgnoradas ?? {});
  const n = resultado?.usadas.length ?? escolhidas.length;

  return (
    <div className="cv-cartao">
      <div className="cv-topo">
        <div>
          <div className="cv-titulo"><i className="fa-solid fa-dice"></i> Chance de vitória</div>
          <p className="cv-sub">Simula esta mesma corrida várias vezes com as builds do arquivo, cada vez com uma sorte diferente, e conta quem ganha.</p>
        </div>
        <div className="cv-acoes">
          {progresso !== null ? (
            <>
              <div className="cv-progresso"><div style={{ width: `${(progresso * 100).toFixed(0)}%` }}></div></div>
              <span className="cv-progresso-texto">{Math.round(progresso * vezes)} / {vezes}</span>
              <button type="button" className="cv-btn-discreto" onClick={() => { worker.current?.terminate(); setProgresso(null); }}>Cancelar</button>
            </>
          ) : (
            <>
              <div className="cv-pilulas">
                {[100, 500, 1000].map((v) => (
                  <button key={v} type="button" className={vezes === v ? "ativo" : ""} onClick={() => setVezes(v)}>{v}</button>
                ))}
              </div>
              <button type="button" className="cv-btn" onClick={rodar} disabled={!podeRodar}>
                <i className="fa-solid fa-play"></i> Simular {vezes} corridas
              </button>
            </>
          )}
        </div>
      </div>

      <div className="cv-selecao">
        <div className="cv-selecao-topo">
          <span>Quem entra na simulação <strong className={demais ? "erro" : ""}>{escolhidas.length} / {Math.min(MAXIMO, entrada.corredoras.length)}</strong></span>
          <button type="button" onClick={() => setSelecionadas(new Set([...entrada.corredoras].sort((x, y) => (x.posicaoReal ?? 99) - (y.posicaoReal ?? 99)).slice(0, MAXIMO).map((c) => c.numero)))}>Todas{entrada.corredoras.length > MAXIMO ? ` (top ${MAXIMO})` : ""}</button>
          <button type="button" onClick={() => setSelecionadas(new Set())}>Nenhuma</button>
        </div>
        <div className="cv-selecao-lista">
          {[...entrada.corredoras].sort((x, y) => x.numero - y.numero).map((c) => {
            const foto = c.outfitId ? fotoCorredora(c.outfitId) : null;
            const marcada = selecionadas.has(c.numero);
            return (
              <button key={c.numero} type="button" className={`cv-escolha${marcada ? " marcada" : ""}`} onClick={() => alternar(c.numero)} title={`${c.nome} · ${c.estrategia}${c.posicaoReal ? ` · chegou em ${c.posicaoReal}º` : ""}`}>
                <i className={`fa-solid ${marcada ? "fa-square-check" : "fa-square"}`}></i>
                {foto ? <img src={foto} alt="" /> : <span className="cv-sem-foto"><i className="fa-solid fa-horse-head"></i></span>}
                <span className="cv-escolha-texto"><strong>{c.nome}</strong><small>#{c.numero} · {c.estrategia}{c.posicaoReal ? ` · ${c.posicaoReal}º` : ""}</small></span>
              </button>
            );
          })}
        </div>
      </div>

      {demais && <p className="cv-aviso"><i className="fa-solid fa-triangle-exclamation"></i> {escolhidas.length} selecionadas: o simulador vai até {MAXIMO} (o campo do LoH). Desmarque algumas pra simular.</p>}
      {!entrada.courseId && <p className="cv-aviso">Esse arquivo não tem a pista, então não dá pra simular.</p>}
      {entrada.courseId && escolhidas.length < 2 && <p className="cv-aviso">Escolha pelo menos 2 cavalinhas.</p>}
      {erro && <p className="cv-aviso"><i className="fa-solid fa-circle-exclamation"></i> {erro}</p>}

      {resultado && (
        <>
          <div className="cv-destaques">
            {favorita && (
              <div>
                <span>Favorita da simulação</span>
                <strong>{favorita.nome}</strong>
                <em>{pct(favorita.chance)} de vitória</em>
              </div>
            )}
            {vencedoraReal && (
              <div className={vencedoraReal === favorita ? "" : "surpresa"}>
                <span>Venceu de verdade</span>
                <strong>{vencedoraReal.nome}</strong>
                <em>tinha {pct(vencedoraReal.chance)} de chance{vencedoraReal === favorita ? " · era a favorita" : vencedoraReal.chance < 0.1 ? " · zebra!" : ""}</em>
              </div>
            )}
          </div>

          <div className="cv-tabela-rolagem">
            <table className="cv-tabela">
              <thead>
                <tr>
                  <th>Corredora</th>
                  <th>Vitória</th>
                  <th>Top 3</th>
                  <th>Posição média</th>
                  <th>Posições (1º → {n}º)</th>
                  <th>Real</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const foto = l.outfitId ? fotoCorredora(l.outfitId) : null;
                  const maior = Math.max(...l.posicoes, 0.0001);
                  return (
                    <tr key={l.numero} className={l.posicaoReal === 1 ? "vencedora" : ""}>
                      <td>
                        <div className="cv-corredora">
                          {foto ? <img src={foto} alt="" /> : <span className="cv-sem-foto"><i className="fa-solid fa-horse-head"></i></span>}
                          <div>
                            <strong>{l.nome}</strong>
                            <small>#{l.numero} · {l.estrategia}{l.treinador ? ` · ${l.treinador}` : " · NPC"}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="cv-barra"><div style={{ width: `${(l.chance * 100).toFixed(1)}%` }}></div><span>{pct(l.chance)}</span></div>
                      </td>
                      <td>{pct(l.top3)}</td>
                      <td>{l.posicaoMedia.toFixed(2)}</td>
                      <td>
                        <div className="cv-distribuicao" title={l.posicoes.map((p, i) => `${i + 1}º: ${pct(p)}`).join("\n")}>
                          {l.posicoes.map((p, i) => <i key={i} style={{ height: `${Math.max(2, (p / maior) * 100)}%`, opacity: p ? 1 : 0.25 }} className={i === (l.posicaoReal ?? 0) - 1 ? "real" : ""}></i>)}
                        </div>
                      </td>
                      <td className="cv-real">{l.posicaoReal ? `${l.posicaoReal}º` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ignoradas.length > 0 && (
            <p className="cv-aviso"><i className="fa-solid fa-triangle-exclamation"></i> Skills sem dados, ignoradas: {ignoradas.map(([nome, ids]) => `${nome} (${ids.join(", ")})`).join(" · ")}</p>
          )}
          <p className="cv-rodape">
            {resultado.vezes} corridas simuladas · semente {resultado.semente}. Na coluna de posições, a barra dourada é a posição em que ela chegou de verdade.
            Simulação com o <a href="https://github.com/jalbarrang/torena-sim" target="_blank" rel="noreferrer">honse-sim</a> (GPL-3.0): estimativa, o nível da unique não entra no cálculo.
          </p>
        </>
      )}
    </div>
  );
}

export default ChanceVitoria;
