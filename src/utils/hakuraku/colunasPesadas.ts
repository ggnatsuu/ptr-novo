// 🎯 Ponto de entrada do cálculo das colunas "pesadas" da telemetria
// (last spurt speed, HP que faltou, duelo, downhill, pace up/down, WT).
//
// Os arquivos desta pasta foram portados do Hakuraku:
//   https://github.com/SSHZ-ORG/hakuraku (MIT License, Copyright (c) 2021 SSHZ.ORG)
// A lógica foi mantida como no original; só os carregadores de dados
// (GameDataLoader, UMDatabaseWrapper, race_data_pb) foram trocados por
// versões locais. Este arquivo reproduz o caminho que a página de corrida do
// Hakuraku faz (RaceJsonParser → RaceDataPresenter → CharaList → columns) e
// devolve os valores já no formato das colunas do CSV do PTR.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { deserializeFromBase64 } from "./RaceDataParser";
import { filterCharaSkills } from "./RaceDataUtils";
import { calculateRaceDistance, parseGroundCondition } from "./RacePresenterUtils";
import { computeOtherEvents } from "./analysisUtils";
import { computeCharaTableData } from "./useCharaTableData";
import { estimateWorldTransform } from "./useWorldTransformEstimate";
import CourseShapeLoader from "./CourseShapeLoader";
import UMDatabaseWrapper from "./UMDatabaseWrapper";

export type ColunasPesadas = {
    last_spurt_speed: number | null;
    last_spurt_speed_diff: number | null;
    hp_val: number | null;
    hp_pct: number | null;
    duel_s: number | null;
    downhill_s: number | null;
    downhill_detail: string;
    pace_up_s: number | null;
    pace_down_s: number | null;
    wt_s: number | null;
};

// ---- Montagem do raceHorseInfo (igual ao parseActFormatRaceJson do Hakuraku) ----

