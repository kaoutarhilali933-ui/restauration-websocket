// server/database.js
const { run, get, all } = require("./db/dbClient");
const bcrypt = require("bcrypt");

// -------------------------
// INIT DB
// -------------------------
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
      id INTEGER PRIMARY KEY,
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

// -------------------------
// SEED TABLES
// -------------------------
async function seedTables() {
  await run(`INSERT OR IGNORE INTO tables (id, number, seats) VALUES (1, 1, 4)`);
  await run(`INSERT OR IGNORE INTO tables (id, number, seats) VALUES (2, 2, 2)`);
  await run(`INSERT OR IGNORE INTO tables (id, number, seats) VALUES (3, 3, 6)`);

  console.log("✅ Default tables inserted");
}

// -------------------------
// USERS
// -------------------------
async function createUser({ email, password, role = "client" }) {

  // 🔐 Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  const result = await run(
    `INSERT INTO users (email, password, role) VALUES (?, ?, ?)`,
    [email, hashedPassword, role]
  );

  return { id: result.lastID };
}

async function getUserByEmail(email) {
  return await get(`SELECT * FROM users WHERE email = ?`, [email]);
}

async function login(email, password) {

  const user = await get(
    `SELECT * FROM users WHERE email = ?`,
    [email]
  );

  if (!user) return null;

  // 🔐 Compare password
  const match = await bcrypt.compare(password, user.password);

  if (!match) return null;

  return user;
}

// -------------------------
// RESERVATIONS
// -------------------------
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

async function getReservationById(id) {
  return await get(
    `SELECT r.*, u.email, t.number as table_number
     FROM reservations r
     JOIN users u ON u.id = r.user_id
     JOIN tables t ON t.id = r.table_id
     WHERE r.id = ?`,
    [id]
  );
}

async function deleteReservationById(id) {
  await run(`DELETE FROM reservations WHERE id = ?`, [id]);
}

// -------------------------
// EXPORTS
// -------------------------
module.exports = {
  initDb,
  seedTables,

  createUser,
  getUserByEmail,
  login,

  saveReservation,
  getReservations,
  getReservationById,
  deleteReservationById
};