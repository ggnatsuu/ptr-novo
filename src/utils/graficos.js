// 🎯 src/utils/graficos.js
// Funções de desenho compartilhadas pelos gráficos SVG do replay
// (GraficoComparativo e GraficoDesempenho).

// Escala com passo "bonito" pra grade do eixo (1, 2, 2.5, 5 × 10^n).
export function escalaBonita(min, max, divisoes = 4) {
  const bruto = (max - min) / divisoes || 1;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((p) => p * potencia).find((p) => p >= bruto);
  const inicio = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const marcas = [];
  for (let v = inicio; v <= fim + passo / 2; v += passo) marcas.push(Math.round(v * 100) / 100);
  return { min: inicio, max: fim, marcas };
}

// Curva suave que passa por todos os pontos sem "inventar" picos
// (interpolação cúbica monótona, a mesma ideia do d3.curveMonotoneX).
// Recebe [[x, y], ...] e devolve o "d" de um <path>.
export function caminhoSuave(pontos) {
  const n = pontos.length;
  if (n < 2) return "";
  if (n === 2) return `M${pontos[0][0]},${pontos[0][1]}L${pontos[1][0]},${pontos[1][1]}`;
  const dx = [];
  const inclinacao = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pontos[i + 1][0] - pontos[i][0]);
    inclinacao.push(dx[i] ? (pontos[i + 1][1] - pontos[i][1]) / dx[i] : 0);
  }
  const tangente = [inclinacao[0]];
  for (let i = 1; i < n - 1; i++) {
    tangente.push(inclinacao[i - 1] * inclinacao[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / inclinacao[i - 1] + (dx[i] + 2 * dx[i - 1]) / inclinacao[i]));
  }
  tangente.push(inclinacao[n - 2]);
  let d = `M${pontos[0][0].toFixed(1)},${pontos[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pontos[i];
    const [x1, y1] = pontos[i + 1];
    const h = dx[i] / 3;
    d += `C${(x0 + h).toFixed(1)},${(y0 + tangente[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - tangente[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}
