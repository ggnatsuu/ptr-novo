import { Region, RegionList } from './Region';
import { CourseData, CourseHelpers } from './CourseData';
import { HorseParameters } from './HorseTypes';
import { RaceParameters } from './RaceParameters';
import { Conditions, immediate, random, noopImmediate, noopRandom } from './ActivationConditions';
import { getParser } from './ConditionParser';
import { ImmediatePolicy } from './ActivationSamplePolicy';

import skills from './data/skill_data.json';

export { Region, RegionList, CourseHelpers, Conditions, getParser, ImmediatePolicy };

// 🎯 Ajuste extraído do app.tsx original (Skill Activation Visualizer) —
// várias condições dependem de coisas que só uma simulação de corrida
// completa saberia (quantas vezes outra skill já ativou, clima, humor,
// popularidade etc). Sem esse ajuste, o motor base trata essas condições
// como "sempre verdadeiro em qualquer lugar" (porque a parte dinâmica que
// checaria de verdade é ignorada por nós), o que é enganoso — mostraria
// skill ativando em pistas/momentos que na real dependem de contagem que
// não temos como saber. O app.tsx original resolve isso limitando pra
// faixas sensatas por fase, em vez de deixar sem limite nenhum.
// Mantemos "running_style" como checagem REAL (não ajustada), diferente
// do app.tsx original, porque a PTR tem seletor de estratégia — faz
// sentido usar esse dado de verdade já que temos ele.
const PISTAS_APERTADAS = new Set([10001, 10002, 10004, 10010, 10103, 10104]);

const ConditionsAjustadas = Object.freeze(Object.assign({}, Conditions, {
	activate_count_all: noopRandom,
	activate_count_end_after: random({
		filterGte(regions: RegionList, _0: number, course: CourseData, _1: HorseParameters, extra: RaceParameters) {
			const bounds = new Region(CourseHelpers.phaseStart(course.distance, 2), CourseHelpers.phaseEnd(course.distance, 3));
			return regions.rmap(r => r.intersect(bounds));
		}
	}),
	activate_count_heal: noopRandom,
	activate_count_later_half: random({
		filterGte(regions: RegionList, _0: number, course: CourseData, _1: HorseParameters, extra: RaceParameters) {
			const bounds = new Region(course.distance / 2, course.distance);
			return regions.rmap(r => r.intersect(bounds));
		}
	}),
	activate_count_middle: random({
		filterGte(regions: RegionList, n: number, course: CourseData, _1: HorseParameters, extra: RaceParameters) {
			const bounds = new Region(CourseHelpers.phaseStart(course.distance, 1), CourseHelpers.phaseEnd(course.distance, 1));
			return regions.rmap(r => r.intersect(bounds));
		}
	}),
	activate_count_start: random({
		filterGte(regions: RegionList, _0: number, course: CourseData, _1: HorseParameters, extra: RaceParameters) {
			const bounds = new Region(CourseHelpers.phaseStart(course.distance, 0), CourseHelpers.phaseEnd(course.distance, 0));
			return regions.rmap(r => r.intersect(bounds));
		}
	}),
	grade: noopImmediate,
	ground_condition: noopImmediate,
	// 🎯 Os dados novos do jogo trocaram a lista de pistas da Sharp Turns
	// (◎/○/×) por "is_tight_track==1", que o motor do alpha123 ainda não
	// implementa. Usamos a mesma lista de pistas que os dados antigos
	// traziam: Sapporo, Hakodate, Fukushima, Kokura, Kawasaki, Funabashi.
	is_tight_track: immediate({
		filterEq(regions: RegionList, value: number, course: CourseData) {
			return PISTAS_APERTADAS.has(course.raceTrackId) == (value == 1) ? regions : new RegionList();
		}
	}),
	is_activate_any_skill: noopRandom,
	is_activate_heal_skill: noopRandom,
	is_activate_other_skill_detail: noopImmediate,
	is_used_skill_id: noopImmediate,
	motivation: noopImmediate,
	popularity: noopImmediate,
	running_style_count_nige_otherself: noopImmediate,
	running_style_count_senko_otherself: noopImmediate,
	running_style_count_sashi_otherself: noopImmediate,
	running_style_count_oikomi_otherself: noopImmediate,
	season: noopImmediate,
	time: noopImmediate,
	weather: noopImmediate,
}));

export { ConditionsAjustadas };

