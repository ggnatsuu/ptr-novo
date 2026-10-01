// 🎯 src/data/conquistas.js
// Catálogo de conquistas e epítetos da PTR. Cada item:
//   tag        identificador fixo (nunca mudar depois de lançado)
//   tipo       "conquista" | "epiteto"
//   categoria  chave de CATEGORIAS
//   raridade   chave de RARIDADES
//   nome       nome da conquista (nos epítetos, é o próprio título)
//   titulo     título que o treinador pode equipar
//   icone      ícone do Font Awesome (sem o "fa-")
//   descricao  regra, em português, como aparece no site
//   verificacao "auto"    = calculada com os resultados (inclusive CSV)
//               "arquivo" = só nas corridas enviadas pelo arquivo do jogo
//               "manual"  = um admin concede
//   requer     (opcional) tags que precisam estar desbloqueadas antes
// As regras de cálculo ficam em utils/conquistas/motor.js, pela tag.

export const RARIDADES = {
  apice: { nome: "Ápice", cor: "#ff6ad5", ordem: 5 },
  platina: { nome: "Platina", cor: "#5fd4f4", ordem: 4 },
  ouro: { nome: "Ouro", cor: "#c5a059", ordem: 3 },
  prata: { nome: "Prata", cor: "#c9d1db", ordem: 2 },
  bronze: { nome: "Bronze", cor: "#cd7f32", ordem: 1 },
};

export const CATEGORIAS = {
  desempenho: { nome: "Desempenho & Pódio", icone: "trophy" },
  adaptacao: { nome: "Adaptação & Desafio da Pista", icone: "route" },
  telemetria: { nome: "Telemetria & Feitos Milimétricos", icone: "stopwatch" },
  leitura: { nome: "Leitura da Corrida", icone: "film" },
  rivalidade: { nome: "Rivalidade & Duelos Diretos", icone: "people-arrows" },
  resenha: { nome: "Resenha & Convivência", icone: "comments" },
  honra: { nome: "Perdeu, Mas com Honra", icone: "face-grin-tears" },
  carreira: { nome: "Carreira & Longevidade", icone: "calendar-days" },
  epitetos: { nome: "Epítetos", icone: "medal" },
};

const c = (categoria, raridade, tag, nome, titulo, icone, descricao, verificacao = "auto", extra = {}) => ({
  tag, tipo: "conquista", categoria, raridade, nome, titulo, icone, descricao, verificacao, ...extra,
});
const e = (raridade, tag, titulo, icone, descricao, extra = {}) => ({
  tag, tipo: "epiteto", categoria: "epitetos", raridade, nome: titulo, titulo, icone, descricao, verificacao: "auto", ...extra,
});

