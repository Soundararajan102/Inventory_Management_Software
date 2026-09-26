use tauri_plugin_sql::{Migration, MigrationKind};


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "create_initial_tables",
      sql: "
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        description TEXT,
        category_id INTEGER,
        brand_id INTEGER,
        price REAL NOT NULL,
        gst_rate REAL DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_info TEXT,
        balance REAL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        balance REAL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        tax_amount REAL NOT NULL,
        net_amount REAL NOT NULL,
        payment_method TEXT
      );
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        tax REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "add_product_fields",
      sql: "
      ALTER TABLE products RENAME COLUMN price TO selling_price;
      ALTER TABLE products ADD COLUMN model TEXT;
      ALTER TABLE products ADD COLUMN hsn_code TEXT;
      ALTER TABLE products ADD COLUMN purchase_price REAL DEFAULT 0;
      ALTER TABLE products ADD COLUMN mrp REAL DEFAULT 0;
      ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'Piece';
      ALTER TABLE products ADD COLUMN min_stock INTEGER DEFAULT 0;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "add_contact_fields",
      sql: "
      ALTER TABLE customers ADD COLUMN address TEXT;
      ALTER TABLE customers ADD COLUMN gstin TEXT;
      ALTER TABLE suppliers ADD COLUMN phone TEXT;
      ALTER TABLE suppliers ADD COLUMN email TEXT;
      ALTER TABLE suppliers ADD COLUMN address TEXT;
      ALTER TABLE suppliers ADD COLUMN gstin TEXT;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "add_purchases",
      sql: "
      CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        invoice_number TEXT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        tax_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        net_amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT
      );
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_rate REAL NOT NULL,
        tax REAL DEFAULT 0
      );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "add_payments",
      sql: "
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- 'customer' or 'supplier'
        entity_id INTEGER NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        amount REAL NOT NULL,
        payment_mode TEXT NOT NULL,
        reference_no TEXT,
        notes TEXT
      );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "add_expenses_and_returns",
      sql: "
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      );
      CREATE TABLE IF NOT EXISTS returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL, -- 'customer' or 'supplier'
        entity_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        amount REAL NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        reason TEXT
      );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 7,
      description: "add_users_table",
      sql: "
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        role TEXT NOT NULL
      );
      -- Insert default Admin user
      INSERT OR IGNORE INTO users (username, pin, role) VALUES ('Admin', '1234', 'admin');
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 8,
      description: "add_permissions_to_users",
      sql: "
      ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT '[]';
      UPDATE users SET permissions = '[\"/\",\"/pos\",\"/purchases\",\"/payments\",\"/expenses\",\"/returns\",\"/reports\",\"/inventory\",\"/contacts\",\"/staff\",\"/settings\"]' WHERE role = 'admin';
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 9,
      description: "add_sales_status_fields",
      sql: "
      ALTER TABLE sales ADD COLUMN discount REAL DEFAULT 0;
      ALTER TABLE sales ADD COLUMN paid_amount REAL DEFAULT 0;
      ALTER TABLE sales ADD COLUMN status TEXT DEFAULT 'Paid';
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 10,
      description: "add_settings_table",
      sql: "
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 11,
      description: "add_unit_to_items",
      sql: "
      ALTER TABLE sale_items ADD COLUMN unit TEXT DEFAULT 'Piece';
      UPDATE sale_items SET unit = (SELECT unit FROM products WHERE products.id = sale_items.product_id);
      ALTER TABLE purchase_items ADD COLUMN unit TEXT DEFAULT 'Piece';
      UPDATE purchase_items SET unit = (SELECT unit FROM products WHERE products.id = purchase_items.product_id);
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 12,
      description: "add_variants",
      sql: "
      ALTER TABLE products ADD COLUMN parent_id INTEGER;
      ALTER TABLE products ADD COLUMN is_group BOOLEAN DEFAULT 0;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 13,
      description: "add_sales_invoice_number",
      sql: "
      ALTER TABLE sales ADD COLUMN invoice_number TEXT;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 14,
      description: "add_returns_transaction_id",
      sql: "
      ALTER TABLE returns ADD COLUMN transaction_id INTEGER;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 15,
      description: "add_gst_percentage_to_products",
      sql: "
      ALTER TABLE products ADD COLUMN gst_percentage REAL DEFAULT 18.0;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 16,
      description: "add_cgst_sgst_to_products",
      sql: "
      ALTER TABLE products ADD COLUMN cgst_percentage REAL DEFAULT 9.0;
      ALTER TABLE products ADD COLUMN sgst_percentage REAL DEFAULT 9.0;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 17,
      description: "add_snapshots_to_transactions",
      sql: "
      ALTER TABLE sales ADD COLUMN customer_snapshot TEXT;
      ALTER TABLE sale_items ADD COLUMN product_snapshot TEXT;
      ALTER TABLE purchases ADD COLUMN supplier_snapshot TEXT;
      ALTER TABLE purchase_items ADD COLUMN product_snapshot TEXT;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 18,
      description: "add_group_name_to_products",
      sql: "
      ALTER TABLE products ADD COLUMN group_name TEXT DEFAULT '';
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 19,
      description: "add_groups_and_brands_tables",
      sql: "
      CREATE TABLE IF NOT EXISTS item_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      ALTER TABLE products ADD COLUMN group_id INTEGER;
      ALTER TABLE products ADD COLUMN brand_id INTEGER;
      ",
      kind: MigrationKind::Up,
    }
  ];

  tauri::Builder::default()
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_sql::Builder::default()
      .add_migrations("sqlite:inventory.db", migrations)
      .build())
    .invoke_handler(tauri::generate_handler![])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
