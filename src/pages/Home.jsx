import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";

// 🎯 Página Home: agora com um hero "vivo" no topo (edição atual puxada do
// Firebase + atalhos rápidos), seguido do conteúdo estático de regras que
// já existia. O CSS desse hero (.hero-main-row, .stat-badge, .widgets-row
// etc) já estava pronto no home.css, só não era usado em lugar nenhum.
function Home() {
  const [edicaoAtual, setEdicaoAtual] = useState(null);

  // 🎯 Busca só o número da edição ativa (mesmo documento que Sorteio/
  // Agenda/RankAdmin já usam) pra mostrar no "stat" do hero. Um getDoc
  // simples basta aqui — não precisa de listener em tempo real na Home.
  useEffect(() => {
    async function buscarEdicaoAtual() {
      try {
        const snap = await getDoc(doc(db, "pistas_sorteadas", "atual"));
        if (snap.exists() && snap.data().edicaoAtiva) {
          setEdicaoAtual(snap.data().edicaoAtiva.replace("edicao_", ""));
        }
      } catch (erro) {
        console.error("Erro ao buscar edição atual:", erro);
      }
    }
    buscarEdicaoAtual();
  }, []);

  return (
    <>
    <div className="hero-container">
      <div className="hero-content">
        <section className="main-banner-container">
          <img
            src="/assets/img/banner_inicio.png"
            alt="Banner Pocolord's Twinkles Series"
            className="main-banner-img"
            width="1200"
            height="400"
          />
        </section>

        <section className="hero-main-row">
          <div className="hero-left">
            <h1 className="main-title">
              Bem-vindo à<span>Pocolord's Twinkles Road</span>
            </h1>
            <p className="subtitle">
              A liga de corridas de Uma Musume: Pretty Derby que simula, com o máximo de fidelidade possível,
              a atmosfera e a emoção competitiva do Turf Japonês real — espelhando a estrutura da JRA.
            </p>
          </div>

          <div className="hero-right">
            <div className="stat-badge">
              <div className="stat-number">{edicaoAtual ? `Nº ${edicaoAtual}` : "—"}</div>
              <div className="stat-label">
                {edicaoAtual && <span className="stat-live-dot"></span>}
                {edicaoAtual ? "EDIÇÃO ATUAL EM ANDAMENTO" : "NENHUMA RODADA ATIVA NO MOMENTO"}
              </div>
            </div>
          </div>
        </section>

        <div className="widgets-row">
          <Link to="/agenda" className="widget-card">
            <span className="widget-icon-cell">📅</span>
            <div>
              <p className="widget-title">Agenda</p>
              <p className="widget-desc">Veja as pistas sorteadas e confirme presença na rodada.</p>
            </div>
          </Link>

          <Link to="/rank" className="widget-card">
            <span className="widget-icon-cell">🏆</span>
            <div>
              <p className="widget-title">Rank Geral</p>
              <p className="widget-desc">Confira quem está liderando o campeonato.</p>
            </div>
          </Link>

          <Link to="/resultados" className="widget-card">
            <span className="widget-icon-cell">🏁</span>
            <div>
              <p className="widget-title">Resultados</p>
              <p className="widget-desc">Histórico completo de corridas e telemetria.</p>
            </div>
          </Link>
        </div>

      </div>
      </div>

      {/* 🎯 Seção "O que é a PTR" — migrada do mockup mockup-home-ptr-v7.html
          (aprovado pelo usuário). Texto 100% verbatim, sem reinterpretação —
          inclusive erros de digitação intencionais do usuário (ex: "Parabens
          voce é ruim mesmo") foram mantidos como estão, de propósito. Essa
          seção substitui por completo as antigas seções estáticas de regras
          G1/G2/G3, calendário, preparação de deck, seleção de atleta e
          manifesto final que existiam aqui antes.
          Classes com prefixo "sobre-ptr-" pra não colidir com nada de outra
          página — home.css é importado globalmente (main.jsx), então nomes
          genéricos tipo .card ou .secao arriscariam vazar estilo pra outros
          lugares do site. */}

      <section className="sobre-ptr-secao sobre-ptr-secao-abertura">
        <div className="sobre-ptr-abertura">
          <div className="sobre-ptr-placeholder sobre-ptr-placeholder-abertura">
            <img src="/assets/img/home/bakushin_1.png" alt="descrição da imagem" />
          </div>
          <div className="sobre-ptr-abertura-texto">
            <p className="sobre-ptr-abertura-rotulo">PTR – PocoLords Twinkles Road</p>
            <p>
              A PTR (PocoLords Twinkles Road) é a liga de corridas de Uma Musume: Pretty Derby, criada
              pelo grupo PocoLords, um dos clubes casuais mais competitivos que existe.
            </p>
          </div>
        </div>
      </section>

      <section className="sobre-ptr-secao">
        <p className="sobre-ptr-secao-titulo">Cronograma</p>
        <div className="sobre-ptr-secao-linha"></div>

        <div className="sobre-ptr-timeline">
          <div className="sobre-ptr-timeline-trilho"></div>
          <div className="sobre-ptr-timeline-pontos">
            <div className="sobre-ptr-ponto">
              <div className="sobre-ptr-ponto-bolinha"><img src="/assets/img/home/ikuno_01.webp" alt="descrição da imagem" /></div>
              <p className="sobre-ptr-ponto-quando">Quarta-feira</p>
              <p className="sobre-ptr-ponto-titulo">Check-in aberto</p>
              <p className="sobre-ptr-ponto-texto">
                Apenas para a organização ter noção de quantos participantes teremos.
                Não é obrigatório — quem não fizer ainda pode correr normalmente.
              </p>
            </div>
            <div className="sobre-ptr-ponto">
              <div className="sobre-ptr-ponto-bolinha"><img src="/assets/img/home/corridas_abertas.webp" alt="descrição da imagem" /></div>
              <p className="sobre-ptr-ponto-quando">3h antes</p>
              <p className="sobre-ptr-ponto-titulo">Pistas abrem</p>
              <p className="sobre-ptr-ponto-texto">
                As pistas abrirão cerca de 3 horas antes do horário oficial do evento.
              </p>
            </div>
            <div className="sobre-ptr-ponto">
              <div className="sobre-ptr-ponto-bolinha"><img src="/assets/img/home/evento.webp" alt="descrição da imagem" /></div>
              <p className="sobre-ptr-ponto-quando">Sábado, 18h30</p>
              <p className="sobre-ptr-ponto-titulo">Evento principal</p>
              <p className="sobre-ptr-ponto-texto">
                Toda a transmissão, narração e comentários acontecem ao vivo no Discord da PocoLords.
              </p>
            </div>
            <div className="sobre-ptr-ponto">
              <div className="sobre-ptr-ponto-bolinha"><img src="/assets/img/home/resultados.webp" alt="descrição da imagem" /></div>
              <p className="sobre-ptr-ponto-quando">Depois</p>
              <p className="sobre-ptr-ponto-titulo">Resultados</p>
              <p className="sobre-ptr-ponto-texto">
                Publicamos os vencedores no site, na aba de resultados, junto com jornal e agenda.
              </p>
            </div>
          </div>
        </div>

        <p className="sobre-ptr-cronograma-completo">
          A PTR acontece durante todo final de semana, tendo seu evento principal no sábado. Na
          quarta-feira abrimos o Check-in, apenas para que a organização tenha uma noção de quantos
          participantes teremos na edição. Mas calma, o Check-in não é obrigatório. Não é porque você
          esqueceu ou não fez o Check-in que ficará de fora. Você ainda poderá colocar sua cavala para
          correr normalmente.
        </p>
      </section>

      <section className="sobre-ptr-frase-efeito">
        <div className="sobre-ptr-frase-conteudo">
          <div className="sobre-ptr-frase-texto">
            <p>A escolha da cavala é <span>TOTALMENTE SUA</span>. O treinamento também.</p>
            <p className="sobre-ptr-frase-fonte">
              A única regra é que a <span>MESMA CAVALA</span> deverá disputar <span>TODAS</span> as corridas da edição, mesmo que ela
              não tenha aptidão para alguma das pistas sorteadas.
            </p>
          </div>
          <div className="sobre-ptr-placeholder sobre-ptr-placeholder-frase">
            <img src="/assets/img/home/nishino_1.png" alt="descrição da imagem" />
          </div>
        </div>
      </section>

      <section className="sobre-ptr-secao">
        <div className="sobre-ptr-grade">
          <div className="sobre-ptr-card">
            <div className="sobre-ptr-card-cabecalho">
              <div className="sobre-ptr-card-avatar-mini"><i className="fa-solid fa-image"></i></div>
              <i className="fa-solid fa-dice"></i>
              <p className="sobre-ptr-card-titulo">Próxima edição</p>
            </div>
            <p className="sobre-ptr-card-texto">
              A próxima edição sempre é definida após o encerramento do evento. É nesse momento que a
              organização escolhe o cenário, as pistas e o deck da semana.
            </p>
          </div>

          <div className="sobre-ptr-card">
            <div className="sobre-ptr-card-cabecalho">
              <div className="sobre-ptr-card-avatar-mini"><i className="fa-solid fa-image"></i></div>
              <i className="fa-solid fa-newspaper"></i>
              <p className="sobre-ptr-card-titulo">Conteúdos extras</p>
            </div>
            <p className="sobre-ptr-card-texto">
              Também temos conteúdos extras, como o jornal da PTR, agenda das próximas edições e
              outras novidades. Vale a pena dar uma passada por lá.
            </p>
          </div>

          <div className="sobre-ptr-card">
            <div className="sobre-ptr-card-cabecalho">
              <div className="sobre-ptr-card-avatar-mini"><i className="fa-solid fa-image"></i></div>
              <i className="fa-solid fa-chess-knight"></i>
              <p className="sobre-ptr-card-titulo">A cavala é sua estratégia</p>
            </div>
            <p className="sobre-ptr-card-texto">
              Mesmo que ela não tenha aptidão para alguma das pistas sorteadas, faz parte da
              estratégia decidir como lidar com esse desafio.
            </p>
          </div>
        </div>
      </section>

      <section className="sobre-ptr-secao">
        <p className="sobre-ptr-secao-titulo">Normas de boa convivência</p>
        <div className="sobre-ptr-secao-linha"></div>

        <div className="sobre-ptr-norma-destaque">
          <div>
            <p className="sobre-ptr-norma-titulo">
              <i className="fa-solid fa-triangle-exclamation"></i> Deck incorreto
            </p>
            <p className="sobre-ptr-norma-texto">
              Se sua cavala estiver com o deck incorreto, ela estará automaticamente impedida de subir
              ao pódio. Errou o deck e ficou em terceiro? Parabéns... agora você é o quarto colocado.
              Ficou abaixo disso? Parabens voce é ruim mesmo.
            </p>
          </div>
          <div className="sobre-ptr-placeholder sobre-ptr-placeholder-norma">
            <img src="/assets/img/home/biwa_1.png" alt="descrição da imagem" />
          </div>
        </div>

        <div className="sobre-ptr-norma-destaque sobre-ptr-norma-destaque-dourada">
          <div>
            <p className="sobre-ptr-norma-titulo-dourada">
              <i className="fa-brands fa-discord"></i> No Discord
            </p>
            <p className="sobre-ptr-norma-texto">
              No Discord, pode conversar, brincar e zoar à vontade. A call é aberta justamente para
              isso. Só pedimos bom senso quando a organização estiver apresentando o evento, narrando
              as corridas ou passando informações importantes. Respeitar quem está falando ajuda todo
              mundo a aproveitar melhor a transmissão.
            </p>
          </div>
          <div className="sobre-ptr-placeholder sobre-ptr-placeholder-norma">
            <img src="/assets/img/home/aston_2.png" alt="descrição da imagem" />
          </div>
        </div>

        <div className="sobre-ptr-norma-destaque sobre-ptr-norma-destaque-dourada">
          <div className="sobre-ptr-placeholder sobre-ptr-placeholder-norma sobre-ptr-placeholder-norma-cover">
            <img src="/assets/img/home/haru_1.webp" alt="descrição da imagem" />
          </div>
          <div>
            <p className="sobre-ptr-norma-titulo-dourada">
              <i className="fa-solid fa-handshake"></i> Respeito entre participantes
            </p>
            <p className="sobre-ptr-norma-texto">
              Também esperamos respeito entre todos os participantes. Aqui, analisar uma cavala não é
              atacar ou julgar ninguém. Faz parte da competição comentar estratégias, builds,
              treinamentos e desempenhos. Todo mundo está aqui para testar ideias, competir, aprender
              um com o outro e, acima de tudo, se divertir.
            </p>
          </div>
        </div>
      </section>

      <section className="sobre-ptr-secao">
        <div className="sobre-ptr-placeholder sobre-ptr-placeholder-fechamento">
          <img src="/assets/img/home/cavalinhas.webp" alt="descrição da imagem" />
        </div>
      </section>
    </>
  );
}

export default Home;