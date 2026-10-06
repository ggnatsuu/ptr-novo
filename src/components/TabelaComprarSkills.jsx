// 🎯 src/components/TabelaComprarSkills.jsx
// "Quais skills comprar" (igual à Skill table do Umalator): pra cada skill
// candidata, roda a corredora base e a base + skill com a mesma sorte e mede
// o ganho em comprimentos. Só testa skills que podem ativar nessa pista/estilo,
// divide o trabalho entre vários workers e preenche a tabela aos poucos.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFecharNoEsc } from "../utils/useFecharNoEsc";
import courseData from "../uma-skill-tools/data/course_data.json";
import { catalogoSkills, catalogoSkillsPorId, caminhoIconeSkill, COR_RARIDADE_SKILL, calcularRegioesSkill, ESTRATEGIA_POR_ESTILO } from "../utils/skillsPista";
import { custoBuild, custoUnitario, DESCONTO_DICA, grupoDaSkill, planejarSkills } from "../utils/simulador/custoSkills";

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

function TabelaComprarSkills({ corredora, unique, contexto, aoAdicionar, aoAdicionarVarios, aoFechar }) {
  const [vezes, setVezes] = useState(50);
  const [resultados, setResultados] = useState({});
  const [progresso, setProgresso] = useState(null); // { feito, total }
  const [erro, setErro] = useState(null);
  const [ordem, setOrdem] = useState({ coluna: "media", desc: true });
  const [busca, setBusca] = useState("");
  const [dicas, setDicas] = useState(() => ({ ...(corredora.dicas ?? {}) }));
  const [adicionadas, setAdicionadas] = useState(() => new Set());
  const [orcamento, setOrcamento] = useState("");
  const [plano, setPlano] = useState(null); // { escolhidas: [id], custo, ganho }
  // Prints da loja (OCR): { itens: [{ id, custo, dica, ok, comprada }] }
  const [loja, setLoja] = useState(null);
  const [lendoLoja, setLendoLoja] = useState(null); // { etapa, atual, total }
  const [caminho, setCaminho] = useState(null); // null (escolher) | "todas"
  const [lojaAberta, setLojaAberta] = useState(true);
  const entradaPrints = useRef(null);
  const workers = useRef([]);
  useFecharNoEsc(aoFechar);
  useEffect(() => () => workers.current.forEach((w) => w.terminate()), []);

  const todasCandidatas = useMemo(() => candidatas(corredora, unique, contexto.courseId), [corredora, unique, contexto.courseId]);
  const ativaAqui = useMemo(() => new Set(todasCandidatas), [todasCandidatas]);
  const daLoja = useMemo(() => new Map((loja?.itens ?? []).filter((i) => !i.comprada).map((i) => [i.id, i])), [loja]);
  // com a loja: calcula só as dela, ou (opção) todas, com as de fora só de referência
  const [comOutras, setComOutras] = useState(false);
  const lista = loja && !comOutras ? todasCandidatas.filter((id) => daLoja.has(id)) : todasCandidatas;
  const compravel = (id) => !loja || daLoja.has(id);

  async function lerPrints(arquivos) {
    const imagens = [...arquivos].filter((a) => a.type.startsWith("image/"));
    if (!imagens.length) return;
    setErro(null);
    setLendoLoja({ etapa: "carregando" });
    try {
      const { lerPrintsLoja } = await import("../utils/simulador/lerLoja");
      const r = await lerPrintsLoja(imagens, setLendoLoja);
      // junta com o que já foi lido (dá pra mandar os prints aos poucos)
      setLoja((atual) => {
        const porId = new Map((atual?.itens ?? []).map((i) => [i.id, i]));
        r.itens.forEach((i) => { if (!porId.get(i.id)?.ok || i.ok) porId.set(i.id, { ...i, comprada: porId.get(i.id)?.comprada ?? false }); });
        return { itens: [...porId.values()] };
      });
      setDicas((d) => ({ ...d, ...Object.fromEntries(r.itens.map((i) => [i.id, i.dica])) }));
      if (r.skillPoints != null) setOrcamento(String(r.skillPoints));
      setLojaAberta(true);
      if (!r.itens.length) setErro("Não reconheci nenhuma skill nesses prints. Mande o print da tela Learn (lista de skills), sem cortar o nome.");
    } catch (e) {
      console.error(e);
      setErro("Não consegui ler os prints.");
    } finally {
      setLendoLoja(null);
    }
  }
  const mudarItemLoja = (id, campos) => setLoja((l) => ({ itens: l.itens.map((i) => (i.id === id ? { ...i, ...campos } : i)) }));
  // caixa de dúvida: troca a skill de uma linha (e junta se ela já estava na lista)
  function escolherSkillLoja(idAntigo, idNovo) {
    if (idAntigo === idNovo) return;
    setLoja((l) => ({
      itens: l.itens
        .filter((x) => x.id !== idNovo)
        .map((x) => (x.id === idAntigo ? { ...x, id: idNovo, ok: custoUnitario(idNovo, x.dica ?? 0, !!corredora.kiremono) === x.custo } : x)),
    }));
    setDicas((d) => ({ ...d, [idNovo]: d[idAntigo] ?? 0 }));
  }
  const tirarItemLoja = (id) => setLoja((l) => ({ itens: l.itens.filter((i) => i.id !== id) }));

  function rodar() {
    workers.current.forEach((w) => w.terminate());
    setResultados({});
    setErro(null);
    const total = lista.length;
    if (!total) return;
    setProgresso({ feito: 0, total });
    setLojaAberta(false); // a tabela precisa do espaço; a loja fica num resumo
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

  // custo de cada skill se fosse comprada agora (com a branca que falta, dica e
  // Fast Learner); se veio da loja, vale o custo que o jogo mostrou
  const custoDe = (id) => {
    const c = custoBuild({ skills: [...corredora.skills, id], dicas, kiremono: !!corredora.kiremono }).itens.find((i) => i.id === id);
    const doJogo = daLoja.get(id)?.custo;
    return doJogo ? { ...c, custo: doJogo, daLoja: true } : c;
  };

  const linhas = Object.values(resultados)
    .map((r) => {
      const s = catalogoSkillsPorId.get(r.id);
      const c = custoDe(r.id);
      const custo = c?.custo ?? 0;
      return { ...r, s, custo, daLoja: !!c?.daLoja, inclui: c?.inclui ?? [], cb: custo > 0 ? (r.media / custo) * 100 : null };
    })
    .filter((l) => l.s && lista.includes(l.id) && (!busca.trim() || l.s.nome.toLowerCase().includes(busca.trim().toLowerCase())))
    .sort((a, b) => {
      const va = a[ordem.coluna] ?? -Infinity;
      const vb = b[ordem.coluna] ?? -Infinity;
      return ordem.desc ? vb - va : va - vb;
    });

  // Planejador: cada skill calculada vira uma opção (custo com a branca que falta
  // e ganho somando o da branca incluída, se ela também foi calculada).
  function planejar() {
    const opcoes = Object.values(resultados).filter((r) => lista.includes(r.id) && compravel(r.id)).map((r) => {
      const c = custoDe(r.id);
      const ganhoInclui = (c?.inclui ?? []).reduce((soma, p) => soma + (resultados[p.id]?.media ?? 0), 0);
      return { id: r.id, grupo: grupoDaSkill(r.id), custo: c?.custo ?? 0, ganho: r.media + ganhoInclui };
    });
    setPlano({ ...planejarSkills(opcoes, Number(orcamento) || 0), orcamento: Number(orcamento) || 0 });
  }
  const noPlano = new Set(plano?.escolhidas ?? []);

  const mudarDica = (id, passo) => setDicas((d) => ({ ...d, [id]: ((d[id] ?? 0) + passo + 6) % 6 }));

  const etapa = plano ? 3 : linhas.length ? 2 : (loja || caminho === "todas") ? 1 : 0;
  const ETAPAS = [
    [caminho === "todas" ? "Todas as skills" : "Loja do jogo", "fa-store"],
    ["Calcular", "fa-play"],
    ["Montar a compra", "fa-cart-shopping"],
  ];
  const precisao = (
    <label className="rel-precisao" title="Quantas corridas por skill: mais corridas = resultado mais firme, porém mais demorado">
      Precisão
      <select value={vezes} onChange={(e) => setVezes(Number(e.target.value))}>
        <option value={50}>Rápida (50)</option>
        <option value={100}>Média (100)</option>
        <option value={300}>Alta (300)</option>
      </select>
    </label>
  );
  const botaoPrints = (texto, classe = "cmp-btn-discreto") => (
    <button type="button" className={classe} onClick={() => entradaPrints.current?.click()} disabled={!!lendoLoja}>
      <i className="fa-solid fa-camera"></i> {texto}
    </button>
  );

  return createPortal(
    <div className="cmp-modal-fundo">
      <div
        className="cmp-modal cmp-relatorio cmp-comprar"
        onClick={(e) => e.stopPropagation()}
        onPaste={(e) => { if (e.clipboardData.files.length && !lendoLoja) lerPrints(e.clipboardData.files); }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); if (!lendoLoja) lerPrints(e.dataTransfer.files); }}
      >
        <div className="cmp-modal-topo">
          <div>
            <strong>
              Quais skills comprar{" "}
              <i
                className="fa-regular fa-circle-question rel-ajuda"
                title={`Pra cada skill, o site roda a corredora como está e a corredora com aquela skill a mais, com a mesma sorte, e mede quantos comprimentos ela acrescenta. Só entram skills que conseguem ativar nessa pista com a estratégia ${corredora.estrategia}.`}
              ></i>
            </strong>
            <small>{corredora.nome || "Corredora"} · {corredora.estrategia} · {contexto.percursoTexto}</small>
          </div>
          <button type="button" onClick={aoFechar} title="Fechar"><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="cmp-relatorio-corpo">
          <input ref={entradaPrints} type="file" accept="image/*" multiple hidden onChange={(e) => { lerPrints(e.target.files); e.target.value = ""; }} />

          {/* etapas */}
          <ol className="rel-etapas">
            {ETAPAS.map(([rotulo, icone], i) => (
              <li key={rotulo} className={etapa > i ? "feita" : etapa === i ? "atual" : ""}>
                <span className="rel-etapa-num">{etapa > i ? <i className="fa-solid fa-check"></i> : i + 1}</span>
                <i className={`fa-solid ${icone}`}></i> {rotulo}
              </li>
            ))}
          </ol>

          {/* lendo prints */}
          {lendoLoja && (
            <div className="rel-cartao-status">
              <i className="fa-solid fa-spinner fa-spin"></i>
              {lendoLoja.etapa === "lendo" ? `Lendo print ${lendoLoja.atual} de ${lendoLoja.total}...` : "Preparando o leitor (só demora na primeira vez)..."}
            </div>
          )}

          {/* etapa 1: escolher o caminho */}
          {!lendoLoja && !loja && caminho !== "todas" && !linhas.length && !progresso && (
            <div className="rel-caminhos">
              <div className="rel-caminho destaque">
                <i className="fa-solid fa-camera rel-caminho-icone"></i>
                <strong>Tenho a loja do jogo</strong>
                <p>Mande os prints da tela <b>Learn</b> da carreira. O site lê as skills, o custo e a dica, e calcula só o que você pode comprar, com o custo real.</p>
                {botaoPrints("Escolher prints", "cmp-btn-principal")}
                <small>ou cole (Ctrl+V) / arraste as imagens aqui</small>
              </div>
              <div className="rel-caminho">
                <i className="fa-solid fa-magnifying-glass rel-caminho-icone"></i>
                <strong>Testar todas as skills</strong>
                <p>As {todasCandidatas.length} skills que conseguem ativar nessa pista, com o custo estimado (dica dá pra ajustar depois). Mais lento.</p>
                <button type="button" className="cmp-btn-discreto" onClick={() => setCaminho("todas")}>
                  <i className="fa-solid fa-arrow-right"></i> Seguir sem a loja
                </button>
              </div>
            </div>
          )}

          {/* etapa 1: conferir a loja */}
          {!lendoLoja && loja && (
            <div className={`rel-loja${lojaAberta ? "" : " fechada"}`}>
              <div className="rel-planejador-linha">
                <span className="rel-planejador-titulo">
                  <i className="fa-solid fa-store"></i> {lojaAberta ? `Confira o que foi lido (${loja.itens.length} skills)` : `Loja: ${loja.itens.length} skills`}
                </span>
                {!lojaAberta && (
                  <span className="rel-loja-mini">
                    {loja.itens.filter((i) => !i.comprada).map((i) => {
                      const sk = catalogoSkillsPorId.get(i.id);
                      return sk?.iconId ? <img key={i.id} src={caminhoIconeSkill(sk.iconId)} alt="" title={sk.nome} /> : null;
                    })}
                  </span>
                )}
                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
                  <button type="button" className="cmp-btn-discreto" onClick={() => setLojaAberta((v) => !v)}>
                    <i className={`fa-solid ${lojaAberta ? "fa-chevron-up" : "fa-pen"}`}></i> {lojaAberta ? "Recolher" : "Editar"}
                  </button>
                  {lojaAberta && botaoPrints("Mais prints")}
                  <button type="button" className="cmp-btn-discreto" onClick={() => { setLoja(null); setCaminho(null); }}>
                    <i className="fa-solid fa-rotate-left"></i> Recomeçar
                  </button>
                </span>
              </div>
              {lojaAberta && <>
              {/* dúvidas: o site mostra o recorte do print e a pessoa escolhe a skill */}
              {loja.itens.some((i) => i.duvida) && (
                <div className="rel-duvidas">
                  <span className="rel-duvidas-titulo">
                    <i className="fa-solid fa-circle-question"></i> Fiquei em dúvida em {loja.itens.filter((i) => i.duvida).length === 1 ? "1 skill" : `${loja.itens.filter((i) => i.duvida).length} skills`}: qual é?
                  </span>
                  {loja.itens.filter((i) => i.duvida).map((i) => (
                    <div key={i.id} className="rel-duvida">
                      {i.recorte
                        ? <img className="rel-duvida-print" src={i.recorte} alt="Trecho do print" />
                        : <div className="rel-duvida-print vazio">Lido: “{i.lido}”</div>}
                      <div className="rel-duvida-opcoes">
                        {(i.alternativas?.length ? i.alternativas : [i.id]).map((alt) => {
                          const sk = catalogoSkillsPorId.get(alt);
                          const esperado = custoUnitario(alt, i.dica ?? 0, !!corredora.kiremono);
                          return (
                            <button key={alt} type="button" className={`rel-duvida-opcao${alt === i.id ? " ativa" : ""}`} onClick={() => escolherSkillLoja(i.id, alt)}>
                              {sk?.iconId && <img src={caminhoIconeSkill(sk.iconId)} alt="" />}
                              <span style={{ color: COR_RARIDADE_SKILL[sk?.rarity] ?? "#f1ead4" }}>{sk?.nome ?? alt}</span>
                              <small className={esperado === i.custo ? "bate" : ""}>{esperado} SP</small>
                            </button>
                          );
                        })}
                        <div className="rel-duvida-acoes">
                          <button type="button" className="cmp-btn-principal" onClick={() => mudarItemLoja(i.id, { duvida: false })}>
                            <i className="fa-solid fa-check"></i> É essa
                          </button>
                          <button type="button" className="cmp-btn-discreto" onClick={() => tirarItemLoja(i.id)}>
                            Nenhuma, apagar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="rel-loja-lista">
                {loja.itens.filter((i) => !i.duvida).map((i) => {
                  const sk = catalogoSkillsPorId.get(i.id);
                  // por que a skill da loja ficou fora do cálculo
                  const fora = i.comprada || ativaAqui.has(i.id) ? null
                    : [unique, ...corredora.skills].includes(i.id) ? ["já na build", "Essa skill já está na build da corredora"]
                    : !sk?.alternatives.some((alt) => alt.effects.some((e) => e.target === 1)) ? ["afeta as outras", "Efeito só nas adversárias: o simulador não mede o ganho"]
                    : ["não ativa aqui", "A condição dela nunca acontece nessa pista com essa estratégia (veja no diagrama)"];
                  return (
                    <div key={i.id} className={`rel-loja-item${i.comprada ? " comprada" : ""}${fora ? " fora" : ""}`}>
                      {sk?.iconId && <img className="rel-loja-icone" src={caminhoIconeSkill(sk.iconId)} alt="" />}
                      <div className="rel-loja-info">
                        <span className="rel-loja-nome" style={{ color: COR_RARIDADE_SKILL[sk?.rarity] ?? "#f1ead4" }} title={`Lido: "${i.lido}"`}>{sk?.nome ?? i.id}</span>
                        <div className="rel-loja-linha">
                          <span className={`rel-loja-custo${!i.ok && !i.comprada ? " aviso" : ""}`} title={i.ok ? "O custo bate com a skill" : "Não consegui conferir o custo: confira e corrija se precisar"}>
                            <input
                              value={i.custo ?? ""}
                              onChange={(e) => mudarItemLoja(i.id, { custo: Number(e.target.value.replace(/\D/g, "")) || null, ok: true })}
                              inputMode="numeric"
                              placeholder="?"
                              disabled={i.comprada}
                            />
                            SP
                          </span>
                          {i.dica > 0 && <span className="rel-loja-chip dica">Dica Lv{i.dica}</span>}
                          {!i.comprada && fora && <span className="rel-loja-chip" title={fora[1]}>{fora[0]}</span>}
                          {!i.comprada && !fora && !i.ok && <span className="rel-loja-chip aviso" title="Confira o custo"><i className="fa-solid fa-triangle-exclamation"></i> conferir</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`rel-loja-comprada${i.comprada ? " ativa" : ""}`}
                        onClick={() => mudarItemLoja(i.id, { comprada: !i.comprada })}
                        title="Já comprei essa skill: sai da conta"
                      >
                        <i className={`fa-solid ${i.comprada ? "fa-check" : "fa-bag-shopping"}`}></i> {i.comprada ? "Comprada" : "Já comprei"}
                      </button>
                      <button type="button" className="rel-loja-tirar" onClick={() => tirarItemLoja(i.id)} title="Tirar da lista (leitura errada)">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="cmp-sub" style={{ margin: 0 }}>
                Dá pra corrigir um custo, marcar o que já comprou ou apagar uma leitura errada. Faltou skill? Mande mais prints.
                {loja.itens.some((i) => i.comprada && !corredora.skills.includes(i.id)) && (
                  <>
                    {" "}
                    <button
                      type="button"
                      className="cmp-btn-discreto"
                      onClick={() => aoAdicionarVarios(loja.itens.filter((i) => i.comprada && !corredora.skills.includes(i.id)).map((i) => ({ id: i.id, nivel: i.dica ?? 0 })))}
                    >
                      <i className="fa-solid fa-plus"></i> Pôr as compradas na build
                    </button>
                  </>
                )}
              </p>
              </>}
            </div>
          )}

          {/* etapa 2: calcular */}
          {!lendoLoja && (loja || caminho === "todas" || linhas.length > 0) && (
            <div className="rel-acao">
              {progresso ? (
                <>
                  <div className="cmp-progresso"><div style={{ width: `${((progresso.feito / progresso.total) * 100).toFixed(0)}%` }}></div></div>
                  <span className="cmp-progresso-texto">{progresso.feito} / {progresso.total} skills</span>
                  <button type="button" className="cmp-btn-discreto" onClick={cancelar}>Cancelar</button>
                </>
              ) : (
                <>
                  <button type="button" className={linhas.length ? "cmp-btn-discreto" : "cmp-btn-principal"} onClick={rodar} disabled={!lista.length}>
                    <i className="fa-solid fa-play"></i> {linhas.length ? "Calcular de novo" : `Calcular ${lista.length === 1 ? "esta skill" : `estas ${lista.length} skills`}`}
                  </button>
                  {precisao}
                  {loja && (
                    <label className="rel-loja-check" title="As que não estão na loja entram na tabela só de referência (pra saber atrás de qual dica ir); o planejador continua usando só as da loja">
                      <input type="checkbox" checked={comOutras} onChange={(e) => setComOutras(e.target.checked)} />
                      Comparar também com as outras {todasCandidatas.length - todasCandidatas.filter((id) => daLoja.has(id)).length} skills do jogo
                    </label>
                  )}
                  {!lista.length && loja && <span className="cmp-vazio">Nenhuma skill da loja ativa nessa pista.</span>}
                  {!loja && (
                    <button type="button" className="rel-link" onClick={() => entradaPrints.current?.click()}>
                      <i className="fa-solid fa-camera"></i> usar os prints da loja em vez disso
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* etapa 3: montar a compra */}
          {linhas.length > 0 && !progresso && (
            <div className="rel-compra">
              <div className="rel-compra-entrada">
                <div className="rel-compra-sp">
                  <span className="rel-compra-rotulo"><i className="fa-solid fa-coins"></i> Seus Skill Points</span>
                  <input
                    value={orcamento}
                    onChange={(e) => setOrcamento(e.target.value.replace(/\D/g, "").slice(0, 5))}
                    onKeyDown={(e) => e.key === "Enter" && orcamento && planejar()}
                    placeholder="0"
                    inputMode="numeric"
                    autoFocus={!plano}
                  />
                  <small>o número de "Skill Points" no topo da tela Learn</small>
                </div>
                <div className="rel-compra-chamada">
                  <strong>Qual a melhor compra?</strong>
                  <p>O site testa as combinações e escolhe as skills {loja ? "da sua loja " : ""}que, juntas, dão mais vantagem sem passar do seu SP.</p>
                  <button type="button" className="cmp-btn-principal" onClick={planejar} disabled={!orcamento}>
                    <i className="fa-solid fa-wand-magic-sparkles"></i> {plano ? "Montar de novo" : "Montar a melhor compra"}
                  </button>
                </div>
              </div>

              {plano && (() => {
                const total = plano.orcamento || 1;
                const itens = plano.escolhidas
                  .map((id) => ({ id, sk: catalogoSkillsPorId.get(id), custo: custoDe(id)?.custo ?? 0, ganho: resultados[id]?.media ?? 0 }))
                  .sort((a, b) => b.ganho - a.ganho);
                const todasNaBuild = plano.escolhidas.every((id) => adicionadas.has(id));
                return (
                  <div className="rel-compra-resultado">
                    <div className="rel-compra-numeros">
                      <div><span>Gasta</span><strong>{plano.custo} SP</strong></div>
                      <div><span>Sobra</span><strong>{Math.max(0, plano.orcamento - plano.custo)} SP</strong></div>
                      <div className="destaque"><span>Ganho estimado</span><strong>{fmtL(plano.ganho)}</strong></div>
                    </div>
                    <div className="rel-compra-barra" title={`${plano.custo} de ${plano.orcamento} SP`}>
                      <div style={{ width: `${Math.min(100, (plano.custo / total) * 100)}%` }}></div>
                    </div>
                    {itens.length === 0 ? (
                      <span className="cmp-vazio">Nenhuma skill cabe nesse SP.</span>
                    ) : (
                      <div className="rel-compra-lista">
                        {itens.map((it, n) => (
                          <div key={it.id} className="rel-compra-item">
                            <span className="rel-compra-ordem">{n + 1}</span>
                            {it.sk?.iconId && <img src={caminhoIconeSkill(it.sk.iconId)} alt="" />}
                            <span className="rel-compra-nome" style={{ color: COR_RARIDADE_SKILL[it.sk?.rarity] ?? "#f1ead4" }}>{it.sk?.nome ?? it.id}</span>
                            <span className="rel-compra-ganho">{fmtL(it.ganho)}</span>
                            <span className="rel-compra-custo">{it.custo} SP</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {itens.length > 0 && (
                      <div className="rel-compra-rodape">
                        <p className="cmp-sub" style={{ margin: 0 }}>
                          Ganho = soma dos ganhos de cada skill (parecidas juntas rendem um pouco menos). A dourada já conta a branca que inclui. As escolhidas ficam marcadas em verde na tabela.
                        </p>
                        <button
                          type="button"
                          className="cmp-btn-principal"
                          disabled={todasNaBuild}
                          onClick={() => {
                            aoAdicionarVarios(plano.escolhidas.map((id) => ({ id, nivel: dicas[id] ?? 0 })));
                            setAdicionadas((a) => new Set([...a, ...plano.escolhidas]));
                          }}
                        >
                          {todasNaBuild ? <><i className="fa-solid fa-check"></i> Na build</> : <><i className="fa-solid fa-plus"></i> Pôr tudo na build</>}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {linhas.length > 0 && (
            <label className="cmp-busca" style={{ alignSelf: "flex-end", minWidth: "220px" }}>
              <i className="fa-solid fa-magnifying-glass"></i>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Filtrar a tabela pelo nome..." />
            </label>
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
                      <tr key={l.id} className={noPlano.has(l.id) ? "rel-no-plano" : loja && !compravel(l.id) ? "rel-fora-loja" : ""}>
                        <td>
                          <span className="cmp-skill-nome">
                            {l.s.iconId && <img src={caminhoIconeSkill(l.s.iconId)} alt="" />}
                            <span style={{ color: COR_RARIDADE_SKILL[l.s.rarity] ?? "#f1ead4" }}>{l.s.nome}</span>
                            {loja && (compravel(l.id)
                              ? <span className="rel-selo-loja" title="Está na sua loja"><i className="fa-solid fa-store"></i> loja</span>
                              : <span className="rel-selo-fora" title="Não está na sua loja: só de referência (custo estimado)">fora da loja</span>)}
                          </span>
                          <small className="rel-inclui">ativou {Math.round(l.taxa * 100)}%{l.inclui.length ? ` · inclui ${l.inclui.map((p) => p.nome).join(", ")}` : ""}</small>
                        </td>
                        <td>{fmtL(l.min)}</td>
                        <td>{fmtL(l.max)}</td>
                        <td className="rel-cb">{fmtL(l.media)}</td>
                        <td>{fmtL(l.mediana)}</td>
                        <td>
                          {l.daLoja ? (
                            <span className="cmp-custo-dica" title="Custo lido do print da loja">
                              <span className="rel-custo-loja">{l.custo}{dica ? <em>Lv{dica}</em> : null}</span>
                            </span>
                          ) : (
                            <span className="cmp-custo-dica">
                              <button type="button" onClick={() => mudarDica(l.id, -1)} title="Menos dica">−</button>
                              <span title={dica ? `Dica Lv${dica} (−${Math.round(DESCONTO_DICA[dica] * 100)}%)` : "Sem dica"}>{l.custo}{dica ? <em>Lv{dica}</em> : null}</span>
                              <button type="button" onClick={() => mudarDica(l.id, 1)} title="Mais dica">+</button>
                            </span>
                          )}
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
