// 🎯 src/pages/Comparador.jsx
// Comparador de corredoras A×B: roda a mesma corrida centenas de vezes
// (motor honse-sim, no navegador, num Web Worker) e mostra quem fica na
// frente, por quanto, e o "head to head" das duas.

import { useEffect, useMemo, useRef, useState } from "react";
import { aptidoesDaCarta, catalogoCorredoras, fotoCorredora, hipodromos, idDaUnique, infoPercurso, percursosDoHipodromo, rotuloPercurso } from "../utils/simulador/corredoras";
import { catalogoSkillsPorId, caminhoIconeSkill, COR_RARIDADE_SKILL } from "../utils/skillsPista";
import DiagramaPistaGuia from "../components/DiagramaPistaGuia";
import { CatalogoSkills } from "./BuscadorPistas";
import ImportarReplayComparador from "../components/ImportarReplayComparador";
import RelatorioSkills from "../components/RelatorioSkills";
import TabelaComprarSkills from "../components/TabelaComprarSkills";
import { criarLinkComparacao, lerLinkComparacao } from "../utils/simulador/compartilhar";
import { presetEventoAtual } from "../utils/simulador/presetEvento";
import SkillComDetalhe from "../components/SkillComDetalhe";
import { custoBuild, DESCONTO_DICA } from "../utils/simulador/custoSkills";
import courseData from "../uma-skill-tools/data/course_data.json";
import "../styles/comparador.css";

// Semente aleatória pro motor (fora dos componentes: é sorteio, não render).
const novaSemente = () => Math.floor(Math.random() * 2 ** 30);

const COR = { a: "#5fa8e8", b: "#e8806f", ouroBorda: "rgba(197, 160, 89, 0.6)" };
const APTIDOES = ["S", "A", "B", "C", "D", "E", "F", "G"];
const ESTRATEGIAS = ["Front", "Pace", "Late", "End", "Runaway"];
const HUMORES = ["Great", "Good", "Normal", "Bad", "Awful"];
const STATUS = [
  ["speed", "Speed", "#5fa8e8"],
  ["stamina", "Stamina", "#e8806f"],
  ["power", "Power", "#f0a040"],
  ["guts", "Guts", "#f27aa9"],
  ["wit", "Wit", "#4fc76a"],
];

const iconeAptidao = (letra) => `/assets/img/statusrank/utx_ico_statusrank_${String((7 - APTIDOES.indexOf(letra)) * 2).padStart(2, "0")}.png`;

