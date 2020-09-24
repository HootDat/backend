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
  nextQuestionGameEvent,
  endGameEvent,
  sanitizeGameObjectForPlayer,
} from "./util/game";
import { K_PRESENCE } from "./constants/redis";
import { PHASE_END } from "./constants/game";

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

    try {
      // register user presence
      const userData = await redis.hgetall(`${K_PRESENCE}-${cId}`);
      if (userData && Object.keys(userData).length > 0) {
        io.to(userData.socketId).emit("auth.loggedInElsewhere");
        console.log(
          `Multiple logins detected for ${cId}. Kicking out old socket ${userData.socketId} from all rooms.`,
        );
        const _socket = io.sockets.sockets[userData.socketId];
        if (_socket && _socket.rooms) {
          Object.keys(_socket.rooms).forEach((room: string) => {
            console.log(`Kicking ${userData.socketId} from ${room}`),
              _socket.leave(room);
          });
        }
      }

      const gameObj = await registerUserOnline(cId, socketId);

      // TODO: if user provided gameCode in handshake query which is not
      // the same as the game he's in, boot him from the game and let him
      // join the new game.

      // if player was in game which is still ongoing (and he's part of)
      if (Object.keys(gameObj).length > 0) {
        const {
          phase,
          gameCode,
          players: { [cId]: playerObj },
        } = gameObj;

        if (phase !== PHASE_END) {
          // tell everyone in the game that this user came online
          io.to(gameCode).emit("game.event.player.update", playerObj);

          // subscribe the socket to the game room
          socket.join(gameCode);
        }

        // TODO: need to check if this even gets received by client since it's
        // before the "connection" event.

        // tell client it's joined a game, and sub socket to game room
        socket.emit("game.join", sanitizeGameObjectForPlayer(cId, gameObj));

        // update socket property for easier bookkeeping
        socket.game = {
          gameCode,
        };
      }
      next();
    } catch (e) {
      console.log("withAuthentication error", e);
      next(new Error("Authentication error."));
    }
  });

const useMetaGameControllers = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

  socket.on("game.create", async (data: any) => {
    try {
      if (socket?.game?.gameCode) {
        // TODO: improve this perhaps?

        // if for some reason the client tries to create a game
        // while it's already in a game, unsub socket from game room
        // and remove the client from the game itself
        socket.leave(socket.game.gameCode);
        const playerObj = await leaveGame(cId, socket.game.gameCode);
        io.to(socket.game.gameCode).emit("game.event.player.leave", playerObj);

        socket.game = {
          gameCode: null,
        };
      }

      const gameObj = await createGame(cId, data.name, data.iconNum);
      const { gameCode } = gameObj;

      console.log("game.create called", cId, gameObj);

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
      if (socket?.game?.gameCode) {
        // TODO: improve this perhaps?

        // if for some reason the client tries to join a game
        // while it's already in a game, unsub socket from game room
        // and remove the client from the game itself
        socket.leave(socket.game.gameCode);
        const playerObj = await leaveGame(cId, socket.game.gameCode);
        io.to(socket.game.gameCode).emit("game.event.player.leave", playerObj);

        socket.game = {
          gameCode: null,
        };
      }

      const { gameCode, name, iconNum } = data;
      if (!gameCode) throw new Error("No gameCode provided.");

      // update redis and get gameObj
      const gameObj = await joinGame(cId, gameCode, name, iconNum);
      const {
        players: { [cId]: playerObj },
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
      if (e.message === "No such game exists.") {
        socket.emit("game.join.error", e.message);
      } else {
        socket.emit("game.join.error");
      }
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

const useGameControllers = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

  socket.on("game.event.questions.update", async (data: any) => {
    try {
      const { gameCode, questions } = data;
      await updateQuestionsGameEvent(cId, gameCode, questions);

      // no feedback for the host here, optimistic rendering on client-side
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

  // TODO: move this somewhere else
  const nextQuestionOrEndGame = async (gameCode: any, gameObj: any) => {
    // decide whether to advance to the answering phase of
    // next question OR the game end screen
    if (gameObj.qnNum + 1 < gameObj.questions.length) {
      // we advance to the next question
      const results = await nextQuestionGameEvent(gameCode);

      // and send each player their own version of the updated game object
      results.forEach(
        ({ socketId, gameObj }: { socketId: any; gameObj: any }) => {
          socket.to(socketId).emit("game.event.transition", gameObj);
        },
      );
    } else {
      // we end the game
      const gameObj = endGameEvent(gameCode);
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
        socket.to(gameCode).emit("game.event.transition", gameObj);

        // TODO: any cleaner way to do the below timeouts?

        // let's transition to PHASE_QN_RESULTS of this question in 8s
        gameObj = await roundEndGameEvent(gameCode);
        setTimeout(() => {
          // advance everyone to the results screen of the question
          io.to(gameCode).emit("game.event.transition", gameObj);

          // after 8s, transition to the PHASE_QN_ANSWER of the next question
          // or the PHASE_END screen, if this was the last question
          setTimeout(() => {
            nextQuestionOrEndGame(gameCode, gameObj);
          }, 8000);
        }, 8000);
      } else {
        let gameObj = await playerGuessGameEvent(cId, answer, gameCode);

        // if everyone has answered,
        // let's transition to PHASE_QN_RESULTS of this question
        if (
          gameObj.results[gameObj.qnNum - 1].length >=
          Object.values(gameObj.players).length
        ) {
          // transition to PHASE_QN_RESULTS of the question
          gameObj = await roundEndGameEvent(gameCode);
          io.to(gameCode).emit("game.event.transition", gameObj);

          // after 8s, transition to the PHASE_QN_ANSWER of the next question
          // or the PHASE_END screen, if this was the last question
          setTimeout(() => {
            nextQuestionOrEndGame(gameCode, gameObj);
          }, 8000);
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
    console.log(`Socket (${socket.cId}, ${socket.id}) connected successfully.`);
    useMetaGameControllers(socket, io);
    useGameControllers(socket, io);
  });
};

export default setupSocket;
