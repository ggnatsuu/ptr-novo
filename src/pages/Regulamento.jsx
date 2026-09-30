// 🎯 Página do Regulamento Geral da PTR. Texto 100% verbatim (fornecido
// pelo usuário em message.txt) — só formatado em títulos/listas/tabelas,
// sem reescrever nada, seguindo a mesma regra já usada na Home (seção
// "O que é a PTR").
// Classes com prefixo "reg-" pra não colidir com nada de outra página —
// todo CSS do site é importado globalmente em main.jsx.
import { useEffect, useRef, useState } from "react";

const INDICE = [
  { id: "sec-1", titulo: "1. Sobre a PTR" },
  { id: "sec-2", titulo: "2. Calendário dos Eventos" },
  { id: "sec-3", titulo: "3. Estrutura da Edição" },
  { id: "sec-4", titulo: "4. Participação" },
  { id: "sec-5", titulo: "5. Construção da Uma Musume" },
  { id: "sec-6", titulo: "6. Corridas" },
  { id: "sec-7", titulo: "7. Ranking Geral" },
  { id: "sec-8", titulo: "8. Penalidades" },
  { id: "sec-9", titulo: "9. Discord e Transmissão" },
  { id: "sec-10", titulo: "10. Boa Convivência" },
  { id: "sec-11", titulo: "11. Glossário" },
  { id: "sec-12", titulo: "12. Disposições Gerais" },
];

