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

function log(message) {
  document.getElementById("output").textContent += message + "\n";
}

// REGISTER
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

// LOGIN
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

// BOOK
function bookTable() {
  socket.send(JSON.stringify({
    type: "BOOK_TABLE",
    tableId: 1,
    date: "2025-06-10",
    timeSlot: "19:00",
    guests: 2
  }));
}

// GET RESERVATIONS
function getReservations() {
  socket.send(JSON.stringify({
    type: "GET_RESERVATIONS"
  }));
}