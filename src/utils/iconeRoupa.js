// 🎯 src/utils/iconeRoupa.js
// Ícone da roupa exata usada na corrida, a partir do card_id que vem no
// arquivo do jogo (guardado em dadosTreinadores.cardId). Corridas antigas
// (CSV) não têm o cardId — nesses casos devolve null e a tela usa o avatar
// genérico da personagem.

import iconesRoupas from "../uma-skill-tools/data/icons.json";

export function iconeDaRoupa(cardId) {
  const entrada = cardId ? iconesRoupas[cardId] : null;
  if (!entrada) return null;
  return `/assets/img/chara/${Array.isArray(entrada) ? entrada[1] : entrada}.png`;
}
