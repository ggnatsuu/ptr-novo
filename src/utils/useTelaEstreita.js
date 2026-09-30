// 🎯 src/utils/useTelaEstreita.js
// true em telas estreitas (celular). Usado pelo replay e pelos gráficos pra
// trocar o desenho: pista mais "quadrada" com textos maiores, gráficos com
// rolagem lateral em vez de espremidos.

import { useEffect, useState } from "react";

const CONSULTA = "(max-width: 700px)";

export function useTelaEstreita() {
  const [estreita, setEstreita] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(CONSULTA).matches : false));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const consulta = window.matchMedia(CONSULTA);
    const aoMudar = (e) => setEstreita(e.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);
  return estreita;
}
