// 🎯 src/utils/simulador/lerLoja.js
// Lê prints da loja de skills da carreira (tela "Learn") com OCR no navegador
// (Tesseract.js, carregado só quando alguém usa) e devolve as skills com o
// custo que aparece na loja (já com dica e Fast Learner) e o SP disponível.
//
// Cada cartão da loja: nome (1ª linha) · descrição · custo na caixinha à
// direita · etiqueta laranja "Hint Lvl N / X% OFF!" em cima do custo.
// Cada print é lido 2 vezes: modo "texto espalhado" (nomes limpos) e modo
// normal (custos e etiquetas); as duas leituras se juntam pela posição.

import { catalogoSkills } from "../skillsPista";
import { custoUnitario, preRequisito } from "./custoSkills";

// ---------------------------------------------------------------- nomes
const normalizar = (t) => t.toLowerCase().replace(/[○◎×☆★♪♡]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
// pedaços da etiqueta de dica que às vezes grudam na linha do nome
const limparEtiqueta = (t) => t.replace(/hint\s*lv[l1i]?\s*\d/gi, " ").replace(/\d{2}\s*%\s*off!?/gi, " ");

function distancia(a, b) {
  const m = a.length, n = b.length;
  let ant = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const atual = [i];
    for (let j = 1; j <= n; j += 1) atual[j] = Math.min(ant[j] + 1, atual[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = atual;
  }
  return ant[n];
}
const semelhanca = (a, b) => 1 - distancia(a, b) / Math.max(a.length, b.length, 1);

// nome normalizado → ids (○ e ◎ da mesma skill caem no mesmo nome; o custo desempata)
let porNome = null;
function indiceNomes(catalogo) {
  const mapa = new Map();
  catalogo.forEach((s) => {
    // skill negativa (×) não é vendida na loja e tem o mesmo nome da ○
    if (s.nome.includes("×")) return;
    const k = normalizar(s.nome);
    if (k) mapa.set(k, [...(mapa.get(k) ?? []), s.id]);
  });
  return mapa;
}

function acharNome(texto, mapa) {
  const alvo = normalizar(limparEtiqueta(texto));
  if (alvo.length < 3 || alvo.length > 48) return null;
  // ○/◎ costuma virar "o"/"0" no fim da linha: compara com e sem esse resto
  const semSimbolo = alvo.replace(/\s+[o0@c]$/, "");
  const ranking = [];
  for (const k of mapa.keys()) {
    if (Math.abs(k.length - semSimbolo.length) > Math.max(4, k.length * 0.35)) continue;
    ranking.push({ k, s: Math.max(semelhanca(alvo, k), semelhanca(semSimbolo, k)) });
  }
  ranking.sort((a, b) => b.s - a.s);
  const melhor = ranking[0];
  if (melhor && melhor.s >= 0.84) {
    // nomes parecidos viram opção na caixa de dúvida
    const parecidas = ranking.slice(1, 5).filter((r) => r.s >= 0.6).flatMap((r) => mapa.get(r.k));
    return { ids: mapa.get(melhor.k), semelhanca: melhor.s, parecidas };
  }
  return null;
}

// ---------------------------------------------------------------- custo esperado
// Testa as combinações possíveis (dica lida, Fast Learner, com ou sem a branca
// incluída) e diz se o custo lido bate com a skill.
// O nível de dica vem da etiqueta laranja; se ela não foi lida, sai do próprio
// custo (180 numa skill de 200 = −10%). Fast Learner por último (Lv1 e Fast
// Learner dão o mesmo −10%: fica como dica).
function conferirCusto(id, custoLido, dicaLida, custo = custoUnitario, preReq = preRequisito) {
  const pre = preReq(id);
  const niveis = dicaLida != null ? [dicaLida] : [0, 1, 2, 3, 4, 5];
  const opcoes = [];
  for (const fl of [false, true]) {
    for (const d of niveis) {
      opcoes.push({ custo: custo(id, d, fl), fl, dica: d });
      if (pre) opcoes.push({ custo: custo(id, d, fl) + custo(pre, 0, fl), fl, dica: d });
    }
  }
  const exato = opcoes.find((o) => o.custo === custoLido);
  if (exato) return exato;
  // OCR às vezes junta um símbolo ao número ("920" no lugar de 90): aceita o
  // custo esperado se os dígitos dele aparecem em ordem dentro do lido.
  const lido = String(custoLido);
  // Também o contrário: um dígito engolido ("12" no lugar de 112).
  const contido = (curto, longo) => { let i = 0; for (const ch of longo) if (ch === curto[i]) i += 1; return i === curto.length; };
  const corrigido = opcoes.find((o) => {
    const esperado = String(o.custo);
    if (lido.length > esperado.length) return contido(esperado, lido);
    return dicaLida != null && lido.length === esperado.length - 1 && lido.length >= 2 && contido(lido, esperado);
  });
  return corrigido ? { ...corrigido, corrigido: true } : null;
}

// "10% OFF" → Lv1 ... "40% OFF" → Lv5
const NIVEL_POR_DESCONTO = { 10: 1, 20: 2, 30: 3, 35: 4, 40: 5 };

// ---------------------------------------------------------------- interpretação (pura)
// linhas = [{ text, bbox: {x0,y0,x1,y1}, words: [{ text, bbox }] }] de UMA imagem.
// opcoes (pra teste fora do navegador): { catalogo, custo, preReq }
export function interpretarLoja(linhasNomes, linhasNumeros = linhasNomes, opcoes = {}) {
  const mapa = opcoes.catalogo ? indiceNomes(opcoes.catalogo) : (porNome ??= indiceNomes(catalogoSkills));
  const nomes = [];
  const numeros = [];
  const dicas = [];
  let skillPoints = null;

  const todas = [...linhasNumeros.map((l) => ({ ...l, fonte: "n" })), ...linhasNomes.map((l) => ({ ...l, fonte: "t" }))];
  for (const l of todas) {
    const texto = (l.text ?? "").trim();
    if (!texto) continue;
    const sp = texto.match(/skill\s*points\D{0,4}(\d{1,5})/i);
    if (sp) { skillPoints = Number(sp[1]); continue; }
    const h = l.bbox.y1 - l.bbox.y0;
    const dica = texto.match(/(?:hint|lvl)\D{0,6}?(\d|max)/i);
    const pct = texto.match(/(\d{2})\s*%\s*off/i);
    if (dica) dicas.push({ nivel: /max/i.test(dica[1]) ? 5 : Number(dica[1]), bbox: l.bbox });
    else if (pct && NIVEL_POR_DESCONTO[pct[1]]) dicas.push({ nivel: NIVEL_POR_DESCONTO[pct[1]], bbox: l.bbox });
    if (l.fonte === "t") {
      const achado = acharNome(texto, mapa);
      if (achado && !nomes.some((n) => Math.abs(n.bbox.y0 - l.bbox.y0) < h)) nomes.push({ ...achado, bbox: l.bbox, h, texto });
      continue;
    }
    if (/hint|lvl|off|skill\s*pts|went\s*up/i.test(texto)) continue; // etiqueta de dica e Log não têm custo
    for (const w of l.words ?? []) {
      if (/%/.test(w.text)) continue;
      const t = w.text.replace(/[^\d]/g, "");
      if (/^\d{2,4}$/.test(t) && w.text.replace(/[\d\s]/g, "").length <= 1) numeros.push({ valor: Number(t), bbox: w.bbox });
    }
  }

  // caixas de custo (linha curta à direita, entre os botões − e +): quando o
  // número não sai na leitura geral, ela é relida sozinha, só com dígitos
  const caixas = [...linhasNumeros, ...linhasNomes]
    .filter((l) => !/hint|lvl|off|skill/i.test(l.text ?? ""))
    .map((l) => l.bbox);

  nomes.sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const itens = nomes.map((nome, i) => {
    const limite = nomes[i + 1]?.bbox.y0 ?? Infinity;
    const naFaixa = (b) => b.x0 > nome.bbox.x0 + nome.h * 6 && b.x0 < nome.bbox.x0 + nome.h * 26 && b.y0 >= nome.bbox.y0 - nome.h && b.y0 < limite;
    // custo: número bem à direita do nome, entre este nome e o próximo
    const custo = numeros.filter((n) => naFaixa(n.bbox)).sort((a, b) => a.bbox.y0 - b.bbox.y0)[0];
    // dica: etiqueta acima do custo (ou na linha do nome), alinhada com ele
    const caixa = caixas.find((b) => naFaixa(b) && b.x1 - b.x0 < nome.h * 12 && b.y1 - b.y0 > nome.h);
    const ref = custo?.bbox ?? caixa;
    const dica = ref
      ? dicas.find((d) => d.bbox.y1 <= ref.y0 + nome.h && d.bbox.y0 >= nome.bbox.y0 - nome.h * 2.5
          && Math.abs((d.bbox.x0 + d.bbox.x1) / 2 - (ref.x0 + ref.x1) / 2) < nome.h * 10)
      : null;
    const item = resolverItem({ ids: nome.ids, parecidas: nome.parecidas, lido: nome.texto, semelhanca: nome.semelhanca, dicaLida: dica?.nivel ?? null }, custo?.valor ?? null, opcoes);
    // faixa do cartão no print (pro recorte da caixa de dúvida)
    item.faixa = { top: Math.max(0, nome.bbox.y0 - nome.h), bottom: Math.min(limite, nome.bbox.y0 + nome.h * 6) - nome.h * 0.3 };
    // miolo da caixa (sem os botões), pra reler se precisar
    if (caixa) {
      const larg = caixa.x1 - caixa.x0;
      item.caixa = { left: Math.round(caixa.x0 + larg * 0.27), top: caixa.y0, width: Math.round(larg * 0.46), height: caixa.y1 - caixa.y0 };
    }
    return item;
  });
  return { itens, skillPoints };
}

// ○/◎ (ou nomes repetidos): fica o id cujo custo bate.
export function resolverItem(base, custoLido, opcoes = {}) {
  let id = base.ids[0];
  let conferido = null;
  let batem = 0;
  if (custoLido != null) {
    for (const candidato of base.ids) {
      const c = conferirCusto(candidato, custoLido, base.dicaLida, opcoes.custo, opcoes.preReq);
      if (c) { batem += 1; if (!conferido) { id = candidato; conferido = c; } }
    }
  }
  const alternativas = [...new Set([...base.ids, ...(base.parecidas ?? [])])];
  return {
    alternativas,
    // dúvida sobre QUAL skill é: nome lido meio torto, mais de uma skill serve
    // pelo custo, ou o custo não bate e existe outra opção parecida
    duvida: base.semelhanca < 0.93 || batem > 1 || (!conferido && alternativas.length > 1),
    ...base,
    id,
    custoLido,
    custo: conferido?.custo ?? custoLido,
    dica: conferido?.dica ?? base.dicaLida ?? 0,
    ok: !!conferido,
    corrigido: !!conferido?.corrigido,
    fastLearner: conferido?.fl ?? false,
  };
}

// ---------------------------------------------------------------- OCR
// Lê UMA imagem com um worker do Tesseract já criado.
// imagem: { original, contraste, largura, altura }. "contraste" é a mesma imagem
// em preto e branco (sem ela os cartões cinzas, de skill que o SP não paga,
// somem). largura/altura servem pro print do PC (tela inteira): aí só a metade
// esquerda (painel Learn) importa.
export async function lerUmaImagem(worker, { original, contraste, largura, altura }, opcoes = {}) {
  const paisagem = largura >= 1280 && largura / altura > 1.6; // tela inteira do PC (16:9)
  const area = paisagem ? { left: 0, top: 0, width: Math.round(largura * 0.52), height: altura } : undefined;
  const ler = async (img, modo, extra = {}, retangulo = area) => {
    await worker.setParameters({ tessedit_pageseg_mode: modo, tessedit_char_whitelist: "", ...extra });
    const { data } = await worker.recognize(img, retangulo ? { rectangle: retangulo } : {}, { blocks: true });
    return { linhas: (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines)), texto: data.text ?? "" };
  };
  const fontes = [original, contraste].filter(Boolean);
  const nomes = [];
  const numeros = [];
  for (const img of fontes) {
    nomes.push(...(await ler(img, "11")).linhas); // texto espalhado: nomes limpos
    numeros.push(...(await ler(img, "3")).linhas); // normal: custos e etiquetas
  }
  const r = interpretarLoja(nomes, numeros, opcoes);
  // custos que não saíram: relê só o miolo da caixinha, só dígitos
  for (let i = 0; i < r.itens.length; i += 1) {
    for (const img of fontes) {
      const item = r.itens[i];
      if (item.ok || !item.caixa) break;
      const { texto } = await ler(img, "7", { tessedit_char_whitelist: "0123456789" }, item.caixa);
      const valor = Number(texto.replace(/\D/g, "")) || null;
      if (!valor) continue;
      const novo = resolverItem(item, valor, opcoes);
      if (novo.ok || item.custoLido == null) r.itens[i] = { ...novo, caixa: item.caixa, faixa: item.faixa };
    }
  }
  await worker.setParameters({ tessedit_char_whitelist: "" });
  return r;
}

// Abre o print, mede e gera a versão em preto e branco (limiar de brilho).
async function prepararImagem(arquivo) {
  try {
    const bmp = await createImageBitmap(arquivo);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    // recorte colorido de um cartão (mostrado quando o site fica em dúvida)
    const largura = bmp.width;
    const recortar = ({ top, bottom }, ate = largura) => {
      const alto = Math.max(10, Math.round(bottom - top));
      const c = document.createElement("canvas");
      const escala = Math.min(1, 420 / ate);
      c.width = Math.round(ate * escala);
      c.height = Math.round(alto * escala);
      c.getContext("2d").drawImage(bmp, 0, Math.round(top), ate, alto, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.8);
    };
    const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const p = dados.data;
    for (let i = 0; i < p.length; i += 4) {
      const v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] < 90 ? 0 : 255;
      p[i] = v; p[i + 1] = v; p[i + 2] = v;
    }
    ctx.putImageData(dados, 0, 0);
    return { original: arquivo, contraste: canvas, largura: canvas.width, altura: canvas.height, recortar, fechar: () => bmp.close() };
  } catch {
    return { original: arquivo };
  }
}

