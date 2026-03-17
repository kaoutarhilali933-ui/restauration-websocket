let socket = new WebSocket("ws://localhost:3000");

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
  ["tablesContainer", "adminTablesContainer"].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
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

function initSocketHandlers() {
  socket.onopen = () => {
    log("Connected to server");
    setWsIndicator(true);

    const msg = document.getElementById("bookingMessage") ||
                document.getElementById("authMessage");
    if (msg && msg.textContent.includes("Reconnexion")) {
      msg.textContent = "";
    }

    const token = sessionStorage.getItem("token");
    if (token) {
      socket.send(JSON.stringify({ type: "AUTHENTICATE", token }));
    }
  };

  socket.onclose = () => {
    log("Connexion au serveur perdue. Tentative de reconnexion...");
    setWsIndicator(false);

    const msg = document.getElementById("bookingMessage") ||
                document.getElementById("authMessage");
    if (msg) {
      msg.textContent = "Connexion perdue. Reconnexion en cours...";
      msg.style.color = "orange";
    }

    setTimeout(() => {
      socket = new WebSocket("ws://localhost:3000");
      initSocketHandlers();
    }, 3000);
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
    sessionStorage.setItem("token", data.token);
    sessionStorage.setItem("userEmail", data.email);
    sessionStorage.setItem("userRole", data.role);
    showAuthMessage("Connexion reussie !", true);
    showSectionsByRole(data.email);

    if (currentUserRole === "client") {
      document.getElementById("myReservationsSection").style.display = "block";
      loadMyReservations();
    }

    return;
  }

  if (data.type === "AUTH_SUCCESS") {
    currentUserRole = data.role;
    showSectionsByRole(data.email);

    if (currentUserRole === "client") {
      document.getElementById("myReservationsSection").style.display = "block";
      loadMyReservations();
    }

    if (currentUserRole === "admin") {
      getReservations();
    }

    return;
  }

  if (data.type === "AUTH_FAILED") {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("userEmail");
    sessionStorage.removeItem("userRole");
    return;
  }

  if (data.type === "LOGIN_FAILED") {
    showAuthMessage("Connexion echouee : " + data.reason, false);
    return;
  }

  if (data.type === "TABLES_STATUS") {
    // A la connexion, toutes les tables sont disponibles par defaut
    // La dispo reelle se charge quand l'utilisateur choisit date + creneau
    tables.forEach(t => t.status = "available");
    renderTables();
    return;
  }

  if (data.type === "TABLES_AVAILABILITY") {
    data.tables.forEach(t => {
      const table = tables.find(x => x.id === t.id);
      if (table) table.status = t.status;
    });
    renderTables();
    return;
  }

  if (data.type === "TABLE_UPDATE") {
    const selectedDate = document.getElementById("date")?.value;
    const selectedSlot = document.getElementById("timeSlot")?.value;

    // Appliquer seulement si le client regarde le meme slot
    const sameSlot = !data.date || !data.timeSlot ||
      (data.date === selectedDate && data.timeSlot === selectedSlot);

    if (sameSlot) {
      const table = tables.find(t => t.id === data.tableId);
      if (table) table.status = data.status || "available";
      renderTables();
    }
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
    if (data.reason === "NO_TABLE_AVAILABLE") {
      checkAvailability(); // rafraichit les couleurs des tables pour ce slot
    }
    return;
  }

  if (data.type === "CONFIRM_SUCCESS") {
    showBookingMessage("Reservation confirmee !", true);
    // La mise a jour visuelle est geree par RESERVATION_CONFIRMED (broadcast)
    return;
  }

  if (data.type === "CONFIRM_FAILED") {
    showBookingMessage("Confirmation echouee : " + data.reason, false);
    return;
  }

  if (data.type === "CANCEL_SUCCESS") {
    showMyReservationsMessage("Reservation annulee.", true);
    updateClientRowStatus(data.reservationId, "cancelled");
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
    renderDashboardRecent(adminReservationsRaw);
    return;
  }

  if (data.type === "MY_RESERVATIONS_LIST") {
    document.getElementById("myReservationsSection").style.display = "block";
    renderMyReservations(data.data);
    showMyReservationsMessage("Reservations mises a jour.", true);
    return;
  }

  if (data.type === "RESERVATION_DELETED") {
    if (currentUserRole === "admin") {
      showBookingMessage("Reservation supprimee (table " + data.tableId + " liberee)", true);
      removeAdminRow(data.reservationId);
      adminReservationsRaw = adminReservationsRaw.filter(r => r.id !== data.reservationId);
      updateAdminStats(adminReservationsRaw);
      renderDashboardRecent(adminReservationsRaw);
    }
    if (currentUserRole === "client" && myLastReservationId === data.reservationId) {
      showBookingMessage("Votre reservation a ete supprimee par l'admin.", false);
      myLastReservationId = null;
      updateClientRowStatus(data.reservationId, "cancelled");
    }
    return;
  }

  if (data.type === "RESERVATION_CANCELLED") {
    if (currentUserRole === "admin") {
      updateAdminRowStatus(data.reservationId, "cancelled");
      const r = adminReservationsRaw.find(x => x.id === data.reservationId);
      if (r) { r.status = "cancelled"; updateAdminStats(adminReservationsRaw); renderDashboardRecent(adminReservationsRaw); }
    }
    return;
  }

  if (data.type === "RESERVATION_CONFIRMED") {
    if (currentUserRole === "admin") {
      updateAdminRowStatus(data.reservationId, "confirmed");
      const r = adminReservationsRaw.find(x => x.id === data.reservationId);
      if (r) { r.status = "confirmed"; updateAdminStats(adminReservationsRaw); renderDashboardRecent(adminReservationsRaw); }
    }
    if (currentUserRole === "client") {
      updateClientRowStatus(data.reservationId, "confirmed");
      showToast("Votre reservation a ete confirmee !", "success");
    }
    return;
  }

  if (data.type === "UNAUTHORIZED") {
    showBookingMessage("Action non autorisee.", false);
    return;
  }
  };
} // fin initSocketHandlers

