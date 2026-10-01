import { useState, useEffect } from "react";
import { doc, getDoc, setDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { listaAvatares } from "../data/avatares";
import { bancoCorridas, bancoG1 } from "../data/bancos-corridas";
import { obterUrlAvatarCloudinary } from "../utils/cloudinary";
import { idConquistas } from "../utils/conquistas/leve";
import { titulosDoTreinador, recarregarTitulos } from "../utils/conquistas/titulos";
import PainelConquistas from "./PainelConquistas";

// 🎯 Lista única de todas as pistas (G1 + G2/G3), sem duplicatas, em ordem
// alfabética — é o "catálogo" de troféus possíveis. Calculada uma vez só
// (fora do componente), já que não depende de nenhum estado.
const todasPistas = [...bancoCorridas, ...bancoG1];
const listaUnicasPistas = todasPistas
  .filter((p, idx, self) => p && p.nome && self.findIndex((t) => t.nome.trim() === p.nome.trim()) === idx)
  .sort((a, b) => a.nome.localeCompare(b.nome));

// 🎯 CLOUDINARY: mesma conta usada no rankGeral.js/perfil.js originais
const CLOUDINARY_CLOUD_NAME = "k1qj4qrm";
function obterUrlTrofeuCloudinary(nomeTrofeu) {
  if (!nomeTrofeu || nomeTrofeu === "Bloqueado") return "";
  const nomeSanitizado = nomeTrofeu.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/${nomeSanitizado}.png`;
}

const PONTOS_PARTICIPACAO = 300;
const PONTOS_POR_POSICAO = { 1: 12, 2: 10, 3: 9, 4: 8, 5: 7, 6: 6, 7: 5, 8: 4, 9: 3 };
function calcularPontosPosicao(posicao) {
  if (PONTOS_POR_POSICAO[posicao] !== undefined) return PONTOS_POR_POSICAO[posicao];
  if (posicao >= 10 && posicao <= 18) return 2;
  return 0;
}

// 🎯 Equivalente ao antigo salvarDadosTreinador(): grava só os campos
// passados (merge: true não apaga o resto do documento).
async function salvarDadosTreinador(dadosObjeto) {
  const usuario = auth.currentUser;
  if (!usuario) return;
  try {
    await setDoc(doc(db, "treinadores", usuario.uid), dadosObjeto, { merge: true });
  } catch (error) {
    console.error("Erro ao salvar dados no Firestore:", error);
  }
}

// 🎯 PARTE 4/4 (final): o inventário de troféus, com busca e estado de
// "bloqueado" pra quem ainda não conquistou aquela pista.
function TrainerCardModal({ aberto, onFechar }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [dados, setDados] = useState(null);

  const [tela, setTela] = useState("principal");
  const [buscaAvatar, setBuscaAvatar] = useState("");
  const [buscaTrofeu, setBuscaTrofeu] = useState("");

  // 🎯 Equivalente ao antigo abrirTrainerCard(): busca o documento do
  // próprio usuário logado, cruza com TODAS as partidas pra calcular
  // prestígio/medalhas/troféus, e guarda tudo em "dados".
  async function carregarDadosDoTreinador() {
    setCarregando(true);
    setErro(null);

    const usuario = auth.currentUser;
    if (!usuario) {
      setErro("Sessão expirada ou não identificada. Aguarde a inicialização do Firebase ou faça login novamente.");
      setCarregando(false);
      return;
    }

    try {
      const docSnap = await getDoc(doc(db, "treinadores", usuario.uid));

      let nomeTreinador = "Sem Nome";
      let fotoInicial = "default_avatar.png";
      let estrategiaInicial = "runner";
      let trofeusEquipados = ["Bloqueado", "Bloqueado", "Bloqueado", "Bloqueado"];
      let inventarioTrofeus = [];
      let tituloEquipado = "";

      if (docSnap.exists()) {
        const d = docSnap.data();
        nomeTreinador = d.nomeTreinador || "Treinador";
        if (d.fotoPerfil) fotoInicial = d.fotoPerfil;
        if (d.estrategia) estrategiaInicial = d.estrategia;
        if (d.trofeusEquipados && Array.isArray(d.trofeusEquipados)) trofeusEquipados = d.trofeusEquipados;
        if (d.inventarioTrofeus && Array.isArray(d.inventarioTrofeus)) inventarioTrofeus = d.inventarioTrofeus;
        if (d.tituloEquipado) tituloEquipado = d.tituloEquipado;
      }

      const trainerId = usuario.uid.slice(-6).toUpperCase();

      let totaisGerais = { primeiros: 0, segundos: 0, terceiros: 0, total: 0, pontosColocacao: 0 };
      let contadorCavalos = {};
      let contadorHipodromosVitoria = {};
      const nomeTreinadorLower = nomeTreinador.toLowerCase().trim();
      const conquistasSnap = await getDoc(doc(db, "conquistas", idConquistas(nomeTreinador))).catch(() => null);
      const docConquistas = conquistasSnap?.exists() ? conquistasSnap.data() : null;

      const partidasSnapshot = await getDocs(collection(db, "resultados_partidas"));
      partidasSnapshot.forEach((docPartida) => {
        const partida = docPartida.data();
        const linha = (partida.classificacao || []).find(
          (c) => c.treinador && c.treinador.toLowerCase().trim() === nomeTreinadorLower
        );
        if (!linha) return;

        totaisGerais.total++;
        totaisGerais.pontosColocacao += calcularPontosPosicao(linha.posicao);

        if (linha.posicao === 1) {
          totaisGerais.primeiros++;
          const pistaFormatada = partida.pistaNome ? partida.pistaNome.trim() : "";
          if (pistaFormatada && !inventarioTrofeus.some((v) => v.toLowerCase().trim() === pistaFormatada.toLowerCase())) {
            inventarioTrofeus.push(pistaFormatada);
          }
          if (partida.hipodromo) {
            const h = partida.hipodromo.trim();
            contadorHipodromosVitoria[h] = (contadorHipodromosVitoria[h] || 0) + 1;
          }
        }
        if (linha.posicao === 2) totaisGerais.segundos++;
        if (linha.posicao === 3) totaisGerais.terceiros++;
        if (linha.personagem) contadorCavalos[linha.personagem] = (contadorCavalos[linha.personagem] || 0) + 1;
      });

      // 🎯 Salva de volta o inventário atualizado (igual o original fazia)
      await setDoc(doc(db, "treinadores", usuario.uid), { inventarioTrofeus }, { merge: true });

      let cavaloMaisUsado = "Nenhum Registrado";
      let maiorUso = 0;
      Object.keys(contadorCavalos).forEach((c) => {
        if (contadorCavalos[c] > maiorUso) {
          maiorUso = contadorCavalos[c];
          cavaloMaisUsado = c;
        }
      });
      const arquivoMaisUsado =
        cavaloMaisUsado !== "Nenhum Registrado"
          ? cavaloMaisUsado.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/__+/g, "_").replace(/^_|_$/g, "") + ".png"
          : "default_avatar.png";

      let hipodromoFavorito = "Nenhum Registrado";
      let maxVitorias = 0;
      Object.keys(contadorHipodromosVitoria).forEach((h) => {
        if (contadorHipodromosVitoria[h] > maxVitorias) {
          maxVitorias = contadorHipodromosVitoria[h];
          hipodromoFavorito = h;
        }
      });

      const prestigio = totaisGerais.total * PONTOS_PARTICIPACAO + totaisGerais.pontosColocacao;
      const classeTreinador = prestigio >= 6000 ? "Mestre de G1" : prestigio >= 3000 ? "Especialista do Turf" : "Treinador Licenciado";

      setDados({
        nomeTreinador,
        fotoInicial,
        estrategiaInicial,
        trofeusEquipados,
        inventarioTrofeus,
        tituloEquipado,
        docConquistas,
        trainerId,
        totaisGerais,
        cavaloMaisUsado,
        arquivoMaisUsado,
        maiorUso,
        hipodromoFavorito,
        prestigio,
        classeTreinador,
      });
    } catch (e) {
      console.error("Erro ao sincronizar dados da carteira PTR:", e);
      setErro("Erro na sincronização JRA. Verifique o console do navegador.");
    } finally {
      setCarregando(false);
    }
  }

  // 🎯 Dispara a busca toda vez que o modal abre (aberto passa de false pra
  // true). É um useEffect de verdade, não uma chamada direta no corpo do
  // componente — buscar dados durante a renderização é uma prática incorreta
  // em React e pode causar buscas duplicadas.
  useEffect(() => {
    if (aberto) {
      carregarDadosDoTreinador();
    } else {
      // Limpa o estado ao fechar, pra próxima abertura buscar tudo de novo
      setDados(null);
      setErro(null);
      setCarregando(true);
      setTela("principal");
      setBuscaAvatar("");
      setBuscaTrofeu("");
    }
  }, [aberto]);

  // 🎯 Equivalente ao clique num avatar da galeria original: salva no
  // Firestore, atualiza a foto na hora (sem esperar reabrir o card) e
  // volta pra tela principal.
  async function selecionarAvatar(arquivo) {
    setDados((d) => ({ ...d, fotoInicial: arquivo }));
    setTela("principal");
    await salvarDadosTreinador({ fotoPerfil: arquivo });
  }

  // 🎯 Equivalente ao clique num troféu do inventário original: sempre
  // edita o slot 0 (o único painel de destaque que existe na tela
  // principal — o "data-slot" do original também era fixo em "0").
  async function selecionarTrofeu(pistaSelecionada) {
    const novosTrofeus = [...dados.trofeusEquipados];
    novosTrofeus[0] = pistaSelecionada;
    setDados((d) => ({ ...d, trofeusEquipados: novosTrofeus }));
    setTela("principal");
    await salvarDadosTreinador({ trofeusEquipados: novosTrofeus });
  }

  if (!aberto) return null;

  return (
    <div
      className="ptr-modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className="ptr-profile-box"
        style={
          tela === "galeria" ? { maxWidth: "920px", width: "95%" }
          : tela === "trofeus" || tela === "conquistas" ? { maxWidth: "980px", width: "95%" }
          : undefined
        }
      >
        <button className="ptr-modal-close-corner" onClick={onFechar}>
          <i className="fa-solid fa-xmark"></i>
        </button>
        <div className="ptr-profile-header">
          <h4>PTR / JRA OFFICIAL LICENSE</h4>
          <div className="license-tag">[ EXPEDIDA EM TEMPO REAL ]</div>
        </div>

        <div
          id="ptr-card-dynamic-content"
          style={tela !== "principal" ? { maxHeight: "85vh", overflowY: "auto" } : undefined}
        >
          {carregando && (
            <div style={{ color: "#c5a059", fontFamily: "'Montserrat'", fontStyle: "italic", padding: "40px", textAlign: "center" }}>
              <i className="fa-solid fa-circle-notch fa-spin"></i> Sincronizando conquistas da carreira PTR...
            </div>
          )}

          {erro && (
            <div style={{ color: "#ff6855", fontFamily: "'Montserrat'", padding: "40px", textAlign: "center" }}>
              <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: "20pt", marginBottom: "10px", display: "block" }}></i>
              {erro}
            </div>
          )}

          {!carregando && !erro && dados && tela === "principal" && (
            <div className="ptr-profile-horizontal-layout" style={{ display: "flex", gap: "30px", alignItems: "stretch", fontFamily: "'Montserrat', sans-serif", boxSizing: "border-box", width: "100%" }}>
              {/* COLUNA ESQUERDA: Identidade + Stats */}
              <div style={{ flex: 1.2, display: "flex", flexDirection: "column", justifyContent: "space-between", minWidth: 0 }}>
                <div className="ptr-profile-identity" style={{ display: "flex", alignItems: "center", gap: "25px", marginBottom: "20px" }}>
                  <div
                    className="ptr-profile-avatar-wrapper"
                    onClick={() => setTela("galeria")}
                    style={{ width: "135px", height: "135px", borderRadius: "12px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", flexShrink: 0, position: "relative", cursor: "pointer" }}
                  >
                    <img
                      src={obterUrlAvatarCloudinary(dados.fotoInicial)}
                      alt={dados.nomeTreinador}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => { e.currentTarget.src = "https://placehold.co/140x140/0e1726/c5a059?text=🐎"; }}
                    />
                    <div className="ptr-avatar-overlay-click"><span>Trocar Foto</span></div>
                  </div>
                  <div className="ptr-profile-meta" style={{ flex: 1, minWidth: 0, fontFamily: "'Montserrat', sans-serif" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "6px" }}>
                      <h2 className="trainer-name" style={{ fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "19pt", fontWeight: 800, margin: 0, letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {dados.nomeTreinador}
                      </h2>
                      <span style={{ fontSize: "8.5pt", fontWeight: 700, color: "rgba(197, 160, 89, 0.65)", letterSpacing: "0.5px", flexShrink: 0 }}>
                        ID: #{dados.trainerId}
                      </span>
                    </div>
                    {(() => {
                      const titulos = titulosDoTreinador(dados.docConquistas);
                      const cor = titulos.find((x) => x.id === dados.tituloEquipado)?.cor ?? "#5f758e";
                      return (
                        <select
                          className="ptr-strategy-inline-select"
                          value={titulos.some((x) => x.id === dados.tituloEquipado) ? dados.tituloEquipado : ""}
                          disabled={titulos.length === 0}
                          onChange={async (e) => {
                            const tituloEquipado = e.target.value;
                            setDados((d) => ({ ...d, tituloEquipado }));
                            await salvarDadosTreinador({ tituloEquipado });
                            recarregarTitulos();
                          }}
                          title="Título exibido abaixo do seu nome no site"
                          style={{ fontSize: "9.5pt", fontWeight: 700, fontStyle: "italic", color: cor, marginBottom: "4px", maxWidth: "100%" }}
                        >
                          <option value="">{titulos.length ? "Sem título" : "Nenhum título ainda"}</option>
                          {titulos.map((x) => <option key={x.id} value={x.id} style={{ color: x.cor }}>{x.texto}</option>)}
                        </select>
                      );
                    })()}
                    <div style={{ fontSize: "10.5pt", color: "#a4b3c6", margin: "4px 0", fontWeight: 600 }}>
                      CLASSE: <span style={{ color: "#c5a059", fontWeight: 700 }}>{dados.classeTreinador}</span>
                    </div>
                    <div style={{ fontSize: "10.5pt", color: "#a4b3c6", margin: "4px 0", fontWeight: 600 }}>
                      HIPÓDROMO FAVORITO: <span style={{ color: "#c5a059", fontWeight: 700 }}>{dados.hipodromoFavorito}</span>
                    </div>
                    <div style={{ fontSize: "10.5pt", color: "#a4b3c6", margin: "4px 0", fontWeight: 600 }}>
                      ESTRATEGIA:{" "}
                      <select
                        className="ptr-strategy-inline-select"
                        value={dados.estrategiaInicial}
                        onChange={(e) => {
                          const novaEstrategia = e.target.value;
                          // Atualização otimista: já reflete na tela antes da gravação terminar
                          setDados((d) => ({ ...d, estrategiaInicial: novaEstrategia }));
                          salvarDadosTreinador({ estrategia: novaEstrategia });
                        }}
                        style={{ fontSize: "10.5pt", fontWeight: 700 }}
                      >
                        <option value="runner">Front Runner</option>
                        <option value="leader">Pace Chaser</option>
                        <option value="betweener">Late Surger</option>
                        <option value="chaser">End Closer</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTela("conquistas")}
                      style={{ marginTop: "8px", background: "transparent", border: "1px solid rgba(197, 160, 89, 0.5)", color: "#c5a059", borderRadius: "6px", padding: "5px 12px", cursor: "pointer", fontSize: "8.5pt", fontWeight: 700, fontFamily: "'Montserrat', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}
                    >
                      <i className="fa-solid fa-medal"></i> Conquistas
                    </button>
                  </div>
                </div>

                <div style={{ background: "rgba(14, 23, 38, 0.4)", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "12px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box", width: "100%" }}>
                  <div style={{ textAlign: "center", borderRight: "1px solid rgba(164, 179, 198, 0.15)", paddingRight: "20px", flexShrink: 0 }}>
                    <span style={{ fontSize: "7.5pt", fontWeight: 700, color: "rgba(164, 179, 198, 0.4)", letterSpacing: "0.5px", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Prestígio</span>
                    <span style={{ fontSize: "15pt", fontWeight: 800, color: "#c5a059", letterSpacing: "0.3px" }}>
                      {dados.prestigio.toLocaleString("pt-BR")}{" "}
                      <span style={{ fontSize: "9.5pt", fontWeight: 700, color: "rgba(197, 160, 89, 0.7)" }}>PTS</span>
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: "14px", borderRight: "1px solid rgba(164, 179, 198, 0.15)", paddingRight: "20px", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ width: "18px", height: "18px", background: "#c5a059", color: "#0b1320", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: 800, marginBottom: "2px" }}>1</span>
                      <span style={{ fontSize: "7.5pt", color: "rgba(164, 179, 198, 0.4)", fontWeight: 700, display: "block" }}>1º</span>
                      <div style={{ fontSize: "12pt", fontWeight: 800, color: "#f1ead4", marginTop: "1px" }}>{dados.totaisGerais.primeiros}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ width: "18px", height: "18px", background: "#a4b3c6", color: "#0b1320", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: 800, marginBottom: "2px" }}>2</span>
                      <span style={{ fontSize: "7.5pt", color: "rgba(164, 179, 198, 0.4)", fontWeight: 700, display: "block" }}>2º</span>
                      <div style={{ fontSize: "12pt", fontWeight: 800, color: "#f1ead4", marginTop: "1px" }}>{dados.totaisGerais.segundos}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ width: "18px", height: "18px", background: "#cd7f32", color: "#0b1320", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "7.5pt", fontWeight: 800, marginBottom: "2px" }}>3</span>
                      <span style={{ fontSize: "7.5pt", color: "rgba(164, 179, 198, 0.4)", fontWeight: 700, display: "block" }}>3º</span>
                      <div style={{ fontSize: "12pt", fontWeight: 800, color: "#f1ead4", marginTop: "1px" }}>{dados.totaisGerais.terceiros}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "8px", border: "1.5px solid rgba(197, 160, 89, 0.4)", overflow: "hidden", backgroundColor: "#0e1726", flexShrink: 0 }}>
                      <img
                        src={obterUrlAvatarCloudinary(dados.arquivoMaisUsado)}
                        alt={dados.cavaloMaisUsado}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => { e.currentTarget.src = "https://placehold.co/38x38/0e1726/c5a059?text=🐎"; }}
                      />
                    </div>
                    <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.2 }}>
                      <div style={{ fontSize: "7.5pt", fontWeight: 700, color: "rgba(164, 179, 198, 0.4)", letterSpacing: "0.5px" }}>MUSUME MAIS USADA</div>
                      <div style={{ fontSize: "10.5pt", fontWeight: 700, color: "#c5a059", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: "1px 0" }}>{dados.cavaloMaisUsado}</div>
                      <div style={{ fontSize: "7.5pt", color: "#a4b3c6", fontWeight: 500 }}>{dados.maiorUso}x utilizada</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* COLUNA DIREITA: Troféu de Destaque */}
              {(() => {
                const principalTrofeu = dados.trofeusEquipados.find((t) => t && t !== "Bloqueado") || "Bloqueado";
                const estaTrancado = principalTrofeu === "Bloqueado";
                return (
                  <div
                    className="ptr-profile-showcase-panel"
                    onClick={() => setTela("trofeus")}
                    style={{ width: "260px", background: "rgba(14, 23, 38, 0.4)", border: "1px solid rgba(164, 179, 198, 0.15)", borderRadius: "12px", padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", boxSizing: "border-box", flexShrink: 0, cursor: "pointer", height: "auto" }}
                  >
                    <div style={{ width: "100%", maxWidth: "110px", aspectRatio: "1/1", display: "flex", justifyContent: "center", alignItems: "center", position: "relative", marginBottom: "25px", opacity: estaTrancado ? 0.25 : 1 }}>
                      {estaTrancado ? (
                        <i className="fa-solid fa-lock" style={{ fontSize: "24pt", color: "rgba(164,179,198,0.3)" }}></i>
                      ) : (
                        <img
                          src={obterUrlTrofeuCloudinary(principalTrofeu)}
                          alt={principalTrofeu}
                          style={{ maxHeight: "115px", width: "auto", objectFit: "contain" }}
                          onError={(e) => { e.currentTarget.src = "https://placehold.co/140x140/0e1726/c5a059?text=%F0%9F%8F%86"; }}
                        />
                      )}
                    </div>
                    <span style={{ fontFamily: "'Cinzel', serif", fontSize: "8pt", fontWeight: 700, color: "#c5a059", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "8px" }}>Troféu de Destaque</span>
                    <h4 style={{ margin: "0 0 20px 0", fontSize: "13pt", fontWeight: 800, color: "#ffffff", lineHeight: 1.3, fontFamily: "'Montserrat'", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                      {estaTrancado ? "NENHUM EQUIPADO" : principalTrofeu}
                    </h4>
                    <span style={{ fontSize: "8pt", fontWeight: 800, color: "#a4b3c6", background: "rgba(11, 19, 32, 0.6)", padding: "5px 16px", borderRadius: "4px", textTransform: "uppercase", letterSpacing: "0.5px", border: "1px solid rgba(164, 179, 198, 0.08)" }}>
                      {estaTrancado ? "---" : "G1"}
                    </span>
                  </div>
                );
              })()}
            </div>
          )}

          {!carregando && !erro && dados && tela === "conquistas" && (
            <div style={{ padding: "5px 15px", boxSizing: "border-box", width: "100%", maxHeight: "70vh", overflowY: "auto" }}>
              <PainelConquistas docConquistas={dados.docConquistas} />
              <button
                onClick={() => setTela("principal")}
                style={{ marginTop: "20px", backgroundColor: "#0b1320", color: "#f1ead4", border: "2px solid #c5a059", borderRadius: "50px", padding: "11px 24px", fontFamily: "'Montserrat', sans-serif", fontSize: "10.5pt", fontWeight: 700, textTransform: "uppercase", cursor: "pointer" }}
              >
                <i className="fa-solid fa-arrow-left"></i> Voltar
              </button>
            </div>
          )}

          {!carregando && !erro && dados && tela === "galeria" && (
            <div style={{ fontFamily: "'Montserrat', sans-serif", padding: "5px 15px", boxSizing: "border-box", width: "100%" }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: "11pt", fontWeight: 700, color: "#c5a059", letterSpacing: "0.5px", textTransform: "uppercase", display: "block", marginBottom: "15px" }}>
                Selecione sua Atleta
              </span>

              <div style={{ marginBottom: "20px", position: "relative", width: "100%" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "15px", top: "50%", transform: "translateY(-50%)", color: "rgba(197, 160, 89, 0.5)", fontSize: "10pt" }}></i>
                <input
                  type="text"
                  placeholder="Buscar atleta por nome..."
                  value={buscaAvatar}
                  onChange={(e) => setBuscaAvatar(e.target.value)}
                  style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Montserrat', sans-serif", fontSize: "10pt", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "12px 12px 12px 40px", boxSizing: "border-box" }}
                />
              </div>

              <div id="ptr-grid-element" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", maxHeight: "290px", overflowY: "auto", padding: "10px 8px 8px 8px", boxSizing: "border-box", width: "100%" }}>
                {listaAvatares
                  .filter((a) => a.nome.toLowerCase().includes(buscaAvatar.toLowerCase().trim()))
                  .map((a) => (
                    <div
                      key={a.arquivo}
                      onClick={() => selecionarAvatar(a.arquivo)}
                      title={a.nome}
                      style={{ background: "rgba(14, 23, 38, 0.4)", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "12px", overflow: "hidden", aspectRatio: "1/1", cursor: "pointer", transition: "all 0.2s", display: "flex", justifyContent: "center", alignItems: "center", boxSizing: "border-box" }}
                    >
                      <img
                        src={obterUrlAvatarCloudinary(a.arquivo)}
                        loading="lazy"
                        alt={a.nome}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                  ))}
              </div>

              <div style={{ width: "100%", display: "flex", justifyContent: "flex-start", marginTop: "20px" }}>
                <button
                  onClick={() => setTela("principal")}
                  style={{ backgroundColor: "#0b1320", color: "#f1ead4", border: "2px solid #c5a059", borderRadius: "50px", padding: "10px 24px", fontFamily: "'Montserrat', sans-serif", fontSize: "9pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 15px rgba(0, 0, 0, 0.4)" }}
                >
                  <i className="fa-solid fa-arrow-left"></i> Voltar
                </button>
              </div>
            </div>
          )}

          {!carregando && !erro && dados && tela === "trofeus" && (
            <div style={{ fontFamily: "'Montserrat', sans-serif", padding: "5px 10px", boxSizing: "border-box", width: "100%" }}>
              <span style={{ fontFamily: "'Cinzel', serif", fontSize: "14pt", fontWeight: 700, color: "#c5a059", letterSpacing: "0.5px", textTransform: "uppercase", display: "block", marginBottom: "18px" }}>
                Slot de Exibição #1
              </span>

              <div style={{ marginBottom: "22px", position: "relative", width: "100%", boxSizing: "border-box" }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: "18px", top: "50%", transform: "translateY(-50%)", color: "rgba(197, 160, 89, 0.5)", fontSize: "13pt" }}></i>
                <input
                  type="text"
                  placeholder="Buscar troféu conquistado..."
                  value={buscaTrofeu}
                  onChange={(e) => setBuscaTrofeu(e.target.value)}
                  style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Montserrat', sans-serif", fontSize: "13pt", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "15px 15px 15px 48px", boxSizing: "border-box" }}
                />
              </div>

              <div id="ptr-grid-trofeus" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px", maxHeight: "460px", overflowY: "auto", padding: "12px 8px 8px 8px", boxSizing: "border-box", width: "100%" }}>
                {/* Opção Remover Troféu — sempre disponível, nunca bloqueada */}
                <div
                  onClick={() => selecionarTrofeu("Bloqueado")}
                  style={{ border: "2px dashed #ff6855", background: "rgba(255, 104, 85, 0.03)", borderRadius: "14px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", aspectRatio: "1/1.3", cursor: "pointer", transition: "all 0.2s", boxSizing: "border-box", padding: "14px", minWidth: 0 }}
                >
                  <i className="fa-solid fa-trash-can" style={{ fontSize: "30pt", color: "#ff6855", marginBottom: "10px" }}></i>
                  <span style={{ fontSize: "10pt", color: "#ff6855", fontWeight: 800, letterSpacing: "0.5px" }}>REMOVER</span>
                </div>

                {/* Troféus disponíveis, com estado bloqueado/desbloqueado */}
                {listaUnicasPistas
                  .filter((p) => p.nome.toLowerCase().includes(buscaTrofeu.toLowerCase().trim()))
                  .map((p) => {
                    const conquistou = dados.inventarioTrofeus.some((v) => v.toLowerCase().trim() === p.nome.toLowerCase().trim());
                    return (
                      <div
                        key={p.nome}
                        onClick={conquistou ? () => selecionarTrofeu(p.nome.trim()) : undefined}
                        style={{
                          background: "rgba(14, 23, 38, 0.5)",
                          borderRadius: "14px",
                          boxSizing: "border-box",
                          padding: "14px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "space-between",
                          aspectRatio: "1/1.3",
                          transition: "all 0.2s",
                          minWidth: 0,
                          border: conquistou ? "1px solid rgba(197, 160, 89, 0.35)" : "1px dashed rgba(164,179,198,0.15)",
                          opacity: conquistou ? 1 : 0.25,
                          cursor: conquistou ? "pointer" : "not-allowed",
                        }}
                      >
                        <div style={{ width: "100%", height: "65%", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {!conquistou && (
                            <i className="fa-solid fa-lock" style={{ position: "absolute", color: "rgba(255,255,255,0.4)", fontSize: "18pt", zIndex: 2 }}></i>
                          )}
                          <img
                            src={obterUrlTrofeuCloudinary(p.nome.trim())}
                            loading="lazy"
                            alt={p.nome}
                            style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain", filter: conquistou ? "drop-shadow(0 4px 8px rgba(0,0,0,0.5))" : "drop-shadow(0 4px 8px rgba(0,0,0,0.5)) grayscale(100%) opacity(0.5)" }}
                            onError={(e) => { e.currentTarget.src = "https://placehold.co/120x120/0e1726/c5a059?text=%3F"; }}
                          />
                        </div>
                        <div style={{ fontSize: "10pt", fontWeight: 700, textAlign: "center", width: "100%", color: "#f1ead4", height: "30%", boxSizing: "border-box", padding: "0 2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.25 }}>
                          <span style={{ color: "#c5a059", marginRight: "3px" }}>{p.grade}</span> - {p.nome}
                        </div>
                      </div>
                    );
                  })}
              </div>

              <div style={{ width: "100%", display: "flex", justifyContent: "flex-start", marginTop: "25px", boxSizing: "border-box" }}>
                <button
                  onClick={() => setTela("principal")}
                  style={{ backgroundColor: "#0b1320", color: "#f1ead4", border: "2px solid #c5a059", borderRadius: "50px", padding: "13px 28px", fontFamily: "'Montserrat', sans-serif", fontSize: "11.5pt", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "10px", boxShadow: "0 4px 15px rgba(0, 0, 0, 0.4)" }}
                >
                  <i className="fa-solid fa-arrow-left"></i> Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TrainerCardModal;