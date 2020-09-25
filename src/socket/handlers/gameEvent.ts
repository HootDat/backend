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

// only host can do this
const updateQuestionsGameEvent = async (
  cId: string,
  gameCode: string,
  questions: any,
) => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

  // if host is not cId, error
  if (
    gameObj.host !== cId ||
    !gameObj.players[cId] ||
    Object.keys(gameObj.players[cId]).length === 0
  )
    throw new Error("Not authorized.");

  // if wrong phase
  if (gameObj.phase !== PHASE_LOBBY) throw new Error("Wrong phase.");

  gameObj.questions = questions;
  await serializeAndUpdateGameObject(gameObj);

  /*   // TODO: consider checking if game's started yet or not before sanitizing */
  /*   return sanitizeGameObjectForPlayer(cId, gameObj); */
};

const startGameEvent = async (cId: string, gameCode: string): Promise<any> => {
  let gameObj = await getAndDeserializeGameObject(gameCode);

  // TODO: put all these checks in a function where the
  // checks are passed via a parameterized object

  // ######################################################
  // ##################### CHECKS #########################
  // ######################################################

  // if host is not cId, error
  if (
    gameObj.host !== cId &&
    gameObj.players[cId] &&
    Object.keys(gameObj.players[cId]).length > 0
  )
    throw new Error("Not authorized.");

  // if wrong phase
  if (gameObj.phase !== PHASE_LOBBY) throw new Error("Wrong phase.");

  // if no questions
  if (gameObj.questions.length === 0)
    throw new Error("Game must have >= 1 questions to start.");

  // if not enough playeres
  const numOnline = Object.values(gameObj.players).reduce(
    (acc: number, curr: any) => acc + (curr.online ? 1 : 0),
    0,
  );

  if (numOnline < 3)
    throw new Error("Game must have >= 3 online players to start.");

  // ######################################################
  // ######################################################
  // ######################################################

  // qnNum: -1 -> qnNum: 0
  gameObj = setNextQuestion(gameObj);
  const playerCIds = Object.keys(gameObj.players);

  await serializeAndUpdateGameObject(gameObj);

  // get socketId of all players in one redis transaction
  const socketIds = await getSocketIdsFromPlayerCIds(playerCIds);

  // make version of game object specific to each player
  // note that socketIds[i] belongs to playerCIds[i]
  return playerCIds.map((_cId: any, i: number) => ({
    socketId: socketIds[i],
    gameObj: sanitizeGameObjectForPlayer(_cId, gameObj),
  }));
};

const playAgainGameEvent = async (
  cId: string,
  gameCode: string,
): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);

  // if host is not cId, error
  if (
    gameObj.host !== cId &&
    gameObj.players[cId] &&
    Object.keys(gameObj.players[cId]).length > 0
  )
    throw new Error("Not authorized.");

  // if wrong phase
  if (gameObj.phase !== PHASE_END) throw new Error("Wrong phase.");

  // reset some fields
  gameObj.qnNum = -1;
  gameObj.phase = PHASE_LOBBY;
  gameObj.results = [];
  gameObj.currAnswer = "";
  gameObj.currAnswerer = "";

  await serializeAndUpdateGameObject(gameObj);

  return gameObj;
};

const playerAnswerGameEvent = async (
  cId: string,
  answer: string,
  gameCode: string,
): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

  // TODO: put all these checks in a function where the
  // checks are passed via a parameterized object

  if (gameObj.phase !== PHASE_QN_ANSWER) throw new Error("Wrong phase.");

  gameObj.currAnswer = answer;
  gameObj.phase = PHASE_QN_GUESS;
  gameObj.results = [
    ...gameObj.results,
    { [cId]: { score: 0, answer, role: "answerer", cId } },
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
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

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
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

  // This guard clause also serves as a guard against multiple calls of
  // this function, in particular when roundEndGameEvent is called the
  // second time after 8s even if it's been previously called after everyone
  // finishes answering.
  // The only issue is if the question has advanced to the next question and
  // is at the PHASE_QN_GUESS phase then the round will end prematurely.
  // This is extremely unlikely though...
  if (gameObj.phase !== PHASE_QN_GUESS) throw new Error("Wrong phase.");

  gameObj.phase = PHASE_QN_RESULTS;
  Object.keys(gameObj.players).forEach((_cId: any) => {
    if (!gameObj.results[gameObj.qnNum][_cId]) {
      gameObj.results[gameObj.qnNum][_cId] = {
        answer: "",
        role: "guesser",
        cId: _cId,
        score:
          gameObj.qnNum > 0
            ? gameObj.results[gameObj.qnNum - 1][_cId]?.score
            : 0,
      };
    }
  });

  await serializeAndUpdateGameObject(gameObj);

  return {
    currAnswerer: gameObj.currAnswerer,
    phase: gameObj.phase,
    results: gameObj.results,
    numQns: gameObj.questions.length,
    qnNum: gameObj.qnNum,
    players: gameObj.players,
  };
};

const nextQuestionGameEvent = async (gameCode: string): Promise<any> => {
  let gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

  // only allow the game to transition to the PHASE_QN_ANSWER phase of
  // the next question if the current phase is PHASE_QN_RESULTS of curr question
  if (gameObj.phase !== PHASE_QN_RESULTS) throw new Error("Wrong phase.");

  gameObj = setNextQuestion(gameObj);

  await serializeAndUpdateGameObject(gameObj);

  // get socketId of all players in one redis transaction
  const playerCIds = Object.keys(gameObj.players);
  const socketIds = await getSocketIdsFromPlayerCIds(playerCIds);

  // make version of game object specific to each player
  // note that socketIds[i] belongs to playerCIds[i]
  return playerCIds.map((_cId: any, i: number) => ({
    socketId: socketIds[i],
    gameObj: sanitizeGameObjectForPlayer(_cId, gameObj), // TODO: omit redundant fields
  }));
};

const endGameEvent = async (gameCode: string): Promise<any> => {
  const gameObj = await getAndDeserializeGameObject(gameCode);
  if (!gameObj || Object.keys(gameObj).length === 0)
    throw new Error("No such game exists.");

  // only allow the game to transition to PHASE_END if the current phase
  // is the PHASE_QN_RESULTS phase of some question
  if (gameObj.phase !== PHASE_QN_RESULTS) throw new Error("Wrong phase.");

  gameObj.phase = PHASE_END;

  await serializeAndUpdateGameObject(gameObj);

  return {
    phase: gameObj.phase,
  };
};

export {
  updateQuestionsGameEvent,
  startGameEvent,
  playerAnswerGameEvent,
  playerGuessGameEvent,
  roundEndGameEvent,
  nextQuestionGameEvent,
  endGameEvent,
  playAgainGameEvent,
};
