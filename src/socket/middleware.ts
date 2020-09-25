/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import temp from "../util/redis";
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
} from "../util/game";
import { K_PRESENCE } from "../constants/redis";
import { PHASE_END } from "../constants/game";

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

export { withAuthentication };
