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
  if (!container) return; // admin n'a pas ce conteneur visible
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
        ? "Confirme"
        : table.status === "pending"
        ? "En attente"
        : "Disponible";

    div.className = cssClass;

    div.innerHTML = `
      <h3>Table ${table.id}</h3>
      <p>Capacite : ${table.capacity} pers.</p>
      <p>${label}</p>
    `;

    container.appendChild(div);
  });
}

/* ================= STATUS BADGES ================= */

function getStatusBadge(status) {
  const s = (status || "").toLowerCase();

  if (s === "confirmed") {
    return `<span class="badge badge-confirmed">Confirmee</span>`;
  }
  if (s === "cancelled") {
    return `<span class="badge badge-cancelled">Annulee</span>`;
  }
  return `<span class="badge badge-pending">En attente</span>`;
}

/* ================= WEBSOCKET ================= */

socket.onopen = () => {
  log("Connected to server");
};

socket.onclose = () => {
  log("Connexion au serveur perdue.");
  if (currentUserRole !== null) {
    const msg = document.getElementById("bookingMessage") || document.getElementById("authMessage");
    if (msg) {
      msg.textContent = "Connexion perdue. Rechargez la page.";
      msg.style.color = "red";
    }
  }
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  log(JSON.stringify(data));

  if (data.type === "REGISTER_SUCCESS") {
    showAuthMessage("Inscription reussie !", true);
    return;
  }

  if (data.type === "REGISTER_FAILED") {
    showAuthMessage("Inscription echouee : " + data.reason, false);
    return;
  }

  if (data.type === "LOGIN_SUCCESS") {
    currentUserRole = data.role;
    showAuthMessage("Connexion reussie !", true);
    showSectionsByRole();

    if (currentUserRole === "client") {
      document.getElementById("myReservationsSection").style.display = "block";
      loadMyReservations();
    }

    return;
  }

  if (data.type === "LOGIN_FAILED") {
    showAuthMessage("Connexion echouee : " + data.reason, false);
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
    showBookingMessage("Reservation effectuee (" + data.status + ")", true);

    if (currentUserRole === "client") loadMyReservations();
    if (currentUserRole === "admin") getReservations();
    return;
  }

  if (data.type === "BOOKING_FAILED") {
    showBookingMessage("Reservation echouee : " + data.reason, false);
    return;
  }

  if (data.type === "CONFIRM_SUCCESS") {
    showBookingMessage("Reservation confirmee !", true);
    if (currentUserRole === "admin") getReservations();
    if (currentUserRole === "client") loadMyReservations();
    return;
  }

  if (data.type === "CONFIRM_FAILED") {
    showBookingMessage("Confirmation echouee : " + data.reason, false);
    return;
  }

  if (data.type === "CANCEL_SUCCESS") {
    showMyReservationsMessage("Reservation annulee.", true);
    loadMyReservations();
    return;
  }

  if (data.type === "CANCEL_FAILED") {
    showMyReservationsMessage("Annulation echouee : " + data.reason, false);
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
    showMyReservationsMessage("Reservations mises a jour.", true);
    return;
  }

  if (data.type === "RESERVATION_DELETED") {
    showBookingMessage("Reservation supprimee (table " + data.tableId + " liberee)", true);

    if (myLastReservationId && data.reservationId === myLastReservationId) {
      showBookingMessage("Votre reservation a ete annulee.", false);
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
    showBookingMessage("Action non autorisee.", false);
    return;
  }
};

function log(message) {
  const el = document.getElementById("output");
  if (el) el.textContent += message + "\n";
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

/* ================= AFFICHAGE PAR ROLE ================= */
/* MODIFIE : affiche header + vue client ou admin + profil  */

function showSectionsByRole() {
  // Cacher la page de login
  document.getElementById("authSection").style.display = "none";

  // Afficher le header et le main
  document.getElementById("appHeader").style.display = "flex";
  document.getElementById("appMain").style.display = "block";

  // Recuperer l'email saisi
  const email = document.getElementById("loginEmail").value;

  // Remplir le profil dans le header
  document.getElementById("profileEmail").textContent = email;
  document.getElementById("profileRole").textContent =
    currentUserRole === "admin" ? "Admin" : "Client";

  if (currentUserRole === "client") {
    // Afficher la vue client
    document.getElementById("clientView").style.display = "block";
    document.getElementById("clientProfileEmail").textContent = email;

    // Afficher les sections existantes
    document.getElementById("tablesSection").style.display = "block";
    document.getElementById("bookingSection").style.display = "block";
    document.getElementById("myReservationsSection").style.display = "block";

    renderTables();
  }

  if (currentUserRole === "admin") {
    // Afficher la vue admin
    document.getElementById("adminView").style.display = "flex";
    document.getElementById("adminProfileEmail").textContent = email;
    document.getElementById("adminSection").style.display = "block";
  }
}

/* ================= NOUVEAU : onglets login ================= */

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add("active");
  document.getElementById(tab + "Tab").classList.add("active");
}

/* ================= NOUVEAU : deconnexion ================= */

function logout() {
  socket.close();
  location.reload();
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
  if (!el) return;
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
  const total     = reservations.length;
  const confirmed = reservations.filter(r => (r.status || "").toLowerCase() === "confirmed").length;
  const cancelled = reservations.filter(r => (r.status || "").toLowerCase() === "cancelled").length;
  const pending   = reservations.filter(r => (r.status || "").toLowerCase() === "pending").length;

  const elTotal     = document.getElementById("statTotal");
  const elConfirmed = document.getElementById("statConfirmed");
  const elCancelled = document.getElementById("statCancelled");
  const elPending   = document.getElementById("statPending");

  if (elTotal)     elTotal.textContent     = total;
  if (elConfirmed) elConfirmed.textContent = confirmed;
  if (elCancelled) elCancelled.textContent = cancelled;
  if (elPending)   elPending.textContent   = pending;
}

function applyAdminFilters() {
  const searchInput  = document.getElementById("adminSearchInput");
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
    const isPending = (res.status || "").toLowerCase() === "pending";

    row.innerHTML = `
      <td>${res.id}</td>
      <td>${res.email}</td>
      <td>${res.table_number}</td>
      <td>${res.date}</td>
      <td>${res.time}</td>
      <td>${res.guests}</td>
      <td>${getStatusBadge(res.status)}</td>
      <td class="actions-cell">
        <div class="action-buttons">
          ${isPending
            ? `<button class="btn-confirm" onclick="confirmReservation(${res.id})">Confirmer</button>`
            : ""
          }
          <button class="btn-danger" onclick="deleteReservation(${res.id})">Supprimer</button>
        </div>
      </td>
    `;

    tbody.appendChild(row);
  });
}

