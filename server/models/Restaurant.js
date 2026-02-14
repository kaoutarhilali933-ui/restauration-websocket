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
  table.release();
};

Restaurant.prototype.getAvailableTables = function () {
  return this.tables.filter((table) => table.isAvailable());
};

module.exports = Restaurant;