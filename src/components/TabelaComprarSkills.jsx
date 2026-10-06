// 🎯 src/components/TabelaComprarSkills.jsx
// "Quais skills comprar" (igual à Skill table do Umalator): pra cada skill
// candidata, roda a corredora base e a base + skill com a mesma sorte e mede
// o ganho em comprimentos. Só testa skills que podem ativar nessa pista/estilo,
// divide o trabalho entre vários workers e preenche a tabela aos poucos.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import courseData from "../uma-skill-tools/data/course_data.json";
import { catalogoSkills, catalogoSkillsPorId, caminhoIconeSkill, COR_RARIDADE_SKILL, calcularRegioesSkill, ESTRATEGIA_POR_ESTILO } from "../utils/skillsPista";
import { custoBuild, DESCONTO_DICA } from "../utils/simulador/custoSkills";

const fmtL = (x) => `${x >= 0 ? "" : "−"}${Math.abs(x).toFixed(2)} L`;
const COLUNAS = [
  ["min", "Mín."],
  ["max", "Máx."],
  ["media", "Média"],
  ["mediana", "Mediana"],
  ["custo", "Custo SP"],
  ["cb", "L / 100 SP"],
];

// Skills que fazem sentido testar: do catálogo, que a corredora ainda não tem,
// não negativas (×), com efeito nela mesma e que conseguem ativar nessa pista
// com essa estratégia (mesmo cálculo do diagrama).
function candidatas(corredora, unique, courseId) {
  const dados = courseData[courseId];
  if (!dados) return [];
  const estrategia = ESTRATEGIA_POR_ESTILO[corredora.estrategia] ?? 1;
  const tem = new Set([unique, ...corredora.skills].filter(Boolean));
  return catalogoSkills
    .filter((s) => !tem.has(s.id) && !s.nome.includes("×"))
    .filter((s) => s.alternatives.some((alt) => alt.effects.some((e) => e.target === 1)))
    .filter((s) => {
      const { erro, gatilhos } = calcularRegioesSkill(dados, s.id, estrategia);
      return !erro && gatilhos.length > 0;
    })
    .map((s) => s.id);
}

