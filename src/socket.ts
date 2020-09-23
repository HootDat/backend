/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import temp from "./util/redis";
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
} from "./util/game";
import { K_PRESENCE } from "./constants/redis";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper class (util/redis.js)

const withAuthentication = (io: any) =>
  io.use(async (socket: any, next: any) => {
    const { cId } = socket.handshake?.query || {};
    const { id: socketId } = socket;
    if (!cId) return next(new Error("No cId provided."));

    // update socket properties for easier bookkeeping
    socket.cId = cId;
    socket.game = {
      gameCode: null,
    };

    // register user presence
    const userData = await redis.hgetall(`${K_PRESENCE}-${cId}`);
    io.to(userData?.socketId).emit("auth.loggedInElsewhere", {});
    const gameObj = await registerUserOnline(cId, socketId);

    // TODO: if user provided gameCode in handshake query which is not
    // the same as the game he's in, boot him from the game and let him
    // join the new game.

    // if player was in game which is still ongoing
    if (gameObj) {
      const {
        gameCode,
        players: { cId: playerObj },
      } = gameObj;

      // tell everyone in the game that this user came online
      io.to(gameCode).emit("game.event.player.update", playerObj);

      // tell client it's joined a game, and sub socket to game room
      // TODO: need to check if this even gets received by client since it's
      // before the "connection" event.
      socket.emit("game.join", gameObj);
      socket.join(gameCode);

      // update socket property for easier bookkeeping
      socket.game = {
        gameCode,
      };
    }

    next();
  });

const useMetaGameControllers = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

  socket.on("game.create", async () => {
    try {
      const gameObj = await createGame(cId);
      const { gameCode } = gameObj;

      // tell client its joined a game, and put socket in game room
      socket.emit("game.join", gameObj);
      socket.join(gameCode);

      // update socket property for easier bookkeeping
      socket.game = {
        gameCode,
      };
    } catch (e) {
      console.error("game.create error", e);
      socket.emit("game.create.error");
    }
  });

  socket.on("game.join", async (data: any) => {
    try {
      const { gameCode } = data;
      if (!gameCode) throw new Error("No gameCode provided.");

      // update redis and get gameObj
      const gameObj = await joinGame(cId, gameCode);
      const {
        players: { cId: playerObj },
      } = gameObj;

      // tell client it's joined a game, and sub socket to game room
      socket.emit("game.join", gameObj);
      socket.join(gameCode);

      // update socket property for easier bookkeeping
      socket.game = {
        gameCode,
      };

      // tell everyone in the game (except self) that a new player has joined
      socket.to(gameCode).emit("game.event.player.join", playerObj);
    } catch (e) {
      console.error("game.join error", e);
      socket.emit("game.join.error");
    }
  });

  socket.on("game.leave", async (data: any) => {
    try {
      const { gameCode } = data;
      if (!gameCode) throw new Error("No gameCode provided.");

      // tell client it's left a game, and unsub socket from game room
      socket.emit("game.leave");
      socket.leave(gameCode);

      // update socket property for easier bookkeeping
      socket.game = {
        gameCode: null,
      };

      // update redis
      const playerObj = await leaveGame(cId, gameCode);

      // tell everyone that this player has left
      socket.to(gameCode).emit("game.event.player.leave", playerObj);
    } catch (e) {
      console.error("game.leave error", e);
      socket.emit("game.leave.error");
    }
  });

  // TODO: handle reconnect event for intermittent connections

  socket.on("disconnect", async () => {
    try {
      console.log(`Socket (${cId}, ${socketId}) disconnected.`);

      const gameObj = await registerUserOffline(cId);
      const {
        gameCode,
        players: { cId: playerObj },
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

const useGameControllers = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

  socket.on("game.event.questions.update", async (data: any) => {
    try {
      const { gameCode, questions } = data;
      await updateQuestionsGameEvent(cId, gameCode, questions);

      socket.to(gameCode).emit("game.event.questions.update", questions);
    } catch (e) {
      console.error("game.event.questions.update error", e);
      socket.emit("game.event.questions.update.error");
    }
  });

  socket.on("game.event.host.start", async (data: any) => {
    try {
      const { gameCode } = data;
      const results = await startGameEvent(cId, gameCode);

      // send each player their own version of the updated game object
      results.forEach(
        ({ socketId, gameObj }: { socketId: any; gameObj: any }) => {
          socket.to(socketId).emit("game.event.transition", gameObj);
        },
      );
    } catch (e) {
      console.error("game.event.host.start error", e);
      socket.emit("game.event.host.start.error");
    }
  });

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
        socket.to(gameCode).emit("game.event.transition", gameObj);

        // let's transition to PHASE_QN_RESULTS of this round in 8s
        gameObj = await roundEndGameEvent(gameCode);
        setTimeout(() => {
          io.to(gameCode).emit("game.event.transition", gameObj);
        }, 8000); // 8s
      } else {
        let gameObj = await playerGuessGameEvent(cId, answer, gameCode);

        // if everyone has answered,
        // let's transition to PHASE_QN_RESULTS of this round
        if (
          gameObj.results[gameObj.qnNum - 1].length === gameObj.players.length
        ) {
          gameObj = await roundEndGameEvent(gameCode);
          io.to(gameCode).emit("game.event.transition", gameObj);
        }
      }
    } catch (e) {
      console.error("game.event.player.answer error", e);
      socket.emit("game.event.player.answer.error");
    }
  });
};

const setupSocket = (server: any) => {
  const io = socketio(server);
  withAuthentication(io);

  io.on("connection", (socket: any) => {
    console.log("Socket connection successful.");
    useMetaGameControllers(socket, io);
    useGameControllers(socket, io);
  });
};

export default setupSocket;
