// 🎯 src/components/TituloTreinador.jsx
// Título equipado de um treinador, pequeno e na cor da raridade. Não mostra
// nada se ele não tiver título equipado.

import { useTituloDe } from "../utils/conquistas/titulos";

function TituloTreinador({ nome, tamanho = "8pt", estilo }) {
  const titulo = useTituloDe(nome);
  if (!titulo) return null;
  return (
    <span style={{ display: "block", color: titulo.cor, fontSize: tamanho, fontWeight: 700, fontStyle: "italic", letterSpacing: "0.3px", fontFamily: "'Montserrat', sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", ...estilo }}>
      {titulo.texto}
    </span>
  );
}

export default TituloTreinador;
