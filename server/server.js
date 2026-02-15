const WebSocket = require("ws");

const Restaurant = require("./models/Restaurant");
const Table = require("./models/Table");
const Reservation = require("./models/Reservation");

const PORT = 3000;

const wss = new WebSocket.Server({ port: PORT });

const clients = [];

console.log("WebSocket server running on ws://localhost:" + PORT);

// -------------------------
// INITIALISATION RESTAURANT
// -------------------------
const restaurant = new Restaurant();

// Ajouter quelques tables
restaurant.addTable(new Table(1, 4));
restaurant.addTable(new Table(2, 2));
restaurant.addTable(new Table(3, 6));

// -------------------------
// BROADCAST
// -------------------------
function broadcast(message) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// -------------------------
// CONNECTION
// -------------------------
wss.on("connection", (socket) => {
  console.log("Client connected");

  clients.push(socket);

  socket.on("message", (data) => {
    try {
      const message = JSON.parse(data);

      console.log("Message reçu :", message);

      // -------- BOOK TABLE --------
      if (message.type === "BOOK_TABLE") {

        const table = restaurant.findTableById(message.tableId);

        if (!table) {
          console.log("Table not found");
          return;
        }

        if (table.isAvailable()) {

          const reservation = new Reservation(
            Date.now(),
            message.tableId,
            message.userId,
            message.date,
            message.timeSlot
          );

          const success = restaurant.makeReservation(reservation, table);

          if (success) {
            console.log("Reservation successful");

            broadcast({
              type: "BOOKING_SUCCESS",
              tableId: table.id
            });

          } else {
            console.log("Reservation failed");
          }

        } else {
          console.log("Table not available");

          broadcast({
            type: "BOOKING_FAILED",
            tableId: table.id
          });
        }
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