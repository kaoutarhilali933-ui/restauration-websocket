const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "database.sqlite");

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error("❌ SQLite error:", err.message);
  else console.log("✅ SQLite connected");
});

// Helper Promises
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDb() {
  await run(`PRAGMA foreign_keys = ON;`);

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('client','admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER UNIQUE NOT NULL,
      seats INTEGER NOT NULL
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      table_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      guests INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(table_id) REFERENCES tables(id) ON DELETE CASCADE
    );
  `);

  console.log("✅ Tables created");
}

/* ---------------- FUNCTIONS ---------------- */

async function createUser({ email, password, role = "client" }) {
  const result = await run(
    `INSERT INTO users (email, password, role) VALUES (?, ?, ?)`,
    [email, password, role]
  );
  return { id: result.lastID };
}

async function getUserByEmail(email) {
  return await get(`SELECT * FROM users WHERE email = ?`, [email]);
}

async function saveReservation({ user_id, table_id, date, time, guests }) {
  const result = await run(
    `INSERT INTO reservations (user_id, table_id, date, time, guests)
     VALUES (?, ?, ?, ?, ?)`,
    [user_id, table_id, date, time, guests]
  );
  return { id: result.lastID };
}

async function getReservations() {
  return await all(`
    SELECT r.*, u.email, t.number as table_number
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    JOIN tables t ON t.id = r.table_id
    ORDER BY r.created_at DESC
  `);
}

module.exports = {
  initDb,
  createUser,
  getUserByEmail,
  saveReservation,
  getReservations
};