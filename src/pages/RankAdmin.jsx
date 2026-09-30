import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, getDocs, setDoc, collection, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { lerArquivoCorrida } from "../utils/arquivoCorrida";
import { bancoCorridas, bancoG1 } from "../data/bancos-corridas";

// 🎯 Nome da corrida → ID do percurso no jogo. Usado pra conferir o arquivo
// enviado quando a pista foi sorteada antes do campo course_id existir.
const COURSE_ID_POR_NOME = Object.fromEntries(
  [...bancoCorridas, ...bancoG1].filter((p) => p.courseId).map((p) => [p.nome, p.courseId])
);

// 🎯 CLOUDINARY: mesma conta usada nos troféus, com um preset dedicado
// pro upload não-assinado das páginas do jornal.
const CLOUDINARY_CLOUD_NAME = "k1qj4qrm";
const CLOUDINARY_UPLOAD_PRESET = "ptr_news";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// 🎯 Equivalente ao antigo enviarImagemParaCloudinary()
async function enviarImagemParaCloudinary(arquivo, pastaDestino) {
  const formData = new FormData();
  formData.append("file", arquivo);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", pastaDestino);

  const resposta = await fetch(CLOUDINARY_UPLOAD_URL, { method: "POST", body: formData });

  if (!resposta.ok) {
    const erroDetalhado = await resposta.json().catch(() => null);
    const mensagem = erroDetalhado?.error?.message || `Erro HTTP ${resposta.status}`;
    throw new Error(`Falha ao enviar "${arquivo.name}" para o Cloudinary: ${mensagem}`);
  }

  const dados = await resposta.json();
  return dados.secure_url;
}

// 🎯 PARTE 2/2 (final): trava de segurança + resultados das pistas (já
// prontos da Parte 1) + publicação do Jornal PTR com upload pro Cloudinary.
// 🎯 Ordem exata das 22 colunas do CSV exportado pela ferramenta de
// telemetria (sem o campo "rank", que não é usado). O nome interno
// continua "personagem" (não "cavalinha") de propósito — é o mesmo nome
// que o Rank Geral, o Perfil e o Jornal já esperam encontrar, então nada
// mais no site precisa mudar.
const CAMPOS_TELEMETRIA = [
  "posicao", "numero", "personagem", "treinador", "tempo", "distancia_diff",
  "style", "start_delay_ms", "start_delay_status", "last_spurt_delay_m",
  "last_spurt_speed", "last_spurt_speed_diff", "hp_status", "hp_m_diff", "hp_val",
  "hp_pct", "duel_s", "downhill_s", "downhill_detail", "pace_up_s", "pace_down_s", "wt_s",
];

// 🎯 Quais desses campos devem virar número (o resto fica como texto).
// "posicao" e "numero" são inteiros; o resto pode ter casa decimal e,
// às vezes, vir como "-" (ex: 1º lugar não tem diferença de distância).
const CAMPOS_NUMERICOS = new Set([
  "posicao", "numero", "distancia_diff", "start_delay_ms", "last_spurt_delay_m",
  "last_spurt_speed", "last_spurt_speed_diff", "hp_m_diff", "hp_val", "hp_pct",
  "duel_s", "downhill_s", "pace_up_s", "pace_down_s", "wt_s",
]);

function parsearNumeroTelemetria(valorBruto) {
  const limpo = (valorBruto || "").trim();
  if (limpo === "-" || limpo === "") return null; // Ex: distancia_diff do 1º colocado
  const numero = parseFloat(limpo);
  return isNaN(numero) ? null : numero;
}

// 🎯 Converte 1 linha do CSV colado em um objeto com os 22 campos
// nomeados. Retorna { dados } se deu certo, ou { erro } com uma
// mensagem legível se a linha não bateu com o formato esperado.
function parsearLinhaTelemetria(linha, numeroDaLinha) {
  const colunas = linha.split(",").map((c) => c.trim());

  if (colunas.length !== CAMPOS_TELEMETRIA.length) {
    return { erro: `Linha ${numeroDaLinha}: esperava ${CAMPOS_TELEMETRIA.length} colunas, encontrei ${colunas.length}.` };
  }

  const objeto = {};
  CAMPOS_TELEMETRIA.forEach((nomeCampo, indice) => {
    const valorBruto = colunas[indice];
    if (nomeCampo === "posicao" || nomeCampo === "numero") {
      objeto[nomeCampo] = parseInt(valorBruto, 10);
    } else if (CAMPOS_NUMERICOS.has(nomeCampo)) {
      objeto[nomeCampo] = parsearNumeroTelemetria(valorBruto);
    } else {
      objeto[nomeCampo] = valorBruto;
    }
  });

  if (isNaN(objeto.posicao)) {
    return { erro: `Linha ${numeroDaLinha}: posição inválida ("${colunas[0]}").` };
  }

  return { dados: objeto };
}

