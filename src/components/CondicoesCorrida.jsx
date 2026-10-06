// 🎯 src/components/CondicoesCorrida.jsx
// Linha com as condições reais da corrida (clima, terreno, estação e
// distância), vindas do arquivo do jogo (condicoesArquivo). Mostrada no
// cabeçalho da corrida em Resultados; mesmos ícones do Buscador de Pistas.

const CLIMAS = {
  sunny: { nome: "Sunny", icone: "/assets/img/utx_ico_weather_00.png" },
  cloudy: { nome: "Cloudy", icone: "/assets/img/utx_ico_weather_01.png" },
  rainy: { nome: "Rainy", icone: "/assets/img/utx_ico_weather_02.png" },
  snowy: { nome: "Snowy", icone: "/assets/img/utx_ico_weather_03.png" },
};
const CONDICOES_TERRENO = { firm: "Firm", good: "Good", soft: "Soft", heavy: "Heavy" };
const ESTACOES = {
  spring: { nome: "Spring", icone: "/assets/img/global/utx_txt_season_00.png" },
  summer: { nome: "Summer", icone: "/assets/img/global/utx_txt_season_01.png" },
  fall: { nome: "Fall", icone: "/assets/img/global/utx_txt_season_02.png" },
  winter: { nome: "Winter", icone: "/assets/img/global/utx_txt_season_03.png" },
};

function CondicoesCorrida({ condicoes, superficie }) {
  const clima = CLIMAS[condicoes.clima];
  const estacao = ESTACOES[condicoes.estacao];
  // "Grama (Turf)" -> "Turf"
  const tipoPista = superficie?.match(/\(([^)]+)\)/)?.[1] ?? superficie;
  const estiloItem = { display: "inline-flex", alignItems: "center", gap: "6px", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.25)", borderRadius: "50px", padding: "5px 14px", color: "#f1ead4", fontFamily: "'Montserrat'", fontSize: "9pt", fontWeight: 600 };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "10px", marginBottom: "18px" }}>
      {clima && <span style={estiloItem}><img src={clima.icone} alt="" style={{ height: "18px" }} />{clima.nome}</span>}
      {condicoes.terreno && (
        <span style={estiloItem}>
          <i className="fa-solid fa-layer-group" style={{ color: "#c5a059" }}></i>
          {tipoPista ? `${tipoPista} • ` : ""}{CONDICOES_TERRENO[condicoes.terreno] ?? condicoes.terreno}
        </span>
      )}
      {estacao && <span style={estiloItem}><img src={estacao.icone} alt={estacao.nome} title={estacao.nome} style={{ height: "22px" }} /></span>}
      {condicoes.distancia && <span style={estiloItem}><i className="fa-solid fa-ruler-horizontal" style={{ color: "#c5a059" }}></i>{condicoes.distancia}m</span>}
    </div>
  );
}

export default CondicoesCorrida;
