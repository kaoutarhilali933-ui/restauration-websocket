const WebSocket = require("ws");

const {
  initDb,
  seedTables,
  createUser,
  getUserByEmail,
  login,
  saveReservation,
  getReservations
} = require("./database");

const Restaurant = require("./models/Restaurant");
const Table = require("./models/Table");
const Reservation = require("./models/Reservation");

const PORT = 3000;

// -------------------------
// INIT DB PROPERLY
// -------------------------
(async () => {
  await initDb();
  await seedTables();
})();

const wss = new WebSocket.Server({ port: PORT });

const clients = [];

console.log("WebSocket server running on ws://localhost:" + PORT);

// -------------------------
// INITIALISATION RESTAURANT (JS MEMORY)
// -------------------------
const restaurant = new Restaurant();
restaurant.addTable(new Table(1, 4));
restaurant.addTable(new Table(2, 2));
restaurant.addTable(new Table(3, 6));

// -------------------------
function broadcast(message) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// -------------------------
wss.on("connection", (socket) => {
  console.log("Client connected");

  let currentUser = null;
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
          role: message.role || "client"
        });

        socket.send(JSON.stringify({
          type: "REGISTER_SUCCESS",
          userId: user.id
        }));
      }

      // -------- LOGIN --------
      if (message.type === "LOGIN") {

        const user = await login(message.email, message.password);

        if (!user) {
          socket.send(JSON.stringify({
            type: "LOGIN_FAILED",
            reason: "Invalid email or password"
          }));
          return;
        }

        currentUser = user;

        socket.send(JSON.stringify({
          type: "LOGIN_SUCCESS",
          userId: user.id,
          role: user.role
        }));
      }

      // -------- BOOK TABLE --------
      if (message.type === "BOOK_TABLE") {

        if (!currentUser) {
          socket.send(JSON.stringify({
            type: "UNAUTHORIZED",
            reason: "You must login first"
          }));
          return;
        }

        const table = restaurant.findTableById(message.tableId);

        if (!table) {
          socket.send(JSON.stringify({ type: "BOOKING_FAILED" }));
          return;
        }

        if (table.isAvailable()) {

          const reservation = new Reservation(
            Date.now(),
            message.tableId,
            currentUser.id,
            message.date,
            message.timeSlot
          );

          const success = restaurant.makeReservation(reservation, table);

          if (success) {

            await saveReservation({
              user_id: currentUser.id,
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

      // -------- GET RESERVATIONS (admin only) --------
      if (message.type === "GET_RESERVATIONS") {

        if (!currentUser || currentUser.role !== "admin") {
          socket.send(JSON.stringify({
            type: "UNAUTHORIZED"
          }));
          return;
        }

        const reservations = await getReservations();

        socket.send(JSON.stringify({
          type: "RESERVATIONS_LIST",
          data: reservations
        }));
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