// 🎯 Versão simplificada de buildSkillData (do RaceSolverBuilder.ts
// original do uma-skill-tools, GPL-3.0) — mesma lógica de resolução
// condição→região (incluindo precondições), mas sem depender do
// RaceSolver completo, já que só precisamos saber ONDE no percurso a
// skill pode ativar, não simular a corrida inteira.
export function buildSkillData(
	horse: HorseParameters,
	raceParams: Partial<RaceParameters>,
	course: CourseData,
	wholeCourse: RegionList,
	parser: {parse: any, tokenize: any},
	skillId: string
) {
	if (!(skillId in skills)) {
		throw new Error('ID de skill inválido: ' + skillId);
	}
	const extra = Object.assign({skillId}, raceParams);
	// 🎯 Mesmo ajuste do catalogoSkills (BuscadorPistas.jsx) — a Seirios e
	// a versão herdada dela têm a segunda condição guardada num ID
	// separado (100701-1 / 900701-1). Junta aqui também, senão o cálculo
	// de "onde ativa" ignoraria essa segunda condição.
	const idsIrmaos = Object.keys(skills as any).filter((outroId) => outroId.startsWith(`${skillId}-`));
	const alternatives = [
		...(skills as any)[skillId].alternatives,
		...idsIrmaos.flatMap((outroId) => (skills as any)[outroId].alternatives),
	];
	const triggers = [];
	for (let i = 0; i < alternatives.length; ++i) {
		const skill = alternatives[i];
		let full = new RegionList();
		wholeCourse.forEach(r => full.push(r));

		// Precondição (se existir) reduz a região ANTES da condição principal
		if (skill.precondition) {
			const pre = parser.parse(parser.tokenize(skill.precondition));
			const preRegions = pre.apply(wholeCourse, course, horse, extra)[0];
			if (preRegions.length == 0) {
				continue;
			} else {
				const bounds = new Region(preRegions[0].start, wholeCourse[wholeCourse.length-1].end);
				full = full.rmap(r => r.intersect(bounds));
			}
		}

		const op = parser.parse(parser.tokenize(skill.condition));
		const [regions] = op.apply(full, course, horse, extra);
		if (regions.length == 0) {
			continue;
		}
		// 🎯 Alternativas são ordenadas da mais forte pra mais fraca nos
		// dados do jogo — a primeira que realmente ativa já é a "melhor"
		// disponível nessa pista. Mostrar só ela no diagrama evita duas
		// barras confusas pra mesma skill; as outras condições possíveis
		// aparecem no card de detalhes (usando skill.alternatives ali,
		// não esse retorno).
		if (triggers.length > 0 && !/is_activate_other_skill_detail|is_used_skill_id/.test(skill.condition)) {
			continue;
		}
		triggers.push({
			skillId,
			condition: skill.condition,
			precondition: skill.precondition || null,
			baseDuration: skill.baseDuration,
			effects: skill.effects,
			samplePolicy: op.samplePolicy,
			isImmediate: op.samplePolicy === ImmediatePolicy,
			regions
		});
	}
	return triggers;
}

// 🎯 Cavalo "neutro" fixo (mesmo usado no Skill Activation Visualizer
// original) — não estamos simulando uma corredora específica, só onde a
// skill PODE ativar no traçado da pista.
export const CAVALO_NEUTRO: HorseParameters = Object.freeze({
	speed: 2000, stamina: 2000, power: 2000, guts: 2000, wisdom: 2000,
	strategy: 1 as any, distanceAptitude: 0 as any, surfaceAptitude: 1 as any, strategyAptitude: 1 as any,
	rawStamina: 2000
});

export const PARAMETROS_CORRIDA_NEUTROS: Partial<RaceParameters> = Object.freeze({
	mood: 0 as any, groundCondition: 1, weather: 1, season: 1, time: 0, grade: 100, popularity: 1
});

const parserPadrao = getParser(ConditionsAjustadas as any);

// 🎯 Função de conveniência: dado um courseId (mesmo id usado no
// Buscador de Pistas) e um skillId, devolve as regiões (em metros) onde
// aquela skill pode ativar nessa pista.
export function regioesDaSkillNaPista(courseId: number, skillId: string) {
	const course = CourseHelpers.getCourse(courseId);
	const wholeCourse = new RegionList();
	wholeCourse.push(new Region(0, course.distance));
	return buildSkillData(CAVALO_NEUTRO, PARAMETROS_CORRIDA_NEUTROS, course, wholeCourse, parserPadrao, skillId);
}