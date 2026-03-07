const socket = new WebSocket("ws://localhost:3000");

let currentUserRole = null;
let myLastReservationId = null;

let bookingMsgTimeout;
let authMsgTimeout;
let myResMsgTimeout;

/* ================= TABLES ================= */

const tables = [
  { id: 1, capacity: 4, status: "available" },
  { id: 2, capacity: 2, status: "available" },
  { id: 3, capacity: 6, status: "available" }
];

function renderTables() {
  const container = document.getElementById("tablesContainer");
  container.innerHTML = "";

  tables.forEach(table => {
    const div = document.createElement("div");

    const cssClass =
      table.status === "confirmed"
        ? "table reserved"
        : table.status === "pending"
        ? "table pending"
        : "table available";

    const label =
      table.status === "confirmed"
        ? "Confirmed"
        : table.status === "pending"
        ? "Pending"
        : "Available";

    div.className = cssClass;

    div.innerHTML = `
      <h3>Table ${table.id}</h3>
      <p>Capacity: ${table.capacity}</p>
      <p>Status: ${label}</p>
    `;

    container.appendChild(div);
  });
}

/* ================= STATUS BADGES ================= */

function getStatusBadge(status) {
  const s = (status || "").toLowerCase();

  if (s === "confirmed") {
    return `<span class="badge badge-confirmed">🟢 Confirmed</span>`;
  }
  if (s === "cancelled") {
    return `<span class="badge badge-cancelled">🔴 Cancelled</span>`;
  }
  return `<span class="badge badge-pending">🟡 Pending</span>`;
}

/* ================= WEBSOCKET ================= */

