// Substituto do UMDatabaseWrapper do Hakuraku: em vez de baixar o banco
// binário (umdb.binarypb.gz), lê só o que o cálculo das colunas usa a
// partir de JSONs gerados por dados/gerar-dados.mjs.
/* eslint-disable @typescript-eslint/no-explicit-any */
import skillsLista from "./dados/skills.json";
import charasLista from "./dados/charas.json";
import skillNeedPointsDados from "./dados/skillNeedPoints.json";

class _UMDatabaseWrapper {
    skills: Record<number, any> = {};
    charas: Record<number, any> = {};
    skillNeedPoints: Record<number, number> = {};

    constructor() {
        (skillsLista as any[]).forEach((skill) => { this.skills[skill.id] = skill; });
        (charasLista as any[]).forEach((chara) => { this.charas[chara.id] = chara; });
        Object.entries(skillNeedPointsDados as Record<string, number>).forEach(([id, pontos]) => {
            this.skillNeedPoints[Number(id)] = pontos;
        });
    }

    skillName = (skillId: number) =>
        this.skills[skillId]?.name ?? `Unknown Skill ${skillId}`;

    hasSkillActivateLot = (skillId: number) =>
        this.skills[skillId]?.activateLot === 1;

    skillNameWithEnglishFallback = (skillId: number) =>
        this.skills[skillId]?.name ?? `Unknown Skill ${skillId}`;

    raceHorseDisplayName = (raceHorse: any): string | undefined => {
        const charaId = Number(raceHorse?.chara_id ?? raceHorse?.charaId);
        const charaName = this.charas[charaId]?.name;
        if (charaName) return charaName;
        const embeddedName = raceHorse?.chara_name ?? raceHorse?.charaName;
        return typeof embeddedName === "string" && embeddedName.trim() ? embeddedName.trim() : undefined;
    };
}

const UMDatabaseWrapper = new _UMDatabaseWrapper();
export default UMDatabaseWrapper;
