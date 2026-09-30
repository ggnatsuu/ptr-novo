// 🎯 src/components/PainelDetalheTreinador.jsx
// Painel que abre ao clicar numa linha da tabela de Resultados: skills da
// corrida (usadas / falharam no Wit / falharam na condição), aptidões e
// deck de suporte — mesmo conteúdo do painel do Hakuraku, no visual do PTR.
// Só existe pra corridas enviadas pelo arquivo do jogo (RankAdmin), que
// guardam esses dados em "dadosTreinadores".

import skillNamesRaw from "../uma-skill-tools/data/skillnames.json";
import skillMetaRaw from "../uma-skill-tools/data/skill_meta.json";

const GRUPOS_SKILL = [
  { status: "activated", titulo: "Activated" },
  { status: "failed-wit", titulo: "Failed wit check" },
  { status: "failed-condition", titulo: "Failed condition" },
  { status: "not-activated", titulo: "Not activated" },
];

// Escala do jogo: 1 = G ... 8 = S. As imagens seguem a numeração do jogo
// (utx_ico_statusrank_00 = G, _02 = F, ... _14 = S).
const LETRAS_NOTA = ["", "G", "F", "E", "D", "C", "B", "A", "S"];

function nomeDaSkill(id) {
  const nomes = skillNamesRaw[id];
  return (nomes && (nomes[1] || nomes[0])) || `Skill ${id}`;
}

function iconeDaSkill(id) {
  // Herdadas (9xxxxx) usam o ícone da única original (1xxxxx).
  const meta = skillMetaRaw[id] ?? (id >= 900000 && id < 1000000 ? skillMetaRaw[id - 800000] : null);
  return meta?.iconId ? `/assets/img/skills/utx_ico_skill_${meta.iconId}.png` : null;
}

function imagemDaNota(nota) {
  if (!nota || nota < 1 || nota > 8) return null;
  return `/assets/img/statusrank/utx_ico_statusrank_${String((nota - 1) * 2).padStart(2, "0")}.png`;
}

const estiloTituloBloco = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: "9pt",
  fontWeight: 800,
  color: "#c5a059",
  textTransform: "uppercase",
  letterSpacing: "1px",
  margin: "0 0 12px 0",
};

const estiloTituloGrupo = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: "7.5pt",
  fontWeight: 700,
  color: "#5f758e",
  textTransform: "uppercase",
  letterSpacing: "1px",
  textAlign: "center",
  margin: "12px 0 6px 0",
};

function SeloStatus({ skill }) {
  if (skill.status === "activated") {
    return (
      <span style={{ background: "rgba(27, 211, 158, 0.12)", color: "#1bd39e", border: "1px solid rgba(27, 211, 158, 0.35)", borderRadius: "4px", padding: "2px 8px", fontSize: "8pt", fontWeight: 700, whiteSpace: "nowrap" }}>
        {skill.vezes > 1 ? `Used ×${skill.vezes}` : "Used"}
      </span>
    );
  }
  return (
    <span style={{ background: "rgba(224, 75, 55, 0.12)", color: "#e04b37", border: "1px solid rgba(224, 75, 55, 0.35)", borderRadius: "4px", width: "22px", height: "22px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "9pt", fontWeight: 700 }}>
      ✕
    </span>
  );
}

function PainelDetalheTreinador({ dados }) {
  const skills = dados.skillsCorrida ?? [];
  const aptidoes = dados.aptidoesCorrida ?? {};
  const deck = dados.deck ?? [];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "30px", padding: "20px 24px", background: "#0b1320", borderTop: "1px solid rgba(197, 160, 89, 0.2)", borderBottom: "1px solid rgba(197, 160, 89, 0.2)", textAlign: "left", fontFamily: "'Montserrat', sans-serif" }}>
      {/* SKILLS */}
      <div style={{ flex: "1 1 320px", maxWidth: "460px" }}>
        <p style={estiloTituloBloco}>Skills ({skills.length})</p>
        {skills.length === 0 && (
          <p style={{ color: "#5f758e", fontSize: "9pt", fontStyle: "italic", margin: 0 }}>
            Status das skills indisponível para esta corrida.
          </p>
        )}
        {GRUPOS_SKILL.map(({ status, titulo }) => {
          const doGrupo = skills.filter((s) => s.status === status);
          if (doGrupo.length === 0) return null;
          return (
            <div key={status}>
              <p style={estiloTituloGrupo}>{titulo}</p>
              {doGrupo.map((skill) => {
                const icone = iconeDaSkill(skill.id);
                return (
                  <div key={skill.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", borderRadius: "6px", background: "rgba(164, 179, 198, 0.04)", marginBottom: "4px" }}>
                    {icone
                      ? <img src={icone} alt="" style={{ width: "24px", height: "24px", flexShrink: 0 }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                      : <span style={{ width: "24px", flexShrink: 0 }} />}
                    <span style={{ flex: 1, color: "#f1ead4", fontSize: "10pt" }}>{nomeDaSkill(skill.id)}</span>
                    <SeloStatus skill={skill} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div style={{ flex: "1 1 260px", display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* APTIDÕES */}
        <div>
          <p style={estiloTituloBloco}>Aptitudes</p>
          {[aptidoes.terreno, aptidoes.distancia, aptidoes.estilo].filter(Boolean).map((aptidao) => {
            const imagem = imagemDaNota(aptidao.nota);
            return (
              <div key={aptidao.nome} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: "220px", padding: "6px 0", borderBottom: "1px solid rgba(164, 179, 198, 0.08)" }}>
                <span style={{ color: "#f1ead4", fontSize: "10pt" }}>{aptidao.nome}</span>
                {imagem
                  ? <img src={imagem} alt={LETRAS_NOTA[aptidao.nota]} title={LETRAS_NOTA[aptidao.nota]} style={{ height: "22px" }} />
                  : <span style={{ color: "#a4b3c6" }}>-</span>}
              </div>
            );
          })}
        </div>

        {/* DECK */}
        {deck.length > 0 && (
          <div>
            <p style={estiloTituloBloco}>Support Deck</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 72px)", gap: "10px" }}>
              {deck.map((carta, indice) => (
                <div key={`${carta.id}-${indice}`} style={{ position: "relative", width: "72px", borderRadius: "6px", overflow: "hidden", border: "1px solid rgba(197, 160, 89, 0.35)", background: "#0d1624" }}>
                  <img
                    src={`/assets/img/support/support_card_s_${carta.id}.png`}
                    alt={`Carta ${carta.id}`}
                    style={{ width: "100%", display: "block" }}
                    onError={(e) => {
                      // Duas imagens do site foram salvas com "S" maiúsculo.
                      const alternativa = `/assets/img/support/Support_card_s_${carta.id}.png`;
                      if (!e.currentTarget.src.endsWith(alternativa)) e.currentTarget.src = alternativa;
                    }}
                  />
                  <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(11, 19, 32, 0.85)", color: "#f1ead4", fontSize: "7.5pt", fontWeight: 700, textAlign: "center", padding: "2px 0" }}>
                    LB {carta.lb}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PainelDetalheTreinador;
