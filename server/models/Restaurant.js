function Restaurant() {
  this.tables = [];
  this.reservations = [];
}

Restaurant.prototype.addTable = function (table) {
  this.tables.push(table);
};

Restaurant.prototype.findTableById = function (id) {
  return this.tables.find((table) => table.id === id);
};

Restaurant.prototype.makeReservation = function (reservation, table) {
  if (table.isAvailable()) {
    table.reserve();
    this.reservations.push(reservation);
    return true;
  }
  return false;
};

Restaurant.prototype.releaseTable = function (table) {

  // 1️⃣ Libérer la table
  table.release();

  // 2️⃣ Supprimer la réservation liée à cette table
  this.reservations = this.reservations.filter(
    (reservation) => reservation.tableId !== table.id
  );

};

Restaurant.prototype.getAvailableTables = function () {
  return this.tables.filter((table) => table.isAvailable());
};

// 🟩 Vérification créneau horaire
Restaurant.prototype.isTimeSlotAvailable = function (tableId, date, timeSlot) {

  return !this.reservations.some(
    (reservation) =>
      reservation.tableId === tableId &&
      reservation.date === date &&
      reservation.timeSlot === timeSlot
  );

};

module.exports = Restaurant;