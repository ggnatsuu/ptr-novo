import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faLock, faUserGear, faUser } from "@fortawesome/free-solid-svg-icons";

function Login() {
  const navigate = useNavigate();

  // 🎯 Qual aba está ativa: "login" ou "register"
  const [aba, setAba] = useState("login");

  // Campos do formulário de login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginSenha, setLoginSenha] = useState("");

  // Campos do formulário de cadastro
  const [regUsername, setRegUsername] = useState("");
  const [regNome, setRegNome] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regSenha, setRegSenha] = useState("");

  // 🎯 Modal de feedback (substitui o antigo exibirModalPTR que criava a
  // div na mão via document.createElement). acaoAoFechar guarda uma função
  // opcional (ex: redirecionar) pra rodar quando a pessoa clicar em "OK".
  const [modal, setModal] = useState({ aberto: false, titulo: "", mensagem: "", tipo: "sucesso", acaoAoFechar: null });

  function abrirModal(titulo, mensagem, acaoAoFechar = null, tipo = "sucesso") {
    setModal({ aberto: true, titulo, mensagem, tipo, acaoAoFechar });
  }

  function fecharModal() {
    const acao = modal.acaoAoFechar;
    setModal((m) => ({ ...m, aberto: false }));
    if (acao) acao();
  }

  // 🎯 Mesma tabela de tradução de erros do login.js original
  function tratarErrosFirebase(code) {
    switch (code) {
      case "auth/invalid-credential":
        abrirModal("Falha de Licença", "E-mail ou senha incorretos. Verifique suas credenciais de acesso.", null, "erro");
        break;
      case "auth/email-already-in-use":
        abrirModal("Cadastro Duplicado", "Este endereço de e-mail já está associado a uma licença ativa de Treinador.", null, "erro");
        break;
      case "auth/weak-password":
        abrirModal("Senha Insegura", "Segurança fraca! A sua senha deve conter pelo menos 6 caracteres.", null, "erro");
        break;
      case "auth/invalid-email":
        abrirModal("E-mail Inválido", "O formato do e-mail inserido não foi reconhecido pela comissão.", null, "erro");
        break;
      default:
        abrirModal("Erro de Conexão", "Ocorreu um erro operacional com o servidor da PTR. Tente novamente mais tarde.", null, "erro");
    }
  }

  // 🎯 Equivalente ao antigo formLogin.addEventListener("submit", ...)
  // 🎯 Envia um e-mail de redefinição de senha via Firebase Auth. Usa o
  // e-mail que já estiver digitado no campo de login — se estiver vazio,
  // pede pra pessoa preencher antes.
  async function handleEsqueciSenha() {
    const email = loginEmail.trim();

    if (!email) {
      abrirModal("E-mail Necessário", "Digite seu e-mail no campo acima antes de clicar em \"Esqueci minha senha\".", null, "erro");
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      abrirModal(
        "E-mail Enviado!",
        `Enviamos um link de redefinição de senha para ${email}. Confira sua caixa de entrada (e a pasta de spam, só por garantia).`,
        null,
        "sucesso"
      );
    } catch (error) {
      console.error("Erro ao enviar redefinição de senha:", error.code);
      if (error.code === "auth/user-not-found") {
        abrirModal("E-mail Não Encontrado", "Não encontramos nenhuma conta cadastrada com esse e-mail.", null, "erro");
      } else if (error.code === "auth/invalid-email") {
        abrirModal("E-mail Inválido", "O formato do e-mail digitado não foi reconhecido.", null, "erro");
      } else {
        abrirModal("Erro ao Enviar", "Não foi possível enviar o e-mail de redefinição agora. Tente novamente mais tarde.", null, "erro");
      }
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const credencial = await signInWithEmailAndPassword(auth, loginEmail, loginSenha);
      const usuario = credencial.user;

      const docRef = doc(db, "treinadores", usuario.uid);
      const docSnap = await getDoc(docRef);
      const nomeDeExibicao = docSnap.exists() ? docSnap.data().nomeTreinador : "Treinador";

      abrirModal("Acesso Autorizado", `Bem-vindo de volta à PTR, ${nomeDeExibicao}!`, () => navigate("/"));
    } catch (error) {
      console.error("Erro ao autenticar:", error.code);
      tratarErrosFirebase(error.code);
    }
  }

  // 🎯 Equivalente ao antigo formRegister.addEventListener("submit", ...)
  async function handleRegister(e) {
    e.preventDefault();
    const username = regUsername.trim().toLowerCase();
    const nome = regNome.trim();
    const email = regEmail.trim();

    try {
      // Valida duplicidade de ID de Usuário
      const q = query(collection(db, "treinadores"), where("usuarioID", "==", username));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        abrirModal("Registro Recusado", "Este Usuário (ID) já está em uso por outro treinador. Escolha outro.", null, "erro");
        return;
      }

      const credencial = await createUserWithEmailAndPassword(auth, email, regSenha);
      const usuario = credencial.user;

      await setDoc(doc(db, "treinadores", usuario.uid), {
        usuarioID: username,
        nomeTreinador: nome,
        email: email,
        criadoEm: new Date().toISOString(),
        nivelAcesso: "treinador",
        atletasInscritas: [],
      });

      abrirModal("Ficha Aprovada", "Licença de Treinador emitida com sucesso! Bem-vindo ao circuito.", () => navigate("/"));
    } catch (error) {
      console.error("Erro ao registrar:", error.code);
      tratarErrosFirebase(error.code);
    }
  }

  return (
    <>
      <div className="hero-container auth-page-container">
        <div className="auth-wrapper">
          <div className="auth-card">
            <div className="auth-tabs">
              <button
                type="button"
                className={`tab-btn${aba === "login" ? " active" : ""}`}
                onClick={() => setAba("login")}
              >
                Entrar
              </button>
              <button
                type="button"
                className={`tab-btn${aba === "register" ? " active" : ""}`}
                onClick={() => setAba("register")}
              >
                Novo Treinador
              </button>
            </div>

            <div className="auth-form-container">
              {/* FORMULÁRIO DE LOGIN */}
              <form className={`auth-form${aba !== "login" ? " hidden" : ""}`} onSubmit={handleLogin}>
                <div className="form-header">
                  <h2>Acessar Prancheta</h2>
                  <p>Insira suas credenciais para gerenciar suas cavalinhas.</p>
                </div>

                <div className="input-container">
                  <label htmlFor="login-email">E-mail</label>
                  <div className="input-field-wrapper">
                    <FontAwesomeIcon icon={faEnvelope} className="input-icon" />
                    <input
                      type="email"
                      id="login-email"
                      required
                      placeholder="exemplo@ptr.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="login-password">Senha de Acesso</label>
                  <div className="input-field-wrapper">
                    <FontAwesomeIcon icon={faLock} className="input-icon" />
                    <input
                      type="password"
                      id="login-password"
                      required
                      placeholder="••••••••"
                      value={loginSenha}
                      onChange={(e) => setLoginSenha(e.target.value)}
                    />
                  </div>
                  <div style={{ textAlign: "right", marginTop: "6px" }}>
                    <button
                      type="button"
                      onClick={handleEsqueciSenha}
                      style={{ background: "none", border: "none", color: "#c5a059", fontSize: "8.5pt", fontFamily: "'Montserrat', sans-serif", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                    >
                      Esqueci minha senha
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn-auth-submit">Autenticar Licença</button>
              </form>

              {/* FORMULÁRIO DE CADASTRO */}
              <form className={`auth-form${aba !== "register" ? " hidden" : ""}`} onSubmit={handleRegister}>
                <div className="form-header">
                  <h2>Registro de Treinador</h2>
                  <p>Cadastre-se para ingressar na Liga PTR.</p>
                </div>

                <div className="input-container">
                  <label htmlFor="reg-username">Usuário</label>
                  <div className="input-field-wrapper">
                    <FontAwesomeIcon icon={faUserGear} className="input-icon" />
                    <input
                      type="text"
                      id="reg-username"
                      required
                      placeholder="Ex: pocolord123"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="reg-name">Nome do Treinador (Nome em jogo)</label>
                  <div className="input-field-wrapper">
                    <FontAwesomeIcon icon={faUser} className="input-icon" />
                    <input
                      type="text"
                      id="reg-name"
                      required
                      placeholder="Ex: Trainer Pocolord"
                      value={regNome}
                      onChange={(e) => setRegNome(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="reg-email">E-mail de Cadastro</label>
                  <div className="input-field-wrapper">
                    <FontAwesomeIcon icon={faEnvelope} className="input-icon" />
                    <input
                      type="email"
                      id="reg-email"
                      required
                      placeholder="seu@email.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="input-container">
                  <label htmlFor="reg-password">Senha Segura</label>
                  <div className="input-field-wrapper">
                    <FontAwesomeIcon icon={faLock} className="input-icon" />
                    <input
                      type="password"
                      id="reg-password"
                      required
                      placeholder="Mínimo 6 caracteres"
                      value={regSenha}
                      onChange={(e) => setRegSenha(e.target.value)}
                    />
                  </div>
                </div>

                <button type="submit" className="btn-auth-submit">Emitir Credencial</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de feedback (sucesso/erro) */}
      {modal.aberto && (
        <div className="ptr-modal-overlay active">
          <div className={`ptr-modal-box${modal.tipo === "erro" ? " erro" : ""}`}>
            <h3 className="ptr-modal-title">{modal.titulo}</h3>
            <p className="ptr-modal-text">{modal.mensagem}</p>
            <div className="ptr-modal-buttons">
              <button className="ptr-btn-confirm" onClick={fecharModal}>OK</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Login;