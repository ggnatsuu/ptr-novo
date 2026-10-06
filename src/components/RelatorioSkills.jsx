// 🎯 src/components/RelatorioSkills.jsx
// Relatório de custo-benefício das skills de uma corredora (Comparador):
// quanto cada skill vale na corrida (simulado: build inteira × build sem ela,
// mesma sorte) e quanto custa em SP em cada nível de dica. Ordena por mais ou
// menos custo-benefício e exporta em PDF (pela impressão do navegador).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { catalogoSkillsPorId, caminhoIconeSkill, COR_RARIDADE_SKILL } from "../utils/skillsPista";
import { custoBuild, DESCONTO_DICA } from "../utils/simulador/custoSkills";
import { fotoCorredora } from "../utils/simulador/corredoras";

const NIVEIS = [0, 1, 2, 3, 4, 5];
const fmtL = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(2)} L`;
const escapar = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function RelatorioSkills({ corredora, unique, contexto, aoFechar }) {
  const [vezes, setVezes] = useState(100);
  const [progresso, setProgresso] = useState(null);
  const [valores, setValores] = useState(null);
  const [erro, setErro] = useState(null);
  const [ordem, setOrdem] = useState("mais"); // "mais" | "menos"
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);

  const compraveis = corredora.skills.filter((id) => catalogoSkillsPorId.has(id));

  function gerar() {
    worker.current?.terminate();
    const w = new Worker(new URL("../utils/simulador/comparador.worker.js", import.meta.url), { type: "module" });
    worker.current = w;
    setErro(null);
    setValores(null);
    setProgresso(0);
    w.onmessage = ({ data }) => {
      if (data.tipo === "progresso") setProgresso(data.feito / data.total);
      if (data.tipo === "fim") { setValores(data.resultado); setProgresso(null); w.terminate(); }
      if (data.tipo === "erro") { setErro(data.mensagem); setProgresso(null); w.terminate(); }
    };
    w.postMessage({
      tipo: "valorSkills",
      courseId: contexto.courseId,
      condicoes: contexto.condicoes,
      ajustes: contexto.ajustes,
      corredora: { ...corredora, skills: [...new Set([unique, ...corredora.skills].filter(Boolean))] },
      skills: compraveis,
      vezes,
      semente: contexto.semente,
    });
  }

  const linhas = useMemo(() => {
    if (!valores) return [];
    const dicas = corredora.dicas ?? {};
    const custoNoNivel = (id, nivel, kiremono = !!corredora.kiremono) => custoBuild({ skills: corredora.skills, dicas: { ...dicas, [id]: nivel }, kiremono }).itens.find((i) => i.id === id);
    const lista = compraveis.map((id) => {
      const s = catalogoSkillsPorId.get(id);
      const custos = NIVEIS.map((n) => custoNoNivel(id, n)?.custo ?? 0);
      // mesma conta com o Fast Learner invertido (pra linha de total de comparação)
      const custosOutroFL = NIVEIS.map((n) => custoNoNivel(id, n, !corredora.kiremono)?.custo ?? 0);
      const nivelAtual = dicas[id] ?? 0;
      const custoAtual = custos[nivelAtual];
      const v = valores[id] ?? { valor: 0, taxa: 0 };
      return {
        id, nome: s.nome, iconId: s.iconId, rarity: s.rarity,
        valor: v.valor, taxa: v.taxa, custos, custosOutroFL, nivelAtual, custoAtual,
        inclui: custoNoNivel(id, nivelAtual)?.inclui ?? [],
        cb: custoAtual > 0 ? (v.valor / custoAtual) * 100 : null,
      };
    });
    const chave = (l) => (l.cb == null ? -Infinity : l.cb);
    return lista.sort((a, b) => (ordem === "mais" ? chave(b) - chave(a) : chave(a) - chave(b)));
  }, [valores, ordem, corredora, compraveis]);

  const total = linhas.reduce((s, l) => s + l.custoAtual, 0);
  const valorTotal = linhas.reduce((s, l) => s + l.valor, 0);
  // Totais da build inteira se TODAS as skills tivessem o mesmo nível de dica
  const somaCol = (campo) => NIVEIS.map((n) => linhas.reduce((s, l) => s + l[campo][n], 0));
  const totais = somaCol("custos");
  const totaisOutroFL = somaCol("custosOutroFL");
  const rotuloOutroFL = corredora.kiremono ? "Total sem Fast Learner" : "Total com Fast Learner (−10%)";
  const cbTotal = total > 0 ? (valorTotal / total) * 100 : null;
  const ranqueadas = [...linhas].filter((l) => l.cb != null).sort((a, b) => b.cb - a.cb);
  const top = new Set(ranqueadas.slice(0, 3).map((l) => l.id));
  const piores = new Set(ranqueadas.slice(-3).map((l) => l.id));

  // Onde buscar dica: só nas skills que valem a pena (≥ 0,2 L), ordenadas pelo
  // SP que a dica economiza (sem dica → Lv5). Terço de cima = Alta, meio = Média.
  const VALE_MINIMO = 0.2;
  const comEconomia = linhas.map((l) => ({ ...l, economia5: l.custos[0] - l.custos[5], economia3: l.custos[0] - l.custos[3] }));
  const elegiveis = comEconomia.filter((l) => l.valor >= VALE_MINIMO && l.economia5 > 0).sort((a, b) => b.economia5 - a.economia5 || b.valor - a.valor);
  const prioridade = new Map(comEconomia.map((l) => [l.id, "nao"]));
  elegiveis.forEach((l, i) => prioridade.set(l.id, i < Math.ceil(elegiveis.length / 3) ? "alta" : i < Math.ceil((elegiveis.length * 2) / 3) ? "media" : "baixa"));
  const ROTULO_PRIORIDADE = { alta: "Alta", media: "Média", baixa: "Baixa", nao: "Não vale" };
  const ondeBuscarDica = elegiveis.slice(0, 5);
  const economiaTopo = ondeBuscarDica.reduce((s, l) => s + l.economia5, 0);

  // PDF no visual da PTR (fundo escuro, dourado, Cinzel). As cores saem na
  // impressão por causa do print-color-adjust: exact.
  function exportarPdf() {
    const origem = window.location.origin;
    const url = (caminho) => (caminho ? `${origem}${caminho}` : "");
    const foto = corredora.outfitId ? url(fotoCorredora(corredora.outfitId)) : "";
    const maiorCb = Math.max(...linhas.map((l) => l.cb ?? 0), 0.0001);
    const corRaridade = (r) => COR_RARIDADE_SKILL[r] ?? "#f1ead4";
    const hoje = new Date().toLocaleDateString("pt-BR");

    const linhasHtml = linhas.map((l, i) => {
      const classe = top.has(l.id) ? "top" : piores.has(l.id) ? "pior" : "";
      const selo = top.has(l.id) ? '<span class="selo bom">MELHOR</span>' : piores.has(l.id) ? '<span class="selo ruim">PIOR</span>' : "";
      const larg = l.cb == null ? 0 : Math.max(2, (l.cb / maiorCb) * 100);
      return `
      <tr class="${classe}">
        <td class="pos">${i + 1}</td>
        <td class="nome">
          <div class="skill">
            ${l.iconId ? `<img src="${url(caminhoIconeSkill(l.iconId))}" alt="">` : ""}
            <div><span style="color:${corRaridade(l.rarity)}">${escapar(l.nome)}</span> ${selo}
            ${l.inclui.length ? `<small>inclui ${l.inclui.map((p) => escapar(p.nome)).join(", ")}</small>` : ""}</div>
          </div>
        </td>
        <td class="vale">${fmtL(l.valor)}</td>
        <td>${Math.round(l.taxa * 100)}%</td>
        ${l.custos.map((c, n) => `<td class="${n === l.nivelAtual ? "atual" : ""}">${c}</td>`).join("")}
        <td class="cb"><div class="barra"><i style="width:${larg}%"></i><b>${l.cb == null ? "—" : l.cb.toFixed(2)}</b></div></td>
        <td><span class="prio ${prioridade.get(l.id)}">${ROTULO_PRIORIDADE[prioridade.get(l.id)]}</span></td>
      </tr>`;
    }).join("");

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório de skills — ${escapar(corredora.nome || "Corredora")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Montserrat:wght@500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; background: #0b1320; color: #f1ead4; font-family: Montserrat, Arial, sans-serif; }
  body { padding: 22px 26px; }
  .topo { display: flex; align-items: center; gap: 16px; padding: 14px 18px; border: 1px solid rgba(197,160,89,.45); border-radius: 14px;
          background: linear-gradient(120deg, rgba(197,160,89,.16), #0d1624 55%); }
  .topo .logo { width: 54px; height: 54px; border-radius: 10px; }
  .topo .foto { width: 64px; height: 64px; border-radius: 12px; object-fit: cover; border: 2px solid rgba(197,160,89,.6); background: #0d1624; }
  .topo .titulos { flex: 1; min-width: 0; }
  .sobre { color: #c5a059; font-size: 7.5pt; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
  h1 { font-family: Cinzel, serif; font-size: 19pt; margin: 2px 0 4px; color: #f1ead4; }
  .linha { color: #a4b3c6; font-size: 9pt; font-weight: 600; }
  .linha strong { color: #f1ead4; }
  .data { text-align: right; color: #8193a8; font-size: 8pt; font-weight: 700; }
  .cartoes { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
  .cartao { background: #0d1624; border: 1px solid rgba(164,179,198,.14); border-radius: 10px; padding: 9px 12px; }
  .cartao span { display: block; color: #8193a8; font-size: 7pt; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
  .cartao strong { font-size: 14pt; color: #f3d27a; }
  .cartao small { color: #8193a8; font-size: 7.5pt; font-weight: 600; margin-left: 4px; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 8.6pt; border: 1px solid rgba(164,179,198,.14); border-radius: 12px; overflow: hidden; }
  thead th { background: #0d1624; color: #c5a059; font-size: 7pt; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 9px 7px; text-align: right; border-bottom: 2px solid rgba(197,160,89,.5); }
  thead th.esq { text-align: left; }
  tbody td { padding: 6px 7px; text-align: right; border-bottom: 1px solid rgba(164,179,198,.08); font-variant-numeric: tabular-nums; color: #c9d3df; }
  tbody tr:nth-child(even) td { background: rgba(255,255,255,.018); }
  td.pos { text-align: center; color: #5f758e; font-weight: 800; width: 26px; }
  td.nome { text-align: left; }
  .skill { display: flex; align-items: center; gap: 8px; }
  .skill img { width: 22px; height: 22px; }
  .skill span { font-weight: 700; }
  .skill small { display: block; color: #5f758e; font-size: 6.8pt; font-weight: 600; }
  td.vale { color: #f1ead4; font-weight: 700; }
  td.atual { background: rgba(197,160,89,.16) !important; color: #f3d27a; font-weight: 800; }
  td.cb { width: 120px; }
  .barra { position: relative; height: 16px; background: #0d1624; border-radius: 5px; overflow: hidden; }
  .barra i { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, rgba(197,160,89,.35), #c5a059); }
  .barra b { position: relative; display: block; padding-right: 6px; line-height: 16px; color: #f1ead4; font-size: 8pt; }
  tr.top .barra i { background: linear-gradient(90deg, rgba(127,208,138,.35), #7fd08a); }
  tr.pior .barra i { background: linear-gradient(90deg, rgba(232,128,111,.35), #e8806f); }
  tr.top td.pos { box-shadow: inset 3px 0 0 #7fd08a; color: #7fd08a; }
  tr.pior td.pos { box-shadow: inset 3px 0 0 #e8806f; color: #e8806f; }
  .selo { font-size: 6pt; font-weight: 900; letter-spacing: .8px; padding: 1px 5px; border-radius: 4px; margin-left: 4px; vertical-align: middle; }
  .selo.bom { background: rgba(127,208,138,.18); color: #7fd08a; } .selo.ruim { background: rgba(232,128,111,.18); color: #e8806f; }
  tfoot td { padding: 8px 7px; text-align: right; font-weight: 800; }
  tfoot tr.total td { background: rgba(197,160,89,.16); color: #f3d27a; border-top: 2px solid rgba(197,160,89,.55); }
  tfoot tr.total td.nome small { display: block; color: #a4b3c6; font-size: 6.8pt; font-weight: 600; }
  tfoot tr.alt td { background: #0d1624; color: #a4b3c6; font-weight: 700; }
  tfoot td.nome { text-align: left; }
  .dicas { background: #0d1624; border: 1px solid rgba(243,210,122,.35); border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; }
  .dicas-titulo { color: #f3d27a; font-size: 9pt; font-weight: 800; margin-bottom: 8px; }
  .dicas-titulo small { color: #8193a8; font-weight: 600; font-size: 7.5pt; margin-left: 6px; }
  .dicas-lista { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .dica { display: flex; align-items: center; gap: 6px; background: #0b1320; border-radius: 8px; padding: 6px 8px; }
  .dica .n { width: 18px; height: 18px; border-radius: 50%; background: #c5a059; color: #0b1320; font-size: 7.5pt; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .dica img { width: 20px; height: 20px; }
  .dica strong { display: block; font-size: 8pt; color: #f1ead4; }
  .dica small { color: #7fd08a; font-size: 6.8pt; font-weight: 700; }
  .prio { font-size: 6.8pt; font-weight: 900; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
  .prio.alta { background: rgba(127,208,138,.2); color: #7fd08a; } .prio.media { background: rgba(243,210,122,.18); color: #f3d27a; }
  .prio.baixa { background: rgba(164,179,198,.14); color: #a4b3c6; } .prio.nao { color: #5f758e; }
  .rodape { display: flex; justify-content: space-between; gap: 20px; margin-top: 12px; color: #5f758e; font-size: 7pt; line-height: 1.5; }
  .rodape b { color: #c5a059; }
  @page { size: A4 landscape; margin: 0; }
</style></head><body>
  <div class="topo">
    <img class="logo" src="${url("/assets/img/logo1.png")}" alt="">
    ${foto ? `<img class="foto" src="${foto}" alt="">` : ""}
    <div class="titulos">
      <div class="sobre">Ferramentas · Comparador · Relatório de skills</div>
      <h1>${escapar(corredora.nome || "Corredora")}</h1>
      <div class="linha"><strong>${escapar(corredora.estrategia)}</strong> · ${escapar(contexto.percursoTexto)}${corredora.kiremono ? " · <strong>Fast Learner</strong>" : ""}</div>
    </div>
    <div class="data">PocoLord's Twinkles Road<br>${hoje}</div>
  </div>

  <div class="cartoes">
    <div class="cartao"><span>Custo na dica marcada</span><strong>${total}</strong><small>SP</small></div>
    <div class="cartao"><span>Valor somado das skills</span><strong>${fmtL(valorTotal)}</strong></div>
    <div class="cartao"><span>Custo-benefício da build</span><strong>${cbTotal == null ? "—" : cbTotal.toFixed(2)}</strong><small>L / 100 SP</small></div>
    <div class="cartao"><span>Skills avaliadas</span><strong>${linhas.length}</strong><small>${vezes} corridas cada</small></div>
  </div>

  ${ondeBuscarDica.length ? `
  <div class="dicas">
    <div class="dicas-titulo">💡 Onde buscar dica primeiro <small>skills que valem a pena e onde a dica economiza mais SP · juntas economizam até ${economiaTopo} SP</small></div>
    <div class="dicas-lista">${ondeBuscarDica.map((l, i) => `
      <div class="dica"><span class="n">${i + 1}</span>${l.iconId ? `<img src="${url(caminhoIconeSkill(l.iconId))}" alt="">` : ""}
        <div><strong>${escapar(l.nome)}</strong><small>−${l.economia3} SP até Lv3 · −${l.economia5} até Lv5</small></div></div>`).join("")}
    </div>
  </div>` : ""}

  <table>
    <thead><tr>
      <th>#</th><th class="esq">Skill</th><th>Vale</th><th>Ativa</th>
      ${NIVEIS.map((n) => `<th>${n ? `Lv${n}<br>−${Math.round(DESCONTO_DICA[n] * 100)}%` : "Sem<br>dica"}</th>`).join("")}
      <th>L / 100 SP</th><th>Dica</th>
    </tr></thead>
    <tbody>${linhasHtml}</tbody>
    <tfoot>
      <tr class="total"><td></td><td class="nome">Total${corredora.kiremono ? " (com Fast Learner)" : ""}<small>se todas tivessem esse nível de dica · na dica marcada: ${total} SP</small></td><td>${fmtL(valorTotal)}</td><td></td>${totais.map((t) => `<td>${t}</td>`).join("")}<td>${cbTotal == null ? "—" : cbTotal.toFixed(2)}</td><td></td></tr>
      <tr class="alt"><td></td><td class="nome">${rotuloOutroFL}</td><td></td><td></td>${totaisOutroFL.map((t) => `<td>${t}</td>`).join("")}<td></td><td></td></tr>
    </tfoot>
  </table>

  <div class="rodape">
    <span>Ordem: <b>${ordem === "mais" ? "mais" : "menos"} custo-benefício</b> primeiro. <b>Vale</b> = comprimentos que a skill rende (build inteira × sem ela, mesma sorte). Custo em dourado = nível de dica marcado. Custos já incluem a branca que a dourada exige. <b>Dica</b> = prioridade de buscar dica (economia de SP nas skills que rendem ≥ 0,2 L).</span>
    <span>Simulação: honse-sim (GPL-3.0) + dados do alpha123 · estimativa</span>
  </div>
  <script>
    // espera fontes e imagens antes de abrir a impressão
    window.onload = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => window.print(), 300));
  </script>
</body></html>`;
    const janela = window.open("", "_blank");
    if (!janela) { setErro("O navegador bloqueou a janela do PDF. Libere pop-ups pra este site."); return; }
    janela.document.write(html);
    janela.document.close();
  }

  return createPortal(
    <div className="cmp-modal-fundo" onClick={aoFechar}>
      <div className="cmp-modal cmp-relatorio" onClick={(e) => e.stopPropagation()}>
        <div className="cmp-modal-topo">
          <div>
            <strong>Custo-benefício das skills</strong>
            <small>{corredora.nome || "Corredora"} · {contexto.percursoTexto} · {compraveis.length} skills compráveis</small>
          </div>
          <button type="button" onClick={aoFechar} title="Fechar"><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="cmp-relatorio-corpo">
          {!valores && (
            <div className="cmp-relatorio-gerar">
              <p className="cmp-sub" style={{ margin: 0 }}>
                Pra cada skill, o site roda a corrida com a build inteira e sem ela (mesma sorte) e mede quantos comprimentos ela vale. Depois cruza com o custo em SP de cada nível de dica.
              </p>
              {progresso !== null ? (
                <div className="cmp-acoes" style={{ justifyContent: "flex-start" }}>
                  <div className="cmp-progresso"><div style={{ width: `${(progresso * 100).toFixed(0)}%` }}></div></div>
                  <span className="cmp-progresso-texto">{Math.round(progresso * compraveis.length)} / {compraveis.length} skills</span>
                </div>
              ) : (
                <div className="cmp-acoes" style={{ justifyContent: "flex-start" }}>
                  <div className="cmp-pilulas">
                    {[[100, "100 corridas"], [300, "300 (mais preciso)"]].map(([v, r]) => (
                      <button key={v} type="button" className={vezes === v ? "ativo" : ""} onClick={() => setVezes(v)}>{r}</button>
                    ))}
                  </div>
                  <button type="button" className="cmp-btn-principal" onClick={gerar} disabled={!compraveis.length}>
                    <i className="fa-solid fa-play"></i> Gerar relatório
                  </button>
                </div>
              )}
              {!compraveis.length && <p className="cmp-aviso">Essa corredora não tem skills compráveis (a unique não entra).</p>}
            </div>
          )}

          {valores && (
            <>
              <div className="cmp-relatorio-barra">
                <div className="cmp-pilulas">
                  <button type="button" className={ordem === "mais" ? "ativo" : ""} onClick={() => setOrdem("mais")}><i className="fa-solid fa-arrow-down-wide-short"></i> Mais custo-benefício</button>
                  <button type="button" className={ordem === "menos" ? "ativo" : ""} onClick={() => setOrdem("menos")}><i className="fa-solid fa-arrow-up-wide-short"></i> Menos custo-benefício</button>
                </div>
                <span className="cmp-sp"><strong>{total}</strong> SP · vale {fmtL(valorTotal)}</span>
                <button type="button" className="cmp-btn-discreto" onClick={gerar}><i className="fa-solid fa-rotate"></i> Recalcular</button>
                <button type="button" className="cmp-btn-principal" onClick={exportarPdf}><i className="fa-solid fa-file-pdf"></i> Exportar PDF</button>
              </div>
              {ondeBuscarDica.length > 0 && (
                <div className="rel-dicas">
                  <div className="rel-dicas-titulo"><i className="fa-solid fa-lightbulb"></i> Onde buscar dica primeiro <small>skills que valem a pena e onde a dica economiza mais SP · juntas economizam até {economiaTopo} SP</small></div>
                  <div className="rel-dicas-lista">
                    {ondeBuscarDica.map((l, i) => (
                      <div key={l.id} className="rel-dica-item">
                        <span className="rel-dica-pos">{i + 1}</span>
                        {l.iconId && <img src={caminhoIconeSkill(l.iconId)} alt="" />}
                        <span className="rel-dica-texto">
                          <strong>{l.nome}</strong>
                          <small>−{l.economia3} SP até Lv3 · −{l.economia5} SP até Lv5 · vale {fmtL(l.valor)}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="cmp-relatorio-tabela">
                <table className="cmp-tabela">
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Skill</th>
                      <th>Vale</th>
                      <th>Ativa</th>
                      {NIVEIS.map((n) => <th key={n}>{n ? `Lv${n}` : "Sem dica"}</th>)}
                      <th>L / 100 SP</th>
                      <th>Dica</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr key={l.id} className={top.has(l.id) ? "rel-top" : piores.has(l.id) ? "rel-pior" : ""}>
                        <td>
                          <span className="cmp-skill-nome">
                            {l.iconId && <img src={caminhoIconeSkill(l.iconId)} alt="" />}
                            <span style={{ color: COR_RARIDADE_SKILL[l.rarity] ?? "#f1ead4" }}>{l.nome}</span>
                          </span>
                          {l.inclui.length > 0 && <small className="rel-inclui">inclui {l.inclui.map((p) => p.nome).join(", ")}</small>}
                        </td>
                        <td>{fmtL(l.valor)}</td>
                        <td>{Math.round(l.taxa * 100)}%</td>
                        {l.custos.map((c, n) => <td key={n} className={n === l.nivelAtual ? "rel-atual" : ""}>{c}</td>)}
                        <td className="rel-cb">{l.cb == null ? "—" : l.cb.toFixed(2)}</td>
                        <td><span className={`rel-prioridade ${prioridade.get(l.id)}`} title={`Dica economiza ${l.custos[0] - l.custos[5]} SP (até Lv5)`}>{ROTULO_PRIORIDADE[prioridade.get(l.id)]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="rel-total">
                      <td>Total {corredora.kiremono ? "(com Fast Learner)" : ""}<small className="rel-inclui" style={{ marginLeft: 0 }}>se todas tivessem esse nível de dica · na dica marcada: {total} SP</small></td>
                      <td>{fmtL(valorTotal)}</td>
                      <td></td>
                      {totais.map((t, n) => <td key={n}>{t}</td>)}
                      <td className="rel-cb">{cbTotal == null ? "—" : cbTotal.toFixed(2)}</td>
                      <td></td>
                    </tr>
                    <tr className="rel-total rel-total-alt">
                      <td>{rotuloOutroFL}</td>
                      <td></td>
                      <td></td>
                      {totaisOutroFL.map((t, n) => <td key={n}>{t}</td>)}
                      <td></td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="cmp-sub">"Vale" = comprimentos que a skill rende na corrida. O custo em destaque é o nível de dica que você marcou, e é ele que entra no "L / 100 SP". Verde = 3 melhores compras, vermelho = 3 piores. "Dica" = prioridade de buscar dica: Alta/Média/Baixa pela economia de SP, só nas skills que rendem pelo menos 0,2 L.</p>
            </>
          )}
          {erro && <p className="cmp-aviso"><i className="fa-solid fa-circle-exclamation"></i> {erro}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

export default RelatorioSkills;
