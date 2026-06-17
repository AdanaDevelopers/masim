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
    CREATE TABLE IF NOT EXISTS whatsapp_contacts (
      jid TEXT PRIMARY KEY,
      phone TEXT,
      push_name TEXT,
      profile_pic_url TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone)').run();

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

function createUserSystemTables(db) {
  // Asegurar que las columnas existan antes de copiar los datos
  addColumn(db, 'users', 'username', 'TEXT');
  addColumn(db, 'users', 'permissions', 'TEXT');

  // Migración para soportar el rol 'personalizado' en el constraint de la tabla users
  const usersTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get()?.sql || '';
  if (usersTableSql && !usersTableSql.includes('personalizado')) {
    console.log('Migrando tabla users para soportar rol "personalizado"...');
    db.prepare('PRAGMA foreign_keys = OFF').run();
    try {
      db.transaction(() => {
        db.prepare('ALTER TABLE users RENAME TO users_old').run();
        db.prepare(`
          CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            username TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (role IN ('administrador', 'mecanico', 'personalizado')),
            permissions TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `).run();
        db.prepare(`
          INSERT INTO users (id, name, email, username, password_hash, role, permissions, created_at)
          SELECT id, name, email, username, password_hash, role, permissions, created_at FROM users_old
        `).run();
        db.prepare('DROP TABLE users_old').run();
      })();
    } finally {
      db.prepare('PRAGMA foreign_keys = ON').run();
    }
    console.log('Migración de tabla users completada con éxito.');
  }

  // Backfill username para usuarios existentes si no tienen
  db.prepare(`
    UPDATE users 
    SET username = LOWER(SUBSTR(email, 1, INSTR(email, '@') - 1)) 
    WHERE username IS NULL OR username = ''
  `).run();

  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)').run();

  db.prepare(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      section TEXT NOT NULL,
      description TEXT NOT NULL,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `).run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_section ON audit_logs(section)').run();
  db.prepare('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)').run();
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
  createUserSystemTables(db);
}

module.exports = migrate;
