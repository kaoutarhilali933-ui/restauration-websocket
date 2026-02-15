function Table(id, capacity) {
  this.id = id;
  this.capacity = capacity;
  this.status = "available";
}

Table.prototype.reserve = function () {
  if (this.status === "available") {
    this.status = "reserved";
    return true;
  }
  return false;
};

Table.prototype.release = function () {
  this.status = "available";
};

Table.prototype.isAvailable = function () {
  return this.status === "available";
};

module.exports = Table;
