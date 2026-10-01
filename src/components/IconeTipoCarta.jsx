// 🎯 src/components/IconeTipoCarta.jsx
// Ícone do tipo da carta de suporte (Speed, Stamina, Pal...) sobre a arte.

import { tipoDaCarta } from "../utils/anotacoesMeta";

function IconeTipoCarta({ id, tamanho = 26, topo = 5 }) {
  const tipo = tipoDaCarta(id);
  if (!tipo) return null;
  return (
    <img src={tipo.icone} alt={tipo.chave} title={tipo.chave} style={{ position: "absolute", top: `${topo}px`, left: "5px", width: `${tamanho}px`, height: `${tamanho}px`, filter: "drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8))", pointerEvents: "none", zIndex: 1 }} />
  );
}

export default IconeTipoCarta;
