function Reservation(id, tableId, userId, date, timeSlot) {
  this.id = id;
  this.tableId = tableId;
  this.userId = userId;
  this.date = date;
  this.timeSlot = timeSlot;
  this.status = "active";
}

Reservation.prototype.validate = function () {
  this.status = "validated";
};

Reservation.prototype.cancel = function () {
  this.status = "cancelled";
};

module.exports = Reservation;