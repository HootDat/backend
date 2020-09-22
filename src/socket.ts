/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";
// @ts-ignore
import redis from "./util/redis";

const REDIS_KEY_WS_PRESENCE = "ws-presence";

const withAuthentication = (io: any) =>
  io.use(async (socket: any, next: any) => {
    const { cId } = socket.handshake?.query || {};
    const { id: socketId } = socket;
    if (!cId) return next(new Error("No cId provided."));

    socket.cId = cId;

    // register user presence which is a clientId -> socketId mapping
    const oldSocketId = await redis.hget(REDIS_KEY_WS_PRESENCE, cId);
    if (oldSocketId) {
      io.to(oldSocketId).emit("room.leave", {});
    }
    await redis.hset(REDIS_KEY_WS_PRESENCE, cId, socketId);

    next();
  });

const useDefaultControllers = (socket: any, io: any) => {
  socket.on("game.create", async (data: any) => {
    console.log(data);
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
    redis.hdel(REDIS_KEY_WS_PRESENCE, socket.cId);
  });
};

const setupSocket = (server) => {
  const io = socketio(server);
  withAuthentication(io);

  io.on("connection", (socket) => {
    console.log("Socket connection successful.");
    useDefaultControllers(socket, io);
  });
};

export default setupSocket;
