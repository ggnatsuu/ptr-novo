// 🎯 src/utils/diagramaPista.js
// Cálculos do diagrama de pista (fases, retas/curvas, subidas/descidas),
// usados pelo Buscador de Pistas e pelo Guia do Meta.

// 🎯 Divide a distância nas 4 fases clássicas da corrida (Abertura 1/6,
// Meio 1/2, Final 1/6, Último Sprint 1/6) — fórmula confirmada batendo
// contra os diagramas reais de Sapporo 1200 (Turf) e Sapporo 1000 (Dirt)
// que vieram como referência.
export function calcularFases(distancia) {
  const abertura = distancia / 6;
  const meio = distancia / 2;
  const final = distancia / 6;
  return {
    abertura: { inicio: 0, fim: abertura },
    meio: { inicio: abertura, fim: abertura + meio },
    final: { inicio: abertura + meio, fim: abertura + meio + final },
    ultimoSprint: { inicio: abertura + meio + final, fim: distancia },
  };
}

// 🎯 Monta a lista de retas/curvas usando os dois arrays reais (straights +
// corners). Qualquer trecho que não aparece em NENHUM dos dois arrays —
// seja no início, no meio ou no fim da pista — não é considerado nem
// curva nem reta dentro do próprio jogo, então fica sem cor/borda/rótulo
// nenhum (só os números de metragem nas pontas, pra referência).
export function montarSegmentosPista(dados) {
  // As curvas mandam: em alguns percursos os dados trazem retas que invadem
  // as curvas (Ooi 1800m: reta 0–301 e curva 300–450; reta 600–1100 por cima
  // da curva 500–650). Então as curvas entram inteiras, numeradas em ordem, e
  // as retas só ocupam o que sobra entre elas (igual ao alpha123).
  const curvas = [...dados.corners]
    .sort((a, b) => a.start - b.start)
    .map((cv, i) => ({ tipo: "curva", inicio: cv.start, fim: cv.start + cv.length, numero: i + 1 }));
  const retas = [];
  [...dados.straights].sort((a, b) => a.start - b.start).forEach((r) => {
    let pedacos = [[r.start, r.end]];
    curvas.forEach((cv) => {
      pedacos = pedacos.flatMap(([i, f]) => (cv.fim <= i || cv.inicio >= f ? [[i, f]] : [[i, Math.min(f, cv.inicio)], [Math.max(i, cv.fim), f]]));
    });
    pedacos.filter(([i, f]) => f - i > 1).forEach(([i, f]) => retas.push({ tipo: "reta", inicio: i, fim: f }));
  });
  const zonas = [...curvas, ...retas].sort((a, b) => a.inicio - b.inicio);

  const segmentos = [];
  let cursor = 0;
  zonas.forEach((zona) => {
    if (zona.inicio > cursor + 0.5) segmentos.push({ tipo: "indefinido", inicio: cursor, fim: zona.inicio });
    segmentos.push(zona);
    cursor = Math.max(cursor, zona.fim);
  });
  if (cursor < dados.distance) {
    segmentos.push({ tipo: "indefinido", inicio: cursor, fim: dados.distance });
  }
  return segmentos;
}

// 🎯 Segmentos de subida/descida — direto do array "slopes" (slope > 0 =
// subida, slope < 0 = descida). Confirmado batendo com a Nakayama 2500m
// inner (os 4 trechos: 621-731 subida, 825-1025 subida, 1125-1525 descida,
// 2325-2435 subida — todos exatamente nos metros da imagem de referência).
export function montarSegmentosDeclive(dados) {
  return [...(dados.slopes || [])]
    .sort((a, b) => a.start - b.start)
    .map((s) => ({ tipo: s.slope > 0 ? "subida" : "descida", inicio: s.start, fim: s.start + s.length, slope: s.slope }));
}

// 🎯 Velocidade base da pista (m/s) — fórmula extraída do app.tsx original
// (function baseSpeed). Uso ela só pra converter "quanto tempo a skill
// fica ativa" em "quantos metros isso representa no desenho" — é uma
// estimativa (a velocidade real varia com estratégia/stats/skills), não
// um cálculo exato de física de corrida completo.
export function velocidadeBaseDaPista(distancia) {
  return 20.0 - (distancia - 2000) / 1000.0;
}

export function formatarDuracaoBase(baseDuration) {
  return (baseDuration / 10000).toFixed(1) + "s";
}
