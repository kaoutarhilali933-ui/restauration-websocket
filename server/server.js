const WebSocket = require("ws");
const Table = require("./models/Table");
const Reservation = require("./models/Reservation");
const Restaurant = require("./models/Restaurant");

// =============================
// TEST COMPLET DES MODELES
// =============================

// Création restaurant
const restaurant = new Restaurant();

// Création table
const table1 = new Table(1, 4);
restaurant.addTable(table1);

console.log("Tables disponibles au départ :", restaurant.getAvailableTables().length);

// Création réservation
const reservation1 = new Reservation(
  1,
  1,
  101,
  "2026-02-15",
  "18:00-20:00"
);

// Faire réservation
const success = restaurant.makeReservation(reservation1, table1);

if (success) {
  console.log("Reservation réussie");
} else {
  console.log("Reservation échouée");
}

console.log("Tables disponibles après réservation :", restaurant.getAvailableTables().length);

// Libération table
restaurant.releaseTable(table1);

console.log("Tables disponibles après libération :", restaurant.getAvailableTables().length);

// =============================
// SERVEUR WEBSOCKET
// =============================

const PORT = 3000;

const server = new WebSocket.Server({ port: PORT });

console.log("WebSocket server running on ws://localhost:" + PORT);

server.on("connection", (socket) => {
  console.log("New client connected");

  socket.on("message", (message) => {
    console.log("Received:", message.toString());

    server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message.toString());
      }
    });
  });

  socket.on("close", () => {
    console.log("Client disconnected");
  });
});