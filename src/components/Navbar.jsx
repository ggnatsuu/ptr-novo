import { useState, useEffect } from "react";
import TrainerCardModal from "./TrainerCardModal";
import { Link, NavLink, useNavigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faTrophy,
  faScrewdriverWrench,
  faHorseHead,
  faToolbox,
  faMagnifyingGlass,
  faFilm,
  faShuffle,
  faUserShield,
} from "@fortawesome/free-solid-svg-icons";

// 🎯 Monta a classe do link considerando se ele é a página atual — usado
// pelo NavLink em vez do antigo Link, que não sabia dizer "você está aqui".
// 🎯 Copiada exatamente do Agenda.jsx (mesma lógica, mesmos horários) —
// abre sexta 18h, fecha sábado 15h30. Mantendo idêntica nos dois
// arquivos, evita a bolinha do Navbar dizer "aberto" enquanto a página
// de Agenda já considera fechado (ou vice-versa).
// 🎯 Pega a hora atual "fixada" em Brasília, não importa o fuso
// configurado no aparelho de quem está acessando — mesma função do
// Agenda.jsx, copiada de propósito pra manter os dois sincronizados.
function agoraEmBrasilia() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const valor = {};
  partes.forEach((p) => { if (p.type !== "literal") valor[p.type] = p.value; });

  return new Date(
    Number(valor.year), Number(valor.month) - 1, Number(valor.day),
    Number(valor.hour) % 24, Number(valor.minute), Number(valor.second)
  );
}

function calcularJanelaCheckin() {
  const agora = agoraEmBrasilia();
  const diaSemana = agora.getDay(); // 0=Dom, 1=Seg, ..., 5=Sex, 6=Sáb

  let diasDesdeSexta = diaSemana - 5;
  if (diasDesdeSexta < 0) diasDesdeSexta += 7;

  const abertura = new Date(agora);
  abertura.setDate(agora.getDate() - diasDesdeSexta);
  abertura.setHours(18, 0, 0, 0);

  const fechamento = new Date(abertura);
  fechamento.setDate(abertura.getDate() + 1); // sábado seguinte
  fechamento.setHours(15, 30, 0, 0);

  const aindaNaoAbriu = agora < abertura;
  const jaFechou = agora > fechamento;
  const dentroDoPrazo = !aindaNaoAbriu && !jaFechou;

  return { abertura, fechamento, dentroDoPrazo, aindaNaoAbriu, jaFechou };
}

function classeNavItem({ isActive }) {
  return `nav-item${isActive ? " active" : ""}`;
}

