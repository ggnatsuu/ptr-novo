// 🎯 src/components/AceleracoesPista.jsx
// Acelerações recomendadas de um estilo no Guia do Meta: cartões de skill
// no mesmo visual do seletor do Buscador de Pistas (ícone + nome), com a
// ordem de prioridade. Avisa quando a skill não ativa nesta pista/estilo.

import { useMemo } from "react";
import SkillComDetalhe from "./SkillComDetalhe";
import { calcularRegioesSkill, caminhoIconeSkill, catalogoSkillsPorId, COR_RARIDADE_SKILL, ESTRATEGIA_POR_ESTILO } from "../utils/skillsPista";

const COR_DESTAQUE = { 1: "#a4b3c6", 2: "#f3c75a", 3: "#c58bff", 4: "#c58bff", 5: "#c58bff", 6: "#ff8ad8" };

function AceleracoesPista({ dadosCorrida, estilo, recomendadas = [], textoAntigo, comentario }) {
  const estrategia = ESTRATEGIA_POR_ESTILO[estilo] ?? 2;

  const skills = useMemo(() => recomendadas
    .map((id) => catalogoSkillsPorId.get(String(id)))
    .filter(Boolean)
    .map((s) => ({ ...s, ativa: dadosCorrida ? calcularRegioesSkill(dadosCorrida, s.id, estrategia).gatilhos.length > 0 : true })),
  [recomendadas, dadosCorrida, estrategia]);

  if (!skills.length) {
    return (
      <div style={{ display: "grid", gap: "8px" }}>
        {textoAntigo ? <div style={{ color: "#f1ead4", fontSize: "9pt", lineHeight: 1.5 }}>{textoAntigo}</div> : !comentario && <p style={{ margin: 0, color: "#5f758e", fontSize: "9pt" }}>Sem recomendação de aceleração.</p>}
        {comentario && <div style={{ color: "#a4b3c6", fontSize: "9pt", lineHeight: 1.55, whiteSpace: "pre-line" }}><i className="fa-solid fa-comment-dots" style={{ color: "#c5a059" }}></i> {comentario}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "10px" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
      {skills.map((s, i) => {
        const cor = COR_DESTAQUE[s.rarity] ?? "#a4b3c6";
        const icone = caminhoIconeSkill(s.iconId);
        return (
          <SkillComDetalhe key={s.id} skillId={s.id} distancia={dadosCorrida?.distance}>
          <div style={{ cursor: "help", display: "inline-flex", alignItems: "center", gap: "8px", background: "#141d2b", border: "1px solid rgba(164, 179, 198, 0.12)", borderLeft: `3px solid ${cor}`, borderRadius: "8px", padding: "5px 12px 5px 8px", maxWidth: "100%", opacity: s.ativa ? 1 : 0.55 }}>
            <span style={{ minWidth: "18px", height: "18px", borderRadius: "50%", background: "linear-gradient(135deg, #f3d27a, #c5a059)", color: "#0b1320", fontSize: "7.5pt", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
            {icone ? (
              <img src={icone} alt="" style={{ width: "30px", height: "30px", borderRadius: "6px", flexShrink: 0 }} />
            ) : (
              <span style={{ width: "30px", height: "30px", flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COR_RARIDADE_SKILL[s.rarity] === "#c9d2dc" ? "#f1ead4" : COR_RARIDADE_SKILL[s.rarity], fontSize: "9pt", fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.nome}</div>
              {!s.ativa && <div style={{ color: "#8193a8", fontSize: "7pt", fontWeight: 700 }}>Não ativa aqui</div>}
            </div>
          </div>
          </SkillComDetalhe>
        );
      })}
    </div>
    {comentario && (
      <div style={{ display: "flex", gap: "8px", background: "rgba(197, 160, 89, 0.06)", borderLeft: "3px solid rgba(197, 160, 89, 0.5)", borderRadius: "6px", padding: "8px 10px", color: "#a4b3c6", fontSize: "9pt", lineHeight: 1.55, whiteSpace: "pre-line" }}>
        <i className="fa-solid fa-comment-dots" style={{ color: "#c5a059", marginTop: "3px" }}></i>
        <span>{comentario}</span>
      </div>
    )}
    </div>
  );
}

export default AceleracoesPista;
