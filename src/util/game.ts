/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore
import temp from "./redis";
import { randomIntFromInterval } from "./helpers";
import { K_PRESENCE, K_GAME } from "../constants/redis";
import {
  PHASE_LOBBY,
  PHASE_QN_ANSWER,
  PHASE_QN_GUESS,
  PHASE_QN_RESULTS,
  PHASE_END,
  ROLE_ANSWERER,
  ROLE_GUESSER,
} from "../constants/game";

const GAMECODE_MAX = 4;
const redis = temp as any; // TOOD: proper typescript for redis async wrapper

const padCode = (code: number): string =>
  String(code).padStart(GAMECODE_MAX, "0").substr(-GAMECODE_MAX);

const generateGameCode = (): string =>
  padCode(randomIntFromInterval(0, Math.pow(10, GAMECODE_MAX) - 1));

const isInUse = async (gameCode: string): Promise<boolean> => {
  try {
    const res = await redis.hgetall(`${K_GAME}-${gameCode}`);
    return !!res;
  } catch (e) {
    console.error("redis error:", e);
    return false;
  }
};

const createBasePlayerObject = (
  cId: string,
  name: string,
  iconNum: number,
): any => ({
  cId,
  name: name || "john doe",
  iconNum: iconNum || 0,
  online: true,
});

const createBaseGameObject = (
  gameCode: string,
  cId: string,
  name: string,
  iconNum: number,
): any => ({
  gameCode,
  host: cId,
  phase: PHASE_LOBBY,
  qnNum: -1,
  questions: [],
  players: { [cId]: createBasePlayerObject(cId, name, iconNum) },
  results: [],
  currAnswerer: "",
  currAnswer: "",
});

const serializeGameObject = (gameObject: any): any => ({
  ...gameObject,
  results: JSON.stringify(gameObject.results),
  questions: JSON.stringify(gameObject.questions),
  players: JSON.stringify(gameObject.players),
});

const deserializeGameObject = (gameObjectSerialized: any): any => ({
  ...gameObjectSerialized,
  qnNum: parseInt(gameObjectSerialized.qnNum),
  results: JSON.parse(gameObjectSerialized.results),
  questions: JSON.parse(gameObjectSerialized.questions),
  players: JSON.parse(gameObjectSerialized.players),
});

const getAndDeserializeGameObject = async (gameCode: string): Promise<any> => {
  const gameObj = await redis.hgetall(`${K_GAME}-${gameCode}`);
  if (!gameObj) return {};

  return deserializeGameObject(gameObj);
};

const mapPlayerToGame = async (cId: string, gameCode: string) => {
  const userData = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  await redis.hmset(`${K_PRESENCE}-${cId}`, { ...userData, gameCode });
};

const deleteGameObject = async (gameObj: any) => {
  Object.keys(gameObj.players).forEach((_cId) => {
    mapPlayerToGame(_cId, "");
  });
  await redis.del(`${K_GAME}-${gameObj.gameCode}`);
};

const serializeAndUpdateGameObject = async (
  gameObj: any,
  resetExpiry = true,
) => {
  await redis.hmset(
    `${K_GAME}-${gameObj.gameCode}`,
    serializeGameObject(gameObj),
  );

  // don't reset expiry if game has already ended
  if (resetExpiry && gameObj.phase !== PHASE_END) {
    if (
      Object.values(gameObj.players).reduce(
        (acc, curr: any) => acc || curr.online,
        false,
      )
    ) {
      // TODO: change back to 10 mins after testing

      // update expiry (10mins) if >= 1 online
      redis.expire(`${K_GAME}-${gameObj.gameCode}`, 100 * 60);
      /* redis.expire(`${K_GAME}-${gameObj.gameCode}`, 10 * 60); */
    } else {
      // update expiry (1min) if none online
      redis.expire(`${K_GAME}-${gameObj.gameCode}`, 1 * 60);
    }
  }
};

// remove roles from all players except client
const sanitizeGameObjectForPlayer = (cId: string, gameObj: any): any => {
  const sanitizedGameObj = {
    ...gameObj,
    yourRole: gameObj.currAnswerer === cId ? ROLE_ANSWERER : ROLE_GUESSER,
  };

  delete sanitizedGameObj.currAnswerer;

  return sanitizedGameObj;
};

