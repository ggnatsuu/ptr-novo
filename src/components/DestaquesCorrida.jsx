// 🎯 src/components/DestaquesCorrida.jsx
// Cartões de destaque acima da tabela de Resultados ("resumo da rodada"),
// calculados a partir da classificação que a página já carregou — não
// gasta leitura nenhuma e aparece pra todo mundo. Cada cartão só aparece se
// a corrida tiver o dado (corridas antigas de CSV não têm, por exemplo, o
// número de skills ativadas).

import { obterUrlImagemPersonagem } from "../utils/cloudinary";
import { iconeDaRoupa } from "../utils/iconeRoupa";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Linha com o maior (ou menor) valor calculado por "valor"; ignora quem não tem.
function melhor(linhas, valor, menorVence = false) {
  let vencedor = null;
  let melhorValor = null;
  linhas.forEach((linha) => {
    const v = valor(linha);
    if (v === null) return;
    if (melhorValor === null || (menorVence ? v < melhorValor : v > melhorValor)) {
      vencedor = linha;
      melhorValor = v;
    }
  });
  return vencedor ? { linha: vencedor, valor: melhorValor } : null;
}

function montarDestaques(corrida) {
  const linhas = corrida.classificacao ?? [];
  const dadosPorNumero = new Map((corrida.dadosTreinadores ?? []).map((d) => [d.numero, d]));
  const skillsAtivadas = (linha) => {
    const skills = dadosPorNumero.get(linha.numero)?.skillsCorrida;
    return skills ? skills.filter((s) => s.status === "activated").length : null;
  };

  const destaques = [
    { icone: "⚡", titulo: "Last spurt mais rápido", ...melhor(linhas, (l) => num(l.last_spurt_speed)), formato: (v) => `${v.toFixed(2)} m/s` },
    {
      icone: "🔋",
      titulo: "Mais HP sobrando",
      ...melhor(linhas.filter((l) => l.hp_status === "Survived"), (l) => num(l.hp_val)),
      formato: (v) => `${v} HP`,
    },
    { icone: "🚀", titulo: "Melhor largada", ...melhor(linhas, (l) => num(l.start_delay_ms), true), formato: (v) => `${v} ms` },
    { icone: "⚔️", titulo: "Mais tempo em duelo", ...melhor(linhas, (l) => (num(l.duel_s) > 0 ? l.duel_s : null)), formato: (v) => `${v}s` },
    { icone: "🧠", titulo: "Mais skills ativadas", ...melhor(linhas, skillsAtivadas), formato: (v) => `${v} skills` },
    {
      icone: "💀",
      titulo: "Faltou mais fôlego",
      ...melhor(linhas.filter((l) => l.hp_status === "Died"), (l) => num(l.hp_m_diff), true),
      formato: (v) => `acabou ${Math.abs(v)}m antes`,
      negativo: true,
    },
  ];
  return destaques
    .filter((d) => d.linha)
    .map((d) => ({ ...d, dados: dadosPorNumero.get(d.linha.numero) }));
}

function DestaquesCorrida({ corrida }) {
  const destaques = montarDestaques(corrida);
  if (destaques.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "22px" }}>
      {destaques.map((d) => {
        const roupa = iconeDaRoupa(d.dados?.cardId);
        const icone = roupa || obterUrlImagemPersonagem(d.linha.personagem);
        return (
          <div
            key={d.titulo}
            style={{ display: "flex", alignItems: "center", gap: "12px", background: "linear-gradient(135deg, #0d1624 0%, #111d2e 100%)", border: "1px solid rgba(197, 160, 89, 0.25)", borderRadius: "10px", padding: "12px 14px", fontFamily: "'Montserrat', sans-serif" }}
          >
            <div style={{ position: "relative", flexShrink: 0 }}>
              {icone
                ? <img src={icone} alt="" style={roupa ? { width: "50px", height: "50px" } : { width: "46px", height: "46px", borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(197, 160, 89, 0.4)" }} />
                : <div style={{ width: "46px", height: "46px", borderRadius: "50%", background: "#1b2a3f" }} />}
              <span style={{ position: "absolute", right: "-6px", bottom: "-4px", fontSize: "15pt", lineHeight: 1 }}>{d.icone}</span>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#c5a059", fontSize: "7.5pt", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.8px" }}>{d.titulo}</div>
              <div style={{ color: "#f1ead4", fontSize: "10pt", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.linha.treinador ?? "NPC"}</div>
              <div style={{ color: "#a4b3c6", fontSize: "8.5pt" }}>
                {d.linha.personagem} • <span style={{ color: d.negativo ? "#e04b37" : "#1bd39e", fontWeight: 700 }}>{d.formato(d.valor)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default DestaquesCorrida;
