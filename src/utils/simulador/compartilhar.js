// 🎯 src/utils/simulador/compartilhar.js
// Link de compartilhamento do Comparador SEM banco de dados: a comparação
// inteira vira JSON → comprimido (deflate) → base64url no fim da URL (#c=...).
// Quem abre o link reconstrói tudo no navegador.

const PREFIXO = "#c=";

const paraBase64Url = (bytes) => {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deBase64Url = (texto) => {
  const b64 = texto.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((texto.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

async function comprimir(texto) {
  if (typeof CompressionStream === "undefined") return new TextEncoder().encode(texto);
  const fluxo = new Blob([texto]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}
async function descomprimir(bytes) {
  const fluxo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Response(fluxo).text();
}

// Só o que importa da corredora (sem campos vazios) pra deixar o link curto.
const enxugar = (c) => ({
  o: c.outfitId, n: c.nome, e: c.epiteto, s: c.estrategia, h: c.humor, a: c.aptidoes, st: c.status, k: c.skills,
  ...(c.dicas && Object.keys(c.dicas).length ? { d: c.dicas } : {}),
  ...(c.kiremono ? { f: 1 } : {}),
});
const expandir = (x) => ({
  outfitId: x.o ?? null, nome: x.n ?? "", epiteto: x.e ?? "", estrategia: x.s ?? "Pace", humor: x.h ?? "Great",
  aptidoes: x.a ?? { distancia: "S", estrategia: "A", terreno: "A" },
  status: x.st ?? { speed: 1200, stamina: 1000, power: 1000, guts: 600, wit: 1000 },
  skills: (x.k ?? []).map(String), dicas: x.d ?? {}, kiremono: !!x.f,
});

export async function criarLinkComparacao(estado) {
  const pacote = {
    v: 1,
    a: enxugar(estado.a),
    b: enxugar(estado.b),
    c: estado.courseId,
    g: estado.grade,
    cd: estado.condicoes,
    m: estado.modo,
    ...(estado.modo === "contestado" ? { cp: estado.campo, fc: estado.forcaCampo } : {}),
    aj: estado.ajustes,
    vz: estado.vezes,
    ...(estado.semente != null ? { sm: estado.semente } : {}),
  };
  const codigo = paraBase64Url(await comprimir(JSON.stringify(pacote)));
  return `${window.location.origin}/comparador${PREFIXO}${codigo}`;
}

// Lê o #c=... da URL atual (ou null se não tiver / estiver quebrado).
export async function lerLinkComparacao() {
  const hash = window.location.hash;
  if (!hash.startsWith(PREFIXO)) return null;
  try {
    const bytes = deBase64Url(hash.slice(PREFIXO.length));
    let texto;
    try { texto = await descomprimir(bytes); } catch { texto = new TextDecoder().decode(bytes); }
    const p = JSON.parse(texto);
    return {
      a: expandir(p.a), b: expandir(p.b),
      courseId: p.c, grade: p.g ?? "G1", condicoes: p.cd, modo: p.m ?? "classico",
      campo: p.cp ?? 9, forcaCampo: p.fc ?? 900, ajustes: p.aj ?? null, vezes: p.vz ?? 500, semente: p.sm ?? null,
    };
  } catch (erro) {
    console.error("Link de comparação inválido:", erro);
    return null;
  }
}