function RankAdmin() {
  const navigate = useNavigate();

  // 🎯 "verificando" | "negado-login" | "negado-permissao" | "liberado"
  const [statusAcesso, setStatusAcesso] = useState("verificando");

  useEffect(() => {
    const pararDeObservar = onAuthStateChanged(auth, async (usuario) => {
      if (!usuario) {
        setStatusAcesso("negado-login");
        return;
      }
      try {
        const docSnap = await getDoc(doc(db, "treinadores", usuario.uid));
        if (docSnap.exists() && docSnap.data().nivelAcesso === "admin") {
          setStatusAcesso("liberado");
        } else {
          setStatusAcesso("negado-permissao");
        }
      } catch (erro) {
        console.error("Erro na validação de segurança:", erro);
        setStatusAcesso("negado-permissao");
      }
    });
    return () => pararDeObservar();
  }, []);

  // 🎯 Modal de notificação genérico (equivalente ao antigo exibirModalPTR)
  const [modalNotif, setModalNotif] = useState({ aberto: false, titulo: "", mensagem: "", tipo: "sucesso" });
  function abrirModalNotificacao(titulo, mensagem, tipo = "sucesso") {
    setModalNotif({ aberto: true, titulo, mensagem, tipo });
  }

  // 🎯 Anúncio manual de abertura do Check-in no Discord (Parte 3/4 do
  // Check-in de Presença) — reaproveita o mesmo Worker e o mesmo padrão
  // de busca de token que o Sorteio já usa pra falar com o Discord.
  const [enviandoAnuncioCheckin, setEnviandoAnuncioCheckin] = useState(false);

  async function anunciarAberturaDoCheckin() {
    setEnviandoAnuncioCheckin(true);
    try {
      const usuario = auth.currentUser;
      if (!usuario) {
        abrirModalNotificacao("Sessão Expirada", "Faça login novamente antes de anunciar.", "erro");
        return;
      }

      const configSnap = await getDoc(doc(db, "config", "discord"));
      const workerToken = configSnap.exists() ? configSnap.data().workerToken : null;
      if (!workerToken) {
        abrirModalNotificacao("Configuração Ausente", "❌ workerToken não encontrado em config/discord.", "erro");
        return;
      }

      const resposta = await fetch("https://pocolordstr-discord.felipe-a-silva754.workers.dev/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Worker-Token": workerToken },
        body: JSON.stringify({ tipo: "checkin_aberto", edicao: edicaoAtual }),
      });

      if (!resposta.ok) {
        const erroTexto = await resposta.text();
        console.error("Discord recusou o anúncio de check-in:", resposta.status, erroTexto);
        abrirModalNotificacao("Erro ao Enviar", "❌ O Discord recusou o anúncio. Confira o console.", "erro");
        return;
      }

      abrirModalNotificacao("Anúncio Enviado!", "📢 Aviso de abertura do Check-in enviado com sucesso para o Discord!", "sucesso");
    } catch (erro) {
      console.error("Erro ao anunciar abertura do check-in:", erro);
      abrirModalNotificacao("Erro de Conexão", "❌ Não foi possível contatar o servidor.", "erro");
    } finally {
      setEnviandoAnuncioCheckin(false);
    }
  }

  // 🎯 Dados da rodada ativa (equivalente ao inicializarPainelAdminRanks)
  const [semRodada, setSemRodada] = useState(false);
  const [pistasAtivas, setPistasAtivas] = useState([]);
  const [edicaoAtual, setEdicaoAtual] = useState("01");
  const [edicaoAtivaId, setEdicaoAtivaId] = useState(null);
  const [climaAtual, setClimaAtual] = useState("Aguardando...");

  // 🎯 Um texto de textarea por pista, guardado num objeto { indice: texto }
  const [terrenoAtual, setTerrenoAtual] = useState("");

  const [textareaValores, setTextareaValores] = useState({});
  const [linksReplay, setLinksReplay] = useState({});

  // 🎯 Arquivo de corrida carregado em cada card (mesma chave do textarea):
  // { nomeArquivo, dados, avisos }. Quando existe, substitui o CSV colado.
  const [arquivosCorrida, setArquivosCorrida] = useState({});

  // 🎯 Nomes dos treinadores cadastrados (minúsculo), pra avisar na prévia
  // quando um nome do arquivo não bate com nenhum perfil do site.
  const [nomesTreinadores, setNomesTreinadores] = useState(null);

  // 🎯 Estados do formulário de publicação do Jornal PTR
  const [jornalTitulo, setJornalTitulo] = useState("");
  const [jornalNumero, setJornalNumero] = useState("");
  const [jornalArquivos, setJornalArquivos] = useState([]);
  const [enviandoJornal, setEnviandoJornal] = useState(false);
  const [textoBotaoJornal, setTextoBotaoJornal] = useState("PUBLICAR EDIÇÃO");

  useEffect(() => {
    if (statusAcesso !== "liberado") return;

    const pararDeObservar = onSnapshot(doc(db, "pistas_sorteadas", "atual"), (snap) => {
      if (!snap.exists()) {
        setSemRodada(true);
        setPistasAtivas([]);
        return;
      }
      const dadosRodada = snap.data();
      setSemRodada(false);
      if (dadosRodada.edicaoAtiva) {
        setEdicaoAtual(dadosRodada.edicaoAtiva.replace("edicao_", ""));
        setEdicaoAtivaId(dadosRodada.edicaoAtiva);
      }
      setClimaAtual(dadosRodada.clima || "Aguardando...");
      setTerrenoAtual(dadosRodada.condicao_terreno || "");
      setPistasAtivas(dadosRodada.pistas || []);
    });

    return () => pararDeObservar();
  }, [statusAcesso]);

  useEffect(() => {
    if (statusAcesso !== "liberado") return;
    getDocs(collection(db, "treinadores"))
      .then((snapshot) => {
        const nomes = new Set();
        snapshot.forEach((d) => {
          const nome = d.data().nomeTreinador;
          if (nome) nomes.add(nome.toLowerCase().trim());
        });
        setNomesTreinadores(nomes);
      })
      .catch((erro) => console.error("Erro ao carregar treinadores (RankAdmin):", erro));
  }, [statusAcesso]);

  // 🎯 Lê o arquivo de corrida escolhido num card e monta a prévia com os
  // avisos de conferência (percurso, clima/terreno, treinadores).
  async function carregarArquivoCorrida(chave, pista, arquivo) {
    if (!arquivo) return;
    try {
      const dados = await lerArquivoCorrida(await arquivo.text());
      const avisos = [];
      if (dados.avisoCalculo) avisos.push(dados.avisoCalculo);

      const courseEsperado = pista.course_id ?? COURSE_ID_POR_NOME[pista.nome] ?? null;
      if (courseEsperado && dados.condicoes.courseId !== courseEsperado) {
        avisos.push(`O percurso do arquivo (${dados.condicoes.courseId}) é diferente do sorteado para "${pista.nome}" (${courseEsperado}). Confira se a sala foi criada na pista certa.`);
      }
      const climaSorteado = (climaAtual || "").toLowerCase();
      if (dados.condicoes.clima && climaSorteado && climaSorteado !== "aguardando..." && dados.condicoes.clima !== climaSorteado) {
        avisos.push(`Clima do arquivo: ${dados.condicoes.clima} — sorteado: ${climaSorteado}.`);
      }
      const terrenoSorteado = (terrenoAtual || "").toLowerCase();
      if (dados.condicoes.terreno && terrenoSorteado && dados.condicoes.terreno !== terrenoSorteado) {
        avisos.push(`Terreno do arquivo: ${dados.condicoes.terreno} — sorteado: ${terrenoSorteado}.`);
      }
      if (nomesTreinadores) {
        const naoEncontrados = dados.classificacao
          .map((l) => l.treinador)
          .filter((nome) => !nomesTreinadores.has(nome.toLowerCase().trim()));
        if (naoEncontrados.length > 0) {
          avisos.push(`Sem perfil cadastrado com esse nome: ${naoEncontrados.join(", ")}. Essas linhas não vão pontuar para ninguém.`);
        }
      }

      setArquivosCorrida((v) => ({ ...v, [chave]: { nomeArquivo: arquivo.name, dados, avisos } }));
    } catch (erro) {
      console.error("Erro ao ler arquivo de corrida:", erro);
      abrirModalNotificacao("Arquivo Inválido", `⚠️ ${erro.message}`, "erro");
    }
  }

  function removerArquivoCorrida(chave) {
    setArquivosCorrida((v) => {
      const novo = { ...v };
      delete novo[chave];
      return novo;
    });
  }

  // 🎯 Mesma lógica do Sorteio/Agenda: se algum confirmado da edição ativa
  // já tem "grupo" gravado, os grupos A/B estão em vigor — cada corrida
  // precisa de 2 lançamentos de resultado (um por grupo), não 1.
  const [gruposAtivos, setGruposAtivos] = useState(false);

  useEffect(() => {
    if (statusAcesso !== "liberado" || !edicaoAtivaId) return;
    const pararDeObservar = onSnapshot(
      collection(db, "checkins", edicaoAtivaId, "confirmados"),
      (snapshot) => setGruposAtivos(snapshot.docs.some((d) => d.data().grupo)),
      (erro) => console.error("Erro ao observar grupos (RankAdmin):", erro)
    );
    return () => pararDeObservar();
  }, [statusAcesso, edicaoAtivaId]);

  // 🎯 Com grupos ativos, cada pista sorteada vira 2 cards de lançamento
  // (Grupo A e Grupo B) em vez de 1 — cada um com seu próprio textarea,
  // link de replay e chave de estado própria (senão os dois compartilham
  // o mesmo valor por causa do índice repetido).
  const cardsResultado = gruposAtivos
    ? pistasAtivas.flatMap((pista, index) => [
        { chave: `${index}-A`, pista, grupo: "A" },
        { chave: `${index}-B`, pista, grupo: "B" },
      ])
    : pistasAtivas.map((pista, index) => ({ chave: `${index}`, pista, grupo: null }));

  // 🎯 Equivalente ao antigo window.processarESalvarResultadoPista. "chave"
  // é a chave de estado do card (ex: "2" sem grupo, ou "2-A"/"2-B" com
  // grupo) — "grupo" (null | "A" | "B") vai tanto pro doc salvo quanto pro
  // ID do documento, senão os 2 lançamentos da mesma corrida se
  // sobrescreveriam no Firestore.
  async function salvarResultadoPista(chave, pista, grupo) {
    // 🎯 Com arquivo de corrida carregado no card, ele substitui o CSV.
    const arquivo = arquivosCorrida[chave];
    let listaClassificacaoJSON = [];
    let treinadorVencedor = "Não Registrado";
    let cavaloVencedor = "Não Registrado";

    if (arquivo) {
      listaClassificacaoJSON = arquivo.dados.classificacao;
      const vencedor = listaClassificacaoJSON.find((l) => l.posicao === 1);
      if (vencedor) {
        treinadorVencedor = vencedor.treinador;
        cavaloVencedor = vencedor.personagem;
      }
      if (listaClassificacaoJSON.length === 0) {
        abrirModalNotificacao("Arquivo Inválido", "⚠️ Nenhum treinador encontrado no arquivo (só NPCs).", "erro");
        return;
      }
    } else {
      const texto = (textareaValores[chave] || "").trim();

      if (texto === "") {
        abrirModalNotificacao("Campo Vazio", "⚠️ Por favor, envie o arquivo da corrida ou cole o texto de classificação antes de salvar!", "erro");
        return;
      }

      const linhas = texto.split("\n").map((l) => l.trim()).filter((l) => l !== "");
      let erros = [];

      linhas.forEach((linha, indice) => {
        // Pula uma eventual linha de cabeçalho (ex: "posicao,numero,cavalinha,...")
        const primeiraColuna = linha.split(",")[0].trim().toLowerCase();
        if (primeiraColuna === "posicao" || primeiraColuna === "posição" || primeiraColuna === "finish") return;

        const resultado = parsearLinhaTelemetria(linha, indice + 1);
        if (resultado.erro) {
          erros.push(resultado.erro);
          return;
        }

        listaClassificacaoJSON.push(resultado.dados);
        if (resultado.dados.posicao === 1) {
          treinadorVencedor = resultado.dados.treinador;
          cavaloVencedor = resultado.dados.personagem;
        }
      });

      if (erros.length > 0) {
        const mensagemErro = erros.length === 1 ? erros[0] : `${erros[0]} (e mais ${erros.length - 1} linha(s) com problema)`;
        abrirModalNotificacao("Formato Inválido", `⚠️ ${mensagemErro}`, "erro");
        return;
      }

      if (listaClassificacaoJSON.length === 0) {
        abrirModalNotificacao("Formato Inválido", "Nenhuma linha válida encontrada. Confira se o CSV colado tem 22 colunas por linha.", "erro");
        return;
      }
    }

    try {
      const globaisSnap = await getDoc(doc(db, "pistas_sorteadas", "atual"));
      const edicaoId = globaisSnap.exists() ? globaisSnap.data().edicaoAtiva || "edicao_01" : "edicao_01";
      const chaveUnicaCorrida = `${edicaoId}_pista_${pista.nome.replace(/[^a-zA-Z0-9]/g, "")}${grupo ? `-${grupo}` : ""}`;

      await setDoc(doc(db, "resultados_partidas", chaveUnicaCorrida), {
        edicaoId,
        pistaNome: pista.nome,
        grade: pista.grade,
        hipodromo: pista.hipodromo,
        distancia: `${pista.distancia_tipo} (${pista.distancia_numero}m)`,
        terreno: pista.terreno,
        clima: climaAtual,
        treinadorVencedor,
        cavaloVencedor,
        classificacao: listaClassificacaoJSON,
        dataRegistro: new Date().toLocaleDateString("pt-BR"),
        linkReplay: (linksReplay[chave] || "").trim(),
        ...(grupo ? { grupo } : {}),
        // 🎯 Só existe quando o resultado veio do arquivo de corrida: as
        // condições reais e os dados de cada treinador (deck, aptidões,
        // stats, skills), guardados pras conquistas.
        ...(arquivo
          ? {
              origem: "arquivo",
              condicoesArquivo: arquivo.dados.condicoes,
              dadosTreinadores: arquivo.dados.dadosTreinadores,
            }
          : {}),
      });

      // 🎯 Dados brutos da corrida pro replay futuro (~40 KB), numa coleção
      // separada pra não pesar a página de Resultados. Se falhar (ex: regra
      // do Firestore ainda não liberada), o placar já está salvo mesmo assim.
      let avisoReplay = "";
      if (arquivo) {
        try {
          await setDoc(doc(db, "replays_partidas", chaveUnicaCorrida), {
            ...arquivo.dados.replay,
            edicaoId,
            pistaNome: pista.nome,
            ...(grupo ? { grupo } : {}),
            enviadoEm: serverTimestamp(),
          });
        } catch (erroReplay) {
          console.error("Erro ao salvar dados do replay:", erroReplay);
          avisoReplay = " ⚠️ Os dados do replay não puderam ser salvos (confira as regras do Firestore para a coleção replays_partidas).";
        }
      }

      abrirModalNotificacao("Placar Computado", `🛰️ Resultados de "${pista.nome}"${grupo ? ` (Grupo ${grupo})` : ""} salvos com sucesso no banco de dados global!${avisoReplay}`, "sucesso");
      setTextareaValores((v) => ({ ...v, [chave]: "" }));
      setLinksReplay((v) => ({ ...v, [chave]: "" }));
      removerArquivoCorrida(chave);
    } catch (error) {
      console.error("Erro ao salvar resultado:", error);
      abrirModalNotificacao("Erro de Gravação", "❌ Erro interno ao processar e sincronizar os dados.", "erro");
    }
  }

  // 🎯 Equivalente ao antigo formJornal.addEventListener("submit", ...)
  async function handleSubmitJornal(e) {
    e.preventDefault();

    const titulo = jornalTitulo.trim();
    const numeroEdicao = parseInt(jornalNumero.trim(), 10);

    if (!titulo || isNaN(numeroEdicao) || jornalArquivos.length === 0) {
      abrirModalNotificacao("Dados Incompletos", "⚠️ Por favor, preencha todos os campos do jornal e anexe as imagens.", "erro");
      return;
    }

    const todosSaoWebp = jornalArquivos.every((arquivo) => arquivo.name.toLowerCase().endsWith(".webp"));
    if (!todosSaoWebp) {
      abrirModalNotificacao("Formato Recusado", "❌ O sistema exige estritamente páginas salvadas na extensão .WEBP!", "erro");
      return;
    }

    const edicaoFormatada = numeroEdicao < 10 ? `edicao_0${numeroEdicao}` : `edicao_${numeroEdicao}`;

    setEnviandoJornal(true);
    setTextoBotaoJornal("ENVIANDO PÁGINAS...");

    try {
      const urlsPaginas = [];

      for (let i = 0; i < jornalArquivos.length; i++) {
        const arquivo = jornalArquivos[i];
        const numeroPagina = i + 1;
        const pastaDestino = `jornal/${edicaoFormatada}`;

        setTextoBotaoJornal(`ENVIANDO PÁG. ${numeroPagina}/${jornalArquivos.length}...`);
        const urlPublica = await enviarImagemParaCloudinary(arquivo, pastaDestino);
        urlsPaginas.push(urlPublica);
      }

      setTextoBotaoJornal("GRAVANDO NO FIRESTORE...");

      const dadosJornalObj = {
        numero_edicao: numeroEdicao,
        titulo: titulo,
        data_postagem: serverTimestamp(),
        paginas: urlsPaginas,
      };

      // 1. Salva no ID histórico específico da edição (ex: edicao_42)
      await setDoc(doc(db, "jornais", edicaoFormatada), dadosJornalObj);
      // 2. Espelha no documento "atual", usado pela Home/Jornal público
      await setDoc(doc(db, "jornais", "atual"), dadosJornalObj);

      abrirModalNotificacao(
        "Jornal Publicado!",
        `📰 A Edição Nº ${numeroEdicao} (${titulo}) foi catalogada e definida como a EDIÇÃO ATIVA com sucesso com ${urlsPaginas.length} páginas.`,
        "sucesso"
      );

      // Reseta o formulário
      setJornalTitulo("");
      setJornalNumero("");
      setJornalArquivos([]);
    } catch (error) {
      console.error("Erro ao publicar edição do jornal:", error);
      abrirModalNotificacao("Falha Crítica", `❌ Não foi possível publicar o jornal: ${error.message}`, "erro");
    } finally {
      setEnviandoJornal(false);
      setTextoBotaoJornal("PUBLICAR EDIÇÃO");
    }
  }

  // ==========================================================================
  // TELAS DE BLOQUEIO (equivalente ao seguranca-sorteio.js)
  // ==========================================================================
  if (statusAcesso === "verificando") {
    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#c5a059", fontFamily: "'Montserrat', sans-serif" }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: "10px" }}></i> Verificando credenciais de acesso...
      </div>
    );
  }

  if (statusAcesso === "negado-login" || statusAcesso === "negado-permissao") {
    const titulo = statusAcesso === "negado-login" ? "Acesso Restrito" : "Operação Negada";
    const mensagem =
      statusAcesso === "negado-login"
        ? "Esta área é exclusiva da Comissão Executiva da PTR. Por favor, realize o login com uma credencial autorizada."
        : "Sua licença atual de Treinador não possui nível de acesso administrativo para gerenciar ou visualizar os sorteios oficiais.";

    return (
      <div style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
        <div style={{ maxWidth: "550px", padding: "45px", border: "3px solid #ff4d4d", borderRadius: "12px", background: "#0b1320", textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.7)" }}>
          <h3 style={{ color: "#ff4d4d", borderBottom: "2px solid rgba(255,77,77,0.2)", paddingBottom: "15px", fontSize: "20pt", marginTop: 0, marginBottom: "20px", fontFamily: "'Cinzel', serif" }}>
            {titulo}
          </h3>
          <p style={{ fontSize: "13pt", lineHeight: 1.6, marginBottom: "35px", color: "#a4b3c6", fontFamily: "'Montserrat', sans-serif" }}>
            {mensagem}
          </p>
          <button
            onClick={() => navigate(statusAcesso === "negado-login" ? "/login" : "/")}
            style={{ background: "#ff4d4d", border: "none", color: "#fff", fontSize: "11pt", padding: "15px 38px", cursor: "pointer", borderRadius: "6px", fontWeight: 700, textTransform: "uppercase" }}
          >
            {statusAcesso === "negado-login" ? "Ir para Login" : "Voltar ao Início"}
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // PAINEL DE ADMIN DE VERDADE
  // ==========================================================================
  return (
    <>
      <main className="main-layout-wrapper" style={{ marginTop: "130px", padding: "0 24px", minHeight: "calc(100vh - 350px)" }}>
        <div className="lottery-header">
          <h2 className="lottery-main-title" style={{ color: "#ff6855" }}>Administração de Resultados</h2>
          <div className="lottery-title-divider" style={{ backgroundColor: "#ff6855", boxShadow: "0 0 10px rgba(255,104,85,0.5)" }}></div>
          <p className="lottery-subtitle">Insira o relatório de posições das corridas ativas na stream para computar os rankings globais.</p>
        </div>

        {/* Anúncio manual de abertura do Check-in */}
        <div style={{ textAlign: "center", margin: "-10px 0 35px 0" }}>
          <button
            type="button"
            onClick={anunciarAberturaDoCheckin}
            disabled={enviandoAnuncioCheckin}
            className="btn-trigger-lottery"
            style={{ maxWidth: "420px", margin: "0 auto", padding: "12px 24px", fontSize: "9.5pt", background: "#0b1320", color: "#1bd39e", border: "2px solid #1bd39e", opacity: enviandoAnuncioCheckin ? 0.6 : 1 }}
          >
            <i className={`fa-brands fa-discord`}></i> {enviandoAnuncioCheckin ? "ENVIANDO..." : "📢 Anunciar Abertura do Check-in"}
          </button>
        </div>

        {/* Container das pistas ativas */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px", alignItems: "center", width: "100%", maxWidth: "850px", margin: "0 auto 50px auto" }}>
          {semRodada ? (
            <div className="lottery-card" style={{ width: "100%", padding: "40px", borderColor: "rgba(255,104,85,0.25)" }}>
              <span style={{ color: "#ff6855", fontWeight: 600 }}>
                ⚠️ Nenhuma rodada ativa encontrada. Realize um sorteio e clique em 'GERAR E FIXAR CARDS' primeiro!
              </span>
            </div>
          ) : pistasAtivas.length === 0 ? (
            <div className="lottery-card" style={{ width: "100%", padding: "40px", borderColor: "rgba(255,104,85,0.25)" }}>
              <span style={{ color: "#5f758e", fontStyle: "italic" }}>
                Aguardando a exportação de dados estruturados do sorteador... Certifique-se de clicar no botão de Fixar Cards na Agenda.
              </span>
            </div>
          ) : (
            cardsResultado.map(({ chave, pista, grupo }) => {
              const corGrade = pista.grade === "G1" ? "#c5a059" : "#a4b3c6";
              const bordaGrade = pista.grade === "G1" ? "rgba(197, 160, 89, 0.4)" : "rgba(164, 179, 198, 0.2)";

              return (
                <div
                  key={chave}
                  className="lottery-card"
                  style={{ width: "100%", padding: "35px", border: `1px solid ${bordaGrade}`, background: "#0d1624", textAlign: "left", alignItems: "flex-start", marginBottom: "25px", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)", position: "relative", display: "flex", flexDirection: "column" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottom: "1px solid rgba(197, 160, 89, 0.15)", paddingBottom: "15px", marginBottom: "20px" }}>
                    <div>
                      <span
                        className={`lottery-card-badge${pista.grade === "G1" ? " badge-gold" : ""}`}
                        style={{ position: "static", transform: "none", display: "inline-block", fontFamily: "'Montserrat', sans-serif", fontSize: "8pt", fontWeight: 700, padding: "4px 12px", borderRadius: "4px" }}
                      >
                        {pista.grade} • ED. {edicaoAtual}{grupo ? ` • GRUPO ${grupo}` : ""}
                      </span>
                      <h3 style={{ margin: "8px 0 0 0", color: "#ffffff", fontSize: "16pt", fontFamily: "'Cinzel', serif", fontWeight: 700, letterSpacing: "0.5px" }}>
                        {pista.nome}{grupo && <span style={{ color: "#c5a059" }}> — Grupo {grupo}</span>}
                      </h3>
                    </div>
                    <div style={{ fontSize: "24pt", color: corGrade, opacity: 0.35, fontFamily: "'Cinzel', serif", fontWeight: 900 }}>{pista.grade}</div>
                  </div>

                  <div style={{ margin: "0 0 25px 0", display: "flex", flexWrap: "wrap", gap: "15px", fontSize: "9.5pt", color: "#a4b3c6", fontFamily: "'Montserrat', sans-serif", background: "rgba(11, 19, 32, 0.4)", padding: "10px 15px", borderRadius: "6px", width: "100%", boxSizing: "border-box" }}>
                    <span><i className="fa-solid fa-location-dot" style={{ color: "#c5a059" }}></i> <strong>Hipódromo:</strong> {pista.hipodromo}</span>
                    <span style={{ color: "rgba(197, 160, 89, 0.3)" }}>|</span>
                    <span><i className="fa-solid fa-bolt" style={{ color: "#c5a059" }}></i> <strong>Distância:</strong> {pista.distancia_tipo} ({pista.distancia_numero}m)</span>
                    <span style={{ color: "rgba(197, 160, 89, 0.3)" }}>|</span>
                    <span><i className="fa-solid fa-mountain" style={{ color: "#c5a059" }}></i> <strong>Terreno:</strong> {pista.terreno}</span>
                  </div>

                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "25px" }}>
                    <label style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 700, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <i className="fa-solid fa-file-import"></i> Arquivo da Corrida (o mesmo enviado ao Hakuraku)
                    </label>

                    {!arquivosCorrida[chave] ? (
                      <label style={{ display: "inline-flex", alignItems: "center", gap: "10px", alignSelf: "flex-start", cursor: "pointer", fontFamily: "'Montserrat', sans-serif", fontSize: "9.5pt", fontWeight: 600, color: "#f1ead4", background: "#0b1320", border: "1px dashed rgba(197, 160, 89, 0.5)", borderRadius: "8px", padding: "12px 20px" }}>
                        <i className="fa-solid fa-upload" style={{ color: "#c5a059" }}></i> Escolher arquivo .json
                        <input
                          type="file"
                          accept=".json,application/json"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            carregarArquivoCorrida(chave, pista, e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    ) : (() => {
                      const { nomeArquivo, dados, avisos } = arquivosCorrida[chave];
                      return (
                        <div style={{ background: "#0b1320", border: "1px solid rgba(27, 211, 158, 0.3)", borderRadius: "8px", padding: "15px", fontFamily: "'Montserrat', sans-serif", fontSize: "9pt", color: "#a4b3c6" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                            <span style={{ color: "#1bd39e", fontWeight: 700 }}>
                              <i className="fa-solid fa-circle-check"></i> {nomeArquivo}
                            </span>
                            <button
                              type="button"
                              onClick={() => removerArquivoCorrida(chave)}
                              style={{ background: "transparent", border: "1px solid rgba(224, 75, 55, 0.5)", color: "#e04b37", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "8.5pt" }}
                            >
                              Remover
                            </button>
                          </div>
                          <div style={{ marginBottom: "10px" }}>
                            {dados.classificacao.length} treinadores • {dados.npcsIgnorados} NPCs ignorados • {dados.condicoes.distancia}m • {dados.condicoes.clima ?? "?"} / {dados.condicoes.terreno ?? "?"}
                          </div>
                          {avisos.map((aviso) => (
                            <div key={aviso} style={{ color: "#d99a4e", background: "rgba(217, 154, 78, 0.08)", border: "1px solid rgba(217, 154, 78, 0.3)", borderRadius: "6px", padding: "6px 10px", marginBottom: "6px" }}>
                              ⚠️ {aviso}
                            </div>
                          ))}
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "6px" }}>
                            <tbody>
                              {dados.classificacao.map((linha) => (
                                <tr key={linha.numero} style={{ borderTop: "1px solid rgba(164, 179, 198, 0.1)" }}>
                                  <td style={{ padding: "4px 6px", color: "#c5a059", fontWeight: 700 }}>{linha.posicao}º</td>
                                  <td style={{ padding: "4px 6px", color: "#f1ead4" }}>{linha.personagem}</td>
                                  <td style={{ padding: "4px 6px" }}>[{linha.treinador}]</td>
                                  <td style={{ padding: "4px 6px", textAlign: "right" }}>{linha.tempo}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ width: "100%", display: arquivosCorrida[chave] ? "none" : "flex", flexDirection: "column", gap: "10px", marginBottom: "25px" }}>
                    <label style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 700, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <i className="fa-solid fa-clipboard-list"></i> Ou cole o CSV (Relatório de Posições da Stream)
                    </label>
                    <textarea
                      rows={6}
                      placeholder={"Cole aqui o CSV exportado pela ferramenta (22 colunas por linha):\nposicao,numero,cavalinha,treinador,tempo,distancia_diff,style,start_delay_ms,start_delay_status,last_spurt_delay_m,last_spurt_speed,last_spurt_speed_diff,hp_status,hp_m_diff,hp_val,hp_pct,duel_s,downhill_s,downhill_detail,pace_up_s,pace_down_s,wt_s"}
                      value={textareaValores[chave] || ""}
                      onChange={(e) => setTextareaValores((v) => ({ ...v, [chave]: e.target.value }))}
                      style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Courier New', monospace", fontSize: "10pt", fontWeight: 600, color: "#f1ead4", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "15px" }}
                    />
                  </div>

                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px", marginBottom: "25px" }}>
                    <label style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 700, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <i className="fa-solid fa-link"></i> Link de Detalhes da Corrida (opcional)
                    </label>
                    <input
                      type="url"
                      placeholder="https://..."
                      value={linksReplay[chave] || ""}
                      onChange={(e) => setLinksReplay((v) => ({ ...v, [chave]: e.target.value }))}
                      style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Montserrat', sans-serif", fontSize: "9.5pt", color: "#f1ead4", boxSizing: "border-box", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "12px 15px" }}
                    />
                  </div>

                  <div style={{ width: "100%", display: "flex", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => salvarResultadoPista(chave, pista, grupo)}
                      className="ptr-btn-confirm"
                      style={{ marginTop: 0, width: "auto", padding: "14px 35px", display: "flex", alignItems: "center", gap: "10px", fontSize: "10pt", letterSpacing: "1px" }}
                    >
                      <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: "11pt" }}></i> COMPUTAR PLACAR OFICIAL
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* SEÇÃO DE UPLOAD DO JORNAL PTR */}
        <div style={{ display: "flex", flexDirection: "column", gap: "30px", alignItems: "center", width: "100%", maxWidth: "850px", margin: "0 auto 50px auto" }}>
          <div className="lottery-card" style={{ width: "100%", padding: "40px", borderColor: "rgba(255,104,85,0.25)", background: "#0d1624", textAlign: "left", borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", borderBottom: "1px solid rgba(197, 160, 89, 0.15)", paddingBottom: "15px", marginBottom: "20px" }}>
              <div>
                <span style={{ display: "inline-block", fontFamily: "'Montserrat', sans-serif", fontSize: "8pt", fontWeight: 700, padding: "4px 12px", borderRadius: "4px", background: "#ff6855", color: "#fff" }}>
                  MÍDIA PTR
                </span>
                <h3 style={{ margin: "8px 0 0 0", color: "#ffffff", fontSize: "16pt", fontFamily: "'Cinzel', serif", fontWeight: 700, letterSpacing: "0.5px" }}>Publicar Jornal PTR</h3>
              </div>
              <div style={{ fontSize: "24pt", color: "#ff6855", opacity: 0.2, fontFamily: "'Cinzel', serif", fontWeight: 900 }}>MÍDIA</div>
            </div>

            <form onSubmit={handleSubmitJornal} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ display: "flex", gap: "20px", width: "100%", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "280px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 700, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Título da Edição
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Clássico de Domingo Intenso!"
                    value={jornalTitulo}
                    onChange={(e) => setJornalTitulo(e.target.value)}
                    style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Montserrat', sans-serif", fontSize: "10pt", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "12px", boxSizing: "border-box" }}
                  />
                </div>

                <div style={{ width: "150px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 700, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px" }}>
                    Nº da Edição
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="Ex: 42"
                    min="1"
                    value={jornalNumero}
                    onChange={(e) => setJornalNumero(e.target.value)}
                    style={{ width: "100%", backgroundColor: "#0b1320", fontFamily: "'Montserrat', sans-serif", fontSize: "10pt", color: "#f1ead4", border: "1px solid rgba(197, 160, 89, 0.2)", borderRadius: "8px", padding: "12px", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "10px" }}>
                <label style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", fontWeight: 700, color: "#c5a059", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Páginas do Jornal (.webp)
                </label>

                <label
                  htmlFor="jornal-paginas"
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", minHeight: "140px", background: "rgba(11, 19, 32, 0.6)", border: "2px dashed rgba(197, 160, 89, 0.3)", borderRadius: "12px", cursor: "pointer", transition: "all 0.3s ease", boxSizing: "border-box", padding: "25px", textAlign: "center" }}
                >
                  <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: "28pt", color: "#ff6855", marginBottom: "12px", filter: "drop-shadow(0 0 8px rgba(255,104,85,0.4))" }}></i>
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "10.5pt", color: "#ffffff", fontWeight: 600, marginBottom: "5px" }}>
                    Clique aqui para selecionar as páginas
                  </span>
                  <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: "8.5pt", color: "#a4b3c6" }}>
                    {jornalArquivos.length > 0 ? (
                      <>🔥 <strong style={{ color: "#ff6855" }}>{jornalArquivos.length}</strong> arquivo(s) pronto(s) para o envio!</>
                    ) : (
                      <>Apenas arquivos no formato <strong style={{ color: "#c5a059" }}>.webp</strong></>
                    )}
                  </span>
                  <input
                    type="file"
                    id="jornal-paginas"
                    multiple
                    accept=".webp"
                    required
                    style={{ display: "none" }}
                    onChange={(e) => setJornalArquivos(Array.from(e.target.files))}
                  />
                </label>
              </div>

              <div style={{ width: "100%", display: "flex", justifyContent: "flex-end", marginTop: "10px" }}>
                <button
                  type="submit"
                  disabled={enviandoJornal}
                  className="ptr-btn-confirm"
                  style={{ marginTop: 0, width: "auto", padding: "14px 35px", display: "flex", alignItems: "center", gap: "10px", fontSize: "10pt", letterSpacing: "1px", backgroundColor: "#ff6855", borderColor: "#ff6855", opacity: enviandoJornal ? 0.6 : 1, cursor: enviandoJornal ? "not-allowed" : "pointer" }}
                >
                  <i className={`fa-solid ${enviandoJornal ? "fa-spinner fa-spin" : "fa-paper-plane"}`} style={{ fontSize: "11pt" }}></i>
                  <span>{textoBotaoJornal}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>

      {/* Modal de notificação genérico */}
      {modalNotif.aberto && (
        <div
          style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(11, 19, 32, 0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, backdropFilter: "blur(5px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalNotif((m) => ({ ...m, aberto: false })); }}
        >
          <div
            style={{
              background: "#0d1624",
              border: `1px solid ${modalNotif.tipo === "sucesso" ? "rgba(197, 160, 89, 0.4)" : "rgba(224, 75, 55, 0.4)"}`,
              width: "100%",
              maxWidth: "450px",
              padding: "35px",
              borderRadius: "12px",
              boxShadow: `0 15px 40px rgba(0,0,0,0.6), 0 0 15px ${modalNotif.tipo === "sucesso" ? "#c5a05933" : "#e04b3733"}`,
              textAlign: "center",
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            <i
              className={`fa-solid ${modalNotif.tipo === "sucesso" ? "fa-circle-check" : "fa-triangle-exclamation"}`}
              style={{ fontSize: "42pt", color: modalNotif.tipo === "sucesso" ? "#c5a059" : "#e04b37", marginBottom: "20px", display: "block" }}
            ></i>
            <h3 style={{ fontFamily: "'Cinzel', serif", fontSize: "16pt", color: "#ffffff", margin: "0 0 12px 0", fontWeight: 700, letterSpacing: "0.5px" }}>{modalNotif.titulo}</h3>
            <p style={{ color: "#a4b3c6", fontSize: "10pt", lineHeight: 1.6, margin: "0 0 25px 0" }}>{modalNotif.mensagem}</p>
            <button
              onClick={() => setModalNotif((m) => ({ ...m, aberto: false }))}
              style={{
                background: modalNotif.tipo === "sucesso" ? "linear-gradient(135deg, #c5a059 0%, #d9b671 100%)" : "linear-gradient(135deg, #ff6855 0%, #e04b37 100%)",
                border: "none",
                padding: "12px 35px",
                color: modalNotif.tipo === "sucesso" ? "#0b1320" : "#ffffff",
                fontFamily: "'Montserrat', sans-serif",
                fontSize: "9.5pt",
                fontWeight: 700,
                borderRadius: "6px",
                cursor: "pointer",
                letterSpacing: "1px",
                textTransform: "uppercase",
              }}
            >
              OK, ENTENDIDO
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default RankAdmin;