function normalizarNomeChara(nome: unknown): string {
    return typeof nome === "string" ? nome.trim().toLocaleLowerCase().replace(/[\s'’._-]+/g, "") : "";
}

function acharCharaIdPeloNome(nome: unknown): number | undefined {
    const normalizado = normalizarNomeChara(nome);
    if (!normalizado) return undefined;
    const achado = Object.values(UMDatabaseWrapper.charas).find(
        (chara: any) => normalizarNomeChara(chara.name) === normalizado,
    );
    return achado?.id;
}

function montarRaceHorseInfo(cavalos: any[]): any[] {
    return cavalos
        .map((cavalo) => {
            const dados = cavalo?.responseHorseData;
            if (!dados) return null;
            const idPelaResposta = Number(dados.chara_id ?? dados.charaId);
            const idDoCavalo = Number(cavalo.charaId ?? cavalo.chara_id);
            const charaId = acharCharaIdPeloNome(cavalo.charaName)
                ?? (UMDatabaseWrapper.charas[idDoCavalo] ? idDoCavalo : undefined)
                ?? idPelaResposta;
            const deck = (cavalo.trainedCharaData?.supportCardArray ?? [])
                .map((carta: any, i: number) => ({
                    position: carta.position ?? i + 1,
                    id: carta.supportCardId,
                    lb: carta.limitBreakCount,
                    exp: carta.exp,
                }))
                .sort((a: any, b: any) => a.position - b.position);
            return {
                ...dados,
                chara_id: charaId,
                chara_name: cavalo.charaName ?? dados.chara_name,
                fan_count: dados.fan_count ?? cavalo.trainedCharaData?.fans,
                rank_score: dados.rank_score ?? cavalo.trainedCharaData?.rankScore,
                scenario_id: cavalo.trainedCharaData?.scenarioId,
                deck,
                parents: [],
            };
        })
        .filter((c) => c !== null);
}

// ---- WT no momento da chegada (igual ao CharaList/index.tsx do Hakuraku) ----

function indiceDoFrame(frames: any[], t: number) {
    if (!frames.length) return 0;
    const ultimo = frames.length - 1;
    if (t <= (frames[0].time ?? 0)) return 0;
    if (t >= (frames[ultimo].time ?? 0)) return ultimo;
    let lo = 0, hi = ultimo;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1, tm = frames[mid].time ?? 0;
        if (tm <= t) { if (t < (frames[mid + 1].time ?? tm)) return mid; lo = mid + 1; }
        else hi = mid - 1;
    }
    return lo;
}

function perdaWtNaChegada(raceData: any, indice: number, tempoChegada: number | undefined, perdaAcumulada: number[][]) {
    const frames = raceData.frame ?? [];
    if (!frames.length || tempoChegada === undefined) return undefined;
    const i = indiceDoFrame(frames, tempoChegada);
    const prox = Math.min(i + 1, frames.length - 1);
    const t0 = frames[i]?.time ?? 0;
    const t1 = frames[prox]?.time ?? t0;
    const alpha = i < frames.length - 1
        ? Math.min(1, Math.max(0, (tempoChegada - t0) / Math.max(1e-9, t1 - t0)))
        : 0;
    const perda0 = perdaAcumulada[i]?.[indice] ?? 0;
    const perda1 = perdaAcumulada[prox]?.[indice] ?? perda0;
    return perda0 + (perda1 - perda0) * alpha;
}

// ---- Formatação igual à exibida na tabela do Hakuraku (columns.tsx) ----

const velocidadeObservada = (v: number) => Math.floor((v + 1e-9) * 100) / 100;
const segundosModo = (s: number) => Math.round(s * 15 / 16);

function formatarLinha(row: any, perdaWt: number | undefined): ColunasPesadas {
    let last_spurt_speed: number | null = null;
    let last_spurt_speed_diff: number | null = null;
    if (row.horseResultData.lastSpurtStartDistance !== -1) {
        if (row.maxAdjustedSpeed && row.lastSpurtTargetSpeed) {
            last_spurt_speed = velocidadeObservada(row.maxAdjustedSpeed);
        }
        const esperada = row.lastSpurtTargetSpeed !== undefined ? velocidadeObservada(row.lastSpurtTargetSpeed) : undefined;
        const diff = row.maxAdjustedSpeed && esperada ? row.maxAdjustedSpeed - esperada : 0;
        // A tabela só mostra a diferença quando passa de 0,05 m/s.
        last_spurt_speed_diff = Math.abs(diff) >= 0.05 ? Number(diff.toFixed(2)) : 0;
    }

    let hp_val: number | null = null;
    let hp_pct: number | null = null;
    if (row.hpOutcome?.type === "died") {
        hp_val = -Math.round(row.hpOutcome.deficit);
        hp_pct = Number(((row.hpOutcome.deficit / row.hpOutcome.startHp) * 100).toFixed(1));
    } else if (row.hpOutcome?.type === "survived") {
        hp_val = Math.round(row.hpOutcome.hp);
        hp_pct = Number(((row.hpOutcome.hp / row.hpOutcome.startHp) * 100).toFixed(1));
    }

    const duel_s = row.duelingTime && row.duelingTime >= 0.01 ? Number(row.duelingTime.toFixed(1)) : null;

    let downhill_s: number | null = null;
    let downhill_detail = "";
    if (row.downhillModeTime && row.downhillModeTime >= 0.01) {
        downhill_s = segundosModo(row.downhillModeTime);
        const antes = row.downhillModeTimePreLate ?? 0;
        const depois = Math.max(0, row.downhillModeTimeLate ?? Math.max(0, row.downhillModeTime - antes));
        const temAntes = antes >= 0.005;
        const temDepois = depois >= 0.005;
        if (temAntes || temDepois) {
            downhill_detail = `${segundosModo(antes)}s pre-late${temDepois ? ` / ${segundosModo(depois)}s late` : ""}`;
        }
    }

    const pace_up_s = (row.paceUpTime ?? 0) >= 0.01 ? segundosModo(row.paceUpTime) : null;
    const pace_down_s = (row.paceDownTime ?? 0) >= 0.01 ? segundosModo(row.paceDownTime) : null;
    const wt_s = perdaWt === undefined ? null : -Number(perdaWt.toFixed(2));

    return { last_spurt_speed, last_spurt_speed_diff, hp_val, hp_pct, duel_s, downhill_s, downhill_detail, pace_up_s, pace_down_s, wt_s };
}

/**
 * Recebe o JSON do arquivo de corrida e devolve as colunas pesadas por
 * número do cavalo (horseIndex + 1, o "NO." da tabela).
 */
export async function calcularColunasPesadas(json: any): Promise<Map<number, ColunasPesadas>> {
    const cavalos = json.raceHorse ?? json["<RaceHorse>k__BackingField"];
    const raceHorseInfo = montarRaceHorseInfo(cavalos);
    const raceData = await deserializeFromBase64(json.simDataBase64 ?? json["<SimDataBase64>k__BackingField"]);

    const courseId: number | undefined = json.raceCourseSet?.id ?? undefined;
    const groundCondition = parseGroundCondition(json.groundCondition);
    const distancia = calculateRaceDistance(raceData);

    const skillActivations: Record<number, { time: number; name: string; param: number[] }[]> = {};
    for (let i = 0; i < raceData.horseResult.length; i++) {
        skillActivations[i] = filterCharaSkills(raceData, i).map((evento: any) => ({
            time: evento.frameTime,
            name: UMDatabaseWrapper.skillNameWithEnglishFallback(evento.param[1]),
            param: evento.param,
        }));
    }

    const otherEvents = computeOtherEvents(raceData, raceHorseInfo, courseId, skillActivations, distancia, groundCondition);
    const tabela = computeCharaTableData(
        raceHorseInfo, raceData, courseId, skillActivations, otherEvents,
        json.raceType, groundCondition, json.randomSeed,
    );

    await CourseShapeLoader.initialize();
    const wt = estimateWorldTransform(raceData.frame ?? [], courseId !== undefined ? String(courseId) : null, json.laneDistanceMax);

    const resultado = new Map<number, ColunasPesadas>();
    tabela.forEach((row: any) => {
        const indice = row.frameOrder - 1;
        const perda = wt ? perdaWtNaChegada(raceData, indice, row.horseResultData.finishTimeRaw, wt.cumulativeLossByFrame) : undefined;
        resultado.set(row.frameOrder, formatarLinha(row, perda));
    });
    return resultado;
}