initSocketHandlers();

function log(message) {
  const el = document.getElementById("output");
  if (el) el.textContent += message + "\n";
}

/* ================= UTILITAIRES ================= */

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

function setWsIndicator(connected) {
  const dot = document.getElementById("wsIndicator");
  if (!dot) return;
  dot.className = connected ? "ws-dot ws-dot-connected" : "ws-dot ws-dot-disconnected";
  dot.title = connected ? "WebSocket connecte" : "WebSocket deconnecte";
}

/* ================= AUTH ================= */

function register() {
  socket.send(JSON.stringify({
    type: "REGISTER",
    email: document.getElementById("registerEmail").value,
    password: document.getElementById("registerPassword").value
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

function showSectionsByRole(email) {
  // Cacher la page de login
  document.getElementById("authSection").style.display = "none";

  // Afficher le header et le main
  document.getElementById("appHeader").style.display = "flex";
  document.getElementById("appMain").style.display = "block";

  // Email fourni par le serveur (login ou reconnexion JWT)
  if (!email) email = document.getElementById("loginEmail").value;

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
    switchAdminSection("dashboard");
  }
}

/* ================= NOUVEAU : onglets login ================= */

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add("active");
  document.getElementById(tab + "Tab").classList.add("active");
}

/* ================= NAVIGATION ADMIN ================= */

function switchAdminSection(name) {
  document.querySelectorAll(".admin-panel").forEach(p => p.style.display = "none");
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(n => n.classList.remove("active"));

  document.getElementById("admin-panel-" + name).style.display = "block";
  document.querySelector(`.nav-item[data-section="${name}"]`).classList.add("active");

  if (name === "tables") {
    renderTables();
  }
}

/* ================= NOUVEAU : deconnexion ================= */

function logout() {
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("userEmail");
  sessionStorage.removeItem("userRole");
  currentUserRole = null;
  myLastReservationId = null;

  // Remettre l'UI a zero sans rechargement de page
  document.getElementById("appHeader").style.display = "none";
  document.getElementById("appMain").style.display = "none";
  document.getElementById("authSection").style.display = "flex";
  document.getElementById("clientView").style.display = "none";
  document.getElementById("adminView").style.display = "none";
  document.getElementById("loginEmail").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("authMessage").textContent = "";

  // Reinitialiser les tables
  tables.forEach(t => t.status = "available");

  // Fermer l'ancien socket et en ouvrir un nouveau
  socket.onclose = null; // eviter le message "Connexion perdue"
  socket.close();
  socket = new WebSocket("ws://localhost:3000");
  initSocketHandlers();
}

/* ================= BOOKING ================= */

function checkAvailability() {
  const date = document.getElementById("date")?.value;
  const timeSlot = document.getElementById("timeSlot")?.value;
  if (!date || !timeSlot || !currentUserRole) return;
  socket.send(JSON.stringify({ type: "CHECK_AVAILABILITY", date, timeSlot }));
}

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

function renderDashboardRecent(reservations) {
  const container = document.getElementById("dashboardRecentList");
  if (!container) return;

  const recent = (reservations || []).slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = `<p class="recent-empty">Aucune reservation pour le moment.</p>`;
    return;
  }

  container.innerHTML = recent.map(r => `
    <div class="recent-item">
      <div class="recent-item-left">
        <span class="recent-item-email">${r.email}</span>
        <span class="recent-item-meta">Table ${r.table_number} &middot; ${r.date} &middot; ${r.time} &middot; ${r.guests} pers.</span>
      </div>
      <div class="recent-item-right">
        ${getStatusBadge(r.status)}
      </div>
    </div>
  `).join("");
}

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
    row.dataset.id = res.id;
    const isPending = (res.status || "").toLowerCase() === "pending";

    row.innerHTML = `
      <td>${res.id}</td>
      <td>${res.email}</td>
      <td>${res.table_number}</td>
      <td>${formatDate(res.date)}</td>
      <td>${res.time}</td>
      <td>${res.guests}</td>
      <td>${getStatusBadge(res.status)}</td>
      <td class="actions-cell">
        <div class="action-buttons">
          ${isPending
            ? `<button type="button" class="btn-confirm" onclick="confirmReservation(${res.id})">Confirmer</button>`
            : ""
          }
          <button type="button" class="btn-danger" onclick="deleteReservation(${res.id})">Supprimer</button>
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

/* ================= MISES A JOUR CIBLEES DU DOM ================= */

function removeAdminRow(id) {
  const row = document.querySelector(`#adminTable tbody tr[data-id="${id}"]`);
  if (row) row.remove();
}

