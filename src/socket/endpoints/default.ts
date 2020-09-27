/* eslint-disable @typescript-eslint/ban-ts-ignore */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { registerUserOffline } from "../../util/game";

const useDefaultEndpoints = (socket: any, io: any) => {
  const { cId, id: socketId } = socket;

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
