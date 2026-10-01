// 🎯 src/components/FotoTreinador.jsx
// Foto de perfil pequena e redonda de um treinador (pelo nome). Quem não
// tem foto (ou nunca entrou no site) fica com o avatar padrão.

import { useFotoDe } from "../utils/conquistas/titulos";
import { obterUrlAvatarCloudinary } from "../utils/cloudinary";

function FotoTreinador({ nome, tamanho = 34, corBorda = "rgba(197, 160, 89, 0.35)" }) {
  const foto = useFotoDe(nome) || "default_avatar.png";
  const url = obterUrlAvatarCloudinary(foto).replace("f_auto,q_auto", `f_auto,q_auto,w_${tamanho * 2},h_${tamanho * 2},c_fill,g_north`);
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
      style={{ width: `${tamanho}px`, height: `${tamanho}px`, borderRadius: "50%", objectFit: "cover", border: `2px solid ${corBorda}`, background: "#0b1320", flexShrink: 0 }}
    />
  );
}

export default FotoTreinador;
