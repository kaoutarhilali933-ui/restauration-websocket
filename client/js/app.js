const socket = new WebSocket("ws://localhost:3000");

let currentUserRole = null;

// ✅ Pour savoir si la réservation supprimée est la tienne
let myLastReservationId = null;

// ✅ Timeout messages
let bookingMsgTimeout;
let authMsgTimeout;

/* ================= TABLES ================= */

const tables = [
  { id: 1, capacity: 4, reserved: false },
  { id: 2, capacity: 2, reserved: false },
  { id: 3, capacity: 6, reserved: false }
];

function renderTables() {
  const container = document.getElementById("tablesContainer");
  container.innerHTML = "";

  tables.forEach(table => {
    const div = document.createElement("div");
    div.className = table.reserved ? "table reserved" : "table available";

    div.innerHTML = `
      <h3>Table ${table.id}</h3>
      <p>Capacity: ${table.capacity}</p>
      <p>Status: ${table.reserved ? "Reserved" : "Available"}</p>
    `;

    container.appendChild(div);
  });
}

/* ================= WEBSOCKET ================= */

socket.onopen = () => {
  log("Connected to server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  log(JSON.stringify(data));

  // REGISTER
  if (data.type === "REGISTER_SUCCESS") {
    showAuthMessage("Registration successful 🎉", true);
    return;
  }

  if (data.type === "REGISTER_FAILED") {
    showAuthMessage("Registration failed ❌ (" + data.reason + ")", false);
    return;
  }

  // LOGIN
  if (data.type === "LOGIN_SUCCESS") {
    currentUserRole = data.role;
    showAuthMessage("Login successful ✅", true);
    showSectionsByRole();
    return;
  }

  if (data.type === "LOGIN_FAILED") {
    showAuthMessage("Login failed ❌ (" + data.reason + ")", false);
    return;
  }

  // ✅ Table update for everyone
  if (data.type === "TABLE_UPDATE") {
    const table = tables.find(t => t.id === data.tableId);
    if (table) table.reserved = data.reserved;

    renderTables();
    return;
  }

  // ✅ BOOKING SUCCESS (only the requester receives this)
  if (data.type === "BOOKING_SUCCESS") {
    myLastReservationId = data.reservationId;
    showBookingMessage("Reservation successful 🎉", true);
    return;
  }

  // BOOKING FAILED
  if (data.type === "BOOKING_FAILED") {
    showBookingMessage("Reservation failed ❌ (" + data.reason + ")", false);
    return;
  }

  // ADMIN LIST
  if (data.type === "RESERVATIONS_LIST") {
    renderReservations(data.data);
    return;
  }

  // ✅ DELETE EVENT (everyone receives)
  if (data.type === "RESERVATION_DELETED") {
    // 1) message global
    showBookingMessage(`A reservation was deleted ✅ (table ${data.tableId} freed)`, true);

    // 2) message perso seulement si c'est la tienne
    if (myLastReservationId && data.reservationId === myLastReservationId) {
      showBookingMessage("Your reservation was cancelled ⚠️", false);
      myLastReservationId = null; // reset
    }

    // 3) si admin, refresh la liste pour enlever la ligne sans refresh page
    if (currentUserRole === "admin") {
      getReservations();
    }

    return;
  }

  // UNAUTHORIZED
  if (data.type === "UNAUTHORIZED") {
    showBookingMessage("Unauthorized ❌", false);
    return;
  }
};

function log(message) {
  document.getElementById("output").textContent += message + "\n";
}

/* ================= AUTH ================= */

function register() {
  socket.send(JSON.stringify({
    type: "REGISTER",
    email: document.getElementById("registerEmail").value,
    password: document.getElementById("registerPassword").value,
    role: document.getElementById("registerRole").value
  }));
}

function login() {
  socket.send(JSON.stringify({
    type: "LOGIN",
    email: document.getElementById("loginEmail").value,
    password: document.getElementById("loginPassword").value
  }));
}

function showAuthMessage(message, success) {
  const el = document.getElementById("authMessage");
  el.textContent = message;
  el.style.color = success ? "green" : "red";

  clearTimeout(authMsgTimeout);
  authMsgTimeout = setTimeout(() => {
    el.textContent = "";
  }, 3000);
}

function showSectionsByRole() {
  document.getElementById("authSection").style.display = "none";
  document.getElementById("tablesSection").style.display = "block";
  document.getElementById("bookingSection").style.display = "block";

  renderTables();

  if (currentUserRole === "admin") {
    document.getElementById("adminSection").style.display = "block";
  }
}

/* ================= BOOKING ================= */

function bookTable() {
  socket.send(JSON.stringify({
    type: "BOOK_TABLE",
    date: document.getElementById("date").value,
    timeSlot: document.getElementById("timeSlot").value,
    numberOfGuests: parseInt(document.getElementById("guests").value)
  }));
}

function showBookingMessage(message, success) {
  const el = document.getElementById("bookingMessage");
  el.textContent = message;
  el.style.color = success ? "green" : "red";

  clearTimeout(bookingMsgTimeout);
  bookingMsgTimeout = setTimeout(() => {
    el.textContent = "";
  }, 3500);
}

/* ================= ADMIN ================= */

function getReservations() {
  socket.send(JSON.stringify({
    type: "GET_RESERVATIONS"
  }));
}

function renderReservations(reservations) {
  const tbody = document.querySelector("#adminTable tbody");
  tbody.innerHTML = "";

  reservations.forEach(res => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${res.id}</td>
      <td>${res.email}</td>
      <td>${res.table_number}</td>
      <td>${res.date}</td>
      <td>${res.time}</td>
      <td>${res.guests}</td>
      <td>
        <button onclick="deleteReservation(${res.id})">
          Delete
        </button>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function deleteReservation(id) {
  socket.send(JSON.stringify({
    type: "DELETE_RESERVATION",
    reservationId: id
  }));
}