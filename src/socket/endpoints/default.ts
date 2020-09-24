/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import temp from "../../util/redis";
import {
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
  nextQuestionGameEvent,
  endGameEvent,
  sanitizeGameObjectForPlayer,
  playAgainGameEvent,
  getAndDeserializeGameObject,
} from "../../util/game";
import { K_PRESENCE } from "../../constants/redis";
import { PHASE_END, ROUND_TIMER } from "../../constants/game";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper class (util/redis.js)

const useDefaultEndpoints = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

  // TODO: handle reconnect event for intermittent connections

  socket.on("disconnect", async () => {
    try {
      console.log(`Socket (${cId}, ${socketId}) disconnected.`);

      const gameObj = await registerUserOffline(cId);
      const {
        gameCode,
        players: { [cId]: playerObj },
      } = gameObj;

      // unsub socket from game room
      socket.leave(gameCode);

      // update socket property for easier bookkeeping
      socket.game = {
        gameCode: null,
      };

      // tell everyone in the game that this user went offline
      socket.to(gameCode).emit("game.event.player.update", playerObj);
    } catch (e) {
      console.log("disconnect error", e);
    }
  });
};

export default useDefaultEndpoints;
