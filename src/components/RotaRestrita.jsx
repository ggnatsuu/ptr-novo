// 🎯 src/components/RotaRestrita.jsx
// Só mostra a página para quem tem um dos níveis de acesso permitidos.

import { Link } from "react-router-dom";
import { useNivelAcesso } from "../utils/nivelAcesso";

function RotaRestrita({ niveis, children }) {
  const nivel = useNivelAcesso();
  if (nivel && niveis.includes(nivel)) return children;
  return (
    <main className="main-layout-wrapper" style={{ marginTop: "130px", minHeight: "calc(100vh - 350px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}>
      <div style={{ textAlign: "center", fontFamily: "'Montserrat', sans-serif", color: "#a4b3c6" }}>
        {nivel === undefined ? (
          <p style={{ color: "#c5a059" }}><i className="fa-solid fa-circle-notch fa-spin"></i> Verificando acesso...</p>
        ) : (
          <>
            <i className="fa-solid fa-lock" style={{ fontSize: "28pt", color: "#c5a059", marginBottom: "16px" }}></i>
            <h2 style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", margin: "0 0 8px" }}>Área restrita</h2>
            <p style={{ margin: "0 0 20px", fontSize: "10pt" }}>
              {nivel === null ? "Entre na sua conta para continuar." : "Seu perfil não tem acesso a esta página."}
            </p>
            <Link to={nivel === null ? "/login" : "/"} style={{ color: "#c5a059", fontWeight: 700, fontSize: "10pt" }}>
              {nivel === null ? "Área do Treinador" : "Voltar ao início"}
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default RotaRestrita;
