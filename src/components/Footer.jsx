import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDiscord } from "@fortawesome/free-brands-svg-icons";

// 🎯 Rodapé padrão JRA/PTR.
// O Footer calcula seu próprio isAdmin (mesmo padrão da Navbar) em vez de
// receber via prop — o App.jsx nunca passava essa prop pra cá, então os
// links de admin (Ao Vivo/Sorteio) nunca apareciam aqui, nem pro admin
// logado. Assim os dois componentes ficam independentes e corretos.
function Footer() {
  const anoAtual = new Date().getFullYear();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const pararDeObservar = onAuthStateChanged(auth, async (usuarioLogado) => {
      if (!usuarioLogado) {
        setIsAdmin(false);
        return;
      }
      try {
        const docSnap = await getDoc(doc(db, "treinadores", usuarioLogado.uid));
        setIsAdmin(docSnap.exists() && docSnap.data().nivelAcesso === "admin");
      } catch (error) {
        console.error(error);
        setIsAdmin(false);
      }
    });
    return () => pararDeObservar();
  }, []);

  return (
    <footer className="main-footer">
      <div className="footer-container">
        <div className="footer-links">
          <Link to="/" className="footer-item">Início</Link>
          <Link to="/jornal" className="footer-item">Jornal PTR</Link>
          <Link to="/agenda" className="footer-item">Agenda</Link>
          <Link to="/regulamento" className="footer-item">Regulamento</Link>
          <Link to="/creditos" className="footer-item">Créditos</Link>
          {isAdmin && (
            <Link to="/sorteio" className="footer-item">Sorteio</Link>
          )}
          <Link to="/rank" className="footer-item">Rank</Link>
        </div>

        <div className="footer-social">
          {/* TODO: trocar pelo link real de convite do Discord */}
          <a
            href="https://discord.gg/dtqUB2hSyh"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-discord-btn"
          >
            <span className="discord-icon">
              <FontAwesomeIcon icon={faDiscord} />
            </span>{" "}
            Discord Oficial Pocolord's
          </a>
        </div>

        <div className="footer-credits">
          <p>&copy; {anoAtual} PocoLord's Twinkles Road. Todos os direitos reservados.</p>
          <p className="jra-disclaimer">Inspirado na estrutura oficial da Japan Racing Association (JRA).</p>
          <p className="jra-disclaimer">
            Projeto de fãs sem fins lucrativos, não afiliado à Cygames. Todos os materiais do jogo
            Umamusume são © Cygames, Inc.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;