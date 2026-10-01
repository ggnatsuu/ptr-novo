// 🎯 src/components/SkillComDetalhe.jsx
// Envolve qualquer elemento de skill: ao passar o mouse, abre um cartão
// flutuante com os detalhes (condições, efeitos e duração), no mesmo
// formato do seletor do Buscador de Pistas.

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { catalogoSkillsPorId, caminhoIconeSkill, COR_RARIDADE_SKILL, partesDaCondicao, formatarEfeito, formatarDuracaoEfetiva } from "../utils/skillsPista";
import { formatarDuracaoBase } from "../utils/diagramaPista";
import "../styles/buscadorpistas.css";

const LARGURA = 270;

function SkillComDetalhe({ skillId, distancia, children, estilo }) {
  const ref = useRef(null);
  const [posicao, setPosicao] = useState(null);
  const skill = catalogoSkillsPorId.get(String(skillId));

  const abrir = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const esquerda = Math.max(8, Math.min(r.left, window.innerWidth - LARGURA - 8));
    const abaixo = window.innerHeight - r.bottom > 320 || r.top < 320;
    setPosicao(abaixo ? { left: esquerda, top: r.bottom + 6 } : { left: esquerda, bottom: window.innerHeight - r.top + 6 });
  };

  return (
    <span ref={ref} onMouseEnter={abrir} onMouseLeave={() => setPosicao(null)} style={{ display: "inline-flex", maxWidth: "100%", ...estilo }}>
      {children}
      {posicao && skill && createPortal(
        <div style={{ position: "fixed", ...posicao, zIndex: 2000, width: `${LARGURA}px`, maxHeight: "70vh", overflowY: "auto", background: "#0d1624", border: "1px solid rgba(197, 160, 89, 0.4)", borderRadius: "10px", boxShadow: "0 12px 32px rgba(0, 0, 0, 0.6)", padding: "8px 10px", fontFamily: "'Montserrat', sans-serif", pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
            {caminhoIconeSkill(skill.iconId) && <img src={caminhoIconeSkill(skill.iconId)} alt="" style={{ width: "24px", height: "24px" }} />}
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COR_RARIDADE_SKILL[skill.rarity] ?? "#f1ead4", fontWeight: 800, fontSize: "9pt" }}>{skill.nome}</div>
              <div style={{ color: "#5f758e", fontSize: "6.5pt" }}>ID: {skill.id}</div>
            </div>
          </div>
          <div className="bp-skill-condicoes detalhe-skill-compacto" style={{ margin: 0 }}>
            {skill.alternatives.map((c, i) => (
              <div key={i} className="bp-skill-condicao-bloco">
                <div className="bp-skill-secao">
                  <p className="bp-skill-secao-titulo">Conditions:</p>
                  {c.precondition && (
                    <div className="bp-skill-secao-grupo">
                      <span className="bp-skill-secao-subtitulo">Preconditions:</span>
                      {partesDaCondicao(c.precondition).map((parte, pi) => <code key={pi} className="bp-skill-secao-linha">{parte}</code>)}
                    </div>
                  )}
                  <div className="bp-skill-secao-grupo">
                    {partesDaCondicao(c.condition).map((parte, pi) => <code key={pi} className="bp-skill-secao-linha">{parte}</code>)}
                  </div>
                </div>
                {c.effects?.length > 0 && (
                  <div className="bp-skill-secao">
                    <p className="bp-skill-secao-titulo">Effects:</p>
                    {c.effects.map((ef, ei) => {
                      const { nome, valor } = formatarEfeito(ef);
                      return (
                        <div key={ei} className="bp-skill-efeito-linha">
                          <span className="bp-skill-efeito-nome">{nome}</span>
                          <span className="bp-skill-efeito-valor">{valor}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {c.baseDuration != null && (
                  <div className="bp-skill-secao">
                    <p className="bp-skill-secao-titulo">Base duration: <span className="bp-skill-secao-valor-inline">{formatarDuracaoBase(c.baseDuration)}</span></p>
                    {c.baseDuration > 0 && distancia && (
                      <p className="bp-skill-secao-titulo">Effective duration ({distancia}m): <span className="bp-skill-secao-valor-inline">{formatarDuracaoEfetiva(c.baseDuration, distancia)}</span></p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}

export default SkillComDetalhe;
