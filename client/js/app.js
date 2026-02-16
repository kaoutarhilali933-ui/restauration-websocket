const socket = new WebSocket("ws://localhost:3000");

let currentUserId = null;
let currentUserRole = null;

/* =========================
   WEBSOCKET
========================= */

socket.onopen = () => {
  log("Connected to server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  log(JSON.stringify(data));

  if (data.type === "REGISTER_SUCCESS") {
    showAuthMessage("Registration successful 🎉", true);
  }

  if (data.type === "REGISTER_FAILED") {
    showAuthMessage("Registration failed ❌ (" + data.reason + ")", false);
  }

  if (data.type === "LOGIN_SUCCESS") {
    currentUserId = data.userId;
    currentUserRole = data.role;

    showAuthMessage("Login successful ✅", true);
    showSectionsByRole();
  }

  if (data.type === "LOGIN_FAILED") {
    showAuthMessage("Login failed ❌ (" + data.reason + ")", false);
  }

  if (data.type === "BOOKING_SUCCESS") {
    showBookingMessage("Reservation successful 🎉", true);
  }

  if (data.type === "BOOKING_FAILED") {
    showBookingMessage("Reservation failed ❌ (" + data.reason + ")", false);
  }

  if (data.type === "RESERVATIONS_LIST") {
    renderReservations(data.data);
  }

  if (data.type === "UNAUTHORIZED") {
    showBookingMessage("Unauthorized ❌", false);
  }
};

function log(message) {
  document.getElementById("output").textContent += message + "\n";
}

/* =========================
   AUTH
========================= */

function register() {
  const email = document.getElementById("registerEmail").value;
  const password = document.getElementById("registerPassword").value;
  const role = document.getElementById("registerRole").value;

  socket.send(JSON.stringify({
    type: "REGISTER",
    email,
    password,
    role
  }));
}

function login() {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  socket.send(JSON.stringify({
    type: "LOGIN",
    email,
    password
  }));
}

function showAuthMessage(message, success) {
  const element = document.getElementById("authMessage");
  element.textContent = message;
  element.style.color = success ? "green" : "red";
}

function showSectionsByRole() {
  document.getElementById("authSection").style.display = "none";
  document.getElementById("bookingSection").style.display = "block";

  if (currentUserRole === "admin") {
    document.getElementById("adminSection").style.display = "block";
  }
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
    date,
    timeSlot,
    numberOfGuests: guests
  }));
}

function showBookingMessage(message, success) {
  const element = document.getElementById("bookingMessage");
  element.textContent = message;
  element.style.color = success ? "green" : "red";
}

/* =========================
   ADMIN
========================= */

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
        <button onclick="deleteReservation(${res.id})">Delete</button>
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