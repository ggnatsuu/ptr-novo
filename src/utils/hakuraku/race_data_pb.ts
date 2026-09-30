// Substituto enxuto do race_data_pb.ts do Hakuraku (gerado pelo protobuf).
// O código portado só precisa dos enums e de objetos simples — sem a
// dependência @bufbuild/protobuf. Valores copiados de umdb/race_data.proto.
/* eslint-disable @typescript-eslint/no-explicit-any */

export type RaceSimulateData = any;
export type RaceSimulateData_EventDataWrapper = any;
export type RaceSimulateHeaderData = any;
export type RaceSimulateFrameData = any;
export type RaceSimulateHorseFrameData = any;
export type RaceSimulateHorseResultData = any;
export type RaceSimulateEventData = any;

export enum RaceSimulateHorseFrameData_TemptationMode {
  NULL = 0,
  POSITION_SASHI = 1,
  POSITION_SENKO = 2,
  POSITION_NIGE = 3,
  BOOST = 4,
}

export enum RaceSimulateHorseResultData_RunningStyle {
  NONE = 0,
  NIGE = 1,
  SENKO = 2,
  SASHI = 3,
  OIKOMI = 4,
}

export enum RaceSimulateEventData_SimulateEventType {
  SCORE = 0,
  CHALLENGE_MATCH_POINT = 1,
  NOUSE_2 = 2,
  SKILL = 3,
  COMPETE_TOP = 4,
  COMPETE_FIGHT = 5,
  RELEASE_CONSERVE_POWER = 6,
  STAMINA_LIMIT_BREAK_BUFF = 7,
  COMPETE_BEFORE_SPURT = 8,
  STAMINA_KEEP = 9,
  SECURE_LEAD = 10,
}

// "Schemas" usados pelo RaceDataParser.ts: aqui só servem pra escolher os
// valores padrão em create() — mesmo comportamento do protobuf-es, que
// inicializa os campos repetidos como listas vazias.
export const RaceSimulateDataSchema = { padrao: () => ({ frame: [], horseResult: [], event: [] }) };
export const RaceSimulateData_EventDataWrapperSchema = { padrao: () => ({}) };
export const RaceSimulateHeaderDataSchema = { padrao: () => ({}) };
export const RaceSimulateFrameDataSchema = { padrao: () => ({ horseFrame: [] }) };
export const RaceSimulateHorseFrameDataSchema = { padrao: () => ({}) };
export const RaceSimulateHorseResultDataSchema = { padrao: () => ({}) };
export const RaceSimulateEventDataSchema = { padrao: () => ({ param: [] }) };

export function create(schema: { padrao: () => any }, valores?: any): any {
  return Object.assign(schema.padrao(), valores ?? {});
}
