CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('administrador', 'mecanico', 'personalizado')),
  permissions TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_type TEXT NOT NULL DEFAULT 'particular' CHECK (customer_type IN ('empresa', 'particular')),
  contact_name TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  rfc TEXT,
  postal_code TEXT,
  tax_regime TEXT,
  cfdi_use TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  vin TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  trim TEXT,
  vehicle_type TEXT,
  plates TEXT,
  mileage INTEGER,
  economic_number TEXT,
  open_vehicle_make_id INTEGER,
  open_vehicle_model_id INTEGER,
  open_vehicle_style_id INTEGER,
  nhtsa_raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mano_obra', 'refaccion')),
  public_price REAL NOT NULL DEFAULT 0,
  internal_cost REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT NOT NULL UNIQUE,
  customer_id INTEGER NOT NULL,
  vehicle_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('recepcion', 'cotizacion_borrador', 'esperando_aprobacion', 'ot_activa', 'trabajo_finalizado', 'cerrada')),
  symptom TEXT,
  reception_inventory TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'none' CHECK (discount_type IN ('none', 'amount', 'percent')),
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  adjustment_note TEXT,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0.16,
  currency TEXT NOT NULL DEFAULT 'MXN',
  entry_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_date TEXT,
  created_by INTEGER,
  approved_at TEXT,
  manual_approved_by INTEGER,
  manual_approved_at TEXT,
  rejection_note TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (manual_approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL,
  item_id INTEGER,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mano_obra', 'refaccion')),
  quantity REAL NOT NULL DEFAULT 1,
  applied_price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES catalog(id)
);

CREATE TABLE IF NOT EXISTS mechanic_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL,
  mechanic_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (mechanic_id) REFERENCES users(id),
  UNIQUE (work_order_id, mechanic_id)
);

CREATE TABLE IF NOT EXISTS work_order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS work_order_supplements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL,
  folio_adicional TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('borrador', 'esperando_aprobacion', 'aprobado', 'rechazado', 'cancelado')),
  description TEXT,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0.16,
  created_by INTEGER,
  approved_at TEXT,
  rejected_at TEXT,
  rejection_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS work_order_supplement_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplement_id INTEGER NOT NULL,
  item_id INTEGER,
  description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('mano_obra', 'refaccion')),
  quantity REAL NOT NULL DEFAULT 1,
  applied_price REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (supplement_id) REFERENCES work_order_supplements(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES catalog(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_order_id INTEGER NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('efectivo', 'tarjeta', 'transferencia')),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MXN',
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (work_order_id) REFERENCES work_orders(id)
);

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
);

CREATE TABLE IF NOT EXISTS billing_issuer_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  rfc TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  fiscal_regime TEXT NOT NULL,
  expedition_place TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rfc TEXT NOT NULL UNIQUE,
  csd_expiration_date TEXT,
  upload_date TEXT,
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'eliminado')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS public_approval_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  target_type TEXT NOT NULL CHECK (target_type IN ('work_order', 'supplement')),
  target_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'aprobado', 'rechazado', 'expirado')) DEFAULT 'pendiente',
  decision_ip TEXT,
  rejection_note TEXT,
  decided_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  jid TEXT PRIMARY KEY,
  phone TEXT,
  push_name TEXT,
  profile_pic_url TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone ON whatsapp_contacts(phone);

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
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_vehicle ON maintenance_visits(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_status ON maintenance_visits(status);
CREATE INDEX IF NOT EXISTS idx_public_tokens_token ON public_approval_tokens(token);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_active_work_order ON invoices(work_order_id) WHERE status != 'cancelada';
CREATE INDEX IF NOT EXISTS idx_invoices_facturama_id ON invoices(facturama_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_jid ON whatsapp_messages(jid);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_customer ON whatsapp_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_created_at ON whatsapp_messages(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  section TEXT NOT NULL,
  description TEXT NOT NULL,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_section ON audit_logs(section);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
