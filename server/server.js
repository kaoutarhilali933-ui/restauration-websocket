const WebSocket = require("ws");

const PORT = 3000;

const wss = new WebSocket.Server({ port: PORT });

console.log("WebSocket server running on ws://localhost:" + PORT);