function deleteReservation(id) {
  socket.send(JSON.stringify({ type: "DELETE_RESERVATION", reservationId: id }));
}
window.deleteReservation = deleteReservation;

/* ================= MES RESERVATIONS ================= */

function loadMyReservations() {
  log("Sending MY_RESERVATIONS");
  socket.send(JSON.stringify({ type: "MY_RESERVATIONS" }));
}
window.loadMyReservations = loadMyReservations;

function cancelReservation(id) {
  const ok = confirm("Confirmer l'annulation de cette reservation ?");
  if (!ok) return;

  socket.send(JSON.stringify({ type: "CANCEL_RESERVATION", reservationId: id }));
}
window.cancelReservation = cancelReservation;

function renderMyReservations(reservations) {
  const tbody = document.querySelector("#myReservationsTable tbody");
  tbody.innerHTML = "";

  // MODIFIE : mise a jour du compteur de reservations actives
  const counter = document.getElementById("clientTotalReservations");
  if (counter) {
    const active = (reservations || []).filter(r =>
      (r.status || "").toLowerCase() !== "cancelled"
    ).length;
    counter.textContent = active;
  }

  if (!reservations || reservations.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;">Aucune reservation</td></tr>`;
    return;
  }

  reservations.forEach(r => {
    const row = document.createElement("tr");
    const isCancelled = (r.status || "").toLowerCase() === "cancelled";

    row.innerHTML = `
      <td>${r.id}</td>
      <td>${r.date}</td>
      <td>${r.time}</td>
      <td>${r.guests}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td>${r.table_number ?? "—"}</td>
      <td>
        ${!isCancelled
          ? `<button class="btn-cancel" onclick="cancelReservation(${r.id})">Annuler</button>`
          : `<span style="color:#94a3b8;">—</span>`
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
