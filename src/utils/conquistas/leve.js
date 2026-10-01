// 🎯 src/utils/conquistas/leve.js
// Peças pequenas das conquistas usadas pelas telas (sem puxar o motor nem os
// dados de skills pro carregamento das páginas).

// Id do documento em conquistas/: nome do treinador em minúsculas (sem "/").
export const idConquistas = (nome) => String(nome ?? "").toLowerCase().trim().replace(/\//g, "_");

// Títulos por personagem (contam EDIÇÕES com a mesma personagem).
export const NIVEIS_PERSONAGEM = [
  { nivel: "oshi", edicoes: 10, titulo: (p) => `Oshi da ${p}` },
  { nivel: "especialista", edicoes: 7, titulo: (p) => `Especialista em ${p}` },
  { nivel: "entusiasta", edicoes: 4, titulo: (p) => `Entusiasta de ${p}` },
  { nivel: "iniciante", edicoes: 2, titulo: (p) => `Iniciante de ${p}` },
];
