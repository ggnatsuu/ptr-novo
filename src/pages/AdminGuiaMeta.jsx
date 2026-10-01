// 🎯 src/pages/AdminGuiaMeta.jsx
// Admin → Guia do Meta: edita os eventos do guia direto no Firestore (sem deploy).
// Etapa atual: lista de eventos, cabeçalho (identificação, pista, status,
// descrição), criar/excluir evento e definir o evento atual.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ModalConfirmacao from "../components/ModalConfirmacao";
import BuscaSkill from "../components/BuscaSkill";
import SkillComDetalhe from "../components/SkillComDetalhe";
import EditorEstilosGuia from "../components/EditorEstilosGuia";
import EditorEstrategiasGuia from "../components/EditorEstrategiasGuia";
import { catalogoSkillsPorId, caminhoIconeSkill, COR_RARIDADE_SKILL } from "../utils/skillsPista";
import { recarregarIndice, carregarEvento, salvarEventoGuia, excluirEventoGuia, definirOcultoGuia, eventoVazio, ESTILOS_GUIA } from "../utils/guiaMetaDados";
import { lerEventoAtual, definirEventoAtual } from "../utils/anotacoesMeta";

const OPCOES = {
  tipo_distancia: ["Sprint", "Mile", "Medium", "Long"],
  terreno: ["Turf", "Dirt"],
  direcao: ["Right", "Left", "Straight"],
  estacao: ["Spring", "Summer", "Fall", "Winter"],
  clima: ["Sunny", "Cloudy", "Rainy", "Snowy", "Random"],
  condicao_pista: ["Firm", "Good", "Soft", "Heavy", "Random"],
};
const HIPODROMOS = ["Sapporo", "Hakodate", "Niigata", "Fukushima", "Nakayama", "Tokyo", "Chukyo", "Kyoto", "Hanshin", "Kokura", "Ooi", "Kawasaki", "Funabashi", "Morioka", "Longchamp", "Del Mar"];
const STATUS = [["speed", "Speed", "#4ea3f5"], ["stamina", "Stamina", "#e85d5d"], ["power", "Power", "#f0a040"], ["guts", "Guts", "#e27ab6"], ["wit", "Wit", "#4fc76a"]];

const estiloCaixa = { background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.18)", borderRadius: "12px", padding: "16px 18px" };
const estiloTitulo = { margin: "0 0 12px", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "11.5pt" };
const estiloRotulo = { display: "block", color: "#8193a8", fontSize: "7.5pt", fontWeight: 800, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: "4px" };
const estiloCampo = { width: "100%", boxSizing: "border-box", background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.2)", borderRadius: "8px", color: "#f1ead4", fontSize: "9.5pt", padding: "8px 10px", fontFamily: "'Montserrat'", outline: "none" };
const estiloBotao = (cor = "#c5a059", cheio = false) => ({ display: "inline-flex", alignItems: "center", gap: "6px", background: cheio ? `linear-gradient(135deg, ${cor}, ${cor}cc)` : "transparent", border: `1px solid ${cheio ? "transparent" : `${cor}66`}`, color: cheio ? "#0b1320" : cor, borderRadius: "8px", padding: "8px 14px", fontSize: "9pt", fontWeight: 800, cursor: "pointer", fontFamily: "'Montserrat'" });

const clonar = (o) => JSON.parse(JSON.stringify(o));
const vazioParaNull = (v) => (v === "" ? null : v);

