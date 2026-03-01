const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();

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

const PORT = 3000;

// ---------------- INIT DB ----------------
(async () => {
  await initDb();
  await seedTables();
})();

const wss = new WebSocket.Server({ port: PORT });
const clients = [];

console.log("WebSocket server running on ws://localhost:" + PORT);

// ---------------- RESTAURANT ----------------
const restaurant = new Restaurant();
restaurant.addTable(new Table(1, 4));
restaurant.addTable(new Table(2, 2));
restaurant.addTable(new Table(3, 6));

// ---------------- BROADCAST ----------------
function broadcast(message) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// ---------------- CONNECTION ----------------
wss.on("connection", (socket) => {
  console.log("Client connected");

  let currentUser = null;
  clients.push(socket);

  socket.on("message", async (data) => {
    try {
      const message = JSON.parse(data);
      console.log("Message reçu :", message);

      // ================= REGISTER =================
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
        return;
      }

      // ================= LOGIN =================
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
        return;
      }

      // ================= BOOK TABLE (DATE AWARE) =================
      if (message.type === "BOOK_TABLE") {
        if (!currentUser) {
          socket.send(JSON.stringify({
            type: "UNAUTHORIZED",
            reason: "You must login first"
          }));
          return;
        }

        const { date, timeSlot, numberOfGuests } = message;

        if (!date || !timeSlot || !numberOfGuests) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "INVALID_DATA"
          }));
          return;
        }

        if (!restaurant.allowedTimeSlots.includes(timeSlot)) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "INVALID_TIME_SLOT"
          }));
          return;
        }

        const today = new Date();
        const bookingDate = new Date(date);
        today.setHours(0, 0, 0, 0);

        if (isNaN(bookingDate.getTime()) || bookingDate < today) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "INVALID_DATE"
          }));
          return;
        }

        const possibleTables = restaurant.tables.filter(
          t => t.capacity >= numberOfGuests
        );

        const existingReservations = await getReservations();
        let selectedTable = null;

        for (let table of possibleTables) {
          const conflict = existingReservations.find(r =>
            r.table_id === table.id &&
            r.date === date &&
            r.time === timeSlot
          );

          if (!conflict) {
            selectedTable = table;
            break;
          }
        }

        if (!selectedTable) {
          socket.send(JSON.stringify({
            type: "BOOKING_FAILED",
            reason: "NO_TABLE_AVAILABLE"
          }));
          return;
        }

        // ✅ IMPORTANT: saveReservation retourne { id: insertedId }
        const newReservation = await saveReservation({
          user_id: currentUser.id,
          table_id: selectedTable.id,
          date,
          time: timeSlot,
          guests: numberOfGuests
        });

        // ✅ 1) BOOKING_SUCCESS uniquement au client qui a réservé
        socket.send(JSON.stringify({
          type: "BOOKING_SUCCESS",
          reservationId: newReservation.id,
          tableId: selectedTable.id
        }));

        // ✅ 2) Update neutre broadcast à tout le monde (y compris lui)
        broadcast({
          type: "TABLE_UPDATE",
          tableId: selectedTable.id,
          reserved: true
        });

        return;
      }

      // ================= ADMIN GET RESERVATIONS =================
      if (message.type === "GET_RESERVATIONS") {
        if (!currentUser || currentUser.role !== "admin") {
          socket.send(JSON.stringify({ type: "UNAUTHORIZED" }));
          return;
        }

        const reservations = await getReservations();

        socket.send(JSON.stringify({
          type: "RESERVATIONS_LIST",
          data: reservations
        }));
        return;
      }

      // ================= DELETE RESERVATION =================
      if (message.type === "DELETE_RESERVATION") {
        if (!currentUser || currentUser.role !== "admin") {
          socket.send(JSON.stringify({ type: "UNAUTHORIZED" }));
          return;
        }

        const db = new sqlite3.Database("./database.sqlite");

        db.get(
          "SELECT * FROM reservations WHERE id = ?",
          [message.reservationId],
          (err, reservation) => {
            if (err) {
              console.log(err);
              return;
            }
            if (!reservation) return;

            db.run(
              "DELETE FROM reservations WHERE id = ?",
              [message.reservationId],
              (err2) => {
                if (err2) {
                  console.log(err2);
                  return;
                }

                // ✅ broadcast deletion (tout le monde)
                broadcast({
                  type: "RESERVATION_DELETED",
                  reservationId: message.reservationId,
                  tableId: reservation.table_id
                });

                // ✅ update table status for everyone
                broadcast({
                  type: "TABLE_UPDATE",
                  tableId: reservation.table_id,
                  reserved: false
                });
              }
            );
          }
        );

        return;
      }

    } catch (error) {
      console.log("Invalid JSON message", error);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
    const index = clients.indexOf(socket);
    if (index !== -1) clients.splice(index, 1);
  });
});