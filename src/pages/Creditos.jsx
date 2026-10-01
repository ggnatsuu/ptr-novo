// 🎯 src/pages/Creditos.jsx
// Créditos das ferramentas, dados e imagens que o PTR usa — e o aviso de
// licença do código do site (GPL-3.0, por incluir o uma-skill-tools).

// Link do código-fonte do PTR no GitHub.
const REPOSITORIO_PTR = "https://github.com/ggnatsuu/ptr-novo";

const FERRAMENTAS = [
  {
    nome: "Hakuraku",
    autor: "hakuraku.moe, a partir do Hakuraku original da SSHZ.ORG",
    links: [
      { texto: "hakuraku.moe", url: "https://hakuraku.moe/" },
      { texto: "Código original (SSHZ.ORG)", url: "https://github.com/SSHZ-ORG/hakuraku" },
    ],
    licenca: "MIT",
    uso: [
      "Leitura do arquivo da corrida exportado do jogo",
      "Colunas de telemetria dos resultados (last spurt, HP, duelo, downhill, pace, WT)",
      "Base do replay, do gráfico de desempenho e do traçado das pistas",
    ],
    icone: "fa-film",
  },
  {
    nome: "uma-skill-tools e uma-tools (Umalator)",
    autor: "alpha123",
    links: [
      { texto: "uma-skill-tools", url: "https://github.com/alpha123/uma-skill-tools" },
      { texto: "uma-tools", url: "https://github.com/alpha123/uma-tools" },
    ],
    licenca: "GPL-3.0",
    uso: [
      "Motor do simulador de skills do Buscador de Pistas",
      "Dados das pistas e das skills",
      "Ícones das roupas e nomes das skills (incluindo traduções da comunidade para as que ainda não saíram no global)",
    ],
    icone: "fa-flask",
  },
  {
    nome: "GameTora",
    autor: "gametora.com",
    links: [{ texto: "gametora.com", url: "https://gametora.com/umamusume" }],
    licenca: null,
    uso: ["Chibis das personagens usados no replay"],
    icone: "fa-images",
  },
];

const BIBLIOTECAS = [
  { nome: "React", url: "https://react.dev/", licenca: "MIT" },
  { nome: "Vite", url: "https://vite.dev/", licenca: "MIT" },
  { nome: "Firebase", url: "https://firebase.google.com/", licenca: "Apache-2.0" },
  { nome: "Font Awesome (ícones)", url: "https://fontawesome.com/", licenca: "CC BY 4.0 / SIL OFL / MIT" },
  { nome: "Google Fonts: Montserrat e Cinzel", url: "https://fonts.google.com/", licenca: "SIL OFL" },
];

const estiloCartao = {
  background: "#0d1624",
  border: "1px solid rgba(197, 160, 89, 0.25)",
  borderRadius: "12px",
  padding: "22px 24px",
  boxShadow: "0 8px 25px rgba(0,0,0,0.4)",
  fontFamily: "'Montserrat', sans-serif",
  textAlign: "left",
};

const estiloLink = { color: "#c5a059", fontWeight: 700, textDecoration: "none" };

function SeloLicenca({ licenca }) {
  if (!licenca) return null;
  return (
    <span style={{ fontSize: "8pt", fontWeight: 800, color: "#0b1320", background: "#c5a059", borderRadius: "4px", padding: "2px 8px", letterSpacing: "0.5px" }}>
      {licenca}
    </span>
  );
}

function Creditos() {
  return (
    <main className="main-layout-wrapper">
      <div className="lottery-header">
        <h2 className="lottery-main-title">📜 Créditos</h2>
        <div className="lottery-title-divider"></div>
        <p className="lottery-subtitle">
          O PTR só existe graças ao trabalho da comunidade. Estas são as ferramentas, dados e imagens que o site usa.
        </p>
      </div>

      <div style={{ width: "100%", maxWidth: "900px", margin: "0 auto 60px auto", display: "flex", flexDirection: "column", gap: "18px", padding: "0 16px", boxSizing: "border-box" }}>
        {FERRAMENTAS.map((f) => (
          <div key={f.nome} style={estiloCartao}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "6px" }}>
              <i className={`fa-solid ${f.icone}`} style={{ color: "#c5a059", fontSize: "16pt" }}></i>
              <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "14pt" }}>{f.nome}</h3>
              <SeloLicenca licenca={f.licenca} />
            </div>
            <p style={{ margin: "0 0 10px 0", color: "#8193a8", fontSize: "9.5pt" }}>por {f.autor}</p>
            <ul style={{ margin: "0 0 12px 0", paddingLeft: "20px", color: "#d9d2bd", fontSize: "10pt", lineHeight: 1.6 }}>
              {f.uso.map((u) => <li key={u}>{u}</li>)}
            </ul>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "9.5pt" }}>
              {f.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={estiloLink}>
                  <i className="fa-solid fa-arrow-up-right-from-square"></i> {l.texto}
                </a>
              ))}
            </div>
          </div>
        ))}

        {/* Cygames */}
        <div style={estiloCartao}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
            <i className="fa-solid fa-horse-head" style={{ color: "#c5a059", fontSize: "16pt" }}></i>
            <h3 style={{ margin: 0, fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "14pt" }}>Umamusume: Pretty Derby</h3>
          </div>
          <p style={{ margin: 0, color: "#d9d2bd", fontSize: "10pt", lineHeight: 1.6 }}>
            Todos os personagens, imagens, ícones, nomes e demais materiais do jogo são © Cygames, Inc. O PTR é um projeto
            de fãs sem fins lucrativos e não é afiliado à Cygames.
          </p>
        </div>

        {/* Bibliotecas */}
        <div style={estiloCartao}>
          <h3 style={{ margin: "0 0 10px 0", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt" }}>
            <i className="fa-solid fa-cubes" style={{ color: "#c5a059" }}></i> Bibliotecas
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "10pt" }}>
            {BIBLIOTECAS.map((b) => (
              <div key={b.nome} style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <a href={b.url} target="_blank" rel="noopener noreferrer" style={estiloLink}>{b.nome}</a>
                <span style={{ color: "#8193a8", fontSize: "9pt" }}>{b.licenca}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Código do site */}
        <div style={{ ...estiloCartao, borderColor: "rgba(27, 211, 158, 0.35)" }}>
          <h3 style={{ margin: "0 0 8px 0", fontFamily: "'Cinzel', serif", color: "#f1ead4", fontSize: "13pt" }}>
            <i className="fa-solid fa-code" style={{ color: "#1bd39e" }}></i> Código do PTR
          </h3>
          <p style={{ margin: "0 0 10px 0", color: "#d9d2bd", fontSize: "10pt", lineHeight: 1.6 }}>
            Por incluir o uma-skill-tools, o código do site é aberto sob a licença GPL-3.0: qualquer pessoa pode ver,
            estudar e reaproveitar, desde que mantenha a mesma licença. As imagens e materiais do jogo continuam sendo da
            Cygames e não fazem parte dessa licença.
          </p>
          {REPOSITORIO_PTR && (
            <a href={REPOSITORIO_PTR} target="_blank" rel="noopener noreferrer" style={estiloLink}>
              <i className="fa-brands fa-github"></i> Ver o código no GitHub
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

export default Creditos;
