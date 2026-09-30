// 🎯 Gera um arquivo pequeno por pista (dados/formas/<courseId>.json) com o
// traçado usado pelo minimapa do replay (components/MinimapaPista.jsx).
// Assim o replay baixa só a pista da corrida (~3 KB) em vez do pistas.json
// inteiro. Rodar de novo depois de atualizar o pistas.json:
//   node src/utils/hakuraku/dados/gerar-formas.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const pasta = path.dirname(fileURLToPath(import.meta.url));
const { courseShapes } = JSON.parse(fs.readFileSync(path.join(pasta, "pistas.json"), "utf8"));
const destino = path.join(pasta, "formas");
fs.mkdirSync(destino, { recursive: true });

let total = 0;
for (const [courseId, forma] of Object.entries(courseShapes)) {
  const conteudo = {
    distancia: forma.distance,
    // Pontos igualmente espaçados do início (0 m) até a chegada, em metros.
    pontos: forma.points.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
  };
  const texto = JSON.stringify(conteudo);
  fs.writeFileSync(path.join(destino, `${courseId}.json`), texto);
  total += texto.length;
}
console.log(`${Object.keys(courseShapes).length} pistas geradas (${(total / 1024).toFixed(0)} KB no total)`);
