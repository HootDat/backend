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

const createBasePlayerObject = (cId: string): any => ({
  cId,
  online: true,
  answers: [],
  score: 0,
});

const createBaseGameObject = (gameCode: string, cId: string): any => ({
  gameCode,
  host: cId,
  phase: "lobby",
  qnNum: -1,
  questions: [],
  players: { [cId]: createBasePlayerObject(cId) },
});

const serializeGameObject = (gameObject: any): any => ({
  ...gameObject,
  players: JSON.stringify(gameObject.players),
});

const deserializeGameObject = (gameObjectSerialized: any): any => ({
  ...gameObjectSerialized,
  players: JSON.parse(gameObjectSerialized.players),
});

const getAndDeserializeGameObject = async (gameCode: string): Promise<any> => {
  const gameObj = await redis.hgetall(`${K_GAME}-${gameCode}`);
  if (!gameObj) throw new Error("No such game exists.");

  return deserializeGameObject(gameObj);
};

const mapPlayerToGame = async (cId: string, gameCode: string | null) => {
  const userData = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  await redis.hmset(`${K_PRESENCE}-${cId}`, { ...userData, gameCode });
};

const createGame = async (cId: string): Promise<any> => {
  let gameCode = generateGameCode();

  // loop till unique game gameCode generated
  while (await isInUse(gameCode)) {
    gameCode = generateGameCode();
  }

  const gameObj = createBaseGameObject(gameCode, cId);

  await redis.hmset(`${K_GAME}-${gameCode}`, serializeGameObject(gameObj));
  await mapPlayerToGame(cId, gameCode);

  return gameObj;
};

const joinGame = async (cId: string, gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // add player to game and update game in redis
  gameObj.players[cId] = createBasePlayerObject(cId);
  await redis.hmset(`${K_GAME}-${gameCode}`, serializeGameObject(gameObj));

  // create player->gameCode mapping
  await mapPlayerToGame(cId, gameCode);
};

const leaveGame = async (cId: string, gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // remove player from game and update game in redis
  gameObj.players[cId] = null;
  await redis.hmset(`${K_GAME}-${gameCode}`, serializeGameObject(gameObj));

  // remove player->gameCode mapping
  await mapPlayerToGame(cId, null);
};

const registerUserOnline = async (
  cId: string,
  socketId: string,
): Promise<any> => {
  await redis.hmset(`${K_PRESENCE}-${cId}`, { socketId });
  const { gameCode } = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  if (!gameCode) return {}; // not in game, we are done

  const gameObj = await getAndDeserializeGameObject(gameCode);

  // set player online status to true and update game in redis
  gameObj.players[cId].online = true;
  await redis.hmset(`${K_GAME}-${gameCode}`, serializeGameObject(gameObj));

  return gameObj;
};

const registerUserOffline = async (cId: string): Promise<any> => {
  await redis.hmset(`${K_PRESENCE}-${cId}`, { socketId: null });
  const { gameCode } = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  if (!gameCode) return {}; // not in game, we are done

  const gameObj = await getAndDeserializeGameObject(gameCode);

  // set player online status to false and update game in redis
  gameObj.players[cId].online = false;
  await redis.hmset(`${K_GAME}-${gameCode}`, serializeGameObject(gameObj));

  return gameObj;
};

export {
  createGame,
  joinGame,
  leaveGame,
  registerUserOffline,
  registerUserOnline,
};
