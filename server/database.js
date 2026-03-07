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
  const user = await get(`SELECT * FROM users WHERE email = ?`, [email]);
  if (!user) return null;

  const match = await bcrypt.compare(password, user.password);
  if (!match) return null;

  return user;
}

// -------------------------
// RESERVATIONS
// -------------------------
async function saveReservation({ user_id, table_id, date, time, guests }) {
  const result = await run(
    `INSERT INTO reservations (user_id, table_id, date, time, guests, status)
     VALUES (?, ?, ?, ?, ?, 'confirmed')`,
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
    `
    SELECT r.*, u.email, t.number as table_number
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    JOIN tables t ON t.id = r.table_id
    WHERE r.id = ?
    `,
    [id]
  );
}

async function deleteReservationById(id) {
  await run(`DELETE FROM reservations WHERE id = ?`, [id]);
}

// ✅ NEW: cancel reservation (client can cancel ONLY his own reservation)
async function cancelReservationById(reservationId, userId) {
  const res = await get(
    `SELECT id, table_id, user_id, status FROM reservations WHERE id = ? AND user_id = ?`,
    [reservationId, userId]
  );

  if (!res) return null; // not found or not owned by user

  await run(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`, [
    reservationId,
  ]);

  // return info useful for broadcast / UI
  return { id: reservationId, table_id: res.table_id, user_id: res.user_id };
}

// ✅ get reservations for connected client by user_id
async function getReservationsByUserId(userId) {
  return await all(
    `
    SELECT r.id, r.date, r.time, r.guests, r.status, t.number AS table_number
    FROM reservations r
    JOIN tables t ON t.id = r.table_id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC
    `,
    [userId]
  );
}

// optional: by email
async function getReservationsByUserEmail(email) {
  return await all(
    `
    SELECT r.id, r.date, r.time, r.guests, r.status, t.number AS table_number
    FROM reservations r
    JOIN tables t ON r.table_id = t.id
    JOIN users u ON r.user_id = u.id
    WHERE u.email = ?
    ORDER BY r.created_at DESC
    `,
    [email]
  );
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
  deleteReservationById,

  cancelReservationById, // ✅ NEW

  getReservationsByUserId, // ✅ REQUIRED for MY_RESERVATIONS
  getReservationsByUserEmail, // ✅ optional
};