const createGame = async (
  cId: string,
  name: string,
  iconNum: number,
): Promise<any> => {
  let gameCode = generateGameCode();

  // loop till unique game gameCode generated
  while (await isInUse(gameCode)) {
    gameCode = generateGameCode();
  }

  const gameObj = createBaseGameObject(gameCode, cId, name, iconNum);

  await serializeAndUpdateGameObject(gameObj);
  await mapPlayerToGame(cId, gameCode);

  // TODO: consider not sanitizing because game's not started yet
  return sanitizeGameObjectForPlayer(cId, gameObj);
};

const joinGame = async (
  cId: string,
  name: "john doe",
  iconNum: 0,
  gameCode: string,
): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

  // add player to game and update game in redis
  gameObj.players[cId] = createBasePlayerObject(cId, name, iconNum);
  await serializeAndUpdateGameObject(gameObj);

  // create player->gameCode mapping
  await mapPlayerToGame(cId, gameCode);

  return sanitizeGameObjectForPlayer(cId, gameObj);
};

const leaveGame = async (cId: string, gameCode: string): Promise<any> => {
  // remove player->gameCode mapping
  await mapPlayerToGame(cId, "");

  // fail silently if game does not exist
  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0) return;

  // remove player from game and update game in redis
  const playerObj = gameObj.players[cId];
  delete gameObj.players[cId];

  const newPlayers = Object.values(gameObj.players);
  let newHost: any;
  if (gameObj.host === cId) {
    // reassign host
    newHost = newPlayers[randomIntFromInterval(0, newPlayers.length - 1)];
    newHost = newHost.cId;
    gameObj.host = newHost;
  }

  await serializeAndUpdateGameObject(gameObj);
  return { playerObj, newHost };
};

const registerUserOnline = async (
  cId: string,
  socketId: string,
): Promise<any> => {
  await redis.hmset(`${K_PRESENCE}-${cId}`, { socketId });
  const { gameCode } = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  if (!gameCode) return {}; // not in game, we are done

  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0 || !gameObj.players[cId]) {
    // if the game is no longer valid or he's not in the game to begin with,
    // remove cId -> gameCode mapping
    await mapPlayerToGame(cId, "");
    return {};
  }

  // set player online status to true and update game in redis
  gameObj.players[cId].online = true;
  await serializeAndUpdateGameObject(gameObj);

  // TODO: consider checking if game's started yet or not before sanitizing
  return gameObj;
};

const registerUserOffline = async (cId: string): Promise<any> => {
  await redis.hmset(`${K_PRESENCE}-${cId}`, { socketId: "" });
  const { gameCode } = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  if (!gameCode) return {}; // not in game, we are done

  const gameObj = await getAndDeserializeGameObject(gameCode);

  // set player online status to false and update game in redis
  gameObj.players[cId].online = false;
  await serializeAndUpdateGameObject(gameObj);

  // TODO: consider checking if game's started yet or not before sanitizing
  return sanitizeGameObjectForPlayer(cId, gameObj);
};

// only host can do this

// this function advances the gameObj to the next question and generates
// a random player to be the answerer
const setNextQuestion = (gameObj: any): any => {
  gameObj.qnNum += 1;
  gameObj.phase = PHASE_QN_ANSWER;
  const onlinePlayers: Array<any> = Object.values(gameObj.players).filter(
    (player: any) => player.online,
  );
  const numPlayers = onlinePlayers.length;
  const currAnswerer =
    onlinePlayers[randomIntFromInterval(0, numPlayers - 1)].cId;
  gameObj.currAnswerer = currAnswerer;

  console.log("currAnswerer:", currAnswerer);

  return gameObj;
};

const getSocketIdsFromPlayerCIds = async (
  playerCIds: Array<any>,
): Promise<any> => {
  const getSocketIdsMulti = redis.multi();
  playerCIds.forEach((_cId: any) => {
    getSocketIdsMulti.hgetall(`${K_PRESENCE}-${_cId}`);
  });
  const results = await redis.executeMulti(getSocketIdsMulti);
  const socketIds = results.map((result: any): any => result.socketId);

  return socketIds;
};

const getPlayerRole = async (cId: string, gameCode: string) => {
  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");
  if (!gameObj.players[cId]) throw new Error("Not authorized.");
  return cId === gameObj.currAnswerer ? "answerer" : "guesser";
};

export {
  setNextQuestion,
  getPlayerRole,
  getSocketIdsFromPlayerCIds,
  padCode,
  generateGameCode,
  isInUse,
  createBasePlayerObject,
  createBaseGameObject,
  serializeGameObject,
  deserializeGameObject,
  getAndDeserializeGameObject,
  mapPlayerToGame,
  serializeAndUpdateGameObject,
  sanitizeGameObjectForPlayer,
  registerUserOffline,
  registerUserOnline,
};
