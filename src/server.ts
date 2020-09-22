import errorHandler from "errorhandler";
import http from "http";
import socketio from "socket.io";

import app from "./app";
import defaultControllers from "./controllers/socket";

/**
 * Error Handler. Provides full stack - remove for production
 */
app.use(errorHandler());

/**
 * Start Express server.
 */
const server = http.createServer(app);
const io = socketio(server);

server.listen(app.get("port"), () => {
  console.log(
    "  App is running at http://localhost:%d in %s mode",
    app.get("port"),
    app.get("env"),
  );
  console.log("  Press CTRL-C to stop\n");
});

io.on("connection", (socket) => {
  console.log("Socket connection successful.");
  defaultControllers(socket, io);
});

export default server;
