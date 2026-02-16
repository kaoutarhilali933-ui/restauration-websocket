const socket = new WebSocket("ws://localhost:3000");
let currentUserId = null;

socket.onopen = () => {
  log("Connected to server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  log(JSON.stringify(data));

  // LOGIN SUCCESS
  if (data.type === "LOGIN_SUCCESS") {
    currentUserId = data.userId;
  }

  // BOOKING SUCCESS
  if (data.type === "BOOKING_SUCCESS") {
    showBookingMessage("Reservation successful 🎉", true);
    markTableAsReserved(data.tableId);
  }

  // BOOKING FAILED
  if (data.type === "BOOKING_FAILED") {
    showBookingMessage("Reservation failed ❌ (" + data.reason + ")", false);
  }

  // UNAUTHORIZED
  if (data.type === "UNAUTHORIZED") {
    showBookingMessage("You must login first 🔒", false);
  }
};

socket.onerror = () => {
  log("WebSocket error");
};

socket.onclose = () => {
  log("Disconnected from server");
};

function log(message) {
  document.getElementById("output").textContent += message + "\n";
}

/* =========================
   AUTH
========================= */

function registerClient() {
  socket.send(JSON.stringify({
    type: "REGISTER",
    email: "test@test.com",
    password: "1234",
    role: "client"
  }));
}

function registerAdmin() {
  socket.send(JSON.stringify({
    type: "REGISTER",
    email: "admin@test.com",
    password: "1234",
    role: "admin"
  }));
}

function loginClient() {
  socket.send(JSON.stringify({
    type: "LOGIN",
    email: "test@test.com",
    password: "1234"
  }));
}

function loginAdmin() {
  socket.send(JSON.stringify({
    type: "LOGIN",
    email: "admin@test.com",
    password: "1234"
  }));
}

/* =========================
   BOOKING
========================= */

function bookTable() {

  if (!currentUserId) {
    showBookingMessage("You must login first 🔒", false);
    return;
  }

  const date = document.getElementById("date").value;
  const timeSlot = document.getElementById("timeSlot").value;
  const guests = parseInt(document.getElementById("guests").value);

  socket.send(JSON.stringify({
    type: "BOOK_TABLE",
    date: date,
    timeSlot: timeSlot,
    numberOfGuests: guests
  }));
}

/* =========================
   TABLE UI UPDATE
========================= */

function markTableAsReserved(tableId) {
  const table = document.querySelector(`[data-table-id="${tableId}"]`);
  if (!table) return;

  table.classList.remove("available");
  table.classList.add("reserved");

  table.querySelector(".status-text").textContent = "Reserved";
}

function manualReserve(id) {
  markTableAsReserved(id);
}

/* =========================
   UI MESSAGE
========================= */

function showBookingMessage(message, success) {
  const element = document.getElementById("bookingMessage");
  element.textContent = message;
  element.style.color = success ? "green" : "red";
}

function getReservations() {
  socket.send(JSON.stringify({
    type: "GET_RESERVATIONS"
  }));
}