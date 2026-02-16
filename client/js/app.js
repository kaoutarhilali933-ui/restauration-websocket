const socket = new WebSocket("ws://localhost:3000");
let currentUserId = null;

socket.onopen = () => {
  log("Connected to server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  log(JSON.stringify(data));

  if (data.type === "LOGIN_SUCCESS") {
    currentUserId = data.userId;
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

  const date = document.getElementById("date").value;
  const timeSlot = document.getElementById("timeSlot").value;
  const guests = parseInt(document.getElementById("guests").value);

  socket.send(JSON.stringify({
    type: "BOOK_TABLE",
    tableId: 1, // tu peux améliorer plus tard
    date: date,
    timeSlot: timeSlot,
    guests: guests
  }));
}

function getReservations() {
  socket.send(JSON.stringify({
    type: "GET_RESERVATIONS"
  }));
}