// Substituto do GameDataLoader do Hakuraku: os dados das pistas vêm de um
// JSON local (dados/pistas.json, gerado por dados/gerar-dados.mjs) em vez de
// serem baixados do site. Só as partes usadas pelo cálculo das colunas.
/* eslint-disable @typescript-eslint/no-explicit-any */
import pistas from "./dados/pistas.json";

class GameDataLoaderClass {
    async initialize(): Promise<void> {
        // Nada a carregar: os dados já vêm junto com o módulo.
    }

    get courseData(): Record<string, any> {
        return (pistas as any).courseData ?? {};
    }

    get racetracks(): any {
        return (pistas as any).racetracks;
    }

    get courseShapes(): any {
        return (pistas as any).courseShapes ?? {};
    }

    get courseBaseRatios(): any {
        return (pistas as any).courseBaseRatios ?? {};
    }
}

const GameDataLoader = new GameDataLoaderClass();
export default GameDataLoader;
