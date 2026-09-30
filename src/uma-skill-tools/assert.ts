// 🎯 Substitui 'node:assert' (que não existe no navegador — só no Node.js)
// por uma versão mínima. Os arquivos originais só usam assert(condicao) ou
// assert(condicao, mensagem) como função direta, nunca métodos tipo
// .equal()/.ok(), então essa versão simples cobre 100% do uso real.
export function strict(condition: any, message?: string): void {
	if (!condition) {
		throw new Error(message || "Assertion failed");
	}
}