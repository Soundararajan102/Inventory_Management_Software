use std::fs::File;
use std::io::{Read, Write, Seek, SeekFrom};
use tauri::Manager;
use serde::{Serialize, Deserialize};
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Serialize, Deserialize)]
pub struct BackupSummary {
    pub file_count: u32,
    pub total_bytes: u64,
}

#[derive(Serialize, Deserialize)]
pub struct RestoreResult {
    pub is_full_backup: bool,
    pub metadata_json: String,
    pub restored_files: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ClockCheckResult {
    pub is_tampered: bool,
    pub current_timestamp_secs: u64,
    pub max_file_timestamp_secs: u64,
    pub detected_file: String,
}

#[tauri::command]
fn check_system_clock_tamper() -> Result<ClockCheckResult, String> {
    let now = std::time::SystemTime::now();
    let current_secs = now
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut max_modified_secs = 0u64;
    let mut candidate_file = String::new();

    #[cfg(target_os = "windows")]
    {
        let mut paths_to_check: Vec<std::path::PathBuf> = Vec::new();

        if let Ok(system_root) = std::env::var("SystemRoot") {
            paths_to_check.push(std::path::Path::new(&system_root).join("System32\\winevt\\Logs\\System.evtx"));
            paths_to_check.push(std::path::Path::new(&system_root).join("System32\\winevt\\Logs\\Application.evtx"));
        } else {
            paths_to_check.push(std::path::PathBuf::from("C:\\Windows\\System32\\winevt\\Logs\\System.evtx"));
        }

        if let Ok(app_data) = std::env::var("APPDATA") {
            paths_to_check.push(std::path::Path::new(&app_data).join("Microsoft\\Windows\\Recent"));
        }

        for p in paths_to_check {
            if p.exists() {
                if let Ok(metadata) = std::fs::metadata(&p) {
                    if let Ok(mod_time) = metadata.modified() {
                        if let Ok(d) = mod_time.duration_since(std::time::UNIX_EPOCH) {
                            let secs = d.as_secs();
                            if secs > max_modified_secs {
                                max_modified_secs = secs;
                                candidate_file = p.to_string_lossy().to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    // Leeway of 15 minutes (900 seconds) for minor timezone adjustments or NTP sync
    let is_tampered = if max_modified_secs > 0 {
        current_secs + 900 < max_modified_secs
    } else {
        false
    };

    Ok(ClockCheckResult {
        is_tampered,
        current_timestamp_secs: current_secs,
        max_file_timestamp_secs: max_modified_secs,
        detected_file: candidate_file,
    })
}

const BACKUP_MAGIC: &[u8; 8] = b"EHBAK01\0";
const SQLITE_MAGIC: &[u8; 16] = b"SQLite format 3\0";

#[tauri::command]
fn backup_all_companies(
    app: tauri::AppHandle,
    target_path: String,
    metadata_json: String,
    db_files: Vec<String>,
) -> Result<BackupSummary, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut file = File::create(&target_path).map_err(|e| format!("Failed to create backup file at {}: {}", target_path, e))?;

    file.write_all(BACKUP_MAGIC).map_err(|e| e.to_string())?;

    let meta_bytes = metadata_json.as_bytes();
    let meta_len = meta_bytes.len() as u32;
    file.write_all(&meta_len.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(meta_bytes).map_err(|e| e.to_string())?;

    let mut valid_files: Vec<(String, Vec<u8>)> = Vec::new();
    let mut total_bytes = 0u64;

    for db_name in &db_files {
        let clean_name = db_name.trim();
        if clean_name.is_empty() {
            continue;
        }
        let full_path = app_data_dir.join(clean_name);
        if full_path.exists() {
            let data = std::fs::read(&full_path).map_err(|e| format!("Failed to read {}: {}", clean_name, e))?;
            total_bytes += data.len() as u64;
            valid_files.push((clean_name.to_string(), data));
        }
    }

    let num_files = valid_files.len() as u32;
    file.write_all(&num_files.to_le_bytes()).map_err(|e| e.to_string())?;

    let mut file_count = 0u32;
    for (name, data) in valid_files {
        let name_bytes = name.as_bytes();
        let name_len = name_bytes.len() as u16;
        file.write_all(&name_len.to_le_bytes()).map_err(|e| e.to_string())?;
        file.write_all(name_bytes).map_err(|e| e.to_string())?;

        let data_len = data.len() as u64;
        file.write_all(&data_len.to_le_bytes()).map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file_count += 1;
    }

    file.flush().map_err(|e| e.to_string())?;
    Ok(BackupSummary {
        file_count,
        total_bytes,
    })
}

#[tauri::command]
fn backup_single_company(
    app: tauri::AppHandle,
    source_db_name: String,
    target_path: String,
) -> Result<u64, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let clean_name = source_db_name.replace("sqlite:", "");
    let source_path = app_data_dir.join(&clean_name);
    if !source_path.exists() {
        return Err(format!("Database file {} does not exist yet.", clean_name));
    }
    let bytes = std::fs::copy(&source_path, &target_path)
        .map_err(|e| format!("Failed to copy database: {}", e))?;
    Ok(bytes)
}

#[tauri::command]
fn restore_backup(
    app: tauri::AppHandle,
    backup_path: String,
    active_db_name: String,
) -> Result<RestoreResult, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;

    let mut file = File::open(&backup_path).map_err(|e| format!("Failed to open backup file: {}", e))?;

    let mut header_buf = [0u8; 16];
    let bytes_read = file.read(&mut header_buf).map_err(|e| e.to_string())?;

    if bytes_read >= 8 && &header_buf[0..8] == BACKUP_MAGIC {
        // Rewind to offset 8 (right after BACKUP_MAGIC)
        file.seek(SeekFrom::Start(8)).map_err(|e| e.to_string())?;

        let mut meta_len_buf = [0u8; 4];
        file.read_exact(&mut meta_len_buf).map_err(|e| e.to_string())?;
        let meta_len = u32::from_le_bytes(meta_len_buf) as usize;

        let mut meta_buf = vec![0u8; meta_len];
        file.read_exact(&mut meta_buf).map_err(|e| e.to_string())?;
        let metadata_json = String::from_utf8(meta_buf).map_err(|e| format!("Invalid metadata encoding: {}", e))?;

        let mut num_files_buf = [0u8; 4];
        file.read_exact(&mut num_files_buf).map_err(|e| e.to_string())?;
        let num_files = u32::from_le_bytes(num_files_buf);

        let mut restored_files = Vec::new();

        for _ in 0..num_files {
            let mut name_len_buf = [0u8; 2];
            file.read_exact(&mut name_len_buf).map_err(|e| e.to_string())?;
            let name_len = u16::from_le_bytes(name_len_buf) as usize;

            let mut name_buf = vec![0u8; name_len];
            file.read_exact(&mut name_buf).map_err(|e| e.to_string())?;
            let filename = String::from_utf8(name_buf).map_err(|e| format!("Invalid filename in backup: {}", e))?;

            let mut data_len_buf = [0u8; 8];
            file.read_exact(&mut data_len_buf).map_err(|e| e.to_string())?;
            let data_len = u64::from_le_bytes(data_len_buf) as usize;

            let mut data = vec![0u8; data_len];
            file.read_exact(&mut data).map_err(|e| e.to_string())?;

            let target_file_path = app_data_dir.join(&filename);

            // Clean up any stale WAL and SHM journal files before writing the restored DB
            let wal_path = app_data_dir.join(format!("{}-wal", filename));
            let shm_path = app_data_dir.join(format!("{}-shm", filename));
            let _ = std::fs::remove_file(wal_path);
            let _ = std::fs::remove_file(shm_path);

            std::fs::write(&target_file_path, &data).map_err(|e| format!("Failed to write restored file {}: {}", filename, e))?;
            restored_files.push(filename);
        }

        Ok(RestoreResult {
            is_full_backup: true,
            metadata_json,
            restored_files,
        })
    } else if bytes_read >= 16 && &header_buf[0..16] == SQLITE_MAGIC {
        drop(file);
        let clean_active_name = if active_db_name.trim().is_empty() {
            "inventory.db".to_string()
        } else {
            active_db_name.replace("sqlite:", "")
        };
        let target_path = app_data_dir.join(&clean_active_name);

        let wal_path = app_data_dir.join(format!("{}-wal", clean_active_name));
        let shm_path = app_data_dir.join(format!("{}-shm", clean_active_name));
        let _ = std::fs::remove_file(wal_path);
        let _ = std::fs::remove_file(shm_path);

        std::fs::copy(&backup_path, &target_path)
            .map_err(|e| format!("Failed to copy database file: {}", e))?;

        Ok(RestoreResult {
            is_full_backup: false,
            metadata_json: String::new(),
            restored_files: vec![clean_active_name],
        })
    } else {
        Err("Invalid backup file: Not a recognized Electro Hub backup archive (.ehbak) or SQLite database (.db).".to_string())
    }
}



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
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 20,
      description: "add_supplier_invoice_date",
      sql: "
      ALTER TABLE purchases ADD COLUMN supplier_invoice_date TEXT;
      ",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 21,
      description: "add_warehouse_system",
      sql: "
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        location TEXT,
        phone TEXT,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS warehouse_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 0,
        UNIQUE(warehouse_id, product_id)
      );
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        from_location_type TEXT NOT NULL,
        from_location_id INTEGER DEFAULT 0,
        from_location_name TEXT NOT NULL,
        to_location_type TEXT NOT NULL,
        to_location_id INTEGER DEFAULT 0,
        to_location_name TEXT NOT NULL,
        product_id INTEGER NOT NULL REFERENCES products(id),
        quantity INTEGER NOT NULL,
        notes TEXT
      );
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
    .invoke_handler(tauri::generate_handler![
      backup_all_companies,
      backup_single_company,
      restore_backup,
      check_system_clock_tamper
    ])
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
