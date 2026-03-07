// server/server.js
const WebSocket = require("ws");

const {
  initDb,
  seedTables,
  createUser,
  getUserByEmail,
  login,
  saveReservation,
  getReservations,
  getReservationById,
  deleteReservationById,
  hasUserBookingForSlot,
  cancelReservationById,
  getReservationsByUserId,
} = require("./database");

const Restaurant = require("./models/Restaurant");
const Table = require("./models/Table");

const PORT = 3000;

// ---------------- INIT DB ----------------
(async () => {
  try {
    await initDb();
    await seedTables();
  } catch (err) {
    console.error("❌ DB init error:", err);
  }
})();

// ---------------- WEBSOCKET SERVER ----------------
const wss = new WebSocket.Server({ port: PORT });
const clients = [];

console.log("✅ WebSocket server running on ws://localhost:" + PORT);

// ---------------- RESTAURANT ----------------
const restaurant = new Restaurant();
restaurant.addTable(new Table(1, 4));
restaurant.addTable(new Table(2, 2));
restaurant.addTable(new Table(3, 6));

// ---------------- BROADCAST ----------------
function broadcast(messageObj) {
  const payload = JSON.stringify(messageObj);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// ---------------- CONNECTION ----------------
wss.on("connection", (socket) => {
  console.log("Client connected");
  clients.push(socket);

  let currentUser = null;

  socket.on("message", async (data) => {
    let message;

    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error("❌ JSON PARSE ERROR:", err);
      socket.send(
        JSON.stringify({
          type: "INVALID_JSON",
          error: "Message must be valid JSON",
        })
      );
      return;
    }

    try {
      console.log("Message reçu :", message);

      // ================= REGISTER =================
      if (message.type === "REGISTER") {
        const { email, password, role } = message;

        if (!email || !password) {
          socket.send(
            JSON.stringify({
              type: "REGISTER_FAILED",
              reason: "EMAIL_AND_PASSWORD_REQUIRED",
            })
          );
          return;
        }

        const existing = await getUserByEmail(email);
        if (existing) {
          socket.send(
            JSON.stringify({
              type: "REGISTER_FAILED",
              reason: "Email already exists",
            })
          );
          return;
        }

        const user = await createUser({
          email,
          password,
          role: role || "client",
        });

        socket.send(
          JSON.stringify({
            type: "REGISTER_SUCCESS",
            userId: user.id,
          })
        );
        return;
      }

      // ================= LOGIN =================
      if (message.type === "LOGIN") {
        const { email, password } = message;

        if (!email || !password) {
          socket.send(
            JSON.stringify({
              type: "LOGIN_FAILED",
              reason: "EMAIL_AND_PASSWORD_REQUIRED",
            })
          );
          return;
        }

        const user = await login(email, password);

        if (!user) {
          socket.send(
            JSON.stringify({
              type: "LOGIN_FAILED",
              reason: "Invalid email or password",
            })
          );
          return;
        }

        currentUser = user;

        socket.send(
          JSON.stringify({
            type: "LOGIN_SUCCESS",
            userId: user.id,
            role: user.role,
          })
        );
        return;
      }

      // ================= BOOK TABLE =================
      if (message.type === "BOOK_TABLE") {
        if (!currentUser) {
          socket.send(
            JSON.stringify({
              type: "UNAUTHORIZED",
              reason: "You must login first",
            })
          );
          return;
        }

        const { date, timeSlot, numberOfGuests } = message;
        const guests = Number(numberOfGuests);

        if (!date || !timeSlot || Number.isNaN(guests) || guests <= 0) {
          socket.send(
            JSON.stringify({
              type: "BOOKING_FAILED",
              reason: "INVALID_DATA",
            })
          );
          return;
        }

        if (!restaurant.allowedTimeSlots.includes(timeSlot)) {
          socket.send(
            JSON.stringify({
              type: "BOOKING_FAILED",
              reason: "INVALID_TIME_SLOT",
            })
          );
          return;
        }

        const today = new Date();
        const bookingDate = new Date(date);
        today.setHours(0, 0, 0, 0);

        if (isNaN(bookingDate.getTime()) || bookingDate < today) {
          socket.send(
            JSON.stringify({
              type: "BOOKING_FAILED",
              reason: "INVALID_DATE",
            })
          );
          return;
        }

        // ✅ same user cannot reserve same date + same slot twice
        const alreadyBooked = await hasUserBookingForSlot(
          currentUser.id,
          date,
          timeSlot
        );

        if (alreadyBooked) {
          socket.send(
            JSON.stringify({
              type: "BOOKING_FAILED",
              reason: "USER_ALREADY_BOOKED_THIS_SLOT",
            })
          );
          return;
        }

        // ✅ tables filtered by capacity
        const possibleTables = restaurant.tables.filter(
          (t) => t.capacity >= guests
        );

        const existingReservations = await getReservations();
        let selectedTable = null;

        // ✅ GLOBAL table locking logic:
        // if a table was already reserved and not cancelled, it is unavailable for everyone
        for (const table of possibleTables) {
          const conflict = existingReservations.find(
            (r) =>
              r.table_id === table.id &&
              r.status !== "cancelled"
          );

          if (!conflict) {
            selectedTable = table;
            break;
          }
        }

        if (!selectedTable) {
          socket.send(
            JSON.stringify({
              type: "BOOKING_FAILED",
              reason: "NO_TABLE_AVAILABLE",
            })
          );
          return;
        }

        const newReservation = await saveReservation({
          user_id: currentUser.id,
          table_id: selectedTable.id,
          date,
          time: timeSlot,
          guests: guests,
        });

        socket.send(
          JSON.stringify({
            type: "BOOKING_SUCCESS",
            reservationId: newReservation.id,
            tableId: selectedTable.id,
            status: "confirmed",
          })
        );

        // ✅ make this table red for everyone
        broadcast({
          type: "TABLE_UPDATE",
          tableId: selectedTable.id,
          reserved: true,
        });

        return;
      }

      // ================= CANCEL RESERVATION (CLIENT) =================
      if (message.type === "CANCEL_RESERVATION") {
        if (!currentUser) {
          socket.send(JSON.stringify({ type: "UNAUTHORIZED" }));
          return;
        }

        const { reservationId } = message;

        if (!reservationId) {
          socket.send(
            JSON.stringify({
              type: "CANCEL_FAILED",
              reason: "RESERVATION_ID_REQUIRED",
            })
          );
          return;
        }

        const cancelled = await cancelReservationById(
          Number(reservationId),
          currentUser.id
        );

        if (!cancelled) {
          socket.send(
            JSON.stringify({
              type: "CANCEL_FAILED",
              reason: "NOT_ALLOWED_OR_NOT_FOUND",
            })
          );
          return;
        }

        socket.send(
          JSON.stringify({
            type: "CANCEL_SUCCESS",
            reservationId: Number(reservationId),
          })
        );

        broadcast({
          type: "RESERVATION_CANCELLED",
          reservationId: Number(reservationId),
        });

        // ✅ free the table globally for everyone
        broadcast({
          type: "TABLE_UPDATE",
          tableId: cancelled.table_id,
          reserved: false,
        });

        return;
      }

      // ================= MY RESERVATIONS (CLIENT) =================
      if (message.type === "MY_RESERVATIONS") {
        if (!currentUser) {
          socket.send(JSON.stringify({ type: "UNAUTHORIZED" }));
          return;
        }

        const reservations = await getReservationsByUserId(currentUser.id);

        socket.send(
          JSON.stringify({
            type: "MY_RESERVATIONS_LIST",
            data: reservations,
          })
        );
        return;
      }

      // ================= ADMIN GET RESERVATIONS =================
      if (message.type === "GET_RESERVATIONS") {
        if (!currentUser || currentUser.role !== "admin") {
          socket.send(JSON.stringify({ type: "UNAUTHORIZED" }));
          return;
        }

        const reservations = await getReservations();

        socket.send(
          JSON.stringify({
            type: "RESERVATIONS_LIST",
            data: reservations,
          })
        );
        return;
      }

      // ================= DELETE RESERVATION (ADMIN) =================
      if (message.type === "DELETE_RESERVATION") {
        if (!currentUser || currentUser.role !== "admin") {
          socket.send(JSON.stringify({ type: "UNAUTHORIZED" }));
          return;
        }

        const reservationId = message.reservationId;

        if (!reservationId) {
          socket.send(
            JSON.stringify({
              type: "DELETE_FAILED",
              reason: "RESERVATION_ID_REQUIRED",
            })
          );
          return;
        }

        const reservation = await getReservationById(reservationId);

        if (!reservation) {
          socket.send(
            JSON.stringify({
              type: "DELETE_FAILED",
              reason: "NOT_FOUND",
            })
          );
          return;
        }

        await deleteReservationById(reservationId);

        broadcast({
          type: "RESERVATION_DELETED",
          reservationId,
          tableId: reservation.table_id,
          userId: reservation.user_id,
        });

        // ✅ free the table globally for everyone
        broadcast({
          type: "TABLE_UPDATE",
          tableId: reservation.table_id,
          reserved: false,
        });

        return;
      }

      socket.send(
        JSON.stringify({
          type: "UNKNOWN_MESSAGE_TYPE",
          receivedType: message.type,
        })
      );
    } catch (err) {
      console.error("❌ SERVER ERROR:", err);
      socket.send(
        JSON.stringify({
          type: "SERVER_ERROR",
          error: "Internal server error",
        })
      );
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected");
    const index = clients.indexOf(socket);
    if (index !== -1) clients.splice(index, 1);
  });
});