// Seletor de aptidão com os ícones de letra do jogo (abre uma grade S..G).
function SeletorAptidao({ valor, aoMudar }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="cmp-aptidao" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setAberto(false); }}>
      <button type="button" className="cmp-aptidao-atual" onClick={() => setAberto((v) => !v)}>
        <img src={iconeAptidao(valor)} alt={valor} />
        <i className="fa-solid fa-chevron-down"></i>
      </button>
      {aberto && (
        <div className="cmp-aptidao-lista">
          {APTIDOES.map((l) => (
            <button key={l} type="button" className={l === valor ? "ativo" : ""} onClick={() => { aoMudar(l); setAberto(false); }} title={l}>
              <img src={iconeAptidao(l)} alt={l} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Status como o motor enxerga: acima de 1200 conta pela metade, e o humor
// multiplica o resultado (Great +4% ... Awful -4%).
const MULT_HUMOR = { Great: 1.04, Good: 1.02, Normal: 1, Bad: 0.98, Awful: 0.96 };
const statusAjustado = (valor, humor) => Math.floor((valor > 1200 ? 1200 + (valor - 1200) / 2 : valor) * (MULT_HUMOR[humor] ?? 1));

const corredoraPadrao = () => ({
  outfitId: null,
  nome: "",
  epiteto: "",
  estrategia: "Pace",
  humor: "Great",
  aptidoes: { distancia: "S", estrategia: "A", terreno: "A" },
  status: { speed: 1200, stamina: 1000, power: 1000, guts: 600, wit: 1000 },
  skills: [],
  dicas: {}, // { skillId: nível de dica 0-5 }
  kiremono: false, // condição Fast Learner (切れ者): +10% de desconto em todas
});

const uniqueDa = (c) => {
  if (!c.outfitId) return null;
  const id = idDaUnique(c.outfitId);
  return catalogoSkillsPorId.has(id) ? id : null;
};

// ---------------------------------------------------------------------------
// Campo de busca com lista suspensa (corredora, skill, pista)
// ---------------------------------------------------------------------------
function CampoBusca({ placeholder, itens, filtrar, renderizar, aoEscolher, valorTexto = "" }) {
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return (t ? itens.filter((i) => filtrar(i, t)) : itens).slice(0, 60);
  }, [texto, itens, filtrar]);
  return (
    <div className="cmp-busca">
      <i className="fa-solid fa-magnifying-glass"></i>
      <input
        value={aberto ? texto : valorTexto}
        placeholder={placeholder}
        onFocus={() => { setTexto(""); setAberto(true); }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => setTexto(e.target.value)}
      />
      {aberto && lista.length > 0 && (
        <div className="cmp-busca-lista">
          {lista.map((item, i) => (
            <button key={i} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { aoEscolher(item); setAberto(false); }}>
              {renderizar(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const filtrarCorredora = (c, t) => c.nome.toLowerCase().includes(t) || c.epiteto.toLowerCase().includes(t);

function ChipSkill({ id, unique, aoRemover, distancia, dica = 0, aoMudarDica, custo }) {
  const s = catalogoSkillsPorId.get(id);
  if (!s) return null;
  const dicaTitulo = custo
    ? `Nível de dica Lv${dica} (−${Math.round(DESCONTO_DICA[dica] * 100)}%) · clique esquerdo sobe, direito desce\nCusto: ${custo.custo} SP${custo.inclui.length ? `\nInclui: ${custo.inclui.map((p) => `${p.nome} (${p.custo})`).join(", ")}` : ""}`
    : "";
  return (
    <span className={`cmp-skill${unique ? " unique" : ""}`} style={{ borderColor: `${COR_RARIDADE_SKILL[s.rarity] ?? "#c9d2dc"}55` }}>
      <SkillComDetalhe skillId={id} distancia={distancia} abrirNoClique estilo={{ flex: 1, minWidth: 0, alignItems: "center", gap: "inherit" }}>
        {s.iconId && <img src={caminhoIconeSkill(s.iconId)} alt="" />}
        <span className="cmp-skill-nome-chip" title={`${s.nome} (clique pra ver os detalhes)`}>{s.nome}</span>
      </SkillComDetalhe>
      {!unique && custo && (
        <button type="button" className={`cmp-dica${dica ? " ativa" : ""}`} onClick={() => aoMudarDica((dica + 1) % 6)} onContextMenu={(e) => { e.preventDefault(); aoMudarDica((dica + 5) % 6); }} title={dicaTitulo}>
          {dica ? `Lv${dica}` : "—"}<span>{custo.custo}</span>
        </button>
      )}
      {unique ? <em>unique</em> : <button type="button" onClick={aoRemover} title="Remover"><i className="fa-solid fa-xmark"></i></button>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Painel de uma corredora (A ou B)
// ---------------------------------------------------------------------------
function PainelCorredora({ lado, corredora, mudar, aoCopiarOutro, percurso, aba = "build", setAba, contexto }) {
  const cor = COR[lado];
  const unique = uniqueDa(corredora);
  const set = (campo, valor) => mudar({ ...corredora, [campo]: valor });
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const [comprarAberto, setComprarAberto] = useState(false);
  const distancia = percurso?.distancia;
  const custo = useMemo(() => custoBuild({ skills: corredora.skills, dicas: corredora.dicas ?? {}, kiremono: !!corredora.kiremono }), [corredora.skills, corredora.dicas, corredora.kiremono]);
  const foto = corredora.outfitId ? fotoCorredora(corredora.outfitId) : null;

  return (
    <div className="cmp-painel" style={{ borderTopColor: cor }}>
      <div className="cmp-painel-topo">
        <div className="cmp-retrato" style={{ borderColor: `${cor}55` }}>
          {foto ? <img src={foto} alt="" /> : <i className="fa-solid fa-horse-head"></i>}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CampoBusca
            placeholder="Escolher corredora..."
            valorTexto={corredora.nome ? `${corredora.nome}${corredora.epiteto ? ` · ${corredora.epiteto}` : ""}` : ""}
            itens={catalogoCorredoras}
            filtrar={filtrarCorredora}
            renderizar={(c) => (
              <>
                {fotoCorredora(c.outfitId) && <img src={fotoCorredora(c.outfitId)} alt="" />}
                <span>{c.nome}<small>{c.epiteto}</small></span>
              </>
            )}
            aoEscolher={(c) => mudar({ ...corredora, outfitId: c.outfitId, nome: c.nome, epiteto: c.epiteto, estrategia: c.estrategia, aptidoes: aptidoesDaCarta(c.outfitId, percurso, c.estrategia) ?? corredora.aptidoes })}
          />
        </div>
        <button type="button" className="cmp-btn-discreto" onClick={aoCopiarOutro} title="Copiar a build da outra corredora">
          <i className="fa-solid fa-clone"></i>
        </button>
        <button
          type="button"
          className="cmp-btn-discreto cmp-btn-limpar"
          title="Limpar esta corredora (volta pra build em branco)"
          onClick={() => setConfirmandoLimpar((v) => !v)}
        >
          <i className="fa-solid fa-trash"></i>
        </button>
      </div>

      {confirmandoLimpar && (
        <div className="cmp-confirmar">
          <i className="fa-solid fa-triangle-exclamation"></i>
          <span>Limpar a corredora <strong style={{ color: cor }}>{lado.toUpperCase()}</strong>{corredora.nome ? <> ({corredora.nome})</> : null}?</span>
          <button type="button" className="sim" onClick={() => { mudar(corredoraPadrao()); setConfirmandoLimpar(false); }}>Limpar</button>
          <button type="button" onClick={() => setConfirmandoLimpar(false)}>Cancelar</button>
        </div>
      )}

      {/* Build e Skills em abas: cada uma usa a altura toda do painel */}
      <div className="cmp-abas-painel">
        <button type="button" className={aba === "build" ? "ativo" : ""} onClick={() => setAba("build")}>
          <i className="fa-solid fa-chart-simple"></i> Build
        </button>
        <button type="button" className={aba === "skills" ? "ativo" : ""} onClick={() => setAba("skills")}>
          <i className="fa-solid fa-bolt"></i> Skills <span>{corredora.skills.length + (unique ? 1 : 0)} · {custo.total} SP</span>
        </button>
      </div>

      {aba === "build" && (
      <div className="cmp-aba-build">
      <div className="cmp-status">
        {STATUS.map(([chave, rotulo, c]) => (
          <label key={chave}>
            <span style={{ color: c }}>{rotulo}</span>
            <input
              type="number"
              min="1"
              max="2000"
              value={corredora.status[chave]}
              onChange={(e) => set("status", { ...corredora.status, [chave]: Math.max(1, Math.min(2000, Number(e.target.value) || 1)) })}
            />
            <small className="cmp-adj" title="Ajustado: o status como o motor enxerga. Acima de 1200 conta pela metade, e o humor multiplica o resultado (Great +4%, Good +2%, Bad −2%, Awful −4%).">
              {statusAjustado(corredora.status[chave], corredora.humor)}
            </small>
          </label>
        ))}
      </div>
      <div className="cmp-adj-legenda" title="Ajustado: o status como o motor enxerga. Acima de 1200 conta pela metade, e o humor multiplica o resultado (Great +4%, Good +2%, Bad −2%, Awful −4%).">
        <i className="fa-solid fa-circle-info"></i> Embaixo: status ajustado (acima de 1200 conta pela metade, × humor)
      </div>

      <div className="cmp-linha">
        <span className="cmp-rotulo">Estratégia</span>
        <div className="cmp-pilulas">
          {ESTRATEGIAS.map((e) => (
            <button key={e} type="button" className={corredora.estrategia === e ? "ativo" : ""} onClick={() => mudar({ ...corredora, estrategia: e, aptidoes: aptidoesDaCarta(corredora.outfitId, percurso, e) ?? corredora.aptidoes })}>{e}</button>
          ))}
        </div>
      </div>

      <div className="cmp-grade-3">
        {[["distancia", "Distância"], ["terreno", "Terreno"], ["estrategia", "Estilo"]].map(([chave, rotulo]) => (
          <label key={chave}>
            <span className="cmp-rotulo">{rotulo}</span>
            <SeletorAptidao valor={corredora.aptidoes[chave]} aoMudar={(l) => set("aptidoes", { ...corredora.aptidoes, [chave]: l })} />
          </label>
        ))}
        <label>
          <span className="cmp-rotulo">Humor</span>
          <select value={corredora.humor} onChange={(e) => set("humor", e.target.value)}>
            {HUMORES.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
      </div>
      </div>
      )}

      <div className="cmp-linha cmp-bloco-skills" style={{ alignItems: "flex-start", display: aba === "skills" ? undefined : "none" }}>
        <div className="cmp-skills-topo">
          <span className="cmp-rotulo" style={{ margin: 0 }}>Skills</span>
          <span className="cmp-sp" title="Custo total em SP das skills compradas (a unique não conta). Dourada sem a branca na build cobra as duas.">
            <strong>{custo.total}</strong> SP
          </span>
          <label className="cmp-kiremono" title="Condição positiva Fast Learner (切れ者): +10% de desconto em todas as skills">
            <input type="checkbox" checked={!!corredora.kiremono} onChange={(e) => set("kiremono", e.target.checked)} /> Fast Learner −10%
          </label>
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "8px" }}>
          <div className="cmp-skills">
            {unique && <ChipSkill id={unique} unique distancia={distancia} />}
            {corredora.skills.map((id) => (
              <ChipSkill
                key={id}
                id={id}
                distancia={distancia}
                dica={corredora.dicas?.[id] ?? 0}
                custo={custo.itens.find((i) => i.id === id)}
                aoMudarDica={(nivel) => set("dicas", { ...(corredora.dicas ?? {}), [id]: nivel })}
                aoRemover={() => set("skills", corredora.skills.filter((x) => x !== id))}
              />
            ))}
            {!unique && corredora.skills.length === 0 && <span className="cmp-vazio">Nenhuma skill</span>}
          </div>
          <div className="cmp-botoes-skills">
            <button type="button" className="cmp-btn-adicionar" onClick={() => setCatalogoAberto(true)}>
              <i className="fa-solid fa-plus"></i> Adicionar skill
            </button>
            <button type="button" className="cmp-btn-relatorio" onClick={() => setRelatorioAberto(true)} disabled={!corredora.skills.length} title="Quanto cada skill vale na corrida × quanto custa em cada nível de dica (exporta em PDF)">
              <i className="fa-solid fa-file-invoice-dollar"></i> Relatório de custo
            </button>
          </div>
          <button type="button" className="cmp-btn-comprar" onClick={() => setComprarAberto(true)} title="Testa as skills que podem ativar nessa pista e mostra quanto cada uma acrescentaria à build">
            <i className="fa-solid fa-cart-shopping"></i> Quais skills comprar?
          </button>
          {comprarAberto && (
            <TabelaComprarSkills
              corredora={corredora}
              unique={unique}
              contexto={contexto}
              aoFechar={() => setComprarAberto(false)}
              aoAdicionar={(id, nivel) => mudar({ ...corredora, skills: corredora.skills.includes(id) ? corredora.skills : [...corredora.skills, id], dicas: { ...(corredora.dicas ?? {}), [id]: nivel } })}
              aoAdicionarVarios={(itens) => mudar({
                ...corredora,
                skills: [...new Set([...corredora.skills, ...itens.map((i) => i.id)])],
                dicas: { ...(corredora.dicas ?? {}), ...Object.fromEntries(itens.map((i) => [i.id, i.nivel])) },
              })}
            />
          )}
          {relatorioAberto && <RelatorioSkills corredora={corredora} unique={unique} contexto={contexto} aoFechar={() => setRelatorioAberto(false)} />}
          {catalogoAberto && (
            <CatalogoSkills
              idsAdicionados={[unique, ...corredora.skills].filter(Boolean)}
              aoAdicionar={(sk) => mudar({ ...corredora, skills: corredora.skills.includes(sk.id) ? corredora.skills : [...corredora.skills, sk.id] })}
              aoFechar={() => setCatalogoAberto(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Builds salvas no navegador (cada pessoa tem as suas). Salvar guarda a
// corredora que está sendo editada; clicar numa carrega nela.
const CHAVE_BUILDS = "ptr-comparador-builds";
function lerBuilds() {
  try { return JSON.parse(localStorage.getItem(CHAVE_BUILDS)) ?? []; } catch { return []; }
}
function gravarBuilds(lista) {
  try { localStorage.setItem(CHAVE_BUILDS, JSON.stringify(lista)); } catch { /* sem armazenamento: só some ao recarregar */ }
}

function BuildsSalvas({ corredora, aoCarregar }) {
  const [lista, setLista] = useState(lerBuilds);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const atualizar = (nova) => { setLista(nova); gravarBuilds(nova); };
  function salvar() {
    const titulo = nome.trim() || `${corredora.nome || "Corredora"} · ${corredora.estrategia}`;
    const build = { ...corredora };
    atualizar([{ id: Date.now(), titulo, build }, ...lista.filter((x) => x.titulo !== titulo)]);
    setNome("");
  }
  return (
    <div className="cmp-builds">
      <button type="button" className="cmp-builds-topo" onClick={() => setAberto((v) => !v)}>
        <i className="fa-solid fa-bookmark"></i> Builds salvas <span>{lista.length}</span>
        <i className={`fa-solid fa-chevron-${aberto ? "up" : "down"}`}></i>
      </button>
      {aberto && (
        <div className="cmp-builds-corpo">
          <div className="cmp-builds-salvar">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder={`${corredora.nome || "Corredora"} · ${corredora.estrategia}`} onKeyDown={(e) => e.key === "Enter" && salvar()} />
            <button type="button" onClick={salvar} title="Salvar a build que está sendo editada"><i className="fa-solid fa-floppy-disk"></i> Salvar</button>
          </div>
          {lista.length === 0 && <p className="cmp-vazio" style={{ margin: "4px 0 0" }}>Nenhuma build salva ainda.</p>}
          {lista.map((item) => (
            <div key={item.id} className="cmp-builds-item">
              <button type="button" className="cmp-builds-carregar" onClick={() => aoCarregar(item.build)} title="Carregar nesta corredora">
                {item.build.outfitId && fotoCorredora(item.build.outfitId) ? <img src={fotoCorredora(item.build.outfitId)} alt="" /> : <i className="fa-solid fa-horse-head"></i>}
                <span>
                  <strong>{item.titulo}</strong>
                  <small>{["speed", "stamina", "power", "guts", "wit"].map((k) => item.build.status[k]).join(" / ")} · {item.build.skills.length} skill{item.build.skills.length === 1 ? "" : "s"}</small>
                </span>
              </button>
              <button type="button" className="cmp-builds-apagar" onClick={() => atualizar(lista.filter((x) => x.id !== item.id))} title="Apagar"><i className="fa-solid fa-trash"></i></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ajustes (aba "Settings" do torena-sim)
// ---------------------------------------------------------------------------
const ambos = (v = true) => ({ a: v, b: v });
const ajustesPadrao = () => ({
  variacaoWit: true,
  rushed: ambos(), downhill: ambos(), testeSkills: ambos(),
  conservarPower: ambos(),
  spot: true, duelo: true,
  taxasDuelo: { runaway: 10, frontRunner: 10, paceChaser: 10, lateSurger: 10, endCloser: 10 },
});

function PainelAjustes({ ajustes, setAjustes, vezes, setVezes, modo, nomeA, nomeB }) {
  const set = (campo, valor) => setAjustes({ ...ajustes, [campo]: valor });
  const linhaAB = (chave, rotulo, dica, desligada) => (
    <div className={`cmp-ajuste-ab${desligada ? " desligada" : ""}`} title={dica}>
      <span>{rotulo}</span>
      {["a", "b"].map((l) => (
        <input key={l} type="checkbox" disabled={desligada} checked={ajustes[chave][l]} onChange={(e) => set(chave, { ...ajustes[chave], [l]: e.target.checked })} style={{ "--cor": COR[l] }} />
      ))}
    </div>
  );
  const cabecalhoAB = (
    <div className="cmp-ajuste-ab cabecalho">
      <span>Mecânica</span>
      <span style={{ color: COR.a }}>A</span>
      <span style={{ color: COR.b }}>B</span>
    </div>
  );
  return (
    <div className="cmp-ajustes">
      <section>
        <div className="cmp-ajuste-linha">
          <div><strong>Corridas por rodada</strong><small>De 1 a 10.000. Os atalhos 1/100/500/1000 ficam embaixo do Rodar.</small></div>
          <input type="number" min="1" max="10000" value={vezes} onChange={(e) => setVezes(Math.max(1, Math.min(10000, Number(e.target.value) || 1)))} />
        </div>
      </section>

      <section>
        <label className="cmp-ajuste-titulo">
          <div><strong>Variação de Wit</strong><small>Eventos aleatórios que dependem do Wit. Desligado, nenhum deles acontece em nenhuma corrida.</small></div>
          <input type="checkbox" checked={ajustes.variacaoWit} onChange={(e) => set("variacaoWit", e.target.checked)} />
        </label>
        {cabecalhoAB}
        {linhaAB("rushed", "Rushed (afobada)", "Chance de ficar afobada no começo da corrida.", !ajustes.variacaoWit)}
        {linhaAB("downhill", "Modo descida (downhill)", "Chance de entrar no modo descida e economizar HP nas descidas.", !ajustes.variacaoWit)}
        {linhaAB("testeSkills", "Teste de Wit das skills", "Antes de cada corrida, cada skill (menos a unique) rola se passa: Wit 600 = 85%, 1000 = 91%, 1200 = 92,5%. Desligado, toda skill passa.", !ajustes.variacaoWit)}
      </section>

      <section>
        <div className="cmp-ajuste-titulo"><div><strong>Mecânicas</strong><small>Sempre simuladas, com ou sem a variação de Wit.</small></div></div>
        {cabecalhoAB}
        {linhaAB("conservarPower", "Conservar power", "Guarda energia pra arrancada final (Fully Charged).")}
        <label className="cmp-ajuste-simples"><span>Spot struggle</span><input type="checkbox" checked={ajustes.spot} onChange={(e) => set("spot", e.target.checked)} /></label>
        <label className="cmp-ajuste-simples"><span>Duelo</span><input type="checkbox" checked={ajustes.duelo} onChange={(e) => set("duelo", e.target.checked)} /></label>
      </section>

      <section className={modo === "vacuo" ? "" : "cmp-ajuste-inativo"}>
        <div className="cmp-ajuste-titulo"><div><strong>Taxas de duelo</strong><small>Só no modo Vacuum: chance (%) de duelar na reta final, por estilo. Nos outros modos o duelo sai da posição real.</small></div></div>
        <div className="cmp-ajuste-taxas">
          {[["runaway", "Runaway"], ["frontRunner", "Front"], ["paceChaser", "Pace"], ["lateSurger", "Late"], ["endCloser", "End"]].map(([k, rot]) => (
            <label key={k}>
              <span>{rot}</span>
              <input type="number" min="0" max="100" value={ajustes.taxasDuelo[k]} onChange={(e) => set("taxasDuelo", { ...ajustes.taxasDuelo, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
            </label>
          ))}
        </div>
      </section>

      <button type="button" className="cmp-btn-discreto" onClick={() => setAjustes(ajustesPadrao())}><i className="fa-solid fa-rotate-left"></i> Voltar ao padrão</button>
      <p className="cmp-sub" style={{ margin: 0 }}><span style={{ color: COR.a }}>A</span> = {nomeA} · <span style={{ color: COR.b }}>B</span> = {nomeB}</p>
    </div>
  );
}

// Cartões A e B no topo da barra lateral: escolhem qual corredora editar.
function SeletorCorredoras({ a, b, editando, setEditando, aoTrocar }) {
  const cartao = (lado, c) => {
    const foto = c.outfitId ? fotoCorredora(c.outfitId) : null;
    return (
      <button type="button" className={`cmp-seletor-cartao${editando === lado ? " ativo" : ""}`} style={{ "--cor": COR[lado] }} onClick={() => setEditando(lado)}>
        <span className="cmp-seletor-letra">{lado.toUpperCase()}</span>
        <span className="cmp-seletor-foto">{foto ? <img src={foto} alt="" /> : <i className="fa-solid fa-horse-head"></i>}</span>
        <span className="cmp-seletor-texto">
          <strong>{c.nome || `Corredora ${lado.toUpperCase()}`}</strong>
          <small>{c.estrategia}{c.skills.length ? ` · ${c.skills.length} skill${c.skills.length > 1 ? "s" : ""}` : ""}</small>
        </span>
      </button>
    );
  };
  return (
    <div className="cmp-seletor">
      {cartao("a", a)}
      <button type="button" className="cmp-seletor-trocar" onClick={aoTrocar} title="Trocar A e B"><i className="fa-solid fa-right-left"></i></button>
      {cartao("b", b)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------
// Histograma com eixo de contagem, linha da mediana e cartão ao passar o
// mouse (faixa + quantas corridas caíram nela), no estilo do torena-sim.
function Histograma({ margens, min, max, mediana, corDe = (meio) => (meio < 0 ? COR.a : COR.b), rotulo = "L" }) {
  const [hover, setHover] = useState(null);
  const barras = useMemo(() => {
    const amplitude = Math.max(1, max - min);
    const passo = [0.25, 0.5, 1, 2, 5, 10, 20, 25, 50].find((p) => amplitude / p <= 40) ?? 100;
    const inicio = Math.floor(min / passo) * passo;
    const n = Math.max(1, Math.ceil((max - inicio) / passo) + 1);
    const contagem = Array(n).fill(0);
    margens.forEach((m) => { contagem[Math.min(n - 1, Math.floor((m - inicio) / passo))] += 1; });
    return contagem.map((c, i) => ({ c, x: inicio + i * passo, passo }));
  }, [margens, min, max]);

  // Eixo Y "redondo" (0, 15, 30, 45, 60...)
  const maior = Math.max(...barras.map((b) => b.c), 1);
  const passoY = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500].find((p) => maior / p <= 4) ?? 1000;
  const topo = Math.ceil(maior / passoY) * passoY;
  const W = 640, H = 214, E = 34, D = 8, cima = 22, base = 188;
  const larg = (W - E - D) / barras.length;
  const y = (c) => base - (c / topo) * (base - cima);
  const xDe = (valor) => E + ((valor - barras[0].x) / (barras.length * barras[0].passo)) * (W - E - D);
  const casas = barras[0].passo < 1 ? 2 : barras[0].passo < 10 ? 1 : 0;
  const fmt = (v) => v.toFixed(casas);

  const b = hover != null ? barras[hover] : null;
  const cartao = b && (() => {
    const texto = `${fmt(b.x)} a ${fmt(b.x + b.passo)} ${rotulo}`;
    const w = Math.max(texto.length * 6.6 + 24, 150);
    const cx = E + hover * larg + larg / 2;
    const bx = Math.min(Math.max(cx + 10, E), W - D - w);
    const by = Math.max(cima, y(b.c) - 46);
    return (
      <g pointerEvents="none">
        <rect x={bx} y={by} width={w} height="40" rx="7" fill="#0b1320" fillOpacity="0.97" stroke={COR.ouroBorda} />
        <text x={bx + 10} y={by + 16} className="cmp-hist-dica-titulo">{texto}</text>
        <text x={bx + 10} y={by + 32} className="cmp-hist-dica">Corridas</text>
        <text x={bx + w - 10} y={by + 32} textAnchor="end" className="cmp-hist-dica-valor">{b.c}</text>
      </g>
    );
  })();

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cmp-histograma" role="img" aria-label="Distribuição" onMouseLeave={() => setHover(null)}>
      {/* grade e eixo Y */}
      {Array.from({ length: topo / passoY + 1 }, (_, i) => i * passoY).map((v) => (
        <g key={`y${v}`}>
          <line x1={E} x2={W - D} y1={y(v)} y2={y(v)} stroke="rgba(164,179,198,0.08)" />
          <text x={E - 6} y={y(v) + 3} textAnchor="end" className="cmp-hist-eixo">{v}</text>
        </g>
      ))}
      {barras.map((bar, i) => {
        const meio = bar.x + bar.passo / 2;
        const ativa = hover === i;
        return (
          <g key={i}>
            <rect x={E + i * larg + 1} y={y(bar.c)} width={Math.max(1, larg - 2)} height={base - y(bar.c)} rx="2" fill={corDe(meio)} opacity={bar.c ? (hover == null || ativa ? 0.92 : 0.55) : 0} />
            {i % Math.ceil(barras.length / 12) === 0 && <text x={E + i * larg + larg / 2} y={H - 8} textAnchor="middle" className="cmp-hist-eixo">{fmt(bar.x)}</text>}
            {/* área de mouse cobrindo a coluna inteira */}
            <rect x={E + i * larg} y={cima} width={larg} height={base - cima} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        );
      })}
      <line x1={E} x2={W - D} y1={base} y2={base} stroke="rgba(164,179,198,0.25)" />
      {/* mediana */}
      {mediana != null && Number.isFinite(mediana) && (
        <g pointerEvents="none">
          <line x1={xDe(mediana)} x2={xDe(mediana)} y1={cima - 4} y2={base} stroke="#f1ead4" strokeOpacity="0.55" strokeDasharray="3 3" />
          <text x={xDe(mediana)} y={cima - 8} textAnchor="middle" className="cmp-hist-mediana">mediana: {fmt(mediana)} {rotulo}</text>
        </g>
      )}
      {cartao}
    </svg>
  );
}

// Skills: onde cada skill ativou de fato nas simulações (início médio, faixa
// entre a primeira e a última ativação, e a duração real em metros).
function linhasSkills(r) {
  return [["a", r.skillsA], ["b", r.skillsB]].flatMap(([lado, ids]) =>
    ids.map((id) => {
      const s = catalogoSkillsPorId.get(id);
      const st = r[lado].skills[id];
      return s ? { lado, id, s, st } : null;
    }).filter(Boolean)
  );
}

// Gráfico do diagrama: velocidade (linha cheia) e HP (tracejado) de A e B na
// corrida mais perto da mediana, e as skills que ativaram nela.
function curvasDaAmostra(r) {
  const am = r.amostra;
  if (!am) return null;
  const vels = [...am.a.vel, ...am.b.vel].filter(([pos]) => pos > 80).map(([, v]) => v);
  if (!vels.length) return null;
  return {
    velMin: Math.max(0, Math.floor(Math.min(...vels)) - 1),
    velMax: Math.ceil(Math.max(...vels)) + 0.5,
    hpMax: Math.max(am.a.maxHp, am.b.maxHp),
    series: [
      { nome: "A", grupo: "A", cor: COR.a, eixo: "vel", pontos: am.a.vel },
      { nome: "B", grupo: "B", cor: COR.b, eixo: "vel", pontos: am.b.vel },
      { nome: "HP A", grupo: "A", cor: COR.a, eixo: "hp", tracejado: true, pontos: am.a.hp },
      { nome: "HP B", grupo: "B", cor: COR.b, eixo: "hp", tracejado: true, pontos: am.b.hp },
    ],
  };
}

function skillsQueNaoAtivaram(r) {
  const am = r.amostra;
  if (!am) return [];
  return [["a", r.skillsA, am.a], ["b", r.skillsB, am.b]].flatMap(([lado, ids, t]) =>
    ids.filter((id) => !t.skills.some((sk) => sk.id === id)).map((id) => ({ lado, nome: catalogoSkillsPorId.get(id)?.nome ?? id }))
  );
}

function etiquetasDaAmostra(r) {
  const am = r.amostra;
  if (!am) return null;
  return [["a", am.a], ["b", am.b]].flatMap(([lado, t]) => [
    ...t.skills.map((sk) => {
      const s = catalogoSkillsPorId.get(sk.id);
      return { nome: s?.nome ?? sk.id, iconId: s?.iconId, inicio: sk.inicio, fim: Math.max(sk.fim, sk.inicio), cor: COR[lado], grupo: lado.toUpperCase() };
    }),
    ...(t.eventos ?? []).map((e) => ({ nome: e.tipo, inicio: e.inicio, fim: e.fim, cor: COR[lado], evento: true, grupo: lado.toUpperCase() })),
  ]);
}

function SkillsResultado({ r }) {
  const linhas = linhasSkills(r);
  const nomeLado = { a: r.nomeA, b: r.nomeB };

  if (!linhas.length) return <div className="cmp-cartao"><p className="cmp-sub" style={{ margin: 0 }}>Nenhuma das duas tem skills equipadas.</p></div>;
  return (
    <div className="cmp-resultado">
      <div className="cmp-cartao">
        <div className="cmp-cartao-titulo"><i className="fa-solid fa-bolt"></i> Skills <small>{r.n === 1 ? "nesta corrida" : `em ${r.n} corridas`}</small></div>
        <table className="cmp-tabela cmp-tabela-skills">
          <thead>
            <tr><th>Skill</th><th>Ativou</th><th>Costuma ativar</th><th>Faixa</th><th>Dura</th></tr>
          </thead>
          <tbody>
            {linhas.map(({ lado, id, s, st }) => (
              <tr key={`${lado}-${id}`}>
                <td>
                  <span className="cmp-skill-nome">
                    <i style={{ background: COR[lado] }} title={nomeLado[lado]}></i>
                    {s.iconId && <img src={caminhoIconeSkill(s.iconId)} alt="" />}
                    {s.nome}
                  </span>
                </td>
                <td>{r.n === 1 ? (st ? "Sim" : "Não") : st ? pct(st.taxa) : "0%"}</td>
                <td>{st ? `${Math.round(st.posicaoMedia)}m` : "—"}</td>
                <td>{st ? `${Math.round(st.min)}–${Math.round(st.max)}m` : "—"}</td>
                <td>{st ? `${Math.round(st.duracaoMedia)}m` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cmp-sub">Skills que nunca ativaram aparecem com 0%: a condição delas não acontece nessa pista ou com esse estilo.</p>
      </div>
    </div>
  );
}

// Calculadora: menor stamina que chega com full spurt na taxa desejada.
function CalculadoraStamina({ corredora, courseId, condicoes, cor }) {
  const [alvo, setAlvo] = useState(100);
  const [forcar, setForcar] = useState({ rushed: false, spot: false, duelo: false });
  const [estado, setEstado] = useState(null); // null | { progresso } | { resultado } | { erro }
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);
  function calcular() {
    worker.current?.terminate();
    const w = new Worker(new URL("../utils/simulador/comparador.worker.js", import.meta.url), { type: "module" });
    worker.current = w;
    setEstado({ progresso: 0 });
    w.onmessage = ({ data }) => {
      if (data.tipo === "progresso") setEstado({ progresso: data.feito / data.total });
      if (data.tipo === "fim") { setEstado({ resultado: data.resultado }); w.terminate(); }
      if (data.tipo === "erro") { setEstado({ erro: data.mensagem }); w.terminate(); }
    };
    w.postMessage({ tipo: "stamina", courseId, condicoes, corredora, alvo: alvo / 100, forcar, semente: novaSemente() });
  }
  const calculando = estado?.progresso !== undefined;
  const res = estado?.resultado;
  return (
    <div className="cmp-calc">
      <div className="cmp-calc-linha">
        <span>Taxa alvo de full spurt</span>
        <label className="cmp-calc-alvo"><input type="number" min="1" max="100" value={alvo} onChange={(e) => setAlvo(Math.max(1, Math.min(100, Number(e.target.value) || 100)))} /> %</label>
        <button type="button" className="cmp-btn-discreto" onClick={calcular} disabled={calculando}>
          {calculando ? `Calculando... ${Math.round(estado.progresso * 100)}%` : "Calcular"}
        </button>
      </div>
      {res && (
        <div className="cmp-calc-resultado">
          {res.necessaria === null
            ? <span>Nem com <strong>2000</strong> de stamina chega a {alvo}% (máx. {pct(res.taxa)}).</span>
            : <span>Precisa de <strong style={{ color: cor }}>{res.necessaria}</strong> de stamina · {pct(res.taxa)} em 60 corridas{res.necessaria <= corredora.status.stamina ? " · a build atual já tem" : ` · faltam ${res.necessaria - corredora.status.stamina}`}</span>}
        </div>
      )}
      {estado?.erro && <p className="cmp-aviso">{estado.erro}</p>}
      <div className="cmp-forcar">
        <span>Forçar nesta estimativa</span>
        {[["rushed", "Rushed", "seção 3, por ~250m"], ["spot", "Spot struggle", "dos 150m ao fim da seção 6"], ["duelo", "Duelo", "da última reta até a chegada"]].map(([k, rot, dica]) => (
          <label key={k} title={dica}>
            <input type="checkbox" checked={forcar[k]} onChange={(e) => setForcar({ ...forcar, [k]: e.target.checked })} />
            <span className="cmp-chave"></span> {rot} <small>{dica}</small>
          </label>
        ))}
      </div>
      <p className="cmp-sub">Menor stamina que chega com full spurt sem zerar o HP, re-simulando cada candidata (60 corridas). Os testes de Wit das skills sempre passam e o downhill é garantido nas descidas.</p>
    </div>
  );
}

const LINHAS_LEDGER = [
  ["downhill", "Descida (downhill)", "fa-person-skiing"],
  ["rushed", "Rushed (afobada)", "fa-wind"],
  ["spotStruggle", "Spot struggle", "fa-fire"],
  ["paceUp", "Acelerar o ritmo (pace up)", "fa-person-running"],
  ["paceDown", "Segurar o ritmo (pace down)", "fa-person-walking"],
  ["dueling", "Duelo", "fa-khanda"],
  ["totalRecovered", "Recuperado por skills", "fa-heart-pulse"],
  ["totalDrainedByEffects", "Drenado por debuffs", "fa-skull"],
];

// Recuperação conta como economia e dreno como custo; o resto segue o sinal
// do motor (negativo = economizou).
const valorLedger = (k, v) => (k === "totalRecovered" ? -v : v);

function DetalheHp({ d, unica }) {
  const lg = d.ledger;
  const fx = d.faixaLedger ?? {};
  const linhas = LINHAS_LEDGER.map(([k, rot, icone]) => ({ k, rot, icone, v: valorLedger(k, lg[k] ?? 0) })).filter((l) => Math.abs(l.v) >= 0.5);
  const economias = linhas.filter((l) => l.v < 0);
  const custos = linhas.filter((l) => l.v > 0);
  const faixa = (k) => {
    const f = fx[k];
    if (unica || !f || !Number.isFinite(f.min) || Math.round(f.min) === Math.round(f.max)) return null;
    const a = Math.round(Math.abs(valorLedger(k, f.min))), b = Math.round(Math.abs(valorLedger(k, f.max)));
    return `${Math.min(a, b)} – ${Math.max(a, b)} HP`;
  };
  const linha = (l, cls) => (
    <div key={l.k} className="cmp-hp-linha">
      <span><i className={`fa-solid ${l.icone}`}></i> {l.rot}</span>
      <span className={cls}>
        {Math.round(Math.abs(l.v))} HP
        {faixa(l.k) && <small>{faixa(l.k)} (média {Math.round(Math.abs(l.v))})</small>}
      </span>
    </div>
  );
  return (
    <div className="cmp-hp">
      <p className="cmp-sub" style={{ marginTop: 0 }}>{unica ? "Nesta corrida." : "Média das corridas."} Cada mecânica é comparada com não ter ela, então as linhas não somam no total.</p>
      <div className="cmp-hp-grupo">Geral</div>
      <div className="cmp-hp-linha"><span><i className="fa-solid fa-heart"></i> HP total</span><span>{Math.round(lg.maxHp)} HP</span></div>
      <div className="cmp-hp-linha"><span><i className="fa-solid fa-shoe-prints"></i> Gasto só correndo</span><span>{Math.round(lg.baselineSpent)} HP</span></div>
      <div className="cmp-hp-linha"><span><i className="fa-solid fa-gauge-high"></i> Gasto no total</span><span>{Math.round(lg.totalSpent)} HP</span></div>
      {economias.length > 0 && <div className="cmp-hp-grupo verde">Economizou</div>}
      {economias.map((l) => linha(l, "melhor"))}
      {custos.length > 0 && <div className="cmp-hp-grupo vermelho">Custou</div>}
      {custos.map((l) => linha(l, "pior"))}
    </div>
  );
}

function StaminaResultado({ r }) {
  const lados = [["a", r.nomeA, r.entradaA], ["b", r.nomeB, r.entradaB]];
  return (
    <div className="cmp-resultado-grade">
      {lados.map(([lado, nome, entrada]) => {
        const d = r[lado];
        return (
          <div key={lado} className="cmp-cartao" style={{ borderTop: `3px solid ${COR[lado]}` }}>
            <div className="cmp-cartao-titulo" style={{ color: COR[lado] }}><i className="fa-solid fa-heart" style={{ color: COR[lado] }}></i> {nome}</div>
            <div className="cmp-numeros">
              <div><span>Full spurt</span><strong>{pct(d.spurt)}</strong></div>
              <div><span>Não zerou HP</span><strong>{pct(1 - d.semHp)}</strong></div>
              {r.n === 1
                ? <div><span>HP no fim</span><strong>{Math.round(d.hpFim.media)}</strong></div>
                : <>
                  <div><span>HP no fim (mín)</span><strong>{Math.round(d.hpFim.min)}</strong></div>
                  <div><span>HP no fim (mediana)</span><strong>{Math.round(d.hpFim.mediana)}</strong></div>
                </>}
            </div>
            {r.n > 1 && (
              <>
                <Histograma margens={d.hps} min={d.hpFim.min} max={d.hpFim.max} mediana={d.hpFim.mediana} corDe={() => COR[lado]} rotulo="HP" />
                <p className="cmp-sub" style={{ textAlign: "center", marginTop: 0 }}>HP que sobrou no fim de cada corrida</p>
              </>
            )}

            <div className="cmp-subtitulo">Para onde foi o HP <small>{r.n === 1 ? "nesta corrida" : "média por corrida"}</small></div>
            <DetalheHp d={d} unica={r.n === 1} />

            <div className="cmp-subtitulo">Calculadora de full spurt</div>
            <CalculadoraStamina corredora={entrada} courseId={r.courseId} condicoes={r.condicoes} cor={COR[lado]} />
          </div>
        );
      })}
    </div>
  );
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fmtTempo = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
// "76.2% (148m)": em quantas corridas a mecânica aconteceu e onde costuma começar
const mec = (lado, k) => {
  const m = lado.mecanicas?.[k];
  if (!m) return "—";
  return m.taxa > 0 ? `${pct(m.taxa)} (${Math.round(m.posicaoMedia)}m)` : "0%";
};
const fmtL = (x) => `${x > 0 ? "+" : ""}${x.toFixed(2)} L`;

function Resultado({ r, nomeA, nomeB }) {
  const bVence = r.bFrente > r.aFrente;
  const vencedor = bVence ? { lado: "b", nome: nomeB, vezes: r.bFrente } : { lado: "a", nome: nomeA, vezes: r.aFrente };
  const linhas = [
    [r.n === 1 ? "Tempo final" : "Tempo final (média)", fmtTempo(r.a.tempo), fmtTempo(r.b.tempo), r.a.tempo < r.b.tempo ? "a" : "b"],
    ["Velocidade máxima", `${r.a.vmax.toFixed(2)} m/s`, `${r.b.vmax.toFixed(2)} m/s`, r.a.vmax > r.b.vmax ? "a" : "b"],
    ["Atraso na largada", `${r.a.atraso.toFixed(3)} s`, `${r.b.atraso.toFixed(3)} s`, r.a.atraso < r.b.atraso ? "a" : "b"],
    ["1ª na entrada do Late Race", pct(r.a.late), pct(r.b.late), r.a.late > r.b.late ? "a" : "b"],
    ["Full spurt", pct(r.a.spurt), pct(r.b.spurt), r.a.spurt > r.b.spurt ? "a" : "b"],
    ["Rushed (afobada)", mec(r.a, "Rushed"), mec(r.b, "Rushed"), r.a.rushed < r.b.rushed ? "a" : "b"],
    ["Spot struggle", mec(r.a, "Spot"), mec(r.b, "Spot"), null],
    ["Duelo", mec(r.a, "Duelo"), mec(r.b, "Duelo"), null],
    ["Fully Charged", mec(r.a, "Carregado"), mec(r.b, "Carregado"), null],
    ["Ficou sem HP", pct(r.a.semHp), pct(r.b.semHp), r.a.semHp < r.b.semHp ? "a" : "b"],
    [r.n === 1 ? "HP no fim" : "HP no fim (média)", r.a.hp.toFixed(0), r.b.hp.toFixed(0), r.a.hp > r.b.hp ? "a" : "b"],
  ];
  const ignoradas = Object.entries(r.skillsIgnoradas ?? {});
  const [aba, setAba] = useState("resumo");
  const unica = r.n === 1;
  const plural = (n, p) => `${n} ${p}${n === 1 ? "" : "s"}`;
  const nomeModo = r.modo === "vacuo" ? "Vacuum" : r.modo === "contestado" ? `Contested (campo de ${r.campo}, outras com ${r.forcaCampo})` : "Classic";

  return (
    <div className="cmp-resultado">
      <div className="cmp-cartao">
        {unica ? (
          <>
            <div className="cmp-manchete">
              {Math.abs(r.mediana) < 0.01
                ? <>Empate técnico</>
                : <><span style={{ color: COR[r.mediana < 0 ? "a" : "b"] }}>{r.mediana < 0 ? nomeA : nomeB}</span> chegou na frente por <strong>{Math.abs(r.mediana).toFixed(2)} L</strong></>}
            </div>
            <p className="cmp-sub">
              Corrida única · semente {r.semente} · modo {nomeModo}.
              Tempo: <span style={{ color: COR.a }}>{nomeA}</span> {fmtTempo(r.a.tempo)} · <span style={{ color: COR.b }}>{nomeB}</span> {fmtTempo(r.b.tempo)}.
            </p>
          </>
        ) : (
          <>
            <div className="cmp-manchete">
              <span style={{ color: COR[vencedor.lado] }}>{vencedor.nome}</span> na frente em <strong>{pct(vencedor.vezes / r.n)}</strong> de {plural(r.n, "corrida")}
            </div>
            <p className="cmp-sub">
              Mediana {fmtL(r.mediana)} · de {fmtL(r.min)} a {fmtL(r.max)} · modo {nomeModo}.
              Margem negativa = <span style={{ color: COR.a }}>{nomeA}</span> na frente; positiva = <span style={{ color: COR.b }}>{nomeB}</span> na frente.
            </p>
          </>
        )}
        {ignoradas.length > 0 && (
          <p className="cmp-aviso"><i className="fa-solid fa-triangle-exclamation"></i> Skills sem dados, ignoradas: {ignoradas.map(([n, ids]) => `${n} (${ids.join(", ")})`).join(" · ")}</p>
        )}
      </div>

      <div className="cmp-abas">
        {[["resumo", "fa-chart-column", "Resumo"], ["stamina", "fa-heart", "Stamina"], ["skills", "fa-bolt", "Skills"]].map(([chave, icone, rotulo]) => (
          <button key={chave} type="button" className={aba === chave ? "ativo" : ""} onClick={() => setAba(chave)}>
            <i className={`fa-solid ${icone}`}></i> {rotulo}
          </button>
        ))}
      </div>

      {aba === "skills" ? <SkillsResultado r={r} /> : aba === "stamina" ? <StaminaResultado r={r} /> : (

      <div className="cmp-resultado-grade">
        {unica ? (
        <div className="cmp-cartao">
          <div className="cmp-cartao-titulo"><i className="fa-solid fa-flag-checkered"></i> Chegada</div>
          {(r.mediana <= 0 ? [["a", nomeA], ["b", nomeB]] : [["b", nomeB], ["a", nomeA]]).map(([lado, nome], i) => (
            <div key={lado} className="cmp-chegada" style={{ borderColor: `${COR[lado]}55` }}>
              <span className="cmp-chegada-pos" style={{ background: COR[lado] }}>{i + 1}º</span>
              <strong style={{ color: COR[lado] }}>{nome}</strong>
              <span>{fmtTempo(r[lado].tempo)}</span>
              <em>{i === 0 ? "venceu" : `+${Math.abs(r.mediana).toFixed(2)} L`}</em>
            </div>
          ))}
          <p className="cmp-sub">Rode 100 ou mais corridas para ver a distribuição da margem.</p>
        </div>
        ) : (
        <div className="cmp-cartao">
          <div className="cmp-cartao-titulo"><i className="fa-solid fa-chart-column"></i> Margem final</div>
          <div className="cmp-numeros">
            {[["Mín", r.min], ["Máx", r.max], ["Média", r.media], ["Mediana", r.mediana]].map(([rot, v]) => (
              <div key={rot}><span>{rot}</span><strong>{fmtL(v)}</strong></div>
            ))}
          </div>
          <Histograma margens={r.margens} min={r.min} max={r.max} mediana={r.mediana} />
          <div className="cmp-legenda">
            <span><i style={{ background: COR.a }}></i> {nomeA} na frente</span>
            <span><i style={{ background: COR.b }}></i> {nomeB} na frente</span>
          </div>
        </div>
        )}

        <div className="cmp-cartao">
          <div className="cmp-cartao-titulo"><i className="fa-solid fa-scale-balanced"></i> Head to head <small>{unica ? "nesta corrida" : `média de ${plural(r.n, "corrida")}`}</small></div>
          <table className="cmp-tabela">
            <thead>
              <tr><th></th><th style={{ color: COR.a }}>{nomeA}</th><th style={{ color: COR.b }}>{nomeB}</th></tr>
            </thead>
            <tbody>
              {linhas.map(([rot, va, vb, melhor]) => (
                <tr key={rot}>
                  <td>{rot}</td>
                  <td className={melhor === "a" && va !== vb ? "melhor" : ""}>{va}</td>
                  <td className={melhor === "b" && va !== vb ? "melhor" : ""}>{vb}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------
function Comparador() {
  const [a, setA] = useState(corredoraPadrao);
  const [b, setB] = useState(corredoraPadrao);
  const [editando, setEditando] = useState("a");
  const [abaPainel, setAbaPainel] = useState("build"); // "build" | "skills" (mesma aba pra A e B)
  // Percurso escolhido por hipódromo + distância (começa no Nakayama 2500m, o do Arima Kinen)
  const [courseId, setCourseId] = useState(() => percursosDoHipodromo("10005").find((p) => p.distancia === 2500)?.courseId ?? "10506");
  const [grade, setGrade] = useState("G1");
  const percurso = infoPercurso(courseId);
  // Builds vindas do replay: mantém as aptidões do arquivo (não recalcula pela
  // carta) e tira a unique da lista de skills (ela já entra sozinha).
  function importarDoReplay({ a: ra, b: rb, courseId: idPista, condicoes: cond }) {
    const paraBuild = (c) => {
      const carta = catalogoCorredoras.find((x) => String(x.outfitId) === String(c.outfitId));
      const unique = c.outfitId ? idDaUnique(c.outfitId) : null;
      return {
        outfitId: c.outfitId ? String(c.outfitId) : null,
        nome: carta?.nome ?? c.nome,
        epiteto: carta?.epiteto ?? "",
        estrategia: c.estrategia,
        humor: c.humor,
        aptidoes: c.aptidoes,
        status: c.status,
        skills: c.skills.filter((id) => id !== unique && catalogoSkillsPorId.has(id)),
      };
    };
    if (ra) setA(paraBuild(ra));
    if (rb) setB(paraBuild(rb));
    if (ra && !rb) setEditando("a");
    if (rb && !ra) setEditando("b");
    if (idPista && infoPercurso(idPista)) setCourseId(String(idPista));
    if (cond) setCondicoes({ terreno: cond.terreno, clima: cond.clima, estacao: cond.estacao });
    setResultado(null);
    setAbaLateral("corredoras");
  }

  // Trocar de percurso atualiza as aptidões (distância/terreno) de quem tem carta.
  function mudarPercurso(id) {
    setCourseId(id);
    const novo = infoPercurso(id);
    const ajustar = (c) => ({ ...c, aptidoes: aptidoesDaCarta(c.outfitId, novo, c.estrategia) ?? c.aptidoes });
    setA(ajustar);
    setB(ajustar);
  }
  function trocarHipodromo(id) {
    const lista = percursosDoHipodromo(id);
    const mesmo = lista.find((p) => p.distancia === percurso?.distancia && p.terreno === percurso?.terreno) ?? lista[0];
    if (mesmo) mudarPercurso(mesmo.courseId);
  }
  const [condicoes, setCondicoes] = useState({ terreno: "Firm", clima: "Sunny", estacao: "Spring" });
  const [modo, setModo] = useState("classico");
  const [campo, setCampo] = useState(9);
  const [forcaCampo, setForcaCampo] = useState(900);
  const [ajustes, setAjustes] = useState(ajustesPadrao);
  const [abaLateral, setAbaLateral] = useState("corredoras");
  const semTesteSkills = !ajustes.variacaoWit || (!ajustes.testeSkills.a && !ajustes.testeSkills.b);
  const [vezes, setVezes] = useState(500);
  const [configAberta, setConfigAberta] = useState(false);
  const [sementeTexto, setSementeTexto] = useState(""); // vazio = aleatória
  const [ultimaSemente, setUltimaSemente] = useState(null);
  const [aviso, setAviso] = useState(null); // mensagem curta que some sozinha
  const avisoTimer = useRef(null);
  function mostrarAviso(texto) {
    setAviso(texto);
    clearTimeout(avisoTimer.current);
    avisoTimer.current = setTimeout(() => setAviso(null), 2800);
  }

  // Link de compartilhamento: ao abrir /comparador#c=..., carrega a comparação.
  useEffect(() => {
    let ativo = true;
    lerLinkComparacao().then((dados) => {
      if (!ativo || !dados) return;
      setA(dados.a);
      setB(dados.b);
      if (dados.courseId && infoPercurso(dados.courseId)) setCourseId(String(dados.courseId));
      setGrade(dados.grade);
      if (dados.condicoes) setCondicoes(dados.condicoes);
      setModo(dados.modo);
      setCampo(dados.campo);
      setForcaCampo(dados.forcaCampo);
      if (dados.ajustes) setAjustes(dados.ajustes);
      setVezes(dados.vezes);
      if (dados.semente != null) setSementeTexto(String(dados.semente));
      mostrarAviso("Comparação carregada do link. É só clicar em Rodar.");
    });
    return () => { ativo = false; };
  }, []);

  async function compartilhar() {
    try {
      const digitada = Number.parseInt(sementeTexto, 10);
      const link = await criarLinkComparacao({
        a, b, courseId, grade, condicoes, modo, campo, forcaCampo, ajustes, vezes,
        semente: Number.isFinite(digitada) ? digitada : ultimaSemente,
      });
      await navigator.clipboard.writeText(link);
      mostrarAviso("Link copiado! Quem abrir vê a mesma comparação (e o mesmo resultado, com a semente).");
    } catch (erro) {
      console.error(erro);
      mostrarAviso("Não consegui copiar o link.");
    }
  }

  async function usarEventoAtual() {
    try {
      const preset = await presetEventoAtual();
      if (!preset?.courseId) { mostrarAviso("Não achei a pista do evento atual no Guia do Meta."); return; }
      mudarPercurso(preset.courseId);
      setGrade("G1");
      setCondicoes((c) => ({ ...c, ...preset.condicoes }));
      setResultado(null);
      mostrarAviso(`Pista e condições do ${preset.nome} aplicadas.`);
    } catch (erro) {
      console.error(erro);
      mostrarAviso("Não consegui ler o Guia do Meta.");
    }
  }
  const [progresso, setProgresso] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const worker = useRef(null);

  useEffect(() => () => worker.current?.terminate(), []);

  // O que o relatório de skills precisa saber da corrida (semente fixa: dá pra comparar relatórios)
  const contextoSimulacao = {
    courseId,
    condicoes: { ...condicoes, grade },
    ajustes,
    semente: 20261006,
    percursoTexto: percurso ? `${percurso.hipodromo} ${percurso.terreno} ${percurso.distancia}m (${percurso.categoria}) · ${condicoes.terreno} · ${condicoes.clima}` : "",
  };
  const nomeA = a.nome || "Corredora A";
  const nomeB = b.nome || "Corredora B";
  const rodando = progresso !== null;

  function comparar() {
    worker.current?.terminate();
    const w = new Worker(new URL("../utils/simulador/comparador.worker.js", import.meta.url), { type: "module" });
    worker.current = w;
    setErro(null);
    setProgresso(0);
    const comUnique = (c) => ({ ...c, skills: [...new Set([uniqueDa(c), ...c.skills].filter(Boolean))] });
    const condicoesCorrida = { ...condicoes, grade };
    const extras = { nomeA, nomeB, courseId, condicoes: condicoesCorrida, entradaA: comUnique(a), entradaB: comUnique(b), skillsA: comUnique(a).skills, skillsB: comUnique(b).skills };
    w.onmessage = ({ data }) => {
      if (data.tipo === "progresso") setProgresso(data.feito / data.total);
      if (data.tipo === "fim") { setResultado({ ...data.resumo, ...extras }); setProgresso(null); w.terminate(); }
      if (data.tipo === "erro") { setErro(data.mensagem); setProgresso(null); w.terminate(); }
    };
    w.onerror = (e) => { setErro(e.message || "Falha ao carregar o simulador."); setProgresso(null); };
    const digitada = Number.parseInt(sementeTexto, 10);
    // Com 1 corrida a semente é sempre nova (pra ver corridas diferentes a cada clique).
    const semente = vezes > 1 && Number.isFinite(digitada) && digitada >= 0 ? digitada : novaSemente();
    setUltimaSemente(semente);
    w.postMessage({
      courseId,
      condicoes: condicoesCorrida,
      a: comUnique(a),
      b: comUnique(b),
      modo,
      vezes,
      campo,
      forcaCampo,
      ajustes,
      semente,
    });
  }

  function cancelar() {
    worker.current?.terminate();
    setProgresso(null);
  }

  const pilulas = (opcoes, valor, aoMudar) => (
    <div className="cmp-pilulas">
      {opcoes.map(([v, rot]) => (
        <button key={v} type="button" className={valor === v ? "ativo" : ""} onClick={() => aoMudar(v)}>{rot}</button>
      ))}
    </div>
  );

  return (
    <main className="cmp-pagina">
      <div className="cmp-layout">
      <aside className="cmp-lateral">
        <div className="cmp-abas-lateral">
          {[["corredoras", "fa-users", "Corredoras"], ["ajustes", "fa-sliders", "Ajustes"]].map(([k, icone, rot]) => (
            <button key={k} type="button" className={abaLateral === k ? "ativo" : ""} onClick={() => setAbaLateral(k)}>
              <i className={`fa-solid ${icone}`}></i> {rot}
            </button>
          ))}
        </div>
        {abaLateral === "ajustes" ? (
          <PainelAjustes ajustes={ajustes} setAjustes={setAjustes} vezes={vezes} setVezes={setVezes} modo={modo} nomeA={nomeA} nomeB={nomeB} />
        ) : (
          <>
            <ImportarReplayComparador aoImportar={importarDoReplay} alvo={editando} />
            <SeletorCorredoras a={a} b={b} editando={editando} setEditando={setEditando} aoTrocar={() => { setA(b); setB(a); }} />
            {editando === "a"
              ? <PainelCorredora key="a" lado="a" corredora={a} mudar={setA} percurso={percurso} aba={abaPainel} setAba={setAbaPainel} contexto={contextoSimulacao} aoCopiarOutro={() => setA({ ...b })} />
              : <PainelCorredora key="b" lado="b" corredora={b} mudar={setB} percurso={percurso} aba={abaPainel} setAba={setAbaPainel} contexto={contextoSimulacao} aoCopiarOutro={() => setB({ ...a })} />}
            <BuildsSalvas corredora={editando === "a" ? a : b} aoCarregar={(build) => (editando === "a" ? setA : setB)({ ...build })} />
          </>
        )}
        {/* Rodar fica fixo no pé da barra lateral: não muda de lugar quando o diagrama cresce */}
        <div className="cmp-acoes cmp-acoes-fixas">
          {rodando ? (
            <>
              <div className="cmp-progresso"><div style={{ width: `${(progresso * 100).toFixed(0)}%` }}></div></div>
              <span className="cmp-progresso-texto">{Math.round(progresso * vezes)} / {vezes}</span>
              <button type="button" className="cmp-btn-discreto" onClick={cancelar}>Cancelar</button>
            </>
          ) : (
            <>
              <button type="button" className="cmp-btn-principal" onClick={comparar} disabled={!percurso}>
                <i className="fa-solid fa-play"></i> Rodar {vezes} corrida{vezes > 1 ? "s" : ""}
              </button>
              {pilulas([[1, "1"], [100, "100"], [500, "500"], [1000, "1000"]], vezes, setVezes)}
              {vezes > 1 && <label className="cmp-semente" title="Mesma semente + mesmas builds = mesmo resultado. Deixe vazio para sortear.">
                <span>Semente</span>
                <input value={sementeTexto} onChange={(e) => setSementeTexto(e.target.value.replace(/\D/g, ""))} placeholder={ultimaSemente !== null ? String(ultimaSemente) : "aleatória"} inputMode="numeric" />
                {ultimaSemente !== null && sementeTexto !== String(ultimaSemente) && (
                  <button type="button" onClick={() => setSementeTexto(String(ultimaSemente))} title="Usar a semente da última simulação (repete o resultado)"><i className="fa-solid fa-rotate-left"></i></button>
                )}
              </label>}
              {vezes === 1 && <span className="cmp-dica-semente"><i className="fa-solid fa-shuffle"></i> semente nova a cada corrida{ultimaSemente !== null ? ` · última: ${ultimaSemente}` : ""}</span>}
              {resultado && (
                <button type="button" className="cmp-btn-discreto" onClick={() => setResultado(null)}>
                  <i className="fa-solid fa-eraser"></i> Limpar
                </button>
              )}
              <button type="button" className="cmp-btn-discreto" onClick={compartilhar} title="Copia um link com as duas builds, a pista, as condições e a semente">
                <i className="fa-solid fa-link"></i> Compartilhar
              </button>
            </>
          )}
        </div>
      </aside>

      <section className="cmp-principal">
      <div className="cmp-cabecalho">
        <div className="cmp-sobretitulo"><i className="fa-solid fa-screwdriver-wrench"></i> Ferramentas · Beta</div>
        <h1>Comparador de Corredoras</h1>
        <p>Monte duas builds e rode a mesma corrida centenas de vezes para ver quem fica na frente, e por quanto.</p>
      </div>

      {courseData[courseId] && (
        <div className="cmp-cartao cmp-diagrama">
          <div className="cmp-cartao-titulo">
            <i className="fa-solid fa-chart-area"></i> Diagrama da pista
            <small>
              {resultado?.courseId === courseId
                ? "corrida mais perto da mediana · linha cheia = velocidade · tracejado = HP · etiqueta = skill (largura = duração)"
                : "passe o mouse para ver trecho, fase e inclinação"}
            </small>
          </div>
          <DiagramaPistaGuia
            dadosCorrida={courseData[courseId]}
            numerar={false}
            curvas={resultado?.courseId === courseId ? curvasDaAmostra(resultado) : null}
            etiquetas={resultado?.courseId === courseId ? etiquetasDaAmostra(resultado) : null}
          />
          {resultado?.courseId === courseId && (() => {
            const faltaram = skillsQueNaoAtivaram(resultado);
            return faltaram.length > 0 && (
              <p className="cmp-sub" style={{ marginTop: "8px" }}>
                <i className="fa-solid fa-circle-info"></i> Não ativaram nesta corrida:{" "}
                {faltaram.map(({ lado, nome }, i) => <span key={i} style={{ color: COR[lado], fontWeight: 700 }}>{i ? ", " : ""}{nome}</span>)}
                {resultado.ajustes && (!resultado.ajustes.variacaoWit || (!resultado.ajustes.testeSkills.a && !resultado.ajustes.testeSkills.b)) ? " (a condição delas não aconteceu)." : " (falhou no teste de Wit ou a condição não aconteceu)."}
              </p>
            );
          })()}
        </div>
      )}

      <div className="cmp-cartao cmp-corrida">
        <button type="button" className="cmp-resumo-corrida" onClick={() => setConfigAberta((v) => !v)} aria-expanded={configAberta}>
          <i className="fa-solid fa-gear"></i>
          <strong>Corrida</strong>
          <span className="cmp-resumo-itens">
            <span className="destaque">{percurso?.hipodromo}</span>
            <span>{percurso?.terreno} {percurso?.distancia}m ({percurso?.categoria})</span>
            <span>{percurso?.direcao}{percurso?.tracado ? ` · ${percurso.tracado}` : ""}</span>
            <span>{grade}</span>
            <span>{condicoes.terreno}</span>
            <span>{condicoes.estacao}</span>
            <span>{condicoes.clima}</span>
            <span className="modo">{modo === "vacuo" ? "Vacuum" : modo === "contestado" ? `Contested · ${campo}` : "Classic"}</span>
            {semTesteSkills && <span>sem teste de Wit</span>}
          </span>
          <i className={`fa-solid fa-chevron-${configAberta ? "up" : "down"} cmp-resumo-seta`}></i>
        </button>
        {configAberta && (
        <div className="cmp-corrida-grade">
          <div className="cmp-preset">
            <button type="button" className="cmp-btn-discreto" onClick={usarEventoAtual} title="Pista, condição, clima e estação do evento atual do Guia do Meta">
              <i className="fa-solid fa-trophy"></i> Usar o CM atual (Guia do Meta)
            </button>
          </div>
          <div className="cmp-percurso">
            <label>
              <span className="cmp-rotulo">Hipódromo</span>
              <select value={percurso?.hipodromoId ?? ""} onChange={(e) => trocarHipodromo(e.target.value)}>
                {hipodromos.map((h) => <option key={h.id} value={h.id}>{h.nome}</option>)}
              </select>
            </label>
            <label>
              <span className="cmp-rotulo">Distância</span>
              <select value={courseId} onChange={(e) => mudarPercurso(e.target.value)}>
                {percursosDoHipodromo(percurso?.hipodromoId).map((p) => <option key={p.courseId} value={p.courseId}>{rotuloPercurso(p)}</option>)}
              </select>
            </label>
            <label>
              <span className="cmp-rotulo">Grade</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)}>
                {["G1", "G2", "G3", "OP"].map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className="cmp-rotulo">Condição</span>
            {pilulas([["Firm", "Firm"], ["Good", "Good"], ["Soft", "Soft"], ["Heavy", "Heavy"]], condicoes.terreno, (v) => setCondicoes({ ...condicoes, terreno: v }))}
          </div>
          <div>
            <span className="cmp-rotulo">Clima</span>
            {pilulas([["Sunny", "Sunny"], ["Cloudy", "Cloudy"], ["Rainy", "Rainy"], ["Snowy", "Snowy"]], condicoes.clima, (v) => setCondicoes({ ...condicoes, clima: v }))}
          </div>
          <div>
            <span className="cmp-rotulo">Estação</span>
            {pilulas([["Spring", "Spring"], ["Summer", "Summer"], ["Fall", "Fall"], ["Winter", "Winter"]], condicoes.estacao, (v) => setCondicoes({ ...condicoes, estacao: v }))}
          </div>
          <div>
            <span className="cmp-rotulo">Modo <i className="fa-solid fa-circle-info" title="Classic: A e B correm juntas com um pacemaker Front (como o Umalator), com Rushed, Spot Struggle e Duelo pela posição real das três. Contested: A e B num campo cheio, com bloqueio e disputa de posição (o mais próximo da corrida real, e o mais lento). Vacuum: cada uma corre sozinha com a mesma sorte, isolando só a diferença das builds; sem Spot Struggle, e o Duelo é por taxa aproximada."></i></span>
            {pilulas([["classico", "Classic"], ["contestado", "Contested"], ["vacuo", "Vacuum"]], modo, setModo)}
          </div>
          {modo === "contestado" && (
            <>
              <div>
                <span className="cmp-rotulo">Tamanho do campo <i className="fa-solid fa-circle-info" title="CM tem 9 corredoras e LoH tem 12. As vagas além de A e B são preenchidas com cavalinhas genéricas."></i></span>
                <div className="cmp-campo">
                  {pilulas([[9, "9 (CM)"], [12, "12 (LoH)"]], campo, setCampo)}
                  <select value={campo} onChange={(e) => setCampo(Number(e.target.value))} title="Qualquer tamanho de 3 a 12 (o máximo do motor)">
                    {Array.from({ length: 10 }, (_, i) => i + 3).map((n) => <option key={n} value={n}>{n} corredoras</option>)}
                  </select>
                </div>
              </div>
              <div>
                <span className="cmp-rotulo">Força das outras <i className="fa-solid fa-circle-info" title="Status (iguais em tudo) das cavalinhas genéricas que completam o campo."></i></span>
                {pilulas([[600, "600"], [900, "900"], [1200, "1200"]], forcaCampo, setForcaCampo)}
              </div>
            </>
          )}
        </div>
        )}
      </div>


      {!resultado && !rodando && (
        <div className="cmp-vazio-resultado">
          <i className="fa-solid fa-flag-checkered"></i>
          <strong>Rode a simulação para comparar</strong>
          <span>Margem final, HP, stamina e onde cada skill ativou aparecem aqui.</span>
        </div>
      )}

      {erro && <p className="cmp-aviso" style={{ textAlign: "center" }}><i className="fa-solid fa-circle-exclamation"></i> {erro}</p>}
      {resultado && <Resultado r={resultado} nomeA={resultado.nomeA} nomeB={resultado.nomeB} />}

      <p className="cmp-creditos">
        Simulação feita com o <a href="https://github.com/jalbarrang/torena-sim" target="_blank" rel="noreferrer">honse-sim</a>, de jalbarrang (GPL-3.0),
        com dados do <a href="https://github.com/alpha123/uma-skill-tools" target="_blank" rel="noreferrer">uma-skill-tools</a>, de alpha123.
        As mecânicas são de engenharia reversa: trate os números como estimativa.
      </p>
      </section>
      </div>
      {aviso && <div className="cmp-aviso-flutuante"><i className="fa-solid fa-circle-check"></i> {aviso}</div>}
    </main>
  );
}

export default Comparador;
