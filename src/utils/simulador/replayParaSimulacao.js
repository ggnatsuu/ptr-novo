// 🎯 src/utils/simulador/replayParaSimulacao.js
// Converte o arquivo de corrida lido por lerArquivoCorrida (o mesmo do
// Hakuraku) nas corredoras do simulador: status, humor, estratégia,
// aptidões que valem na corrida e skills de cada uma das cavalinhas.

const HUMOR_DO_JOGO = { 1: "Awful", 2: "Bad", 3: "Normal", 4: "Good", 5: "Great" };
const ESTRATEGIA_DO_ARQUIVO = { FRONT: "Front", PACE: "Pace", LATE: "Late", END: "End" };
const LETRA_DA_NOTA = ["G", "F", "E", "D", "C", "B", "A", "S"]; // nota 1 = G ... 8 = S
const CLIMA = { sunny: "Sunny", cloudy: "Cloudy", rainy: "Rainy", snowy: "Snowy" };
const TERRENO = { firm: "Firm", good: "Good", soft: "Soft", heavy: "Heavy" };
const ESTACAO = { spring: "Spring", summer: "Summer", fall: "Fall", autumn: "Fall", winter: "Winter" };

const letra = (aptidao) => LETRA_DA_NOTA[(aptidao?.nota ?? 7) - 1] ?? "A";

export function replayParaSimulacao(dados) {
  const c = dados.condicoes ?? {};
  const corredoras = (dados.dadosTreinadores ?? [])
    .filter((t) => t.stats?.speed != null)
    .sort((x, y) => x.numero - y.numero)
    .map((t) => {
      const runaway = /nige|runaway/i.test(t.estiloEspecial ?? "");
      return {
        numero: t.numero,
        posicaoReal: t.posicao,
        treinador: t.treinador ?? null,
        outfitId: t.cardId,
        nome: t.personagem ?? `#${t.numero}`,
        humor: HUMOR_DO_JOGO[t.humor] ?? "Normal",
        estrategia: runaway ? "Runaway" : ESTRATEGIA_DO_ARQUIVO[t.estilo] ?? "Pace",
        aptidoes: {
          distancia: letra(t.aptidoesCorrida?.distancia),
          terreno: letra(t.aptidoesCorrida?.terreno),
          estrategia: letra(t.aptidoesCorrida?.estilo),
        },
        status: { speed: t.stats.speed, stamina: t.stats.stamina, power: t.stats.power, guts: t.stats.guts, wit: t.stats.wiz },
        skills: (t.skills ?? []).map(String),
      };
    });
  return {
    courseId: c.courseId != null ? String(c.courseId) : null,
    condicoes: {
      terreno: TERRENO[c.terreno] ?? "Firm",
      clima: CLIMA[c.clima] ?? "Sunny",
      estacao: ESTACAO[c.estacao] ?? "Spring",
      grade: "G1",
    },
    corredoras,
  };
}