// arquivos: File[] (prints). Junta as imagens, sem repetir skill.
export async function lerPrintsLoja(arquivos, aoProgresso = () => {}) {
  const { createWorker } = await import("tesseract.js");
  aoProgresso({ etapa: "carregando" });
  const worker = await createWorker("eng");
  try {
    const porId = new Map();
    let skillPoints = null;
    for (let i = 0; i < arquivos.length; i += 1) {
      aoProgresso({ etapa: "lendo", atual: i + 1, total: arquivos.length });
      const imagem = await prepararImagem(arquivos[i]);
      const r = await lerUmaImagem(worker, imagem);
      if (r.skillPoints != null) skillPoints = r.skillPoints;
      const paisagem = imagem.largura >= 1280 && imagem.largura / imagem.altura > 1.6;
      r.itens.forEach((item) => {
        const atual = porId.get(item.id);
        const melhor = !atual || (atual.duvida && !item.duvida) || (atual.duvida === item.duvida && ((!atual.ok && item.ok) || (atual.ok === item.ok && item.semelhanca > atual.semelhanca)));
        if (!melhor) return;
        if (item.duvida && imagem.recortar && item.faixa) {
          try { item.recorte = imagem.recortar(item.faixa, paisagem ? Math.round(imagem.largura * 0.52) : imagem.largura); } catch { /* sem recorte */ }
        }
        porId.set(item.id, item);
      });
      imagem.fechar?.();
    }
    return { itens: [...porId.values()].map((item) => ({ ...item, caixa: undefined, faixa: undefined, parecidas: undefined, ids: undefined })), skillPoints };
  } finally {
    await worker.terminate();
  }
}
