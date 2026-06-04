function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function addColumn(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

function createMaintenanceVisits(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS maintenance_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      vehicle_id INTEGER NOT NULL,
      source_work_order_id INTEGER,
      scheduled_date TEXT,
      scheduled_mileage INTEGER,
      service_type TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'programada' CHECK (status IN ('programada', 'realizada', 'cancelada')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
      FOREIGN KEY (source_work_order_id) REFERENCES work_orders(id)
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_maintenance_visits_vehicle ON maintenance_visits(vehicle_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_maintenance_visits_status ON maintenance_visits(status)').run();
}

function createBillingTables(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS billing_issuer_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      rfc TEXT NOT NULL,
      legal_name TEXT NOT NULL,
      fiscal_regime TEXT NOT NULL,
      expedition_place TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS billing_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfc TEXT NOT NULL UNIQUE,
      csd_expiration_date TEXT,
      upload_date TEXT,
      status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'eliminado')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      work_order_id INTEGER NOT NULL,
      internal_folio TEXT NOT NULL UNIQUE,
      facturama_id TEXT,
      uuid TEXT,
      status TEXT NOT NULL DEFAULT 'timbrada' CHECK (status IN ('timbrada', 'cancelada', 'error')),
      serie TEXT,
      subtotal REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'MXN',
      request_json TEXT,
      response_json TEXT,
      error_message TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (work_order_id) REFERENCES work_orders(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `).run();
  db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_work_order ON invoices(work_order_id) WHERE status != 'cancelada'").run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_invoices_facturama_id ON invoices(facturama_id)').run();
}

function createWhatsappTables(db) {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      jid TEXT NOT NULL,
      phone TEXT,
      customer_id INTEGER,
      direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
      message_type TEXT NOT NULL DEFAULT 'text',
      body TEXT,
      baileys_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'sent', 'error')),
      error_message TEXT,
      created_by INTEGER,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `).run();
  addColumn(db, 'whatsapp_messages', 'read_at', 'TEXT');
  db.prepare('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_jid ON whatsapp_messages(jid)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer ON whatsapp_messages(customer_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at)').run();
}

function migrate(db) {
  addColumn(db, 'vehicles', 'economic_number', 'TEXT');
  addColumn(db, 'work_orders', 'discount_type', "TEXT NOT NULL DEFAULT 'none'");
  addColumn(db, 'work_orders', 'discount_value', 'REAL NOT NULL DEFAULT 0');
  addColumn(db, 'work_orders', 'discount_amount', 'REAL NOT NULL DEFAULT 0');
  addColumn(db, 'work_orders', 'adjustment_note', 'TEXT');
  addColumn(db, 'work_orders', 'manual_approved_by', 'INTEGER');
  addColumn(db, 'work_orders', 'manual_approved_at', 'TEXT');
  addColumn(db, 'work_orders', 'rejection_note', 'TEXT');
  addColumn(db, 'work_order_supplements', 'rejection_note', 'TEXT');
  addColumn(db, 'public_approval_tokens', 'rejection_note', 'TEXT');

  createMaintenanceVisits(db);
  createBillingTables(db);
  createWhatsappTables(db);
}

module.exports = migrate;
