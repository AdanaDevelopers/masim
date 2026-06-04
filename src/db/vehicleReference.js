const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.OPEN_VEHICLE_DB_PATH || './data/open_vehicle.db';
const db = new Database(path.resolve(process.cwd(), dbPath), { readonly: true, fileMustExist: true });

module.exports = db;
