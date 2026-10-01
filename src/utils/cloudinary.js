// 🎯 src/utils/cloudinary.js
// Utilitário compartilhado pra montar URLs de imagens hospedadas no
// Cloudinary. Centralizado aqui porque é usado em vários arquivos
// diferentes (Perfil, Rank Geral, Agenda, Resultados, Rank Personagens) —
// evita duplicar a mesma lógica de "montar URL" em cada um.

import { listaAvatares } from "../data/avatares";

const CLOUDINARY_CLOUD_NAME = "k1qj4qrm";

// 🎯 Transforma o nome de arquivo local de um avatar (ex: "admire_groove.png",
// do jeito que já vem salvo no Firestore/avatares.js) na URL de entrega do
// Cloudinary. Como as imagens foram subidas mantendo o mesmo nome e a
// mesma extensão (.png), não precisa de nenhuma conversão — só monta a
// URL final em cima do nome de arquivo exato.
export function obterUrlAvatarCloudinary(nomeArquivo) {
  if (!nomeArquivo) return "";
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/${nomeArquivo}`;
}

// 🎯 Busca a imagem de uma cavalinha pelo nome exato do personagem
// (ex: "Narita Brian"), cruzando com a lista de avatares já cadastrada.
export function obterUrlImagemPersonagem(nomePersonagem) {
  const encontrado = listaAvatares.find((a) => a.nome === nomePersonagem);
  return encontrado ? obterUrlAvatarCloudinary(encontrado.arquivo) : "";
}
// 🎯 Imagem do troféu de uma pista (mesma regra do cartão do treinador).
export function obterUrlTrofeuCloudinary(nomeTrofeu) {
  if (!nomeTrofeu || nomeTrofeu === "Bloqueado") return "";
  const nomeSanitizado = nomeTrofeu.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/f_auto,q_auto/${nomeSanitizado}.png`;
}
