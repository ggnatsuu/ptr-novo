// 🎯 src/utils/iconeRoupa.js
// Ícone da roupa exata usada na corrida, a partir do card_id que vem no
// arquivo do jogo (guardado em dadosTreinadores.cardId). Corridas antigas
// (CSV) não têm o cardId — nesses casos devolve null e a tela usa o avatar
// genérico da personagem.

import iconesRoupas from "../uma-skill-tools/data/icons.json";
import chibisDisponiveis from "../data/chibis.json";

export function iconeDaRoupa(cardId) {
  const entrada = cardId ? iconesRoupas[cardId] : null;
  if (!entrada) return null;
  return `/assets/img/chara/${Array.isArray(entrada) ? entrada[1] : entrada}.png`;
}

// 🎯 Chibi da roupa (usado no replay, no modo "Chibis"). As imagens ficam em
// public/assets/img/chibi/<card_id>_0010.png (pose normal) e _0011.png
// (comemorando). A lista de roupas com chibi fica em data/chibis.json —
// pra incluir roupas novas, copiar as imagens pra pasta e atualizar a lista.
const comChibi = new Set(chibisDisponiveis);

export function chibiDaRoupa(cardId, comemorando = false) {
  if (!cardId || !comChibi.has(String(cardId))) return null;
  return `/assets/img/chibi/${cardId}_${comemorando ? "0011" : "0010"}.png`;
}