// 🎯 PARTE 4/4 (final): dropdowns clicáveis, fechar ao clicar fora,
// e o modal de confirmação de logout com o signOut de verdade.
function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const estaEmPaginaDeRank = location.pathname.startsWith("/rank");
  const estaEmFerramentas = location.pathname.startsWith("/team-trials") || location.pathname.startsWith("/pistas") || location.pathname.startsWith("/replay");
  const estaEmAdmin = location.pathname.startsWith("/sorteio") || location.pathname.startsWith("/rank-admin");

  const [menuAberto, setMenuAberto] = useState(false);

  const [usuario, setUsuario] = useState(null);
  const [nomeTreinador, setNomeTreinador] = useState("Carregando...");
  const [isAdmin, setIsAdmin] = useState(false);

  // 🎯 Um booleano pra cada dropdown, e um pro modal de "tem certeza que
  // quer sair?". Antes, o navbar.js antigo criava esse modal na mão via
  // document.createElement toda vez que alguém clicava em "Sair" — em
  // React, é bem mais simples: só um if no JSX controlado por esse estado.
  const [rankDropdownAberto, setRankDropdownAberto] = useState(false);
  const [ferramentasDropdownAberto, setFerramentasDropdownAberto] = useState(false);
  const [adminDropdownAberto, setAdminDropdownAberto] = useState(false);
  const [janelaCheckin, setJanelaCheckin] = useState(calcularJanelaCheckin());
  const [userDropdownAberto, setUserDropdownAberto] = useState(false);
  const [modalLogoutAberto, setModalLogoutAberto] = useState(false);
  const [trainerCardAberto, setTrainerCardAberto] = useState(false);
  const [navbarComScroll, setNavbarComScroll] = useState(false);

  // 🎯 Detecta rolagem da página pra aplicar um visual mais compacto/opaco
  // na navbar (classe .scrolled no CSS) — dá uma sensação mais "viva" em
  // vez de ficar sempre estática do mesmo jeito.
  useEffect(() => {
    function aoRolar() {
      setNavbarComScroll(window.scrollY > 40);
    }
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);


  // 🎯 Equivalente ao antigo window.addEventListener("resize", ...):
  // se a pessoa girar o celular ou redimensionar pra uma tela grande
  // enquanto o menu está aberto, ele fecha sozinho.
  useEffect(() => {
    function fecharSeTelaGrande() {
      if (window.innerWidth > 1400) setMenuAberto(false);
    }
    window.addEventListener("resize", fecharSeTelaGrande);

    // Função de "limpeza": remove o listener quando o componente sai da tela,
    // pra não ficar rodando escondido em segundo plano sem necessidade.
    return () => window.removeEventListener("resize", fecharSeTelaGrande);
  }, []);

  // 🎯 Equivalente ao antigo onAuthStateChanged(auth, async (user) => {...}).
  // Roda uma vez quando a Navbar aparece na tela, e fica "escutando" pra
  // sempre — toda vez que alguém loga ou desloga em qualquer parte do site,
  // essa função dispara de novo automaticamente.
  useEffect(() => {
    const pararDeObservar = onAuthStateChanged(auth, async (usuarioLogado) => {
      setUsuario(usuarioLogado);

      if (usuarioLogado) {
        try {
          const docRef = doc(db, "treinadores", usuarioLogado.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const dadosUsuario = docSnap.data();
            setNomeTreinador(dadosUsuario.usuarioID);
            setIsAdmin(dadosUsuario.nivelAcesso === "admin");
          }
        } catch (error) {
          console.error(error);
        }
      } else {
        // Ninguém logado: reseta tudo pro estado "visitante"
        setIsAdmin(false);
        setNomeTreinador("Carregando...");
      }
    });

    // Assim como no listener de resize: para de observar quando a Navbar
    // sai da tela, pra não vazar memória.
    return () => pararDeObservar();
  }, []);

  // 🎯 Equivalente ao antigo document.addEventListener("click", () => {...}):
  // qualquer clique na página (fora dos próprios botões dos dropdowns)
  // fecha os dois. Os botões dos dropdowns usam e.stopPropagation() no
  // clique deles pra esse listener "global" não fechar na mesma hora que abre.
  useEffect(() => {
    function fecharDropdowns() {
      setUserDropdownAberto(false);
      setRankDropdownAberto(false);
      setFerramentasDropdownAberto(false);
      setAdminDropdownAberto(false);
    }
    document.addEventListener("click", fecharDropdowns);
    return () => document.removeEventListener("click", fecharDropdowns);
  }, []);

  // 🎯 Mesmo padrão do Agenda.jsx: recalcula a cada 30s, pra bolinha
  // acender/apagar sozinha no exato instante que o check-in abre/fecha,
  // sem precisar a pessoa dar F5.
  useEffect(() => {
    const intervalo = setInterval(() => {
      setJanelaCheckin(calcularJanelaCheckin());
    }, 30000);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <>
      <nav className={`navbar${navbarComScroll ? " scrolled" : ""}`}>
        {/* LINHA ÚNICA: Logo + Menu completo (centralizado) + Perfil/Login (desktop) + Hambúrguer (mobile) */}
        <div className="nav-header-top">
          <Link to="/" className="nav-logo">
            <img src="/assets/img/logo1.png" alt="Logo PTR" className="logo-img" />
            <span className="logo-text">Pocolord's Twinkles Road</span>
          </Link>

          <div className="nav-links-bar">
            <NavLink to="/" end className={classeNavItem}>Início</NavLink>
            <NavLink to="/jornal" className={classeNavItem}>Jornal PTR</NavLink>
            <NavLink to="/agenda" className={classeNavItem} style={{ position: "relative" }}>
              Agenda
              {janelaCheckin.dentroDoPrazo && <span className="checkin-aberto-dot" title="Check-in aberto"></span>}
            </NavLink>
            <NavLink to="/resultados" className={classeNavItem}>Resultados</NavLink>

            <div
              className={`user-dropdown${rankDropdownAberto ? " open" : ""}`}
              id="rank-dropdown-menu-desktop"
              style={{ display: "flex", alignItems: "center" }}
            >
              <button
                className={`nav-item${estaEmPaginaDeRank ? " active" : ""}`}
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setRankDropdownAberto((aberto) => !aberto);
                  setFerramentasDropdownAberto(false);
                  setAdminDropdownAberto(false);
                  setUserDropdownAberto(false);
                }}
              >
                Rank{" "}
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="dropdown-arrow"
                  style={{ fontSize: "7pt", marginTop: "1px" }}
                />
              </button>
              <div className="dropdown-content" style={{ minWidth: "150px" }}>
                <Link to="/rank">
                  <FontAwesomeIcon icon={faTrophy} /> Geral
                </Link>
                <Link to="/rank-personagens">
                  <FontAwesomeIcon icon={faHorseHead} /> Personagens
                </Link>
              </div>
            </div>

            {isAdmin && (
              <div
                className={`user-dropdown${ferramentasDropdownAberto ? " open" : ""}`}
                id="ferramentas-dropdown-menu-desktop"
                style={{ display: "flex", alignItems: "center" }}
              >
                <button
                  className={`nav-item${estaEmFerramentas ? " active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFerramentasDropdownAberto((aberto) => !aberto);
                    setRankDropdownAberto(false);
                    setAdminDropdownAberto(false);
                    setUserDropdownAberto(false);
                  }}
                >
                  Ferramentas{" "}
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="dropdown-arrow"
                    style={{ fontSize: "7pt", marginTop: "1px" }}
                  />
                </button>
                <div className="dropdown-content" style={{ minWidth: "190px" }}>
                  <Link to="/team-trials">
                    <FontAwesomeIcon icon={faTrophy} /> Team Trials Tracker
                  </Link>
                  <Link to="/pistas">
                    <FontAwesomeIcon icon={faMagnifyingGlass} /> Buscador de Pistas
                  </Link>
                  <Link to="/replay">
                    <FontAwesomeIcon icon={faFilm} /> Replay de Corrida
                  </Link>
                </div>
              </div>
            )}

            {isAdmin && (
              <div
                className={`user-dropdown${adminDropdownAberto ? " open" : ""}`}
                id="admin-dropdown-menu-desktop"
                style={{ display: "flex", alignItems: "center" }}
              >
                <button
                  className={`nav-item${estaEmAdmin ? " active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdminDropdownAberto((aberto) => !aberto);
                    setRankDropdownAberto(false);
                    setFerramentasDropdownAberto(false);
                    setUserDropdownAberto(false);
                  }}
                >
                  Admin{" "}
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="dropdown-arrow"
                    style={{ fontSize: "7pt", marginTop: "1px" }}
                  />
                </button>
                <div className="dropdown-content" style={{ minWidth: "170px" }}>
                  <Link to="/sorteio">
                    <FontAwesomeIcon icon={faShuffle} /> Sorteio
                  </Link>
                  <Link to="/rank-admin">
                    <FontAwesomeIcon icon={faScrewdriverWrench} /> Administração
                  </Link>
                </div>
              </div>
            )}
            <NavLink to="/regulamento" className={classeNavItem}>Regulamento</NavLink>
          </div>

          {/* 🎯 Cópia do bloco de auth/perfil só pra régua desktop — some no
              mobile (vira parte da gaveta lá embaixo, igual já era). IDs
              distintos (sufixo -desktop) pra não duplicar id no HTML. */}
          <div className="nav-auth-box nav-auth-box-desktop-only">
            {usuario ? (
              <div className={`user-dropdown${userDropdownAberto ? " open" : ""}`} id="user-dropdown-menu-desktop">
                <button
                  className="dropdown-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserDropdownAberto((aberto) => !aberto);
                    setRankDropdownAberto(false);
                    setFerramentasDropdownAberto(false);
                    setAdminDropdownAberto(false);
                  }}
                >
                  <span>{nomeTreinador}</span>
                  <FontAwesomeIcon icon={faChevronDown} className="dropdown-arrow" />
                </button>
                <div className="dropdown-content">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setTrainerCardAberto(true);
                    }}
                  >
                    Meu Perfil
                  </a>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalLogoutAberto(true);
                    }}
                  >
                    Sair
                  </button>
                </div>
              </div>
            ) : (
              <Link to="/login" className="btn-login">Área do Treinador</Link>
            )}
          </div>

          <button
            className="menu-toggle"
            id="menuToggle"
            aria-label="Abrir menu"
            onClick={() => setMenuAberto(true)}
          >
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </button>
        </div>

        {/* GAVETA MOBILE — igual já era, sem mudança de comportamento */}
        <div
          className={`nav-menu-wrapper${menuAberto ? " open" : ""}`}
          id="navMenu"
        >
          <button
            className="btn-close-drawer"
            id="btnCloseDrawer"
            aria-label="Fechar menu"
            onClick={() => setMenuAberto(false)}
          >
            &times;
          </button>

          <div className="nav-links">
            <NavLink to="/" end className={classeNavItem}>Início</NavLink>
            <NavLink to="/jornal" className={classeNavItem}>Jornal PTR</NavLink>
            <NavLink to="/agenda" className={classeNavItem} style={{ position: "relative" }}>
              Agenda
              {janelaCheckin.dentroDoPrazo && <span className="checkin-aberto-dot" title="Check-in aberto"></span>}
            </NavLink>
            <NavLink to="/resultados" className={classeNavItem}>Resultados</NavLink>

            <div
              className={`user-dropdown${rankDropdownAberto ? " open" : ""}`}
              id="rank-dropdown-menu"
              style={{ display: "flex", alignItems: "center" }}
            >
              <button
                className={`nav-item${estaEmPaginaDeRank ? " active" : ""}`}
                id="rank-dropdown-btn"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
                onClick={(e) => {
                  e.stopPropagation(); // Impede que o listener global feche na mesma hora
                  setRankDropdownAberto((aberto) => !aberto);
                  setFerramentasDropdownAberto(false);
                  setAdminDropdownAberto(false);
                  setUserDropdownAberto(false);
                }}
              >
                Rank{" "}
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="dropdown-arrow"
                  style={{ fontSize: "7pt", marginTop: "1px" }}
                />
              </button>
              <div className="dropdown-content" style={{ minWidth: "150px" }}>
                <Link to="/rank">
                  <FontAwesomeIcon icon={faTrophy} /> Geral
                </Link>
                <Link to="/rank-personagens">
                  <FontAwesomeIcon icon={faHorseHead} /> Personagens
                </Link>
              </div>
            </div>

            {isAdmin && (
              <div
                className={`user-dropdown${ferramentasDropdownAberto ? " open" : ""}`}
                id="ferramentas-dropdown-menu"
                style={{ display: "flex", alignItems: "center" }}
              >
                <button
                  className={`nav-item${estaEmFerramentas ? " active" : ""}`}
                  id="ferramentas-dropdown-btn"
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFerramentasDropdownAberto((aberto) => !aberto);
                    setRankDropdownAberto(false);
                    setAdminDropdownAberto(false);
                    setUserDropdownAberto(false);
                  }}
                >
                  Ferramentas{" "}
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="dropdown-arrow"
                    style={{ fontSize: "7pt", marginTop: "1px" }}
                  />
                </button>
                <div className="dropdown-content" style={{ minWidth: "190px" }}>
                  <Link to="/team-trials">
                    <FontAwesomeIcon icon={faTrophy} /> Team Trials Tracker
                  </Link>
                  <Link to="/pistas">
                    <FontAwesomeIcon icon={faMagnifyingGlass} /> Buscador de Pistas
                  </Link>
                  <Link to="/replay">
                    <FontAwesomeIcon icon={faFilm} /> Replay de Corrida
                  </Link>
                </div>
              </div>
            )}

            {isAdmin && (
              <div
                className={`user-dropdown${adminDropdownAberto ? " open" : ""}`}
                id="admin-dropdown-menu"
                style={{ display: "flex", alignItems: "center" }}
              >
                <button
                  className={`nav-item${estaEmAdmin ? " active" : ""}`}
                  id="admin-dropdown-btn"
                  style={{ display: "flex", alignItems: "center", gap: "6px" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAdminDropdownAberto((aberto) => !aberto);
                    setRankDropdownAberto(false);
                    setFerramentasDropdownAberto(false);
                    setUserDropdownAberto(false);
                  }}
                >
                  Admin{" "}
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="dropdown-arrow"
                    style={{ fontSize: "7pt", marginTop: "1px" }}
                  />
                </button>
                <div className="dropdown-content" style={{ minWidth: "170px" }}>
                  <Link to="/sorteio" id="link-sorteio">
                    <FontAwesomeIcon icon={faShuffle} /> Sorteio
                  </Link>
                  <Link to="/rank-admin" id="link-rank-admin">
                    <FontAwesomeIcon icon={faScrewdriverWrench} /> Administração
                  </Link>
                </div>
              </div>
            )}
            <NavLink to="/regulamento" className={classeNavItem}>Regulamento</NavLink>
          </div>

          <div className="nav-auth-box" id="nav-auth-container">
            {usuario ? (
              // 🎯 Logado: mostra o nome + dropdown (Perfil/Sair), já clicável.
              <div
                className={`user-dropdown${userDropdownAberto ? " open" : ""}`}
                id="user-dropdown-menu"
              >
                <button
                  className="dropdown-toggle"
                  id="dropdown-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserDropdownAberto((aberto) => !aberto);
                    setRankDropdownAberto(false);
                    setFerramentasDropdownAberto(false);
                    setAdminDropdownAberto(false);
                  }}
                >
                  <span id="nav-trainer-name">{nomeTreinador}</span>
                  <FontAwesomeIcon icon={faChevronDown} className="dropdown-arrow" />
                </button>
                <div className="dropdown-content">
                  <a
                    href="#"
                    id="btn-perfil-nav"
                    onClick={(e) => {
                      e.preventDefault();
                      setTrainerCardAberto(true);
                    }}
                  >
                    Meu Perfil
                  </a>
                  <button
                    id="btn-logout-nav"
                    onClick={(e) => {
                      e.stopPropagation();
                      setModalLogoutAberto(true);
                    }}
                  >
                    Sair
                  </button>
                </div>
              </div>
            ) : (
              // 🎯 Deslogado: mostra o botão "Área do Treinador"
              <Link to="/login" className="btn-login" id="btn-login-nav">
                Área do Treinador
              </Link>
            )}
          </div>
        </div>
      </nav>

      <div
        className={`body-overlay${menuAberto ? " active" : ""}`}
        id="bodyOverlay"
        onClick={() => setMenuAberto(false)}
      ></div>

      {/* 🎯 Modal de confirmação de logout. Antes isso era criado na mão
          via document.createElement toda vez que "Sair" era clicado;
          agora é só um bloco de JSX que aparece/some com o estado. */}
      {modalLogoutAberto && (
        <div className="ptr-logout-overlay active">
          <div className="ptr-modal-box">
            <h3 className="ptr-modal-title">Encerrar Sessão</h3>
            <p className="ptr-modal-text">Deseja realmente deslogar?</p>
            <div className="ptr-modal-buttons">
              <button
                className="ptr-btn-cancel"
                onClick={() => setModalLogoutAberto(false)}
              >
                Cancelar
              </button>
              <button
                className="ptr-btn-confirm"
                onClick={async () => {
                  await signOut(auth);
                  setModalLogoutAberto(false);
                  navigate("/"); // Equivalente ao antigo window.location.href
                }}
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      )}

      <TrainerCardModal aberto={trainerCardAberto} onFechar={() => setTrainerCardAberto(false)} />
    </>
  );
}

export default Navbar;