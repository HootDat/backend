/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import temp from "../../util/redis";
import {
  updateQuestionsGameEvent,
  startGameEvent,
  playerAnswerGameEvent,
  playerGuessGameEvent,
  roundEndGameEvent,
  nextQuestionGameEvent,
  endGameEvent,
  playAgainGameEvent,
} from "../handlers/gameEvent";
import {
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
} from "../../util/game";
import { K_PRESENCE } from "../../constants/redis";
import { PHASE_END, ROUND_TIMER_1, ROUND_TIMER_2 } from "../../constants/game";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper class (util/redis.js)

const useGameEventEndpoints = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

  socket.on("game.event.chat", async (data: any) => {
    try {
      const { gameCode, message } = data;
      const gameObj = await getAndDeserializeGameObject(gameCode);

      if (!gameObj || Object.keys(gameObj).length === 0)
        throw new Error("No such game exists.");

      // if cId not in game he wanna send to
      if (
        !gameObj.players[cId] ||
        Object.keys(gameObj.players[cId]).length === 0
      )
        throw new Error("Not authorized.");

      io.to(gameCode).emit("game.event.chat", { cId, message });
    } catch (e) {
      console.error("game.event.chat error", e);
      if (e.message === "No such game exists.") {
        socket.emit("game.kick", e.message);
      } else {
        socket.emit("game.event.chat.error");
      }
    }
  });

  socket.on("game.event.questions.update", async (data: any) => {
    try {
      const { gameCode, questions } = data;
      await updateQuestionsGameEvent(cId, gameCode, questions);

      // no feedback for the host here, optimistic rendering on client-side
      socket.to(gameCode).emit("game.event.questions.update", questions);
    } catch (e) {
      console.error("game.event.questions.update error", e);
      if (e.message === "No such game exists.") {
        socket.emit("game.kick", e.message);
      } else {
        socket.emit("game.event.questions.update.error");
      }
    }
  });

  socket.on("game.event.host.start", async (data: any) => {
    try {
      const { gameCode } = data;
      const results = await startGameEvent(cId, gameCode);

      // send each player their own version of the updated game object
      results.forEach(
        ({ socketId, gameObj }: { socketId: any; gameObj: any }) => {
          io.to(socketId).emit("game.event.transition", gameObj);
        },
      );
    } catch (e) {
      console.error("game.event.host.start error", e);
      if (e.message === "No such game exists.") {
        socket.emit("game.kick", e.message);
      } else {
        socket.emit("game.event.host.start.error");
      }
    }
  });

  socket.on("game.event.host.playAgain", async (data: any) => {
    try {
      const { gameCode } = data;
      const gameObj = await playAgainGameEvent(cId, gameCode);

      io.to(gameCode).emit("game.event.transition", gameObj);
    } catch (e) {
      console.error("game.event.host.start error", e);
      if (e.message === "No such game exists.") {
        socket.emit("game.kick", e.message);
      } else {
        socket.emit("game.event.host.start.error");
      }
    }
  });

  // TODO: move this somewhere else
  const nextQuestionOrEndGame = async (gameCode: any, gameObj: any) => {
    // decide whether to advance to the answering phase of
    // next question OR the game end screen
    if (gameObj.qnNum + 1 < gameObj.numQns) {
      // we advance to the next question
      const results = await nextQuestionGameEvent(gameCode);

      // and send each player their own version of the updated game object
      results.forEach(
        ({ socketId, gameObj }: { socketId: any; gameObj: any }) => {
          io.to(socketId).emit("game.event.transition", gameObj);
        },
      );
    } else {
      // we end the game
      const gameObj = await endGameEvent(gameCode);
      io.to(gameCode).emit("game.event.transition", gameObj);
    }
  };

  socket.on("game.event.player.answer", async (data: any) => {
    try {
      const { gameCode, answer: answerRaw } = data;
      const answer = answerRaw.trim();
      const playerRole = await getPlayerRole(cId, gameCode);

      // TODO: break up if/else into two separate events
      // game.event.player.answer and game.event.player.guess

      // authorized already
      if (playerRole === "answerer") {
        let gameObj = await playerAnswerGameEvent(cId, answer, gameCode);
        io.to(gameCode).emit("game.event.transition", gameObj);

        // TODO: any cleaner way to do the below timeouts?

        setTimeout(async () => {
          try {
            // let's transition to PHASE_QN_RESULTS of this question in ROUND_TIMER_1 ms
            gameObj = await roundEndGameEvent(gameCode, gameObj.qnNum);

            // advance everyone to the results screen of the question
            io.to(gameCode).emit("game.event.transition", gameObj);

            // after ROUND_TIMER_2 ms, transition to the PHASE_QN_ANSWER of the next question
            // or the PHASE_END screen, if this was the last question
            setTimeout(() => {
              nextQuestionOrEndGame(gameCode, gameObj);
            }, ROUND_TIMER_2);
          } catch (e) {
            // Transition already handled elsewhere. Can "fail" silently.
            console.log("IGNORE THIS. IGNORE THIS. setTimeout error:", e);
          }
        }, ROUND_TIMER_1);
      } else {
        let gameObj = await playerGuessGameEvent(cId, answer, gameCode);

        const numAnswered = Object.keys(gameObj.results[gameObj.qnNum]).length;
        const numOnline = Object.values(gameObj.players).reduce(
          (acc: number, curr: any) => acc + (curr.online ? 1 : 0),
          0,
        );

        // if everyone has answered,
        // let's transition to PHASE_QN_RESULTS of this question
        if (numAnswered >= numOnline) {
          // transition to PHASE_QN_RESULTS of the question
          gameObj = await roundEndGameEvent(gameCode, gameObj.qnNum);
          io.to(gameCode).emit("game.event.transition", gameObj);

          // after ROUND_TIMER_2 ms, transition to the PHASE_QN_ANSWER of the next question
          // or the PHASE_END screen, if this was the last question
          setTimeout(() => {
            nextQuestionOrEndGame(gameCode, gameObj);
          }, ROUND_TIMER_2);
        }
      }
    } catch (e) {
      console.error("game.event.player.answer error", e);
      if (e.message === "No such game exists.") {
        socket.emit("game.kick", e.message);
      } else {
        socket.emit("game.event.player.answer.error");
      }
    }
  });
};

export default useGameEventEndpoints;
