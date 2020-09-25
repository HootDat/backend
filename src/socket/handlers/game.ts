/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-ignore
import temp from "../../util/redis";
import { randomIntFromInterval } from "../../util/helpers";
import {
  setNextQuestion,
  getPlayerRole,
  generateGameCode,
  isInUse,
  createBasePlayerObject,
  createBaseGameObject,
  getAndDeserializeGameObject,
  mapPlayerToGame,
  serializeAndUpdateGameObject,
  sanitizeGameObjectForPlayer,
  getSocketIdsFromPlayerCIds,
  registerUserOnline,
  registerUserOffline,
} from "../../util/game";
import { K_PRESENCE, K_GAME } from "../../constants/redis";
import {
  PHASE_LOBBY,
  PHASE_QN_ANSWER,
  PHASE_QN_GUESS,
  PHASE_QN_RESULTS,
  PHASE_END,
  ROLE_ANSWERER,
  ROLE_GUESSER,
} from "../../constants/game";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper

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

  return gameObj;
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

export { createGame, joinGame, leaveGame };
