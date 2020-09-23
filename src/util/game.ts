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
  ROLE_ANSWERER,
  ROLE_GUESSER,
} from "../constants/game";

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
  name: "",
  iconNum: -1,
  online: true,
});

const createBaseGameObject = (gameCode: string, cId: string): any => ({
  gameCode,
  host: cId,
  phase: PHASE_LOBBY,
  qnNum: -1,
  questions: [],
  players: { [cId]: createBasePlayerObject(cId) },
  results: [],
  currAnswerer: "",
  currAnswer: "",
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

const serializeAndUpdateGameObject = (gameObj: any) =>
  redis.hmset(`${K_GAME}-${gameObj.gameCode}`, serializeGameObject(gameObj));

// remove roles from all players except client
const sanitizeGameObjectForPlayer = (cId: string, gameObj: any): any => {
  const sanitizedGameObj = {
    ...gameObj,
    yourRole: gameObj.currAnswerer === cId ? ROLE_ANSWERER : ROLE_GUESSER,
  };

  return sanitizedGameObj;
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

  await serializeAndUpdateGameObject(gameObj);
  await mapPlayerToGame(cId, gameCode);

  return sanitizeGameObjectForPlayer(cId, gameObj);
};

const joinGame = async (cId: string, gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // add player to game and update game in redis
  gameObj.players[cId] = createBasePlayerObject(cId);
  await serializeAndUpdateGameObject(gameObj);

  // create player->gameCode mapping
  await mapPlayerToGame(cId, gameCode);
};

const leaveGame = async (cId: string, gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // remove player from game and update game in redis
  gameObj.players[cId] = null;
  await serializeAndUpdateGameObject(gameObj);

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
  await serializeAndUpdateGameObject(gameObj);

  return sanitizeGameObjectForPlayer(cId, gameObj);
};

const registerUserOffline = async (cId: string): Promise<any> => {
  await redis.hmset(`${K_PRESENCE}-${cId}`, { socketId: null });
  const { gameCode } = await redis.hgetall(`${K_PRESENCE}-${cId}`);
  if (!gameCode) return {}; // not in game, we are done

  const gameObj = await getAndDeserializeGameObject(gameCode);

  // set player online status to false and update game in redis
  gameObj.players[cId].online = false;
  await serializeAndUpdateGameObject(gameObj);

  return sanitizeGameObjectForPlayer(cId, gameObj);
};

// only host can do this
const updateQuestionsGameEvent = async (
  cId: string,
  gameCode: string,
  questions: any,
): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // if host is not cId, error
  if (gameObj.host !== cId) throw new Error("Not authorized.");

  // if wrong phase
  if (gameObj.phase !== PHASE_LOBBY) throw new Error("Wrong phase.");

  gameObj.questions = questions;
  await serializeAndUpdateGameObject(gameObj);

  return sanitizeGameObjectForPlayer(cId, gameObj);
};

const startGameEvent = async (cId: string, gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // TODO: put all these checks in a function where the
  // checks are passed via a parameterized object

  // if host is not cId, error
  if (gameObj.host !== cId) throw new Error("Not authorized.");

  // if wrong phase
  if (gameObj.phase !== PHASE_LOBBY) throw new Error("Wrong phase.");

  // if no questions
  if (gameObj.questions.length === 0)
    throw new Error("Game must have >= 1 questions to start.");

  gameObj.qnNum += 1;
  gameObj.phase = PHASE_QN_ANSWER;
  const playerCIds = Object.keys(gameObj.players);
  const numPlayers = playerCIds.length;
  const curAnswerer = playerCIds[randomIntFromInterval(0, numPlayers - 1)];
  gameObj.curAnswerer = curAnswerer;

  await serializeAndUpdateGameObject(gameObj);

  // get socketId of all players in one redis transaction
  const getSocketIdsMulti = redis.multi();
  playerCIds.forEach((_cId) => {
    getSocketIdsMulti.hgetall(_cId);
  });
  const socketIds = (await redis.executeMulti(getSocketIdsMulti)).map(
    ({ socketId }: { socketId: any }): any => socketId,
  );

  // make version of game object specific to each player
  return playerCIds.map((_cId, i) => ({
    socketId: socketIds[i],
    gameObj: sanitizeGameObjectForPlayer(_cId, gameObj),
  }));
};

const getPlayerRole = async (cId: string, gameCode: string) => {
  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj.players[cId]) throw new Error("Not authorized.");
  return cId === gameObj.currAnswerer ? "answerer" : "guesser";
};

const playerAnswerGameEvent = async (
  cId: string,
  answer: string,
  gameCode: string,
): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // TODO: put all these checks in a function where the
  // checks are passed via a parameterized object

  if (gameObj.phase !== PHASE_QN_ANSWER) throw new Error("Wrong phase.");

  gameObj.currAnswer = answer;
  gameObj.phase = PHASE_QN_GUESS;
  gameObj.results = [
    ...gameObj.results,
    { cId: { score: 0, answer, role: "answerer", cId } },
  ];
  await serializeAndUpdateGameObject(gameObj);
  return {
    currAnswer: gameObj.currAnswer,
    phase: gameObj.phase,
  };
};

const playerGuessGameEvent = async (
  cId: string,
  answer: string,
  gameCode: string,
) => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // TODO: put all these checks in a function where the
  // checks are passed via a parameterized object

  // TODO: beware of race conditions (multiple guessers update)
  // either have everything as single redis transaction/use semaphore
  // or find a smarter concurrent way to perform such an update, perhaps using
  // a synchronized js object first before committing to redis when the
  // timer's up

  if (gameObj.phase !== PHASE_QN_GUESS) throw new Error("Wrong phase.");

  gameObj.phase = PHASE_QN_GUESS;

  gameObj.results[gameObj.qnNum][cId] = { answer, role: "guesser", cId };
  let score = answer === gameObj.currAnswerer ? 1 : 0;
  if (gameObj.qnNum > 0) {
    score += gameObj.results[gameObj.qnNum - 1][cId]?.score || 0;
  }
  gameObj.results[gameObj.qnNum][cId].score = score;

  await serializeAndUpdateGameObject(gameObj);

  return gameObj;
};

const roundEndGameEvent = async (gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // This guard clause also serves as a guard against multiple calls of
  // this function, in particular when roundEndGameEvent is called the
  // second time after 8s even if it's been previously called after everyone
  // finishes answering.
  // The only issue is if the question has advanced to the next question and
  // is at the PHASE_QN_GUESS phase then the round will end prematurely.
  // This is extremely unlikely though...
  if (gameObj.phase !== PHASE_QN_GUESS) throw new Error("Wrong phase.");

  gameObj.phase = PHASE_QN_RESULTS;

  await serializeAndUpdateGameObject(gameObj);

  return {
    currAnswerer: gameObj.currAnswerer,
    phase: gameObj.phase,
    results: gameObj.results,
  };
};

export {
  createGame,
  joinGame,
  leaveGame,
  registerUserOffline,
  registerUserOnline,
  updateQuestionsGameEvent,
  startGameEvent,
  getPlayerRole,
  playerAnswerGameEvent,
  playerGuessGameEvent,
  roundEndGameEvent,
};
