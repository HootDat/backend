/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */

import socketio from "socket.io";

import { withAuthentication } from "./socket/middleware";
import useDefaultEndpoints from "./socket/endpoints/default";
import useGameEndpoints from "./socket/endpoints/game";
import useGameEventEndpoints from "./socket/endpoints/gameEvent";

const setupSocket = (server: any) => {
  const io = socketio(server);
  withAuthentication(io);

  io.on("connection", (socket: any) => {
    console.log(`Socket (${socket.cId}, ${socket.id}) connected successfully.`);
    useDefaultEndpoints(socket, io);
    useGameEndpoints(socket, io);
    useGameEventEndpoints(socket, io);
  });
};

export default setupSocket;
