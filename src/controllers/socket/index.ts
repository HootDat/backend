const defaultControllers = (socket, io) => {
  socket.on("testMsg1", (data) => {
    console.log("testMsg1 received:", data);
  });

  socket.on("testMsg2", (data) => {
    console.log("testMsg2 received:", data);
  });
};

export default defaultControllers;