socket.onopen = () => {
  log("Connected to server");
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  log(JSON.stringify(data));

  if (data.type === "REGISTER_SUCCESS") {
    showAuthMessage("Registration successful 🎉", true);
    return;
  }

  if (data.type === "REGISTER_FAILED") {
    showAuthMessage("Registration failed ❌ (" + data.reason + ")", false);
    return;
  }

  if (data.type === "LOGIN_SUCCESS") {
    currentUserRole = data.role;
    showAuthMessage("Login successful ✅", true);
    showSectionsByRole();

    if (currentUserRole === "client") {
      document.getElementById("myReservationsSection").style.display = "block";
      loadMyReservations();
    }

    return;
  }

  if (data.type === "LOGIN_FAILED") {
    showAuthMessage("Login failed ❌ (" + data.reason + ")", false);
    return;
  }

  if (data.type === "TABLE_UPDATE") {
    const table = tables.find(t => t.id === data.tableId);
    if (table) {
      table.status = data.status || "available";
    }
    renderTables();
    return;
  }

  if (data.type === "BOOKING_SUCCESS") {
    myLastReservationId = data.reservationId;
    showBookingMessage(`Reservation successful 🎉 (${data.status})`, true);

    if (currentUserRole === "client") loadMyReservations();
    if (currentUserRole === "admin") getReservations();
    return;
  }

  if (data.type === "BOOKING_FAILED") {
    showBookingMessage("Reservation failed ❌ (" + data.reason + ")", false);
    return;
  }

  if (data.type === "CONFIRM_SUCCESS") {
    showBookingMessage("Reservation confirmed ✅", true);
    if (currentUserRole === "admin") getReservations();
    if (currentUserRole === "client") loadMyReservations();
    return;
  }

  if (data.type === "CONFIRM_FAILED") {
    showBookingMessage("Confirm failed ❌ (" + data.reason + ")", false);
    return;
  }

  if (data.type === "CANCEL_SUCCESS") {
    showMyReservationsMessage("Reservation cancelled ✅", true);
    loadMyReservations();
    return;
  }

  if (data.type === "CANCEL_FAILED") {
    showMyReservationsMessage("Cancel failed ❌ (" + data.reason + ")", false);
    return;
  }

  if (data.type === "RESERVATIONS_LIST") {
    adminReservationsRaw = Array.isArray(data.data) ? data.data : [];
    applyAdminFilters();
    updateAdminStats(adminReservationsRaw);
    return;
  }

  if (data.type === "MY_RESERVATIONS_LIST") {
    document.getElementById("myReservationsSection").style.display = "block";
    renderMyReservations(data.data);
    showMyReservationsMessage("My reservations updated ✅", true);
    return;
  }

  if (data.type === "RESERVATION_DELETED") {
    showBookingMessage(`A reservation was deleted ✅ (table ${data.tableId} freed)`, true);

    if (myLastReservationId && data.reservationId === myLastReservationId) {
      showBookingMessage("Your reservation was cancelled ⚠️", false);
      myLastReservationId = null;
      if (currentUserRole === "client") loadMyReservations();
    }

    if (currentUserRole === "admin") getReservations();
    return;
  }

  if (data.type === "RESERVATION_CANCELLED") {
    if (currentUserRole === "admin") getReservations();
    if (currentUserRole === "client") loadMyReservations();
    return;
  }

  if (data.type === "RESERVATION_CONFIRMED") {
    if (currentUserRole === "admin") getReservations();
    if (currentUserRole === "client") loadMyReservations();
    return;
  }

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

  if (currentUserRole === "client") {
    document.getElementById("myReservationsSection").style.display = "block";
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

let adminReservationsRaw = [];

function getReservations() {
  socket.send(JSON.stringify({ type: "GET_RESERVATIONS" }));
}

function confirmReservation(id) {
  socket.send(JSON.stringify({
    type: "CONFIRM_RESERVATION",
    reservationId: id
  }));
}
window.confirmReservation = confirmReservation;

function updateAdminStats(reservations) {
  const total = reservations.length;
  const confirmed = reservations.filter(r => (r.status || "").toLowerCase() === "confirmed").length;
  const cancelled = reservations.filter(r => (r.status || "").toLowerCase() === "cancelled").length;

  const elTotal = document.getElementById("statTotal");
  const elConfirmed = document.getElementById("statConfirmed");
  const elCancelled = document.getElementById("statCancelled");

  if (elTotal) elTotal.textContent = total;
  if (elConfirmed) elConfirmed.textContent = confirmed;
  if (elCancelled) elCancelled.textContent = cancelled;
}

function applyAdminFilters() {
  const searchInput = document.getElementById("adminSearchInput");
  const statusFilter = document.getElementById("adminStatusFilter");

  const search = (searchInput?.value || "").trim().toLowerCase();
  const filter = (statusFilter?.value || "all").toLowerCase();

  let filtered = [...adminReservationsRaw];

  if (search.length > 0) {
    filtered = filtered.filter(r => (r.email || "").toLowerCase().includes(search));
  }

  if (filter !== "all") {
    filtered = filtered.filter(r => (r.status || "").toLowerCase() === filter);
  }

  renderReservations(filtered);
}

window.applyAdminFilters = applyAdminFilters;

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
      <td>${getStatusBadge(res.status)}</td>
      <td>
        ${
          (res.status || "").toLowerCase() === "pending"
            ? `<button onclick="confirmReservation(${res.id})">Confirm</button>
               <button onclick="deleteReservation(${res.id})">Delete</button>`
            : `<button onclick="deleteReservation(${res.id})">Delete</button>`
        }
      </td>
    `;

    tbody.appendChild(row);
  });
}

function deleteReservation(id) {
  socket.send(JSON.stringify({ type: "DELETE_RESERVATION", reservationId: id }));
}
window.deleteReservation = deleteReservation;

/* ================= MY RESERVATIONS ================= */

function loadMyReservations() {
  log("➡️ Sending MY_RESERVATIONS");
  socket.send(JSON.stringify({ type: "MY_RESERVATIONS" }));
}
window.loadMyReservations = loadMyReservations;

function cancelReservation(id) {
  const ok = confirm("Are you sure you want to cancel this reservation?");
  if (!ok) return;

  socket.send(JSON.stringify({ type: "CANCEL_RESERVATION", reservationId: id }));
}
window.cancelReservation = cancelReservation;

function renderMyReservations(reservations) {
  const tbody = document.querySelector("#myReservationsTable tbody");
  tbody.innerHTML = "";

  if (!reservations || reservations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No reservations</td></tr>`;
    return;
  }

  reservations.forEach(r => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${r.id}</td>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.guests}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td>${r.table_number ?? ""}</td>
      <td>
        ${
          (r.status || "").toLowerCase() !== "cancelled"
            ? `<button class="btn-cancel" onclick="cancelReservation(${r.id})">Cancel</button>`
            : `<span style="color:gray;">—</span>`
        }
      </td>
    `;

    tbody.appendChild(row);
  });
}

function showMyReservationsMessage(message, success) {
  const el = document.getElementById("myReservationsMessage");
  if (!el) return;

  el.textContent = message;
  el.style.color = success ? "green" : "red";

  clearTimeout(myResMsgTimeout);
  myResMsgTimeout = setTimeout(() => {
    el.textContent = "";
  }, 2500);
}