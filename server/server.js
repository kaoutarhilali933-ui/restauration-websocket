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

        // 🟢 Vérification créneau autorisé
        if (!restaurant.allowedTimeSlots.includes(message.timeSlot)) {
          console.log("Invalid time slot");

          broadcast({
            type: "BOOKING_FAILED",
            reason: "INVALID_TIME_SLOT"
          });

          return;
        }

        // 🟢 Validation date
        if (!message.date) {
          console.log("Invalid date");

          broadcast({
            type: "BOOKING_FAILED",
            reason: "INVALID_DATE"
          });

          return;
        }

        const today = new Date();
        const bookingDate = new Date(message.date);
        today.setHours(0, 0, 0, 0);

        if (isNaN(bookingDate.getTime()) || bookingDate < today) {
          console.log("Past or invalid date");

          broadcast({
            type: "BOOKING_FAILED",
            reason: "INVALID_DATE"
          });

          return;
        }

        // 🟢 Nouvelle logique multi-tables
        const table = restaurant.findAvailableTableForGuests(
          message.numberOfGuests,
          message.date,
          message.timeSlot
        );

        if (!table) {
          console.log("No available table for this number of guests");

          broadcast({
            type: "BOOKING_FAILED",
            reason: "NO_TABLE_AVAILABLE"
          });

          return;
        }

        const reservation = new Reservation(
          Date.now(),
          table.id,
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

          broadcast({
            type: "BOOKING_FAILED",
            reason: "RESERVATION_ERROR"
          });
        }
      }

      // -------- RELEASE TABLE --------
      if (message.type === "RELEASE_TABLE") {

        const table = restaurant.findTableById(message.tableId);

        if (!table) {
          console.log("Table not found");
          return;
        }

        if (!table.isAvailable()) {

          restaurant.releaseTable(table);

          console.log("Table released");

          broadcast({
            type: "TABLE_RELEASED",
            tableId: table.id
          });

        } else {
          console.log("Table already available");
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