function TabelaComprarSkills({ corredora, unique, contexto, aoAdicionar, aoFechar }) {
  const [vezes, setVezes] = useState(50);
  const [resultados, setResultados] = useState({});
  const [progresso, setProgresso] = useState(null); // { feito, total }
  const [erro, setErro] = useState(null);
  const [ordem, setOrdem] = useState({ coluna: "media", desc: true });
  const [busca, setBusca] = useState("");
  const [dicas, setDicas] = useState(() => ({ ...(corredora.dicas ?? {}) }));
  const [adicionadas, setAdicionadas] = useState(() => new Set());
  const workers = useRef([]);
  useEffect(() => () => workers.current.forEach((w) => w.terminate()), []);

  const lista = useMemo(() => candidatas(corredora, unique, contexto.courseId), [corredora, unique, contexto.courseId]);

  function rodar() {
    workers.current.forEach((w) => w.terminate());
    setResultados({});
    setErro(null);
    const total = lista.length;
    if (!total) return;
    setProgresso({ feito: 0, total });
    const nWorkers = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1, total));
    const partes = Array.from({ length: nWorkers }, (_, i) => lista.filter((_, j) => j % nWorkers === i));
    let terminados = 0;
    const corredoraMotor = { ...corredora, skills: [...new Set([unique, ...corredora.skills].filter(Boolean))] };
    workers.current = partes.map((parte) => {
      const w = new Worker(new URL("../utils/simulador/comparador.worker.js", import.meta.url), { type: "module" });
      w.onmessage = ({ data }) => {
        if (data.tipo === "skill") {
          setResultados((r) => ({ ...r, [data.id]: data }));
          setProgresso((p) => (p ? { ...p, feito: p.feito + 1 } : p));
        }
        if (data.tipo === "fim" || data.tipo === "erro") {
          if (data.tipo === "erro") setErro(data.mensagem);
          w.terminate();
          terminados += 1;
          if (terminados === partes.length) setProgresso(null);
        }
      };
      w.postMessage({ tipo: "tabelaSkills", courseId: contexto.courseId, condicoes: contexto.condicoes, ajustes: contexto.ajustes, corredora: corredoraMotor, candidatos: parte, vezes, semente: contexto.semente });
      return w;
    });
  }

  function cancelar() {
    workers.current.forEach((w) => w.terminate());
    setProgresso(null);
  }

  // custo de cada skill se fosse comprada agora (com a branca que falta, dica e Fast Learner)
  const custoDe = (id) => custoBuild({ skills: [...corredora.skills, id], dicas, kiremono: !!corredora.kiremono }).itens.find((i) => i.id === id);

  const linhas = Object.values(resultados)
    .map((r) => {
      const s = catalogoSkillsPorId.get(r.id);
      const c = custoDe(r.id);
      const custo = c?.custo ?? 0;
      return { ...r, s, custo, inclui: c?.inclui ?? [], cb: custo > 0 ? (r.media / custo) * 100 : null };
    })
    .filter((l) => l.s && (!busca.trim() || l.s.nome.toLowerCase().includes(busca.trim().toLowerCase())))
    .sort((a, b) => {
      const va = a[ordem.coluna] ?? -Infinity;
      const vb = b[ordem.coluna] ?? -Infinity;
      return ordem.desc ? vb - va : va - vb;
    });

  const mudarDica = (id, passo) => setDicas((d) => ({ ...d, [id]: ((d[id] ?? 0) + passo + 6) % 6 }));

  return createPortal(
    <div className="cmp-modal-fundo" onClick={aoFechar}>
      <div className="cmp-modal cmp-relatorio cmp-comprar" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-modal-topo">
          <div>
            <strong>Quais skills comprar</strong>
            <small>{corredora.nome || "Corredora"} · {corredora.estrategia} · {contexto.percursoTexto} · {lista.length} skills que podem ativar aqui</small>
          </div>
          <button type="button" onClick={aoFechar} title="Fechar"><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="cmp-relatorio-corpo">
          <div className="cmp-relatorio-barra">
            {progresso ? (
              <>
                <div className="cmp-progresso"><div style={{ width: `${((progresso.feito / progresso.total) * 100).toFixed(0)}%` }}></div></div>
                <span className="cmp-progresso-texto">{progresso.feito} / {progresso.total} skills</span>
                <button type="button" className="cmp-btn-discreto" onClick={cancelar}>Cancelar</button>
              </>
            ) : (
              <>
                <div className="cmp-pilulas">
                  {[[50, "50 corridas (rápido)"], [100, "100"], [300, "300 (preciso)"]].map(([v, r]) => (
                    <button key={v} type="button" className={vezes === v ? "ativo" : ""} onClick={() => setVezes(v)}>{r}</button>
                  ))}
                </div>
                <button type="button" className="cmp-btn-principal" onClick={rodar} disabled={!lista.length}>
                  <i className="fa-solid fa-play"></i> {linhas.length ? "Calcular de novo" : "Calcular"}
                </button>
              </>
            )}
            <label className="cmp-busca" style={{ marginLeft: "auto", minWidth: "200px" }}>
              <i className="fa-solid fa-magnifying-glass"></i>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar pelo nome..." />
            </label>
          </div>

          {!linhas.length && !progresso && (
            <p className="cmp-sub" style={{ margin: 0 }}>
              Pra cada skill, o site roda a corredora como está e a corredora com aquela skill a mais, com a mesma sorte, e mede quantos comprimentos ela acrescenta.
              Só entram skills que conseguem ativar nessa pista com a estratégia {corredora.estrategia}. A tabela vai sendo preenchida enquanto calcula.
            </p>
          )}

          {linhas.length > 0 && (
            <div className="cmp-relatorio-tabela">
              <table className="cmp-tabela">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Skill</th>
                    {COLUNAS.map(([k, rot]) => (
                      <th key={k} className="cmp-th-ordenar" onClick={() => setOrdem((o) => ({ coluna: k, desc: o.coluna === k ? !o.desc : true }))}>
                        {rot} {ordem.coluna === k && <i className={`fa-solid fa-caret-${ordem.desc ? "down" : "up"}`}></i>}
                      </th>
                    ))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const dica = dicas[l.id] ?? 0;
                    const ja = adicionadas.has(l.id);
                    return (
                      <tr key={l.id}>
                        <td>
                          <span className="cmp-skill-nome">
                            {l.s.iconId && <img src={caminhoIconeSkill(l.s.iconId)} alt="" />}
                            <span style={{ color: COR_RARIDADE_SKILL[l.s.rarity] ?? "#f1ead4" }}>{l.s.nome}</span>
                          </span>
                          <small className="rel-inclui">ativou {Math.round(l.taxa * 100)}%{l.inclui.length ? ` · inclui ${l.inclui.map((p) => p.nome).join(", ")}` : ""}</small>
                        </td>
                        <td>{fmtL(l.min)}</td>
                        <td>{fmtL(l.max)}</td>
                        <td className="rel-cb">{fmtL(l.media)}</td>
                        <td>{fmtL(l.mediana)}</td>
                        <td>
                          <span className="cmp-custo-dica">
                            <button type="button" onClick={() => mudarDica(l.id, -1)} title="Menos dica">−</button>
                            <span title={dica ? `Dica Lv${dica} (−${Math.round(DESCONTO_DICA[dica] * 100)}%)` : "Sem dica"}>{l.custo}{dica ? <em>Lv{dica}</em> : null}</span>
                            <button type="button" onClick={() => mudarDica(l.id, 1)} title="Mais dica">+</button>
                          </span>
                        </td>
                        <td className="rel-cb">{l.cb == null ? "—" : l.cb.toFixed(2)}</td>
                        <td>
                          <button
                            type="button"
                            className="cmp-btn-discreto"
                            disabled={ja}
                            onClick={() => { aoAdicionar(l.id, dica); setAdicionadas((a) => new Set(a).add(l.id)); }}
                            title="Adicionar na build (com o nível de dica escolhido)"
                          >
                            {ja ? <><i className="fa-solid fa-check"></i> Na build</> : <><i className="fa-solid fa-plus"></i> Adicionar</>}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {linhas.length > 0 && (
            <p className="cmp-sub">
              Ganho = comprimentos que a skill acrescenta à build atual (mín/máx = pior e melhor corrida; mediana = caso típico). Clique no título da coluna pra ordenar.
              O custo já inclui a branca que a dourada exige e o Fast Learner, se marcado. {vezes} corridas por skill.
            </p>
          )}
          {erro && <p className="cmp-aviso"><i className="fa-solid fa-circle-exclamation"></i> {erro}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default TabelaComprarSkills;
