const WebSocket = require("ws");

const { 
  initDb,
  createUser,
  getUserByEmail,
  saveReservation
} = require("./database");

const Restaurant = require("./models/Restaurant");
const Table = require("./models/Table");
const Reservation = require("./models/Reservation");

const PORT = 3000;

initDb();

const wss = new WebSocket.Server({ port: PORT });

const clients = [];

console.log("WebSocket server running on ws://localhost:" + PORT);

// -------------------------
// INITIALISATION RESTAURANT
// -------------------------
const restaurant = new Restaurant();

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

  socket.on("message", async (data) => {
    try {
      const message = JSON.parse(data);

      console.log("Message reçu :", message);

      // -------- REGISTER --------
      if (message.type === "REGISTER") {

        const existing = await getUserByEmail(message.email);

        if (existing) {
          socket.send(JSON.stringify({
            type: "REGISTER_FAILED",
            reason: "Email already exists"
          }));
          return;
        }

        const user = await createUser({
          email: message.email,
          password: message.password,
          role: "client"
        });

        socket.send(JSON.stringify({
          type: "REGISTER_SUCCESS",
          userId: user.id
        }));
      }

      // -------- BOOK TABLE --------
      if (message.type === "BOOK_TABLE") {

        const table = restaurant.findTableById(message.tableId);

        if (!table) {
          socket.send(JSON.stringify({ type: "BOOKING_FAILED" }));
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

            await saveReservation({
              user_id: message.userId,
              table_id: message.tableId,
              date: message.date,
              time: message.timeSlot,
              guests: message.guests || 1
            });

            broadcast({
              type: "BOOKING_SUCCESS",
              tableId: table.id
            });

          } else {
            socket.send(JSON.stringify({ type: "BOOKING_FAILED" }));
          }

        } else {
          socket.send(JSON.stringify({ type: "BOOKING_FAILED" }));
        }
      }

    } catch (error) {
      console.log("Invalid JSON message", error);
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