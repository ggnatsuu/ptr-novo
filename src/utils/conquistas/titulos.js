// 🎯 src/utils/conquistas/titulos.js
// Títulos equipáveis. O treinador escolhe um em treinadores/{uid}.tituloEquipado:
//   "c:<tag>"                — título de conquista ou epíteto
//   "p:<personagem>|<nivel>" — título por personagem (Iniciante/Entusiasta/...)
// Só é exibido se ele realmente tiver o título (confere em conquistas/{id}),
// então mesmo que alguém grave um título que não tem, ele não aparece.

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../config/firebase";
import { CONQUISTAS, RARIDADES } from "../../data/conquistas";
import { NIVEIS_PERSONAGEM, idConquistas } from "./leve";

const POR_TAG = new Map(CONQUISTAS.map((c) => [c.tag, c]));
const COR_NIVEL = { iniciante: RARIDADES.bronze.cor, entusiasta: RARIDADES.prata.cor, especialista: RARIDADES.ouro.cor, oshi: RARIDADES.platina.cor };
const ORDEM_NIVEL = { iniciante: 1, entusiasta: 2, especialista: 3, oshi: 4 };

// Todos os títulos que o treinador tem: [{ id, texto, cor }].
export function titulosDoTreinador(docConquistas) {
  if (!docConquistas) return [];
  const tags = [...(docConquistas.conquistas ?? []).map((q) => q.tag), ...Object.keys(docConquistas.manuais ?? {})];
  const deConquistas = [...new Set(tags)]
    .map((tag) => POR_TAG.get(tag))
    .filter(Boolean)
    .sort((a, b) => RARIDADES[b.raridade].ordem - RARIDADES[a.raridade].ordem)
    .map((c) => ({ id: `c:${c.tag}`, texto: c.titulo, cor: RARIDADES[c.raridade].cor }));
  const dePersonagens = (docConquistas.personagens ?? []).flatMap((p) =>
    NIVEIS_PERSONAGEM.filter((n) => ORDEM_NIVEL[n.nivel] <= ORDEM_NIVEL[p.nivel]).map((n) => ({ id: `p:${p.personagem}|${n.nivel}`, texto: n.titulo(p.personagem), cor: COR_NIVEL[n.nivel] })),
  );
  return [...deConquistas, ...dePersonagens];
}

export function resolverTitulo(idTitulo, docConquistas) {
  if (!idTitulo) return null;
  return titulosDoTreinador(docConquistas).find((t) => t.id === idTitulo) ?? null;
}

// ---- Título equipado de todos (carregado uma vez por sessão) ----

let promessa = null;
const ouvintes = new Set();
const chave = (nome) => String(nome ?? "").toLowerCase().trim();

function carregarMapa() {
  if (!promessa) {
    promessa = Promise.all([getDocs(collection(db, "conquistas")), getDocs(collection(db, "treinadores"))])
      .then(([conquistas, treinadores]) => {
        const docs = new Map(conquistas.docs.map((d) => [d.id, d.data()]));
        const mapa = new Map();
        treinadores.docs.forEach((d) => {
          const { nomeTreinador, tituloEquipado } = d.data();
          if (!nomeTreinador || !tituloEquipado) return;
          const titulo = resolverTitulo(tituloEquipado, docs.get(idConquistas(nomeTreinador)));
          if (titulo) mapa.set(chave(nomeTreinador), titulo);
        });
        return mapa;
      })
      .catch((erro) => {
        console.error("Erro ao carregar títulos:", erro);
        promessa = null;
        return new Map();
      });
  }
  return promessa;
}

// Título equipado de um treinador (pelo nome), ou null.
export function useTituloDe(nome) {
  const [mapa, setMapa] = useState(null);
  useEffect(() => {
    let vivo = true;
    carregarMapa().then((m) => { if (vivo) setMapa(m); });
    const ouvir = (m) => setMapa(m);
    ouvintes.add(ouvir);
    return () => { vivo = false; ouvintes.delete(ouvir); };
  }, []);
  return nome && mapa ? mapa.get(chave(nome)) ?? null : null;
}

// Depois de trocar o título: recarrega e avisa quem está mostrando.
export function recarregarTitulos() {
  promessa = null;
  carregarMapa().then((m) => ouvintes.forEach((f) => f(m)));
}
