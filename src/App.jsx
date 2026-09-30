import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import Agenda from "./pages/Agenda";
import Regulamento from "./pages/Regulamento";
import RankGeral from "./pages/RankGeral";
import Home from "./pages/Home";
import Login from "./pages/Login";
import RankAdmin from "./pages/RankAdmin";
import Jornal from "./pages/Jornal";
import Sorteio from "./pages/Sorteio";
import Resultados from "./pages/Resultados";
import RankPersonagens from "./pages/RankPersonagens";
import TeamTrials from "./pages/TeamTrials";
import BuscadorPistas from "./pages/BuscadorPistas";

// 🎯 Página provisória, só de "segurar a bandeira" enquanto a gente não
// migra a página de verdade. Recebe um título diferente pra cada rota.
function PaginaEmConstrucao({ titulo }) {
  return (
    <div style={{ padding: "180px 20px 100px", textAlign: "center", color: "#a4b3c6" }}>
      <h2 style={{ color: "#c5a059", fontFamily: "'Cinzel', serif", fontSize: "22pt" }}>
        {titulo}
      </h2>
      <p>Esta página ainda será migrada pra React.</p>
    </div>
  );
}

function App() {
  return (
    <>
      <Navbar />

      {/* 🎯 Esse "flex: 1 0 auto" é o que faz o rodapé ficar sempre fixo
          no fim da página — o #root (em index.css) é um flex column, e
          essa div "estica" pra ocupar todo o espaço vazio da tela quando
          o conteúdo da página é curto, empurrando o Footer pro fundo
          de verdade em vez de deixar ele "subir" logo depois do conteúdo. */}
      <div style={{ flex: "1 0 auto" }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/jornal" element={<Jornal />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/regulamento" element={<Regulamento />} />
          <Route path="/sorteio" element={<Sorteio />} />
          <Route path="/resultados" element={<Resultados />} />
          <Route path="/rank" element={<RankGeral />} />
          <Route path="/rank-personagens" element={<RankPersonagens />} />
          <Route path="/rank-admin" element={<RankAdmin />} />
          <Route path="/login" element={<Login />} />
          <Route path="/team-trials" element={<TeamTrials />} />
          <Route path="/pistas" element={<BuscadorPistas />} />
          <Route path="*" element={<PaginaEmConstrucao titulo="Página não encontrada" />} />
        </Routes>
      </div>

      <Footer />
    </>
  );
}

export default App;