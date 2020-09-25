/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import temp from "../../util/redis";
import { createGame, joinGame, leaveGame } from "../handlers/game";
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
import { PHASE_END, ROUND_TIMER } from "../../constants/game";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper class (util/redis.js)

const useGameEndpoints = (socket: any, io: any) => {
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

      const { name: playerName, iconNum } = data;
      const gameObj = await createGame(cId, playerName, iconNum);
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

      const { gameCode, name: playerName, iconNum } = data;
      if (!gameCode) throw new Error("No gameCode provided.");

      // update redis and get gameObj
      const gameObj = await joinGame(cId, playerName, iconNum, gameCode);
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
      const { playerObj, newHost } = await leaveGame(cId, gameCode);

      // tell everyone that this player has left
      socket.to(gameCode).emit("game.event.player.leave", playerObj);

      // if new host, tell everyone too
      if (newHost) {
        console.log("game.event.newHost emitted", newHost);
        socket.to(gameCode).emit("game.event.newHost", newHost);
      }
    } catch (e) {
      console.error("game.leave error", e);
      socket.emit("game.leave.error");
    }
  });
};

export default useGameEndpoints;
