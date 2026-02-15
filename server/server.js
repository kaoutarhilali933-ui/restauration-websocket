const WebSocket = require("ws");

const PORT = 3000;

const wss = new WebSocket.Server({ port: PORT });

const clients = [];

console.log("WebSocket server running on ws://localhost:" + PORT);

// Fonction broadcast
function broadcast(message) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

wss.on("connection", (socket) => {
  console.log("Client connected");

  clients.push(socket);

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data);

      console.log("Message reçu :", message);

      if (message.type === "TABLE_RESERVED") {
        broadcast({
          type: "TABLE_RESERVED",
          tableId: message.tableId,
        });
      }

    } catch (error) {
      console.log("Invalid JSON message");
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");

    const index = clients.indexOf(socket);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});