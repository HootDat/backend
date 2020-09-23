/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore
import temp from "./redis";
import { randomIntFromInterval } from "./helpers";
import { K_PRESENCE, K_GAME } from "../constants/redis";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper

const padCode = (code: number): string =>
  String(code).padStart(6, "0").substr(-6);

const generateGameCode = (): string =>
  padCode(randomIntFromInterval(0, 999999));

const isInUse = async (gameCode: string): Promise<boolean> => {
  try {
    const res = await redis.hgetall(`${K_GAME}-${gameCode}`);
    return !!res;
  } catch (e) {
    console.error("redis error:", e);
    return false;
  }
};

const createGameObject = (gameCode: string, cId: string): any => ({
  gameCode,
  host: cId,
  phase: "lobby",
  players: [{ cId, answers: [], score: 0 }],
});

const serializeGameObject = (gameObject: any): any => ({
  ...gameObject,
  players: JSON.stringify(gameObject.players),
});

const deserializeGameObject = (gameObjectSerialized: any): any => ({
  ...gameObjectSerialized,
  players: JSON.parse(gameObjectSerialized.players),
});

const createGameRoom = async (cId: string): Promise<string> => {
  let gameCode = generateGameCode();

  // loop till unique game code generated
  while (await isInUse(gameCode)) {
    gameCode = generateGameCode();
  }

  const gameObj = createGameObject(gameCode, cId);

  await redis.hmset(`${K_GAME}-${gameCode}`, serializeGameObject(gameObj));
  const userData = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  await redis.hmset(`${K_PRESENCE}-${cId}`, { ...userData, gameCode });

  return gameObj;
};

export { createGameRoom };