function Regulamento() {
  const indicePrincipalRef = useRef(null);
  const [mostrarIndiceFlutuante, setMostrarIndiceFlutuante] = useState(false);

  // 🎯 O índice flutuante (fixo na lateral) só aparece quando o índice
  // principal (lá no topo da página) sai da tela rolando pra baixo. Assim
  // que ele volta a aparecer (rolando de volta pro topo), o flutuante some
  // sozinho — evita os dois aparecerem ao mesmo tempo.
  useEffect(() => {
    const elemento = indicePrincipalRef.current;
    if (!elemento) return;

    const observador = new IntersectionObserver(
      ([entrada]) => setMostrarIndiceFlutuante(!entrada.isIntersecting),
      { rootMargin: "-90px 0px 0px 0px" } // compensa a navbar fixa no topo
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <div className="reg-pagina">
      <header className="reg-cabecalho">
        <p className="reg-cabecalho-rotulo">Regulamento Geral</p>
        <h1 className="reg-cabecalho-titulo">PTR – PocoLords Twinkles Road</h1>
      </header>

      <nav className="reg-indice" aria-label="Índice do regulamento" ref={indicePrincipalRef}>
        <p className="reg-indice-titulo">Índice</p>
        <ol className="reg-indice-lista">
          {INDICE.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.titulo}</a>
            </li>
          ))}
        </ol>
      </nav>

      {/* 🎯 Índice flutuante — cópia compacta do índice principal, fixa na
          lateral direita, visível só depois que o principal sai da tela
          (ver useEffect acima). Escondida em telas estreitas (media query
          no CSS) — não cabe do lado do texto sem espremer o conteúdo. */}
      {mostrarIndiceFlutuante && (
        <nav className="reg-indice-flutuante" aria-label="Índice do regulamento (atalho fixo)">
          <p className="reg-indice-flutuante-titulo">Índice</p>
          <ol className="reg-indice-flutuante-lista">
            {INDICE.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.titulo}</a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="reg-conteudo">
        <section id="sec-1" className="reg-secao">
          <h2 className="reg-secao-titulo">1. Sobre a PTR</h2>
          <p>
            A <strong>PTR (PocoLords Twinkles Road)</strong> é a liga de corridas de{" "}
            <strong>Uma Musume: Pretty Derby</strong>, organizada pela comunidade PocoLords.
          </p>
          <p>
            Seu objetivo é proporcionar um ambiente competitivo, estratégico e divertido, onde cada
            treinador possa desenvolver sua própria Uma Musume, construir sua história dentro da liga e
            disputar corridas inspiradas no calendário oficial japonês do jogo.
          </p>
          <p>
            Mais do que vencer corridas, a PTR busca criar um ambiente em que estratégia, participação e
            boa convivência caminhem juntas.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-2" className="reg-secao">
          <h2 className="reg-secao-titulo">2. Calendário dos Eventos</h2>

          <h3 className="reg-subsecao-titulo">2.1 Dias Oficiais</h3>
          <p>A PTR realiza uma edição por semana.</p>
          <ul className="reg-lista">
            <li>
              <strong>Sexta-feira</strong>
              <ul className="reg-lista">
                <li>Abertura do Check-in às 18h00.</li>
              </ul>
            </li>
            <li>
              <strong>Sábado</strong>
              <ul className="reg-lista">
                <li>Encerramento do Check-in.</li>
                <li>Abertura das inscrições.</li>
                <li>Abertura das pistas aproximadamente 3 horas antes do evento.</li>
                <li>Início oficial da edição às 18h30.</li>
              </ul>
            </li>
          </ul>
          <p>
            A duração do evento pode variar conforme o número de participantes, tendo normalmente cerca
            de <strong>1h30</strong>.
          </p>

          <h3 className="reg-subsecao-titulo">2.2 Check-in</h3>
          <p>
            O Check-in existe exclusivamente para auxiliar a Organização da PTR a estimar o número de
            participantes da edição.
          </p>
          <p>
            Com essas informações é possível preparar antecipadamente a quantidade de salas necessárias
            para acomodar todos os competidores.
          </p>
          <p>
            O Check-in é realizado exclusivamente pelo site oficial da PTR e divulgado também no Discord
            da PocoLords.
          </p>
          <p>
            Sua abertura ocorre às <strong>18h00 de sexta-feira</strong>, sendo encerrado aproximadamente
            às <strong>15h30 de sábado</strong>.
          </p>
          <p>
            O Check-in <strong>não é obrigatório</strong>, porém sua realização ajuda diretamente na
            organização do evento.
          </p>

          <h3 className="reg-subsecao-titulo">2.3 Inscrições</h3>
          <p>Após o encerramento do Check-in, inicia-se o período de inscrições da edição.</p>
          <p>
            Durante aproximadamente três horas, os participantes poderão entrar na sala oficial da
            corrida utilizando o código disponibilizado pela Organização da PTR através do site e do
            Discord.
          </p>
          <p>
            Enquanto a sala permanecer aberta, o participante poderá alterar livremente sua Uma Musume
            inscrita.
          </p>
          <p>
            Após o fechamento da sala, nenhuma alteração poderá ser realizada, uma vez que essa
            limitação pertence ao próprio sistema de Uma Musume: Pretty Derby.
          </p>
          <p>Encerradas as inscrições, nenhum novo participante poderá ingressar na edição em andamento.</p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-3" className="reg-secao">
          <h2 className="reg-secao-titulo">3. Estrutura da Edição</h2>

          <h3 className="reg-subsecao-titulo">3.1 Sorteio da Edição</h3>
          <p>Ao término de cada edição, a Organização da PTR realiza o sorteio da próxima semana.</p>
          <p>São definidos:</p>
          <ul className="reg-lista">
            <li>Cenário;</li>
            <li>Deck da edição;</li>
            <li>Corridas da semana.</li>
          </ul>
          <p>
            Todas as corridas seguem como referência o calendário oficial de{" "}
            <strong>Uma Musume: Pretty Derby</strong>, respeitando a hierarquia tradicional entre G1, G2
            e G3.
          </p>

          <h3 className="reg-subsecao-titulo">3.2 Quantidade de Corridas</h3>
          <p>Cada edição possui, normalmente, <strong>três corridas</strong>.</p>
          <p>
            Caso o número de participantes seja superior à capacidade de uma única sala, poderão ser
            abertas salas adicionais utilizando as mesmas corridas sorteadas para aquela edição.
          </p>
          <p>
            Esse sistema garante que todos os participantes possam competir sem alterar a programação
            originalmente definida.
          </p>

          <h3 className="reg-subsecao-titulo">3.3 Evento Principal</h3>
          <p>
            Em geral, as corridas <strong>G1</strong> representam o Evento Principal de cada edição,
            acompanhando o prestígio do calendário oficial de Uma Musume: Pretty Derby.
          </p>
          <p>
            A ordem das corridas é definida pela Organização da PTR juntamente com os participantes
            presentes no início do evento.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-4" className="reg-secao">
          <h2 className="reg-secao-titulo">4. Participação</h2>
          <p>Cada participante poderá utilizar <strong>apenas uma Uma Musume durante toda a edição</strong>.</p>
          <p>A escolha da Uma Musume é de inteira responsabilidade do treinador.</p>
          <p>Enquanto o período de inscrições permanecer aberto, a troca da Uma Musume será permitida.</p>
          <p>Após o fechamento da sala, nenhuma alteração poderá ser realizada.</p>
          <p>
            Essa limitação faz parte do funcionamento do próprio jogo e não pode ser modificada pela
            Organização da PTR.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-5" className="reg-secao">
          <h2 className="reg-secao-titulo">5. Construção da Uma Musume</h2>
          <p>A PTR não determina qual Uma Musume cada participante deverá utilizar.</p>
          <p>Cada treinador é livre para escolher sua Uma Musume e definir sua estratégia de treinamento.</p>
          <p>
            Para promover maior equilíbrio competitivo entre jogadores de diferentes níveis de
            progressão, cada edição contará com um sorteio que definirá o limite máximo de cartas{" "}
            <strong>SSR</strong> permitidas na composição do deck.
          </p>
          <p>As cartas das categorias <strong>SR</strong> e <strong>R</strong> poderão ser utilizadas livremente.</p>
          <p>
            O cenário de treinamento também será definido pela edição e deverá ser respeitado por todos
            os participantes.
          </p>
          <p>
            Caso uma Uma Musume seja inscrita utilizando um deck diferente do estabelecido para a edição, ela
            estará sujeita às penalidades previstas neste regulamento.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-6" className="reg-secao">
          <h2 className="reg-secao-titulo">6. Corridas</h2>
          <p>Cada edição possui corridas previamente definidas e divulgadas pela Organização da PTR.</p>
          <p>As provas serão assistidas coletivamente durante o evento oficial.</p>
          <p>
            Por respeito aos demais participantes e ao espírito da competição, solicita-se que os
            competidores <strong>não assistam ao resultado das corridas antes da transmissão oficial</strong>.
          </p>
          <p>
            Da mesma forma, qualquer tipo de spoiler durante o evento compromete a experiência coletiva
            e poderá ser analisado pela Organização da PTR.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-7" className="reg-secao">
          <h2 className="reg-secao-titulo">7. Ranking Geral</h2>
          <p>
            O Ranking Geral da PTR existe para registrar a trajetória dos participantes ao longo das
            edições.
          </p>
          <p>
            Seu objetivo é valorizar aqueles que acompanham regularmente a liga e construir um histórico
            das conquistas obtidas por cada treinador.
          </p>
          <p>O ranking não determina quem é o melhor competidor.</p>
          <p>
            Cada participante atribui seu próprio valor às suas conquistas, sejam elas vitórias, pódios
            ou participações.
          </p>
          <p>
            Na PTR, as categorias G1, G2 e G3 possuem o prestígio natural do calendário oficial, mas não
            concedem pontuação diferente dentro do ranking.
          </p>

          <h3 className="reg-subsecao-titulo">Pontuação</h3>

          <div className="reg-pontuacao-participacao">
            <span className="reg-pontuacao-participacao-numero">300</span>
            <span className="reg-pontuacao-participacao-label">pontos por participação</span>
          </div>

          <table className="reg-tabela">
            <caption>Resultado das Corridas</caption>
            <thead>
              <tr>
                <th>Posição</th>
                <th>Pontos</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>1º Lugar</td><td>12 pontos</td></tr>
              <tr><td>2º Lugar</td><td>10 pontos</td></tr>
              <tr><td>3º Lugar</td><td>9 pontos</td></tr>
              <tr><td>4º Lugar</td><td>8 pontos</td></tr>
              <tr><td>5º Lugar</td><td>7 pontos</td></tr>
              <tr><td>6º Lugar</td><td>6 pontos</td></tr>
              <tr><td>7º Lugar</td><td>5 pontos</td></tr>
              <tr><td>8º Lugar</td><td>4 pontos</td></tr>
              <tr><td>9º Lugar</td><td>3 pontos</td></tr>
              <tr><td>10º ao 18º Lugar</td><td>2 pontos</td></tr>
            </tbody>
          </table>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-8" className="reg-secao">
          <h2 className="reg-secao-titulo">8. Penalidades</h2>
          <p>
            A PTR acredita que a melhor forma de manter um ambiente saudável é através da boa convivência
            entre seus participantes.
          </p>
          <p>Ainda assim, algumas situações exigem providências por parte da Organização.</p>

          <h3 className="reg-subsecao-titulo">Deck incorreto</h3>
          <p>
            Participantes inscritos com deck diferente daquele estabelecido para a edição não poderão
            ocupar posições de pódio.
          </p>
          <p>
            Caso terminem entre os três primeiros colocados, serão desclassificados da premiação daquela
            corrida, promovendo automaticamente os competidores seguintes.
          </p>
          <p>
            Caso o erro seja cometido por um participante iniciante, a Organização poderá orientar e
            esclarecer as regras antes de aplicar medidas mais severas.
          </p>
          <p>Situações de descumprimento proposital das regras poderão resultar em punições mais rigorosas.</p>

          <h3 className="reg-subsecao-titulo">Boa convivência</h3>
          <p>A PTR é um ambiente criado para competição, diversão e interação entre seus participantes.</p>
          <p>Respeito, bom senso e educação são esperados durante todos os eventos.</p>
          <p>
            Sempre que necessário, a Organização da PTR poderá analisar situações que prejudiquem o
            ambiente da comunidade e tomar as providências que considerar adequadas, incluindo
            advertências, desclassificações ou impedimento de participação em futuras edições.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-9" className="reg-secao">
          <h2 className="reg-secao-titulo">9. Discord e Transmissão</h2>
          <p>A participação na chamada de voz do Discord não é obrigatória.</p>
          <p>Todos são bem-vindos para acompanhar, conversar e participar do evento da forma que preferirem.</p>
          <p>
            Durante a transmissão oficial, apenas a Organização da PTR realizará a apresentação e
            transmissão das corridas.
          </p>
          <p>
            Os participantes poderão entrar ou sair da chamada a qualquer momento, respeitando o
            andamento do evento e a boa convivência entre todos.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-10" className="reg-secao">
          <h2 className="reg-secao-titulo">10. Boa Convivência</h2>
          <p>A PTR foi criada para ser um ambiente leve, competitivo e agradável para todos.</p>
          <p>
            Brincadeiras, comentários e análises das Uma Musume fazem parte da experiência da comunidade,
            desde que realizados com respeito aos demais participantes.
          </p>
          <p>
            A Organização da PTR espera que todos contribuam para manter um ambiente saudável, acolhedor
            e divertido.
          </p>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-11" className="reg-secao">
          <h2 className="reg-secao-titulo">11. Glossário</h2>
          <dl className="reg-glossario">
            <dt>PTR</dt>
            <dd>PocoLords Twinkles Road.</dd>

            <dt>Check-in</dt>
            <dd>Confirmação de participação utilizada para auxiliar a organização da edição.</dd>

            <dt>Deck</dt>
            <dd>Conjunto de Support Cards utilizado durante o treinamento.</dd>

            <dt>Cenário</dt>
            <dd>Modo de treinamento definido para a edição.</dd>

            <dt>G1 / G2 / G3</dt>
            <dd>Graduações oficiais das corridas do calendário de Uma Musume: Pretty Derby.</dd>

            <dt>Sprint / Mile / Medium / Long</dt>
            <dd>Categorias de distância das corridas.</dd>

            <dt>Turf / Dirt</dt>
            <dd>Tipos de pista.</dd>

            <dt>SSR / SR / R</dt>
            <dd>Categorias das Support Cards utilizadas no treinamento.</dd>
          </dl>
        </section>

        <hr className="reg-divisor" />

        <section id="sec-12" className="reg-secao">
          <h2 className="reg-secao-titulo">12. Disposições Gerais</h2>
          <p>Este regulamento poderá ser atualizado sempre que necessário para acompanhar a evolução da PTR.</p>
          <p>
            Situações não previstas neste documento serão analisadas pela Organização da PTR, que poderá
            adotar as medidas consideradas mais adequadas para preservar o funcionamento da liga, a boa
            convivência entre os participantes e o espírito da competição.
          </p>
        </section>
      </div>
    </div>
  );
}

export default Regulamento;
