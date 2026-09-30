// 🎯 src/components/MinimapaPista.jsx
// Minimapa do replay (components/ReplayCorrida.jsx): desenha o traçado real
// da pista (formas geradas por utils/hakuraku/dados/gerar-formas.mjs), com
// as curvas, o trecho que a câmera está mostrando e um pontinho por cavalo.
// Cada pista fica num arquivo próprio, baixado só quando o replay abre.

import { useEffect, useMemo, useState } from "react";
import courseData from "../uma-skill-tools/data/course_data.json";

const FORMAS = import.meta.glob("../utils/hakuraku/dados/formas/*.json", { import: "default" });

const LARGURA = 300;
const ALTURA = 190;
const MARGEM = 12;
const LARGURA_PISTA_M = 12; // largura aproximada das raias, em metros, pro deslocamento lateral

const limitar = (v, min, max) => Math.min(Math.max(v, min), max);

// Ponto do traçado a uma certa fração da corrida (0 = largada, 1 = chegada),
// com a normal "pra fora" do oval, em coordenadas do mundo.
function pontoNoTracado(pontos, fracao) {
  const maxIndice = pontos.length - 1;
  const escalado = limitar(fracao, 0, 1) * maxIndice;
  const baixo = Math.floor(escalado);
  const alto = Math.min(maxIndice, baixo + 1);
  const alfa = escalado - baixo;
  const [x1, z1] = pontos[baixo];
  const [x2, z2] = pontos[alto];
  const anterior = pontos[Math.max(0, baixo - 1)];
  const proximo = pontos[Math.min(maxIndice, alto + 1)];
  const dx = proximo[0] - anterior[0];
  const dz = proximo[1] - anterior[1];
  const comprimento = Math.hypot(dx, dz) || 1;
  return { x: x1 + (x2 - x1) * alfa, z: z1 + (z2 - z1) * alfa, nx: -dz / comprimento, nz: dx / comprimento };
}

function areaComSinal(pontos) {
  let area = 0;
  pontos.forEach(([x1, z1], i) => {
    const [x2, z2] = pontos[(i + 1) % pontos.length];
    area += x1 * z2 - x2 * z1;
  });
  return area / 2;
}

function MinimapaPista({ courseId, marcadores, trechoVisivel }) {
  const [forma, setForma] = useState({ id: null, dados: null });

  useEffect(() => {
    const carregar = FORMAS[`../utils/hakuraku/dados/formas/${courseId}.json`];
    if (!carregar) return undefined;
    let cancelado = false;
    carregar()
      .then((dados) => { if (!cancelado) setForma({ id: courseId, dados }); })
      .catch((erro) => console.error("Erro ao carregar o traçado da pista:", erro));
    return () => { cancelado = true; };
  }, [courseId]);

  const geo = useMemo(() => {
    if (forma.id !== courseId || !forma.dados) return null;
    const { pontos, distancia } = forma.dados;
    const xs = pontos.map(([x]) => x);
    const zs = pontos.map(([, z]) => z);
    const minX = Math.min(...xs);
    const minZ = Math.min(...zs);
    const spanX = Math.max(1, Math.max(...xs) - minX);
    const spanZ = Math.max(1, Math.max(...zs) - minZ);
    const escala = Math.min((LARGURA - MARGEM * 2) / spanX, (ALTURA - MARGEM * 2) / spanZ);
    const offX = MARGEM + (LARGURA - MARGEM * 2 - spanX * escala) / 2;
    const offY = MARGEM + (ALTURA - MARGEM * 2 - spanZ * escala) / 2;
    // Mesmo espelhamento do Hakuraku, pra pista ficar na orientação do jogo.
    const naTela = (x, z) => [LARGURA - (offX + (x - minX) * escala), offY + (z - minZ) * escala];
    const sentidoFora = areaComSinal(pontos) < 0 ? 1 : -1;

    const trecho = (inicio, fim) => {
      const a = limitar(inicio / distancia, 0, 1);
      const b = limitar(fim / distancia, 0, 1);
      if (b <= a) return "";
      const lista = [];
      const passos = Math.max(2, Math.ceil((b - a) * (pontos.length - 1)) + 1);
      for (let k = 0; k <= passos; k++) {
        const p = pontoNoTracado(pontos, a + ((b - a) * k) / passos);
        lista.push(naTela(p.x, p.z).map((v) => v.toFixed(1)).join(","));
      }
      return lista.join(" ");
    };

    const posicao = (metros, raia) => {
      const p = pontoNoTracado(pontos, metros / distancia);
      const lateral = sentidoFora * LARGURA_PISTA_M * limitar(raia / 10000, 0, 1);
      return naTela(p.x + p.nx * lateral, p.z + p.nz * lateral);
    };

    const curso = courseData[courseId];
    const chegada = pontoNoTracado(pontos, 1);
    return {
      distancia,
      contorno: pontos.map(([x, z]) => naTela(x, z).map((v) => v.toFixed(1)).join(",")).join(" "),
      curvas: (curso?.corners ?? []).map((c) => trecho(c.start, c.start + c.length)).filter(Boolean),
      chegada: [
        naTela(chegada.x - chegada.nx * 6, chegada.z - chegada.nz * 6),
        naTela(chegada.x + chegada.nx * (LARGURA_PISTA_M + 6), chegada.z + chegada.nz * (LARGURA_PISTA_M + 6)),
      ],
      trecho,
      posicao,
    };
  }, [forma, courseId]);

  if (!geo) return null;

  const ordenados = [...marcadores].sort((a, b) => Number(a.destaque) - Number(b.destaque));

  return (
    <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} style={{ width: "100%", display: "block" }} aria-hidden="true">
      <polyline points={geo.contorno} fill="none" stroke="#1d3a2a" strokeWidth="9" strokeLinejoin="round" strokeLinecap="round" />
      {geo.curvas.map((pontos) => (
        <polyline key={pontos} points={pontos} fill="none" stroke="rgba(197, 160, 89, 0.3)" strokeWidth="9" strokeLinejoin="round" />
      ))}
      {trechoVisivel && (
        <polyline points={geo.trecho(trechoVisivel.inicio, trechoVisivel.fim)} fill="none" stroke="rgba(241, 234, 212, 0.35)" strokeWidth="13" strokeLinejoin="round" strokeLinecap="round" />
      )}
      <line x1={geo.chegada[0][0]} y1={geo.chegada[0][1]} x2={geo.chegada[1][0]} y2={geo.chegada[1][1]} stroke="#f1ead4" strokeWidth="2.5" strokeDasharray="2 2" />
      {ordenados.map((m) => {
        const [x, y] = geo.posicao(m.distancia, m.raia);
        return (
          <circle
            key={m.indice}
            cx={x}
            cy={y}
            r={m.destaque ? 5.5 : 3.6}
            fill={m.destaque ? "#c5a059" : m.cor}
            stroke="#0b1320"
            strokeWidth="1"
            opacity={m.npc && !m.destaque ? 0.45 : 1}
          />
        );
      })}
    </svg>
  );
}

export default MinimapaPista;