// Campo de texto ligado a um caminho do evento ("status_recomendados.speed").
function Campo({ rotulo, valor, aoMudar, dica, area, opcoes, lista, largura }) {
  const props = { value: valor ?? "", onChange: (e) => aoMudar(e.target.value), style: estiloCampo };
  return (
    <label style={{ display: "block", minWidth: 0, gridColumn: largura }}>
      <span style={estiloRotulo}>{rotulo}</span>
      {opcoes ? (
        <select {...props} style={{ ...estiloCampo, cursor: "pointer" }}>
          <option value="">—</option>
          {opcoes.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : area ? (
        <textarea {...props} rows={3} style={{ ...estiloCampo, resize: "vertical" }} />
      ) : (
        <input {...props} list={lista} />
      )}
      {dica && <span style={{ display: "block", color: "#5f758e", fontSize: "7.5pt", marginTop: "3px" }}>{dica}</span>}
    </label>
  );
}

function AdminGuiaMeta() {
  const [indice, setIndice] = useState(null);
  const [busca, setBusca] = useState("");
  const [idSelecionado, setIdSelecionado] = useState(null);
  const [original, setOriginal] = useState(null); // evento como está salvo
  const [rascunho, setRascunho] = useState(null); // evento sendo editado
  const [novo, setNovo] = useState(false); // rascunho ainda não existe no Firebase
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [eventoAtual, setEventoAtual] = useState(null);
  const [criando, setCriando] = useState(null); // { tipo, numero, copiarDe }
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [confirmarTroca, setConfirmarTroca] = useState(null); // id para trocar com alterações pendentes

  useEffect(() => {
    window.scrollTo(0, 0);
    Promise.all([recarregarIndice(), lerEventoAtual()]).then(([i, atual]) => { setIndice(i); setEventoAtual(atual); });
  }, []);

  useEffect(() => {
    if (!mensagem) return undefined;
    const t = setTimeout(() => setMensagem(null), 3000);
    return () => clearTimeout(t);
  }, [mensagem]);

  const pendente = rascunho && (novo || JSON.stringify(rascunho) !== JSON.stringify(original));

  const abrir = async (id) => {
    setIdSelecionado(id);
    setNovo(false);
    setRascunho(null);
    const e = await carregarEvento(id);
    setOriginal(e);
    setRascunho(e ? clonar(e) : null);
  };
  const pedirAbrir = (id) => (pendente && id !== idSelecionado ? setConfirmarTroca(id) : abrir(id));

  // Altera um caminho do rascunho: mudar("informacoes_pista.hipodromo", "Tokyo")
  const mudar = (caminho, valor) => setRascunho((r) => {
    const c = clonar(r);
    const partes = caminho.split(".");
    let alvo = c;
    partes.slice(0, -1).forEach((p) => { alvo[p] = alvo[p] ?? {}; alvo = alvo[p]; });
    alvo[partes.at(-1)] = vazioParaNull(valor);
    return c;
  });

  // Altera os dados de um estilo (personagens, decks...).
  const mudarEstilo = (estilo, alterar) => setRascunho((r) => {
    const c = clonar(r);
    c.estilos = c.estilos ?? {};
    c.estilos[estilo] = c.estilos[estilo] ?? {};
    alterar(c.estilos[estilo]);
    return c;
  });

  // Acelerações de um estilo: lista ordenada de ids de skill.
  const mudarAceleracoes = (estilo, alterar) => setRascunho((r) => {
    const c = clonar(r);
    c.estilos[estilo] = c.estilos[estilo] ?? {};
    c.estilos[estilo].aceleracoes = alterar([...(c.estilos[estilo].aceleracoes ?? [])]);
    return c;
  });
  const moverAceleracao = (estilo, i, delta) => mudarAceleracoes(estilo, (lista) => {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return lista;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    return lista;
  });

  const alternarOculto = async (id, oculto) => {
    try {
      const eventos = await definirOcultoGuia(id, oculto);
      setIndice((i) => ({ ...i, eventos }));
      if (id === idSelecionado) {
        setOriginal((o) => (o ? { ...o, oculto } : o));
        setRascunho((r) => (r ? { ...r, oculto } : r));
      }
      setMensagem({ texto: `${id} ${oculto ? "oculto para os membros" : "visível para os membros"}.`, tipo: "ok" });
    } catch (erro) {
      console.error("Erro ao ocultar o evento:", erro);
      setMensagem({ texto: "Não foi possível alterar. Confira a regra do Firestore.", tipo: "erro" });
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const eventos = await salvarEventoGuia(rascunho);
      setIndice((i) => ({ ...i, eventos }));
      setOriginal(clonar(rascunho));
      setNovo(false);
      setIdSelecionado(rascunho.id);
      setMensagem({ texto: "Evento salvo. O guia já mostra a versão nova.", tipo: "ok" });
    } catch (erro) {
      console.error("Erro ao salvar o evento:", erro);
      setMensagem({ texto: "Não foi possível salvar. Confira a regra do Firestore.", tipo: "erro" });
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    setConfirmarExcluir(false);
    try {
      const eventos = await excluirEventoGuia(rascunho.id);
      setIndice((i) => ({ ...i, eventos }));
      setIdSelecionado(null); setRascunho(null); setOriginal(null);
      setMensagem({ texto: "Evento excluído.", tipo: "ok" });
    } catch (erro) {
      console.error("Erro ao excluir o evento:", erro);
      setMensagem({ texto: "Não foi possível excluir.", tipo: "erro" });
    }
  };

  const criar = async () => {
    const numero = Number(criando.numero);
    let base = eventoVazio(criando.tipo, numero);
    if (indice.eventos.some((e) => e.id === base.id)) return setMensagem({ texto: `${base.id} já existe.`, tipo: "erro" });
    if (criando.copiarDe) {
      const origem = await carregarEvento(criando.copiarDe);
      if (origem) base = { ...clonar(origem), id: base.id, tipo: base.tipo, numero, nome: base.nome, cartas_novas: [] };
    }
    setCriando(null);
    setIdSelecionado(base.id);
    setOriginal(null);
    setRascunho(base);
    setNovo(true);
    return setMensagem({ texto: `${base.id} criado. Preencha e clique em Salvar.`, tipo: "ok" });
  };

  const marcarAtual = async () => {
    await definirEventoAtual(rascunho.id);
    setEventoAtual(rascunho.id);
    setMensagem({ texto: `${rascunho.id} agora é o evento atual do guia.`, tipo: "ok" });
  };

  const grupos = useMemo(() => {
    if (!indice) return [];
    const termo = busca.trim().toLowerCase();
    const lista = indice.eventos.filter((e) => !termo || `${e.nome} ${e.informacoes_pista?.hipodromo}`.toLowerCase().includes(termo));
    return ["Champions Meeting", "League of Heroes"].map((t) => [t, lista.filter((e) => e.tipo === t).sort((a, b) => b.numero - a.numero)]);
  }, [indice, busca]);

  if (!indice) {
    return <main className="main-layout-wrapper" style={{ marginTop: "130px", minHeight: "60vh", textAlign: "center", color: "#c5a059" }}><i className="fa-solid fa-circle-notch fa-spin"></i> Carregando...</main>;
  }
  if (indice.origem === "json") {
    return (
      <main className="main-layout-wrapper" style={{ marginTop: "130px", minHeight: "60vh", textAlign: "center", color: "#f0a040", fontFamily: "'Montserrat'" }}>
        <p>Os dados do guia ainda não estão no Firebase. Importe primeiro pela faixa laranja do <Link to="/guia-meta" style={{ color: "#c5a059" }}>Guia do Meta</Link>.</p>
      </main>
    );
  }

  const r = rascunho;
  return (
    <main className="main-layout-wrapper" style={{ marginTop: "130px", padding: "0 16px 60px", fontFamily: "'Montserrat', sans-serif", maxWidth: "1400px", marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <div style={{ flex: 1 }}>
          <div style={{ color: "#c5a059", fontSize: "8pt", fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase" }}><i className="fa-solid fa-screwdriver-wrench"></i> Admin</div>
          <h1 style={{ margin: "4px 0 0", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "20pt" }}>Editor do Guia do Meta</h1>
        </div>
        <button type="button" onClick={() => setCriando({ tipo: "Champions Meeting", numero: "", copiarDe: "" })} style={estiloBotao("#c5a059", true)}>
          <i className="fa-solid fa-plus"></i> Novo evento
        </button>
      </div>

      {mensagem && (
        <div style={{ marginBottom: "12px", padding: "10px 14px", borderRadius: "8px", fontSize: "9pt", color: mensagem.tipo === "erro" ? "#e8806f" : "#7fd08a", background: mensagem.tipo === "erro" ? "rgba(232, 128, 111, 0.1)" : "rgba(79, 199, 106, 0.1)", border: `1px solid ${mensagem.tipo === "erro" ? "rgba(232, 128, 111, 0.4)" : "rgba(79, 199, 106, 0.35)"}` }}>
          <i className={`fa-solid ${mensagem.tipo === "erro" ? "fa-triangle-exclamation" : "fa-circle-check"}`}></i> {mensagem.texto}
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-start" }}>
        {/* LISTA DE EVENTOS */}
        <aside style={{ ...estiloCaixa, flex: "0 0 280px", padding: "12px", position: "sticky", top: "90px" }}>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar evento..." style={{ ...estiloCampo, marginBottom: "10px" }} />
          <div className="rolagem-dourada" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
            {grupos.map(([tipo, lista]) => (
              <div key={tipo} style={{ marginBottom: "10px" }}>
                <div style={{ ...estiloRotulo, padding: "4px 6px" }}>{tipo}</div>
                {lista.map((e) => (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", opacity: e.oculto ? 0.55 : 1 }}>
                  <button type="button" onClick={() => pedirAbrir(e.id)} className="linha-clicavel" style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: 0, textAlign: "left", background: e.id === idSelecionado ? "rgba(197, 160, 89, 0.14)" : "transparent", border: "none", borderRadius: "6px", padding: "6px 8px", cursor: "pointer", fontFamily: "'Montserrat'" }}>
                    <span style={{ width: "34px", color: e.id === idSelecionado ? "#c5a059" : "#8193a8", fontSize: "8.5pt", fontWeight: 800 }}>#{e.numero}</span>
                    <span style={{ flex: 1, minWidth: 0, color: "#f1ead4", fontSize: "8.5pt", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.nome.replace(e.id, "").trim() || e.nome}</span>
                    {e.id === eventoAtual && <span style={{ background: "#c5a059", color: "#0b1320", borderRadius: "4px", padding: "0 5px", fontSize: "6.5pt", fontWeight: 800 }}>ATUAL</span>}
                  </button>
                  <button type="button" onClick={() => alternarOculto(e.id, !e.oculto)} title={e.oculto ? "Oculto para os membros — clique para mostrar" : "Visível — clique para ocultar dos membros"} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px 6px", color: e.oculto ? "#e8806f" : "#5f758e", fontSize: "9pt" }}>
                    <i className={`fa-solid ${e.oculto ? "fa-eye-slash" : "fa-eye"}`}></i>
                  </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* EDITOR */}
        <section style={{ flex: "1 1 600px", minWidth: 0, display: "grid", gap: "14px" }}>
          {!r ? (
            <div style={{ ...estiloCaixa, textAlign: "center", color: "#8193a8", padding: "60px 20px" }}>
              {idSelecionado ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Carregando evento...</> : <><i className="fa-solid fa-arrow-left"></i> Escolha um evento na lista ou crie um novo.</>}
            </div>
          ) : (
            <>
              {/* BARRA DO EVENTO */}
              <div style={{ ...estiloCaixa, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", position: "sticky", top: "80px", zIndex: 5, boxShadow: "0 8px 20px rgba(0, 0, 0, 0.4)" }}>
                <span style={{ background: "rgba(197, 160, 89, 0.15)", color: "#c5a059", borderRadius: "6px", padding: "4px 8px", fontSize: "9pt", fontWeight: 800 }}>{r.id}</span>
                <span style={{ color: "#f1ead4", fontWeight: 800, fontSize: "11pt", flex: 1, minWidth: "160px" }}>
                  {r.nome}
                  {pendente && <span style={{ color: "#f0a040", fontSize: "8.5pt", fontWeight: 700 }}> · {novo ? "novo, ainda não salvo" : "alterações não salvas"}</span>}
                </span>
                {!novo && <button type="button" onClick={() => alternarOculto(r.id, !r.oculto)} title={r.oculto ? "Voltar a mostrar para os membros" : "Esconder dos membros; admin continua vendo"} style={estiloBotao(r.oculto ? "#e8806f" : "#8193a8")}>
                  <i className={`fa-solid ${r.oculto ? "fa-eye-slash" : "fa-eye"}`}></i> {r.oculto ? "Oculto" : "Visível"}
                </button>}
                {!novo && <Link to={`/guia-meta?evento=${encodeURIComponent(r.id)}`} target="_blank" style={{ ...estiloBotao("#8193a8"), textDecoration: "none" }}><i className="fa-solid fa-eye"></i> Ver guia</Link>}
                {!novo && r.id !== eventoAtual && <button type="button" onClick={marcarAtual} style={estiloBotao()}><i className="fa-solid fa-thumbtack"></i> Definir como atual</button>}
                {!novo && <button type="button" onClick={() => setConfirmarExcluir(true)} style={estiloBotao("#e8806f")}><i className="fa-solid fa-trash"></i></button>}
                <button type="button" onClick={salvar} disabled={!pendente || salvando} style={{ ...estiloBotao("#c5a059", pendente), opacity: pendente ? 1 : 0.5, cursor: pendente ? "pointer" : "default" }}>
                  {salvando ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Salvando...</> : <><i className="fa-solid fa-floppy-disk"></i> Salvar</>}
                </button>
              </div>

              {/* IDENTIFICAÇÃO */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}>Identificação</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px" }}>
                  <Campo rotulo="Nome" valor={r.nome} aoMudar={(v) => mudar("nome", v)} dica={`Ex.: "${r.id} GEMINI CUP"`} largura="span 2" />
                  <Campo rotulo="Cenário" valor={r.cenario} aoMudar={(v) => mudar("cenario", v)} />
                  <Campo rotulo="Período especial" valor={r.periodo_especial} aoMudar={(v) => mudar("periodo_especial", v)} />
                </div>
              </div>

              {/* PISTA */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}>Pista</h3>
                <datalist id="lista-hipodromos">{HIPODROMOS.map((h) => <option key={h} value={h} />)}</datalist>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
                  <Campo rotulo="Hipódromo" valor={r.informacoes_pista?.hipodromo} aoMudar={(v) => mudar("informacoes_pista.hipodromo", v)} lista="lista-hipodromos" />
                  <Campo rotulo="Distância" valor={r.informacoes_pista?.distancia} aoMudar={(v) => mudar("informacoes_pista.distancia", v)} dica="Ex.: 2400m" />
                  {Object.entries(OPCOES).map(([chave, opcoes]) => (
                    <Campo key={chave} rotulo={{ tipo_distancia: "Tipo de distância", terreno: "Terreno", direcao: "Direção", estacao: "Estação", clima: "Clima", condicao_pista: "Condição" }[chave]} valor={r.informacoes_pista?.[chave]} aoMudar={(v) => mudar(`informacoes_pista.${chave}`, v)} opcoes={opcoes} />
                  ))}
                </div>
              </div>

              {/* STATUS */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}>Status recomendados</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px" }}>
                  {STATUS.map(([chave, nome, cor]) => (
                    <label key={chave} style={{ display: "block" }}>
                      <span style={{ ...estiloRotulo, color: cor }}>{nome}</span>
                      <input value={r.status_recomendados?.[chave] ?? ""} onChange={(e) => mudar(`status_recomendados.${chave}`, e.target.value)} style={{ ...estiloCampo, borderBottom: `2px solid ${cor}` }} />
                    </label>
                  ))}
                </div>
                <p style={{ color: "#5f758e", fontSize: "7.5pt", margin: "6px 0 14px" }}>Use “+1 Gold” para indicar skill de recover (ex.: 901*+1 Gold). Valores livres: 1500++, 1100+, wip...</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px" }}>
                  <Campo rotulo="Alternativa 1 · recover" valor={r.status_recomendados?.alternativa_1?.rotulo} aoMudar={(v) => mudar("status_recomendados.alternativa_1.rotulo", v)} dica="Ex.: + 1 GOLD" />
                  <Campo rotulo="Alternativa 1 · Stamina" valor={r.status_recomendados?.alternativa_1?.stamina} aoMudar={(v) => mudar("status_recomendados.alternativa_1.stamina", v)} />
                  <Campo rotulo="Alternativa 1 · Guts" valor={r.status_recomendados?.alternativa_1?.guts} aoMudar={(v) => mudar("status_recomendados.alternativa_1.guts", v)} />
                  <Campo rotulo="Alternativa 2 · Stamina" valor={r.status_recomendados?.alternativa_2?.stamina} aoMudar={(v) => mudar("status_recomendados.alternativa_2.stamina", v)} />
                  <Campo rotulo="Alternativa 2 · Guts" valor={r.status_recomendados?.alternativa_2?.guts} aoMudar={(v) => mudar("status_recomendados.alternativa_2.guts", v)} />
                </div>
              </div>

              {/* META */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}>Meta</h3>
                <div style={{ display: "grid", gap: "12px" }}>
                  <Campo rotulo="Ranking de estilos" valor={r.descricao?.ranking_estilos} aoMudar={(v) => mudar("descricao.ranking_estilos", v)} dica="Use > (acima), >> (bem acima), >= (igual ou acima), = (empate). Ex.: Front>>Blaze>=End>Late>Pace" />
                  <Campo rotulo="Descrição curta" valor={r.descricao?.curta} aoMudar={(v) => mudar("descricao.curta", v)} area dica='Para o status secreto, escreva "Secret Stats: Sta and Gut" (Spd, Sta, Pow, Gut, Wit).' />
                  <Campo rotulo="Análise do meta" valor={r.descricao?.analise_meta} aoMudar={(v) => mudar("descricao.analise_meta", v)} area />
                </div>
              </div>

              {/* ESTRATÉGIAS DE COMPOSIÇÃO */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}><i className="fa-solid fa-chess" style={{ color: "#c5a059" }}></i> Estratégias de composição</h3>
                <p style={{ color: "#5f758e", fontSize: "8pt", margin: "-6px 0 12px" }}>Composições de time sugeridas (3 cavalinhas). Aparecem no guia abaixo do META, na ordem daqui. Sem nenhuma, a seção some para os membros.</p>
                <EditorEstrategiasGuia estrategias={r.estrategias ?? []} aoMudar={(lista) => mudar("estrategias", lista)} />
              </div>

              {/* ACELERAÇÕES */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}><i className="fa-solid fa-bolt" style={{ color: "#c5a059" }}></i> Acelerações por estilo</h3>
                <p style={{ color: "#5f758e", fontSize: "8pt", margin: "-6px 0 12px" }}>A ordem é a prioridade mostrada no guia. Enquanto um estilo não tiver skills escolhidas, o guia mostra o texto antigo da planilha.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
                  {ESTILOS_GUIA.map((estilo) => {
                    const lista = r.estilos?.[estilo]?.aceleracoes ?? [];
                    return (
                      <div key={estilo} style={{ background: "#0b1320", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "10px", padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                          <img src={`/assets/img/textures/${estilo.toLowerCase()}.webp`} alt="" style={{ height: "26px" }} />
                          <span style={{ color: "#f1ead4", fontWeight: 800, fontSize: "10pt" }}>{estilo}</span>
                        </div>
                        {r.estilos?.[estilo]?.rec_accel && (
                          <p style={{ margin: "0 0 8px", color: "#8193a8", fontSize: "8pt", lineHeight: 1.4 }}><i className="fa-solid fa-file-lines"></i> Planilha: {r.estilos[estilo].rec_accel}</p>
                        )}
                        <div style={{ display: "grid", gap: "6px", marginBottom: "8px" }}>
                          {lista.map((id, i) => {
                            const sk = catalogoSkillsPorId.get(String(id));
                            return (
                              <div key={id} style={{ display: "flex", alignItems: "center", gap: "8px", background: "#0d1624", border: "1px solid rgba(164, 179, 198, 0.12)", borderRadius: "8px", padding: "5px 8px" }}>
                                <span style={{ minWidth: "20px", height: "20px", borderRadius: "50%", background: "linear-gradient(135deg, #f3d27a, #c5a059)", color: "#0b1320", fontSize: "8pt", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center" }}>{i + 1}</span>
                                {sk && caminhoIconeSkill(sk.iconId) && <img src={caminhoIconeSkill(sk.iconId)} alt="" style={{ width: "22px", height: "22px" }} />}
                                <SkillComDetalhe skillId={id} estilo={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ cursor: "help", minWidth: 0, color: COR_RARIDADE_SKILL[sk?.rarity] ?? "#f1ead4", fontSize: "9pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sk?.nome ?? id}</span>
                                </SkillComDetalhe>
                                <button type="button" title="Subir" disabled={i === 0} onClick={() => moverAceleracao(estilo, i, -1)} style={{ background: "transparent", border: "none", color: i === 0 ? "#3a4a5e" : "#a4b3c6", cursor: i === 0 ? "default" : "pointer" }}><i className="fa-solid fa-chevron-up"></i></button>
                                <button type="button" title="Descer" disabled={i === lista.length - 1} onClick={() => moverAceleracao(estilo, i, 1)} style={{ background: "transparent", border: "none", color: i === lista.length - 1 ? "#3a4a5e" : "#a4b3c6", cursor: i === lista.length - 1 ? "default" : "pointer" }}><i className="fa-solid fa-chevron-down"></i></button>
                                <button type="button" title="Remover" onClick={() => mudarAceleracoes(estilo, (l) => l.filter((x) => x !== id))} style={{ background: "transparent", border: "none", color: "#e8806f", cursor: "pointer" }}><i className="fa-solid fa-xmark"></i></button>
                              </div>
                            );
                          })}
                        </div>
                        <BuscaSkill aoEscolher={(id) => mudarAceleracoes(estilo, (l) => (l.includes(id) ? l : [...l, id]))} ignorar={lista.map(String)} placeholder="Adicionar skill de aceleração..." />
                        <label style={{ display: "block", marginTop: "10px" }}>
                          <span style={estiloRotulo}>Comentário sobre as skills</span>
                          <textarea value={r.estilos?.[estilo]?.comentario_accel ?? ""} onChange={(e) => mudar(`estilos.${estilo}.comentario_accel`, e.target.value)} rows={3} placeholder="Ex.: Seiun só se não houver outro Front na sala." style={{ ...estiloCampo, resize: "vertical" }} />
                        </label>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* PERSONAGENS E DECKS */}
              <div style={estiloCaixa}>
                <h3 style={estiloTitulo}><i className="fa-solid fa-chess-knight" style={{ color: "#c5a059" }}></i> Personagens e decks por estilo</h3>
                <EditorEstilosGuia estilos={r.estilos} aoMudarEstilo={mudarEstilo} />
              </div>
            </>
          )}
        </section>
      </div>

      {/* NOVO EVENTO */}
      {criando && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setCriando(null); }} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(5, 9, 16, 0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ width: "min(440px, 100%)", ...estiloCaixa, padding: "22px", boxShadow: "0 24px 64px rgba(0, 0, 0, 0.65)" }}>
            <h3 style={{ ...estiloTitulo, fontSize: "13pt" }}><i className="fa-solid fa-plus" style={{ color: "#c5a059" }}></i> Novo evento</h3>
            <div style={{ display: "grid", gap: "12px" }}>
              <Campo rotulo="Tipo" valor={criando.tipo} aoMudar={(v) => setCriando((c) => ({ ...c, tipo: v || "Champions Meeting" }))} opcoes={["Champions Meeting", "League of Heroes"]} />
              <Campo rotulo="Número" valor={criando.numero} aoMudar={(v) => setCriando((c) => ({ ...c, numero: v.replace(/\D/g, "") }))} dica={`Vai virar ${criando.tipo === "League of Heroes" ? "LoH" : "CM"} #${criando.numero || "?"}`} />
              <Campo rotulo="Copiar conteúdo de (opcional)" valor={criando.copiarDe} aoMudar={(v) => setCriando((c) => ({ ...c, copiarDe: v ?? "" }))} opcoes={indice.eventos.map((e) => e.id)} dica="Copia pista, status, personagens e decks como ponto de partida." />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "18px" }}>
              <button type="button" onClick={() => setCriando(null)} style={estiloBotao("#8193a8")}>Cancelar</button>
              <button type="button" disabled={!criando.numero} onClick={criar} style={{ ...estiloBotao("#c5a059", true), opacity: criando.numero ? 1 : 0.5 }}>Criar</button>
            </div>
          </div>
        </div>
      )}

      <ModalConfirmacao
        aberto={confirmarExcluir}
        perigo
        icone="fa-trash"
        titulo={`Excluir ${r?.id}?`}
        mensagem="O evento some do guia para todos. As anotações pessoais dos treinadores sobre ele continuam guardadas, mas deixam de aparecer."
        textoConfirmar="Excluir evento"
        aoConfirmar={excluir}
        aoCancelar={() => setConfirmarExcluir(false)}
      />
      <ModalConfirmacao
        aberto={!!confirmarTroca}
        icone="fa-triangle-exclamation"
        titulo="Descartar alterações?"
        mensagem={`Há alterações não salvas em ${r?.id}. Abrir ${confirmarTroca} vai descartá-las.`}
        textoConfirmar="Descartar e abrir"
        aoConfirmar={() => { const id = confirmarTroca; setConfirmarTroca(null); abrir(id); }}
        aoCancelar={() => setConfirmarTroca(null)}
      />
    </main>
  );
}

export default AdminGuiaMeta;
