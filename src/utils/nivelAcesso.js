// 🎯 src/utils/nivelAcesso.js
// Níveis de acesso (campo nivelAcesso em treinadores/{uid}): "treinador"
// (padrão), "pocolord" (vê as Ferramentas) e "admin" (vê tudo). Só o admin
// muda o nível de alguém (regra do Firestore).

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

export const NIVEIS_FERRAMENTAS = ["admin", "pocolord"];

// undefined = verificando; null = sem login; senão o nível ("treinador"...).
export function useNivelAcesso() {
  const [nivel, setNivel] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, async (usuario) => {
    if (!usuario) {
      setNivel(null);
      return;
    }
    try {
      const perfil = await getDoc(doc(db, "treinadores", usuario.uid));
      setNivel(perfil.exists() ? perfil.data().nivelAcesso ?? "treinador" : "treinador");
    } catch (erro) {
      console.error("Erro ao verificar o nível de acesso:", erro);
      setNivel("treinador");
    }
  }), []);
  return nivel;
}