export const CONQUISTAS = [
  // 🏆 Desempenho & Pódio
  c("desempenho", "apice", "grand_slam_ptr", "Grand Slam da PTR", "Colecionador de Troféus", "trophy", "Vencer todas as provas G1 do circuito pelo menos uma vez na carreira"),
  c("desempenho", "platina", "triplice_coroa_semana", "A Tríplice Coroa da Semana", "Soberano da Tríplice", "calendar-week", "Vencer as três corridas da mesma edição"),
  c("desempenho", "platina", "rei_dos_g1", "Rei dos G1", "Realeza dos G1", "ranking-star", "Vencer 5 provas G1 diferentes"),
  c("desempenho", "platina", "mestre_do_budget", "Mestre do Budget (F2P Supremo)", "A Prancheta de Ouro", "coins", "Ser o 1º geral da semana com deck sem nenhuma SSR", "arquivo"),
  c("desempenho", "ouro", "dono_do_podio", "Dono do Pódio", "Consistência Absoluta", "medal", "Top 3 nas três corridas da mesma edição"),
  c("desempenho", "ouro", "vitoria_por_um_focinho", "Vitória por um Focinho", "Coração de Aço", "heart-pulse", "Vencer com o 2º colocado a até 0,05s"),
  c("desempenho", "ouro", "massacre_do_turf", "O Massacre do Turf", "Monstro Solitário", "bolt", "Vencer com mais de 7 corpos (~17,5 m) de vantagem"),
  c("desempenho", "ouro", "economia_extrema", "Economia Extrema", "Gênio do Low-Cost", "piggy-bank", "Pódio da semana com pelo menos 2 cartas R no deck", "arquivo"),
  c("desempenho", "prata", "batismo_de_fogo", "Batismo de Fogo", "Vencedor de G1", "fire", "Vencer sua primeira G1"),
  c("desempenho", "prata", "dobradinha_de_ouro", "Dobradinha de Ouro", "Dominador do Turf", "award", "Vencer 2 das 3 corridas da mesma edição"),
  c("desempenho", "prata", "senhor_da_regularidade", "O Senhor da Regularidade", "Relógio Suíço", "clock", "Top 5 em 6 corridas consecutivas"),
  c("desempenho", "bronze", "primeira_vitoria", "Primeira Vitória", "Gosto da Vitória", "star", "Vencer sua primeira corrida"),
  c("desempenho", "bronze", "primeiro_podio", "Primeiro Pódio", "Noite de Pódio", "shield-halved", "Top 3 pela primeira vez"),
  c("desempenho", "bronze", "estreante_veloz", "Estreante Veloz", "Calouro Audacioso", "flag-checkered", "Top 9 na primeira participação"),

  // 🧬 Adaptação & Desafio da Pista
  c("adaptacao", "platina", "ousadia_e_gloria", "Ousadia e Glória", "Inimigo da Estatística", "dice-d20", "Vencer com aptidão C ou pior na distância", "arquivo"),
  c("adaptacao", "platina", "milagre_terra_batida", "O Milagre da Terra Batida", "O Trator de Tracen", "mountain", "Vencer na Terra com aptidão de terreno E ou pior", "arquivo"),
  c("adaptacao", "platina", "conquistador", "Conquistador", "Senhor dos Hipódromos", "earth-asia", "Vencer em todos os hipódromos"),
  c("adaptacao", "ouro", "rei_do_lamacal", "Rei do Lamaçal", "Terror da Tempestade", "cloud-showers-heavy", "Vencer sob Rainy com terreno Heavy", "arquivo"),
  c("adaptacao", "ouro", "a_reta_e_nossa", "A Reta É Nossa", "Flecha em Linha Reta", "arrow-right-long", "Vencer o Ibis Summer Dash (Niigata 1000m reta)"),
  c("adaptacao", "ouro", "maratonista_incansavel", "Maratonista Incansável", "Pulmão de Aço", "lungs", "Vencer prova de 3000m ou mais sem esgotar a estamina"),
  c("adaptacao", "ouro", "mestre_dos_estilos", "Mestre dos Estilos", "Mestre das Táticas", "chess", "Vencer com os 4 estilos"),
  c("adaptacao", "prata", "polivalente_do_turf", "Polivalente do Turf", "Mestre da Versatilidade", "route", "Top 3 em duas corridas da mesma edição com pelo menos 800m de diferença entre elas"),
  c("adaptacao", "prata", "subida_sem_freio", "Subida Sem Freio", "Devorador de Subidas", "arrow-trend-up", "Vencer em Nakayama ou Hanshin"),
  c("adaptacao", "prata", "versatil", "Versátil", "Camaleão", "shuffle", "Vencer com 2 estilos diferentes"),
  c("adaptacao", "prata", "todo_terreno", "Todo Terreno", "Pé em Qualquer Chão", "road", "Vencer na Grama e na Terra"),
  c("adaptacao", "bronze", "apenas_corra", "Apenas Corra", "Sem Medo da Vergonha", "person-running", "Disputar prova com aptidão E ou F no terreno ou na distância", "arquivo"),
  c("adaptacao", "bronze", "sob_o_sol_escaldante", "Sob o Sol Escaldante", "Amigo do Calor", "sun", "Disputar prova Sunny + Firm", "arquivo"),
  c("adaptacao", "bronze", "turista", "Turista", "Viajante da Tracen", "map-location-dot", "Correr em 5 hipódromos diferentes"),

  // ⏱️ Telemetria & Feitos Milimétricos
  c("telemetria", "ouro", "timing_cirurgico", "Timing Cirúrgico", "Cronômetro Humano", "gauge-high", "Iniciar o Last Spurt com 0 m de atraso"),
  c("telemetria", "ouro", "volta_por_cima", "Volta por Cima", "Acordou Atrasada, Chegou Primeiro", "rocket", "Vencer largando com status \"Late\""),
  c("telemetria", "ouro", "coracao_valente", "Coração Valente", "Vence Até Sem Fôlego", "heart-crack", "Vencer mesmo com o HP esgotado antes da linha"),
  c("telemetria", "prata", "combustivel_na_reserva", "Combustível na Reserva", "No Limite do Tanque", "gas-pump", "Vencer prova Long com HP \"Survived\" e menos de 3%"),
  c("telemetria", "prata", "duelista", "Duelista", "Ombro a Ombro", "handshake-angle", "Vencer depois de duelar por 5 s ou mais"),
  c("telemetria", "prata", "rei_da_descida", "Rei da Descida", "Sem Freio na Ladeira", "person-skiing", "Somar 15 s ou mais em modo Downhill numa corrida"),
  c("telemetria", "bronze", "reflexo_de_lince", "Reflexo de Lince", "Largada Relâmpago", "eye", "Largar com atraso de menos de 10 ms"),

  // 🎬 Leitura da Corrida (precisam do replay do arquivo)
  c("leitura", "ouro", "arrancada_do_seculo", "A Arrancada do Século", "Teletransporte no Spurt", "forward-fast", "Estar em 8º ou pior no início da reta final e vencer", "arquivo"),
  c("leitura", "ouro", "do_fundo_do_pelotao", "Do Fundo do Pelotão", "Furacão de Trás", "angles-up", "Ganhar 10 ou mais posições numa corrida (da largada à chegada)", "arquivo"),
  c("leitura", "ouro", "saida_de_emergencia", "Saída de Emergência", "Mestre da Brecha", "door-open", "Vencer depois de ser bloqueado na parte final da corrida", "arquivo"),
  c("leitura", "prata", "muralha_intransponivel", "Muralha Intransponível", "A Fuga Implacável", "shield", "Ficar em 1º do fim da largada (200 m) até a chegada, sem perder a ponta", "arquivo"),
  c("leitura", "prata", "especialista_em_heranca", "O Especialista em Herança", "Sangue Nobre", "dna", "Ativar 2 ou mais únicas herdadas na mesma corrida", "arquivo"),
  c("leitura", "prata", "ouro_puro", "Ouro Puro", "Banhado a Ouro", "gem", "Vencer ativando 3 ou mais skills douradas", "arquivo"),
  c("leitura", "prata", "wit_infalivel", "Wit Infalível", "Mente Afiada", "brain", "Nenhuma skill falhar no Wit check, com 12 ou mais skills na corrida", "arquivo"),
  c("leitura", "bronze", "segundo_folego", "Segundo Fôlego", "Fênix do Turf", "kit-medical", "Recuperar 300 HP ou mais com skills numa corrida", "arquivo"),
  c("leitura", "bronze", "cabeca_fria", "Cabeça Fria", "Sangue de Barata", "snowflake", "Vencer sem ficar Rushed nem um segundo", "arquivo"),
  c("leitura", "bronze", "cavalo_teimoso", "O Cavalo Teimoso", "Ligou o Foda-se", "horse-head", "Ficar Rushed dentro da primeira curva", "arquivo"),

  // ⚔️ Rivalidade & Duelos Diretos
  c("rivalidade", "ouro", "duelo_no_ultimo_metro", "Duelo no Último Metro", "Final de Foto", "camera", "Cruzar a chegada com o mesmo tempo de outro competidor"),
  c("rivalidade", "prata", "pesadelo_do_lider", "Pesadelo do Líder", "Pedra no Sapato", "shoe-prints", "Terminar à frente do líder da temporada nas 3 corridas da edição"),
  c("rivalidade", "prata", "guerra_de_estrategia", "Guerra de Estratégia", "O Alfa do Pelotão", "users-rays", "Vencer com pelo menos outros 4 usando o mesmo estilo"),

  // 💬 Resenha & Convivência
  c("resenha", "ouro", "cala_boca_historico", "Cala-Boca Histórico", "O Terror dos Secadores", "volume-xmark", "Vencer a corrida principal depois de a call inteira ter secado", "manual"),
  c("resenha", "ouro", "cadeira_cativa", "Cadeira Cativa", "Patrimônio da PocoLords", "chair", "10 edições consecutivas (check-in + corrida)"),
  c("resenha", "ouro", "a_profecia_cumprida", "A Profecia Cumprida", "O Vidente de Sábado", "hat-wizard", "Anunciar na call onde assumiria a ponta, e acertar", "manual"),
  c("resenha", "prata", "anfitriao_da_sexta", "O Anfitrião da Sexta", "Pontualidade Britânica", "user-clock", "Check-in na sexta antes das 21h em 3 semanas seguidas"),
  c("resenha", "prata", "manchete_do_jornal", "Manchete do Jornal", "Capa de Revista", "newspaper", "Ser mencionado ou virar tema do Jornal da PTR", "manual"),

  // 😂 Perdeu, Mas com Honra
  c("honra", "prata", "porteiro_do_podio", "O Porteiro do Pódio", "A Quase-Glória", "door-closed", "4º lugar em 2 ou mais corridas da mesma edição"),
  c("honra", "prata", "secador_involuntario", "Secador Involuntário", "Vítima do Spurt", "wind", "Terminar em 2º perdendo por menos de 1 m"),
  c("honra", "bronze", "ficou_no_paddock", "Ficou no Paddock", "Dormiu no Ponto", "bed", "Largar com status \"Late\""),
  c("honra", "bronze", "ponto_de_participacao", "O Ponto de Participação", "O Importante É Competir", "hand-holding-heart", "Entre 10º e 18º nas três corridas da edição"),
  c("honra", "bronze", "esqueceu_a_estamina", "Esqueceu a Estamina", "Sem Ar no Final", "battery-empty", "Terminar com a estamina esgotada"),

  // 📅 Carreira & Longevidade
  c("carreira", "platina", "lenda_viva_pocolords", "Lenda Viva da PocoLords", "Pilar da Academia", "monument", "Disputar 25 edições"),
  c("carreira", "ouro", "clube_dos_15000", "Clube dos 15.000", "Magnata do Prestígio", "sack-dollar", "Mais de 15.000 pontos no Rank Geral"),
  c("carreira", "ouro", "fidelidade_de_sangue", "Fidelidade de Sangue", "Amor Incondicional", "heart", "10 edições com a mesma Uma base (dá o título de Oshi dela)"),
  c("carreira", "ouro", "maestria", "Maestria", "Dupla Perfeita", "infinity", "5 vitórias com a mesma personagem"),
  c("carreira", "prata", "veterano_de_guerra", "Veterano de Guerra", "Calejado do Turf", "shield-heart", "Disputar 15 edições"),
  c("carreira", "prata", "retorno_triunfal", "O Retorno Triunfal", "O Bom Filho à Casa Torna", "rotate-left", "Voltar após 2 ou mais edições fora e vencer na edição de volta"),
  c("carreira", "prata", "elenco_variado", "Elenco Variado", "Treinador de Elenco", "users", "Correr com 10 personagens diferentes"),

  // 🎖️ Epítetos (nome = título, em inglês como no jogo)
  e("platina", "goddess", "Goddess", "venus", "Ter Lady + vencer Victoria Mile, Hanshin Juvenile e Queen Elizabeth II Cup", { requer: ["triplice_tiara"] }),
  e("platina", "mile_a_minute", "Mile a Minute", "stopwatch", "Vencer NHK Mile Cup, Oka Sho, Yasuda Kinen, Victoria Mile, Mile Championship e (Hanshin Juvenile ou Asahi Hai)"),
  e("platina", "legendary", "Legendary", "dragon", "Ter Stunning ou Lady + Spring Champion + Fall Champion", { requer: ["spring_champion", "fall_champion"] }),
  e("platina", "dirt_g1_dominator", "Dirt G1 Dominator", "mountain-sun", "Vencer 5 G1 de Terra"),
  e("ouro", "heroine", "Heroine", "chess-queen", "Ter Lady + vencer Queen Elizabeth II Cup", { requer: ["triplice_tiara"] }),
  e("ouro", "incredible", "Incredible", "wand-sparkles", "Ter Stunning + vencer Japan Cup ou Arima Kinen", { requer: ["triplice_coroa"] }),
  e("ouro", "phenomenal", "Phenomenal", "meteor", "Ter Stunning + vencer 2 entre Tenno Sho Spring, Takarazuka Kinen, Japan Cup, Tenno Sho Autumn, Osaka Hai e Arima Kinen", { requer: ["triplice_coroa"] }),
  e("ouro", "breakneck_miler", "Breakneck Miler", "gauge-simple-high", "Vencer NHK Mile Cup, Yasuda Kinen e Mile Championship"),
  e("ouro", "sprint_speedster", "Sprint Speedster", "jet-fighter", "Vencer Takamatsunomiya Kinen, Sprinters Stakes, Yasuda Kinen e Mile Championship"),
  e("ouro", "pro_racer", "Pro Racer", "horse", "10 vitórias"),
  e("ouro", "eat_my_dust", "Eat My Dust", "smog", "7 vitórias na Terra"),
  e("ouro", "dirt_g1_powerhouse", "Dirt G1 Powerhouse", "dumbbell", "Vencer 3 G1 de Terra"),
  e("prata", "triplice_coroa", "Stunning", "crown", "Vencer Satsuki Sho, Tokyo Yushun e Kikuka Sho (Tríplice Coroa)"),
  e("prata", "triplice_tiara", "Lady", "ring", "Vencer Oka Sho, Japanese Oaks e Shuka Sho (Tríplice Tiara)"),
  e("prata", "spring_champion", "Spring Champion", "seedling", "Vencer Osaka Hai, Tenno Sho Spring e Takarazuka Kinen"),
  e("prata", "fall_champion", "Fall Champion", "leaf", "Vencer Tenno Sho Autumn, Japan Cup e Arima Kinen"),
  e("prata", "shield_bearer", "Shield Bearer", "torii-gate", "Vencer Tenno Sho Spring e Tenno Sho Autumn"),
  e("prata", "sprint_go_getter", "Sprint Go-Getter", "bolt-lightning", "Vencer Takamatsunomiya Kinen e Sprinters Stakes"),
  e("prata", "kicking_up_dust", "Kicking Up Dust", "hurricane", "Vencer Unicorn Stakes, Leopard Stakes e Japan Dirty Derby"),
  e("prata", "dirt_sprinter", "Dirt Sprinter", "forward", "Vencer a JBC Sprint duas vezes"),
  e("prata", "dirt_dancer", "Dirt Dancer", "music", "Vencer na Terra em Sprint, Mile e Medium"),
  e("prata", "turf_tussler", "Turf Tussler", "clover", "Vencer na Grama em Sprint, Mile, Medium e Long"),
  e("prata", "playing_dirty", "Playing Dirty", "hand-back-fist", "4 vitórias na Terra"),
  e("prata", "dirt_g1_star", "Dirt G1 Star", "star-half-stroke", "Vencer 2 G1 de Terra"),
  e("prata", "standard_distance_leader", "Standard Distance Leader", "ruler", "3 vitórias em distância múltipla de 400m (1200/1600/2000/2400/3200)"),
  e("prata", "non_standard_distance_leader", "Non-Standard Distance Leader", "ruler-combined", "3 vitórias em distância não múltipla de 400m"),
  e("bronze", "dirt_g1_achiever", "Dirt G1 Achiever", "certificate", "Vencer 1 G1 de Terra"),
  e("bronze", "dirty_work", "Dirty Work", "trowel", "2 vitórias na Terra"),
  e("bronze", "kokura_constable", "Kokura Constable", "building-shield", "2 vitórias em Kokura"),
  e("bronze", "west_japan_whiz", "West Japan Whiz", "map-pin", "3 vitórias em Chukyo, Hanshin ou Kyoto"),
  e("bronze", "kanto_conqueror", "Kanto Conqueror", "city", "3 vitórias em Tokyo, Nakayama ou Ooi"),
  e("bronze", "tohoku_top_dog", "Tohoku Top Dog", "dog", "3 vitórias em Fukushima ou Niigata"),
  e("bronze", "hokkaido_hotshot", "Hokkaido Hotshot", "snowflake", "3 vitórias em Sapporo ou Hakodate"),
  e("bronze", "junior_jewel", "Junior Jewel", "child", "3 vitórias em corridas com \"Junior\" ou \"Nisai\" no nome"),
  e("bronze", "umatastic", "Umatastic", "face-grin-stars", "3 vitórias em corridas \"Himba Stakes\""),
  e("bronze", "globe_trotter", "Globe-Trotter", "earth-americas", "3 vitórias em corridas com nome de país (Saudi Arabia Royal Cup, New Zealand Trophy, American Jockey Club Cup, Copa Republica Argentina, Japan Cup, Japanese Oaks, Japan Dirty Derby)"),
];

// Planejadas que continuam fora do site (o jogo não registra o necessário ou
// é trabalhoso demais por enquanto).
export const PLANEJADAS = [
  { tag: "o_olho_da_maldicao", nome: "O Olho da Maldição", motivo: "Identificar debuffs aplicados exige ler o efeito de cada skill" },
  { tag: "sobrevivente_do_feitico", nome: "Sobrevivente do Feitiço", motivo: "Idem (debuffs recebidos)" },
  { tag: "panico_no_pelotao", nome: "Pânico no Pelotão", motivo: "O jogo não registra quem causou o Rushed de outra cavalinha" },
  { tag: "combo_de_posicao", nome: "Combo de Posição", motivo: "Falta definir o que conta como skill \"amarela\"" },
];
