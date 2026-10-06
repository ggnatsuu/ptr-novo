// 🎯 src/components/ImportarReplayComparador.jsx
// Comparador: lê um arquivo de corrida (o mesmo do Hakuraku) e abre um modal
// pra escolher 1 ou 2 cavalinhas — com 2, a 1ª vira A e a 2ª vira B; com 1,
// ela vai pra corredora que está aberta (`alvo`). Builds
// completas do arquivo. Opcionalmente leva junto a pista e as condições.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFecharNoEsc } from "../utils/useFecharNoEsc";
import { replayParaSimulacao } from "../utils/simulador/replayParaSimulacao";
import { fotoCorredora } from "../utils/simulador/corredoras";

const COR = { a: "#5fa8e8", b: "#e8806f" };

function ImportarReplayComparador({ aoImportar, alvo = "a" }) {
  const inputRef = useRef(null);
  const [entrada, setEntrada] = useState(null); // { nomeArquivo, courseId, condicoes, corredoras }
  useFecharNoEsc(() => setEntrada(null), !!entrada);
  const [escolha, setEscolha] = useState([]); // [numeroA, numeroB]
  const [levarPista, setLevarPista] = useState(true);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState("");

  async function abrir(file) {
    if (!file) return;
    setErro("");
    setLendo(true);
    try {
      // a leitura do arquivo é pesada: só carrega quando alguém usa
      const { lerArquivoCorrida } = await import("../utils/arquivoCorrida");
      const dados = await lerArquivoCorrida(await file.text(), { incluirNpcs: true });
      const e = replayParaSimulacao(dados);
      if (e.corredoras.length < 2) throw new Error("O arquivo não tem builds suficientes pra comparar.");
      setEntrada({ ...e, nomeArquivo: file.name });
      setEscolha([]);
    } catch (err) {
      setErro(err?.message || "Não foi possível ler esse arquivo.");
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function alternar(numero) {
    setEscolha((atual) => (atual.includes(numero) ? atual.filter((n) => n !== numero) : atual.length >= 2 ? [atual[0], numero] : [...atual, numero]));
  }

  function importar() {
    const escolhidas = escolha.map((n) => entrada.corredoras.find((c) => c.numero === n));
    const [na, nb] = escolhidas.length === 1 ? (alvo === "b" ? [null, escolhidas[0]] : [escolhidas[0], null]) : escolhidas;
    aoImportar({ a: na, b: nb, courseId: levarPista ? entrada.courseId : null, condicoes: levarPista ? entrada.condicoes : null });
    setEntrada(null);
  }

  return (
    <>
      <button type="button" className="cmp-btn-importar" onClick={() => inputRef.current?.click()} disabled={lendo}>
        <i className={`fa-solid ${lendo ? "fa-circle-notch fa-spin" : "fa-file-import"}`}></i> {lendo ? "Lendo arquivo..." : "Importar do replay"}
      </button>
      <input ref={inputRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => abrir(e.target.files?.[0])} />
      {erro && <p className="cmp-aviso" style={{ margin: 0 }}><i className="fa-solid fa-circle-exclamation"></i> {erro}</p>}

      {entrada && createPortal(
        <div className="cmp-modal-fundo">
          <div className="cmp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cmp-modal-topo">
              <div>
                <strong>Escolha 1 ou 2 cavalinhas</strong>
                <small>{entrada.nomeArquivo} · com 2, a 1ª vira <span style={{ color: COR.a }}>A</span> e a 2ª vira <span style={{ color: COR.b }}>B</span>; com 1, ela vai pra <span style={{ color: COR[alvo] }}>{alvo.toUpperCase()}</span> (a que está aberta)</small>
              </div>
              <button type="button" onClick={() => setEntrada(null)} title="Fechar"><i className="fa-solid fa-xmark"></i></button>
            </div>

            <div className="cmp-modal-lista">
              {[...entrada.corredoras].sort((x, y) => (x.posicaoReal ?? 99) - (y.posicaoReal ?? 99)).map((c) => {
                const pos = escolha.indexOf(c.numero);
                const lado = escolha.length === 1 && pos === 0 ? alvo : pos === 0 ? "a" : pos === 1 ? "b" : null;
                const foto = c.outfitId ? fotoCorredora(c.outfitId) : null;
                return (
                  <button key={c.numero} type="button" className={`cmp-modal-item${lado ? " escolhida" : ""}`} style={lado ? { borderColor: COR[lado], background: `${COR[lado]}14` } : undefined} onClick={() => alternar(c.numero)}>
                    <span className="cmp-modal-letra" style={lado ? { background: COR[lado], color: "#0b1320" } : undefined}>{lado ? lado.toUpperCase() : c.posicaoReal ? `${c.posicaoReal}º` : "–"}</span>
                    {foto ? <img src={foto} alt="" /> : <span className="cmp-modal-sem-foto"><i className="fa-solid fa-horse-head"></i></span>}
                    <span className="cmp-modal-texto">
                      <strong>{c.nome}</strong>
                      <small>{c.estrategia} · {c.treinador ?? "NPC"}</small>
                      <small className="mono">{[c.status.speed, c.status.stamina, c.status.power, c.status.guts, c.status.wit].join(" / ")} · {c.skills.length} skills</small>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="cmp-modal-rodape">
              <label>
                <input type="checkbox" checked={levarPista} onChange={(e) => setLevarPista(e.target.checked)} />
                Usar a pista e as condições da corrida ({entrada.condicoes.clima}, {entrada.condicoes.terreno}, {entrada.condicoes.estacao})
              </label>
              <button type="button" className="cmp-btn-principal" onClick={importar} disabled={escolha.length < 1}>
                <i className="fa-solid fa-file-import"></i> {escolha.length === 1 ? `Importar em ${alvo.toUpperCase()}` : escolha.length === 2 ? "Importar A e B" : "Importar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default ImportarReplayComparador;
