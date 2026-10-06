// 🎯 src/utils/useFecharNoEsc.js
// Janelas do Comparador: fecham só no X ou no Esc (clicar fora não fecha,
// pra ninguém perder o que estava fazendo sem querer).

import { useEffect, useRef } from "react";

export function useFecharNoEsc(aoFechar, ativo = true) {
  const fechar = useRef(aoFechar);
  useEffect(() => { fechar.current = aoFechar; });
  useEffect(() => {
    if (!ativo) return undefined;
    const tecla = (e) => { if (e.key === "Escape") fechar.current?.(); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ativo]);
}
