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
// INIT DB
// -------------------------
(async () => {
  await initDb();
  await seedTables();
})();

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

      // ---------------- REGISTER ----------------
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

      // ---------------- LOGIN ----------------
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

      // ---------------- BOOK TABLE ----------------
      if (message.type === "BOOK_TABLE") {

        if (!currentUser) {
          socket.send(JSON.stringify({
            type: "UNAUTHORIZED",
            reason: "You must login first"
          }));
          return;
        }

        // Vérifier créneau autorisé
        if (!restaurant.allowedTimeSlots.includes(message.timeSlot)) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "INVALID_TIME_SLOT"
          }));
          return;
        }

        // Vérifier date
        if (!message.date) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "INVALID_DATE"
          }));
          return;
        }

        const today = new Date();
        const bookingDate = new Date(message.date);
        today.setHours(0, 0, 0, 0);

        if (isNaN(bookingDate.getTime()) || bookingDate < today) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "INVALID_DATE"
          }));
          return;
        }

        // Trouver table disponible
        const table = restaurant.findAvailableTableForGuests(
          message.numberOfGuests,
          message.date,
          message.timeSlot
        );

        if (!table) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "NO_TABLE_AVAILABLE"
          }));
          return;
        }

        const reservation = new Reservation(
          Date.now(),
          table.id,
          currentUser.id,
          message.date,
          message.timeSlot
        );

        const success = restaurant.makeReservation(reservation, table);

        if (!success) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED"
          }));
          return;
        }

        // Sauvegarde DB
        await saveReservation({
          user_id: currentUser.id,
          table_id: table.id,
          date: message.date,
          time: message.timeSlot,
          guests: message.numberOfGuests
        });

        broadcast({
          type: "BOOKING_SUCCESS",
          tableId: table.id
        });
      }

      // ---------------- ADMIN GET RESERVATIONS ----------------
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