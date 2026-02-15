const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "database.sqlite");

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error opening database:", err.message);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

// ===============================
// CREATE TABLES IF NOT EXISTS
// ===============================

db.serialize(() => {

  // USERS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);

  // TABLES TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY,
      capacity INTEGER NOT NULL,
      status TEXT NOT NULL
    )
  `);

  // RESERVATIONS TABLE
  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY,
      table_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      FOREIGN KEY (table_id) REFERENCES tables(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log("✅ Tables ensured in database");
});

// ===============================
// DATABASE FUNCTIONS
// ===============================

// CREATE USER
function createUser(email, password, role) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (email, password, role) VALUES (?, ?, ?)`,
      [email, password, role],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// GET USER BY EMAIL
function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM users WHERE email = ?`,
      [email],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

// SAVE RESERVATION
function saveReservation(reservation) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO reservations (id, table_id, user_id, date, time_slot)
       VALUES (?, ?, ?, ?, ?)`,
      [
        reservation.id,
        reservation.tableId,
        reservation.userId,
        reservation.date,
        reservation.timeSlot
      ],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

// GET ALL RESERVATIONS
function getReservations() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM reservations`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// ===============================
// EXPORT
// ===============================

module.exports = {
  db,
  createUser,
  getUserByEmail,
  saveReservation,
  getReservations
};