const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.MASIM_DB_PATH || './data/masim.db';
const db = new Database(path.resolve(process.cwd(), dbPath));

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

module.exports = db;
