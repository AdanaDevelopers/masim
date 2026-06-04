require('dotenv').config();

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./masim');
const migrate = require('./migrate');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
migrate(db);

const passwordHash = bcrypt.hashSync('Admin123!', 10);
db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run('Administrador Masim', 'admin@masim.local', passwordHash, 'administrador');

const mechanicHash = bcrypt.hashSync('Mecanico123!', 10);
db.prepare(`
  INSERT OR IGNORE INTO users (name, email, password_hash, role)
  VALUES (?, ?, ?, ?)
`).run('Mecanico Demo', 'mecanico@masim.local', mechanicHash, 'mecanico');

const seedCatalog = db.prepare(`
  INSERT OR IGNORE INTO catalog (id, description, type, public_price, internal_cost)
  VALUES (?, ?, ?, ?, ?)
`);

seedCatalog.run(1, 'Diagnostico general', 'mano_obra', 450, 0);
seedCatalog.run(2, 'Cambio de aceite', 'mano_obra', 350, 0);
seedCatalog.run(3, 'Aceite sintetico 5W-30', 'refaccion', 250, 160);
seedCatalog.run(4, 'Filtro de aceite', 'refaccion', 180, 95);
seedCatalog.run(5, 'Revision de frenos', 'mano_obra', 500, 0);

console.log('Base de datos inicializada en data/masim.db');
