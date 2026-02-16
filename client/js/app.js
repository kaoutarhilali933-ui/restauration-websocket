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
    tableId: 1,
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

/* =========================
   TABLES UI (Simulation)
========================= */

const tables = [
  { id: 1, capacity: 4, reserved: false },
  { id: 2, capacity: 2, reserved: true },
  { id: 3, capacity: 6, reserved: false }
];

function renderTables() {
  const container = document.getElementById("tablesContainer");
  container.innerHTML = "";

  tables.forEach(table => {
    const card = document.createElement("div");
    card.className = "table-card " + (table.reserved ? "reserved" : "available");

    card.innerHTML = `
      <h3>Table ${table.id}</h3>
      <p>Capacity: ${table.capacity}</p>
      <p>Status: ${table.reserved ? "Reserved" : "Available"}</p>
      <button onclick="toggleTable(${table.id})">
        ${table.reserved ? "Liberate" : "Reserve"}
      </button>
    `;

    container.appendChild(card);
  });
}

function toggleTable(id) {
  const table = tables.find(t => t.id === id);
  table.reserved = !table.reserved;
  renderTables();
}

// Initial render
renderTables();