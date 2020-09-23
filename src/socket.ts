/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import temp from "./util/redis";
import { createGameRoom } from "./util/game";
import { K_PRESENCE } from "./constants/redis";

const redis = temp as any; // TOOD: proper typescript for redis async wrapper class (util/redis.js)

const withAuthentication = (io: any) =>
  io.use(async (socket: any, next: any) => {
    const { cId } = socket.handshake?.query || {};
    const { id: socketId } = socket;
    if (!cId) return next(new Error("No cId provided."));

    socket.cId = cId;

    // register user presence which is a clientId -> socketId mapping
    const userData = await redis.hgetall(`${K_PRESENCE}-${cId}`);
    io.to(userData?.socketId).emit("auth.loggedInElsewhere", {});
    await redis.hmset(`${K_PRESENCE}-${cId}`, { socketId });

    next();
  });

const useDefaultControllers = (socket: any, io: any) => {
  socket.on("game.create", async () => {
    try {
      const gameObj = await createGameRoom(socket.cId);
      socket.emit("game.join", gameObj);
    } catch (e) {
      console.error("game.create error", e);
      socket.emit("game.create.error");
    }
  });

  socket.on("game.join", async (data: any) => {
    console.log(data);
  });

  socket.on("game.leave", (data: any) => {
    console.log(data);
  });

  socket.on("disconnect", (data: any) => {
    console.log(
      `Socket (${socket.cId}, ${socket.id}) disconnected. Cleaning up.`,
    );
    redis.hdel(K_PRESENCE, socket.cId);
  });
};

const setupSocket = (server: any) => {
  const io = socketio(server);
  withAuthentication(io);

  io.on("connection", (socket: any) => {
    console.log("Socket connection successful.");
    useDefaultControllers(socket, io);
  });
};

export default setupSocket;
