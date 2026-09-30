// 🎯 Stub mínimo — o ActivationConditions.ts original importa RaceState e
// DynamicCondition só como TIPOS (apagados na compilação pra JS), não usa
// nenhuma lógica de execução daqui. Não precisamos do RaceSolver de
// verdade pra calcular as regiões estáticas onde uma skill pode ativar.
export interface RaceState {
	[key: string]: any
}

export type DynamicCondition = (s: RaceState) => boolean;
