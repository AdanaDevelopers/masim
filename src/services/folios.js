const db = require('../db/masim');

function nextWorkOrderFolio() {
  const id = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM work_orders').get().next;
  return `OT-${String(id).padStart(5, '0')}`;
}

module.exports = { nextWorkOrderFolio };