function updateAdminRowStatus(id, newStatus) {
  const row = document.querySelector(`#adminTable tbody tr[data-id="${id}"]`);
  if (!row) return;
  const s = newStatus.toLowerCase();
  // Colonne statut (index 6)
  row.cells[6].innerHTML = getStatusBadge(newStatus);
  // Colonne actions (index 7)
  row.cells[7].querySelector(".action-buttons").innerHTML = `
    ${s === "pending"
      ? `<button type="button" class="btn-confirm" onclick="confirmReservation(${id})">Confirmer</button>`
      : ""}
    <button type="button" class="btn-danger" onclick="deleteReservation(${id})">Supprimer</button>
  `;
}

function updateClientRowStatus(id, newStatus) {
  const row = document.querySelector(`#myReservationsTable tbody tr[data-id="${id}"]`);
  if (!row) return;
  const isCancelled = newStatus.toLowerCase() === "cancelled";
  // Colonne statut (index 4)
  row.cells[4].innerHTML = getStatusBadge(newStatus);
  // Colonne action (index 6)
  row.cells[6].innerHTML = isCancelled
    ? `<span style="color:#94a3b8;">—</span>`
    : `<button type="button" class="btn-cancel" onclick="cancelReservation(${id})">Annuler</button>`;
  // Mettre a jour le compteur si annulation
  if (isCancelled) {
    const counter = document.getElementById("clientTotalReservations");
    if (counter) counter.textContent = Math.max(0, parseInt(counter.textContent) - 1);
  }
}

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
    row.dataset.id = r.id;
    const isCancelled = (r.status || "").toLowerCase() === "cancelled";

    row.innerHTML = `
      <td>${r.id}</td>
      <td>${formatDate(r.date)}</td>
      <td>${r.time}</td>
      <td>${r.guests}</td>
      <td>${getStatusBadge(r.status)}</td>
      <td>${r.table_number ?? "—"}</td>
      <td>
        ${!isCancelled
          ? `<button type="button" class="btn-cancel" onclick="cancelReservation(${r.id})">Annuler</button>`
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
