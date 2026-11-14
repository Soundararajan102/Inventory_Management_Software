import Database from '@tauri-apps/plugin-sql';
import { invoke } from '@tauri-apps/api/core';
import { getActiveCompanyDbName, getActiveCompany } from './companies';

let currentDbUrl: string | null = null;
let dbInstance: Database | null = null;
let dbLoadPromise: Promise<Database> | null = null;

export function resetDbInstance() {
  dbInstance = null;
  dbLoadPromise = null;
  currentDbUrl = null;
}

export async function closeDbConnection(): Promise<void> {
  try {
    if (dbInstance) {
      await dbInstance.close();
    }
  } catch (e) {
    console.warn('Error closing database instance:', e);
  } finally {
    resetDbInstance();
  }
}

async function initDatabaseSchema(db: Database) {
  try {
    // 1. Core tables
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        description TEXT,
        category_id INTEGER,
        brand_id INTEGER,
        group_id INTEGER,
        model TEXT,
        hsn_code TEXT,
        purchase_price REAL DEFAULT 0,
        selling_price REAL NOT NULL,
        mrp REAL DEFAULT 0,
        unit TEXT DEFAULT 'Piece',
        min_stock INTEGER DEFAULT 0,
        gst_rate REAL DEFAULT 0,
        stock_quantity INTEGER DEFAULT 0
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS brands (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS item_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        contact_info TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        gstin TEXT,
        balance REAL DEFAULT 0,
        advance_balance REAL DEFAULT 0
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        gstin TEXT,
        balance REAL DEFAULT 0,
        advance_balance REAL DEFAULT 0
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        tax_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        net_amount REAL NOT NULL,
        paid_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'Paid',
        payment_method TEXT,
        invoice_number TEXT,
        customer_snapshot TEXT,
        source_type TEXT DEFAULT 'shop',
        source_warehouse_id INTEGER,
        dispatch_details TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sale_id INTEGER NOT NULL,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        tax REAL NOT NULL,
        item_source_type TEXT DEFAULT 'shop',
        item_warehouse_id INTEGER
      );
    `);
    await db.execute(`
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
        status TEXT DEFAULT 'Paid',
        destination_type TEXT DEFAULT 'shop',
        destination_warehouse_id INTEGER
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        purchase_rate REAL NOT NULL,
        tax REAL DEFAULT 0
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        amount REAL NOT NULL,
        payment_mode TEXT NOT NULL,
        reference_no TEXT,
        notes TEXT,
        cheque_no TEXT,
        bank_name TEXT,
        cheque_date TEXT,
        cheque_status TEXT DEFAULT 'cleared',
        is_advance INTEGER DEFAULT 0
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        description TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS returns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        amount REAL NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        reason TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_number TEXT UNIQUE,
        customer_id INTEGER,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        tax_amount REAL NOT NULL,
        discount REAL NOT NULL,
        net_amount REAL NOT NULL,
        status TEXT DEFAULT 'Pending',
        converted_sale_id INTEGER,
        converted_invoice_no TEXT,
        customer_snapshot TEXT,
        notes TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS quotation_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quotation_id INTEGER NOT NULL,
        product_id INTEGER,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        tax REAL NOT NULL,
        unit TEXT,
        product_snapshot TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        location TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS warehouse_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warehouse_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity INTEGER DEFAULT 0,
        UNIQUE(warehouse_id, product_id)
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_id INTEGER,
        dest_type TEXT NOT NULL,
        dest_id INTEGER,
        quantity INTEGER NOT NULL,
        date TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT DEFAULT '["/","/pos","/purchases","/payments","/expenses","/returns","/reports","/inventory","/contacts","/staff","/settings"]'
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Ensure machine license / activation expiry is carried over to this company database
    const storedExpiry = localStorage.getItem('activation_expiry');
    if (storedExpiry) {
      try {
        await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['activation_expiry', storedExpiry]);
      } catch (e) {}
    }

    // Ensure default Admin user exists in this database
    const activeComp = getActiveCompany();
    const adminPin = activeComp.adminPin || '1234';
    try {
      await db.execute(
        `INSERT OR IGNORE INTO users (username, pin, role, permissions) 
         VALUES ('Admin', $1, 'admin', '["/","/pos","/purchases","/payments","/expenses","/returns","/reports","/inventory","/contacts","/staff","/settings"]')`,
        [adminPin]
      );
    } catch (e) {}

    // Column additions if older tables exist without newer columns
    try { await db.execute('ALTER TABLE products ADD COLUMN group_id INTEGER'); } catch (e) {}
    try { await db.execute('ALTER TABLE products ADD COLUMN brand_id INTEGER'); } catch (e) {}
    try { await db.execute('ALTER TABLE payments ADD COLUMN cheque_no TEXT'); } catch (e) {}
    try { await db.execute('ALTER TABLE payments ADD COLUMN bank_name TEXT'); } catch (e) {}
    try { await db.execute('ALTER TABLE payments ADD COLUMN cheque_date TEXT'); } catch (e) {}
    try { await db.execute("ALTER TABLE payments ADD COLUMN cheque_status TEXT DEFAULT 'cleared'"); } catch (e) {}
    try { await db.execute("ALTER TABLE payments ADD COLUMN is_advance INTEGER DEFAULT 0"); } catch (e) {}
    try { await db.execute("ALTER TABLE purchases ADD COLUMN destination_type TEXT DEFAULT 'shop'"); } catch (e) {}
    try { await db.execute("ALTER TABLE purchases ADD COLUMN destination_warehouse_id INTEGER"); } catch (e) {}
    try { await db.execute("ALTER TABLE sales ADD COLUMN source_type TEXT DEFAULT 'shop'"); } catch (e) {}
    try { await db.execute("ALTER TABLE sales ADD COLUMN source_warehouse_id INTEGER"); } catch (e) {}
    try { await db.execute("ALTER TABLE sales ADD COLUMN dispatch_details TEXT"); } catch (e) {}
    try { await db.execute("ALTER TABLE customers ADD COLUMN advance_balance REAL DEFAULT 0"); } catch (e) {}
    try { await db.execute("ALTER TABLE suppliers ADD COLUMN advance_balance REAL DEFAULT 0"); } catch (e) {}
  } catch (e) {
    console.error("Error initializing database schema:", e);
  }
}

// Loads the active business / company SQLite database file
export async function getDb() {
  const activeDbUrl = getActiveCompanyDbName();
  if (dbInstance && currentDbUrl !== activeDbUrl) {
    resetDbInstance();
  }
  if (dbInstance) return dbInstance;
  if (!dbLoadPromise) {
    currentDbUrl = activeDbUrl;
    dbLoadPromise = Database.load(activeDbUrl).then(async (db) => {
      dbInstance = db;
      await initDatabaseSchema(db);
      return db;
    }).catch(err => {
      dbLoadPromise = null;
      currentDbUrl = null;
      throw err;
    });
  }
  return await dbLoadPromise;
}

export function getLocalTimestamp(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export interface ItemGroup {
  id: number;
  name: string;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  group_id: number | null;
  brand_id: number | null;
  group_name?: string;
  brand_name?: string;
  barcode: string | null;
  model: string | null;
  hsn_code: string | null;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  unit: string;
  min_stock: number;
  stock_quantity: number;
  parent_id: number | null;
  is_group: boolean;
  gst_percentage: number;
  cgst_percentage: number;
  sgst_percentage: number;
  shop_stock?: number;
  warehouse_stocks?: Record<number, number>;
  variants?: Product[];
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDb();
  return await db.select<Product[]>(`
    SELECT products.*, item_groups.name as group_name, brands.name as brand_name 
    FROM products 
    LEFT JOIN item_groups ON products.group_id = item_groups.id 
    LEFT JOIN brands ON products.brand_id = brands.id 
    WHERE products.is_group = 0 
    ORDER BY products.id DESC
  `);
}

export async function getSellableProducts(warehouseId?: number | null): Promise<Product[]> {
  const db = await getDb();
  const products = await db.select<Product[]>(`
    SELECT products.*, 
           products.stock_quantity as shop_stock,
           item_groups.name as group_name, 
           brands.name as brand_name 
    FROM products 
    LEFT JOIN item_groups ON products.group_id = item_groups.id 
    LEFT JOIN brands ON products.brand_id = brands.id 
    WHERE products.is_group = 0 
    ORDER BY products.id DESC
  `);

  try {
    const whItems = await db.select<{warehouse_id: number, product_id: number, quantity: number}[]>(`
      SELECT warehouse_id, product_id, quantity FROM warehouse_items
    `);

    const whMap: Record<number, Record<number, number>> = {};
    for (const wi of whItems) {
      if (!whMap[wi.product_id]) whMap[wi.product_id] = {};
      whMap[wi.product_id][wi.warehouse_id] = wi.quantity;
    }

    return products.map(p => {
      const stocks = whMap[p.id] || {};
      return {
        ...p,
        shop_stock: p.stock_quantity,
        warehouse_stocks: stocks,
        stock_quantity: warehouseId ? (stocks[warehouseId] || 0) : p.stock_quantity
      };
    });
  } catch (err) {
    console.error("Error loading warehouse_items for sellable products:", err);
    return products.map(p => ({
      ...p,
      shop_stock: p.stock_quantity,
      warehouse_stocks: {}
    }));
  }
}

export async function getItemGroups(): Promise<ItemGroup[]> {
  const db = await getDb();
  return await db.select<ItemGroup[]>('SELECT * FROM item_groups ORDER BY name ASC');
}

export async function addGroup(name: string) {
  const db = await getDb();
  await db.execute('INSERT INTO item_groups (name) VALUES ($1)', [name.trim()]);
}

export async function updateGroup(id: number, name: string) {
  const db = await getDb();
  await db.execute('UPDATE item_groups SET name = $1 WHERE id = $2', [name.trim(), id]);
}

export async function deleteGroup(id: number) {
  const db = await getDb();
  await db.execute('UPDATE products SET group_id = NULL WHERE group_id = $1', [id]);
  await db.execute('DELETE FROM item_groups WHERE id = $1', [id]);
}

export async function getBrands(): Promise<Brand[]> {
  const db = await getDb();
  return await db.select<Brand[]>('SELECT * FROM brands ORDER BY name ASC');
}

export async function addBrand(name: string) {
  const db = await getDb();
  await db.execute('INSERT INTO brands (name) VALUES ($1)', [name.trim()]);
}

export async function updateBrand(id: number, name: string) {
  const db = await getDb();
  await db.execute('UPDATE brands SET name = $1 WHERE id = $2', [name.trim(), id]);
}

export async function deleteBrand(id: number) {
  const db = await getDb();
  await db.execute('UPDATE products SET brand_id = NULL WHERE brand_id = $1', [id]);
  await db.execute('DELETE FROM brands WHERE id = $1', [id]);
}

export interface ProductBaseData {
  group_id: number | null;
  brand_id: number | null;
  barcode?: string | null;
  model: string;
  hsn_code: string;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  unit: string;
  min_stock: number;
  stock: number;
  gst_percentage: number;
  cgst_percentage: number;
  sgst_percentage: number;
}

// Removed ProductVariantData as variants are no longer needed

export async function addProduct(
  name: string, 
  baseData: ProductBaseData,
  warehouseId?: number | null
) {
  const db = await getDb();
  const shopStock = warehouseId ? 0 : baseData.stock;
  const res = await db.execute(
    `INSERT INTO products 
      (name, group_id, brand_id, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock_quantity, is_group, parent_id, gst_percentage, cgst_percentage, sgst_percentage) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, NULL, $13, $14, $15)`,
    [name, baseData.group_id, baseData.brand_id, baseData.barcode || null, baseData.model, baseData.hsn_code, baseData.purchase_price, baseData.selling_price, baseData.mrp, baseData.unit, baseData.min_stock, shopStock, baseData.gst_percentage, baseData.cgst_percentage, baseData.sgst_percentage]
  );

  if (warehouseId && baseData.stock > 0) {
    const newProductId = res.lastInsertId || 0;
    if (newProductId > 0) {
      await addStockDirectlyToWarehouse(warehouseId, newProductId, baseData.stock, 'Initial Product Stock');
    }
  }
}

export async function updateProduct(
  id: number,
  name: string, 
  group_id: number | null,
  brand_id: number | null,
  barcode: string | null | undefined, 
  model: string,
  hsn_code: string,
  purchase_price: number,
  selling_price: number,
  mrp: number,
  unit: string,
  min_stock: number,
  stock: number,
  gst_percentage: number,
  cgst_percentage: number,
  sgst_percentage: number
) {
  const db = await getDb();
  await db.execute(
    `UPDATE products SET 
      name = $1, group_id = $2, brand_id = $3, barcode = $4, model = $5, hsn_code = $6, purchase_price = $7, selling_price = $8, mrp = $9, unit = $10, min_stock = $11, stock_quantity = $12, gst_percentage = $13, cgst_percentage = $14, sgst_percentage = $15 
     WHERE id = $16`,
    [name, group_id, brand_id, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock, gst_percentage, cgst_percentage, sgst_percentage, id]
  );
}

export async function deleteProduct(id: number): Promise<void> {
  const db = await getDb();
  
  // 1. Check if product is recorded in any sales bills
  const salesRes = await db.select<{count: number}[]>(
    'SELECT COUNT(*) as count FROM sale_items WHERE product_id = $1',
    [id]
  );
  if (salesRes[0]?.count > 0) {
    throw new Error(`Cannot delete product because it is recorded in ${salesRes[0].count} sales bill(s). To maintain accurate sales history, edit the product or adjust its stock to 0.`);
  }

  // 2. Check if product is recorded in any purchase bills
  const purchRes = await db.select<{count: number}[]>(
    'SELECT COUNT(*) as count FROM purchase_items WHERE product_id = $1',
    [id]
  );
  if (purchRes[0]?.count > 0) {
    throw new Error(`Cannot delete product because it is recorded in ${purchRes[0].count} purchase bill(s). To maintain accurate purchase history, edit the product or adjust its stock to 0.`);
  }

  // 3. Check if warehouse has remaining stock
  const whRes = await db.select<{total: number}[]>(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM warehouse_items WHERE product_id = $1',
    [id]
  );
  if (whRes[0]?.total > 0) {
    throw new Error(`Cannot delete product because it has ${whRes[0].total} units stored in Godown / Warehouses. Please transfer or clear the warehouse stock first.`);
  }

  // Clean up any empty warehouse items entries
  await db.execute('DELETE FROM warehouse_items WHERE product_id = $1', [id]);
  // Clean up stock movements referencing this product
  await db.execute('DELETE FROM stock_movements WHERE product_id = $1', [id]);
  // Delete the product
  await db.execute('DELETE FROM products WHERE id = $1', [id]);
}

export interface CartItem extends Product {
  cart_qty: number;
  item_source_type?: 'shop' | 'warehouse';
  item_warehouse_id?: number | null;
  item_warehouse_name?: string;
  cart_key?: string;
}

export interface DispatchDetails {
  ewayBillNo?: string;
  dispatchDocNo?: string;
  dispatchedThrough?: string;
  destination?: string;
  carrierName?: string;
  billOfLadingNo?: string;
  motorVehicleNo?: string;
  termsOfDelivery?: string;
}

export async function recordSale(
  cart: CartItem[],
  totalAmount: number,
  taxAmount: number,
  discountAmount: number,
  netAmount: number,
  paidAmount: number,
  paymentMethod: string = 'Cash',
  customerId: number | null = null,
  chequeNo?: string | null,
  bankName?: string | null,
  chequeDate?: string | null,
  sourceType: 'shop' | 'warehouse' = 'shop',
  sourceWarehouseId: number | null = null,
  saleDate?: string | null,
  dispatchDetails?: DispatchDetails | null,
  taxMethodOverride?: 'exclusive' | 'inclusive'
) {
  const db = await getDb();
  
  let finalSaleDate: string | null = null;
  if (saleDate && saleDate.trim()) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    finalSaleDate = saleDate.includes(' ') || saleDate.includes('T') ? saleDate : `${saleDate.trim()} ${timeStr}`;
  } else {
    finalSaleDate = getLocalTimestamp();
  }

  const isCheque = paymentMethod.toLowerCase() === 'cheque';
  const isPDC = isCheque && isPdcDate(chequeDate);
  const effectivePaidAmount = isPDC ? 0 : paidAmount;

  let status = 'Unpaid';
  if (effectivePaidAmount >= netAmount - 0.01) status = 'Paid';
  else if (effectivePaidAmount > 0) status = 'Partial';
  
  // Note: tauri-plugin-sql handles queries asynchronously.
  // We insert the sale, get the ID, then insert items and update stock.
  
  let customerSnapshot = null;
  if (customerId !== null) {
    const custRes = await db.select<any[]>('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.length > 0) customerSnapshot = JSON.stringify(custRes[0]);
  }

  const dispatchDetailsJson = dispatchDetails ? JSON.stringify(dispatchDetails) : null;
  const saleResult = await db.execute(
    `INSERT INTO sales (customer_id, date, total_amount, tax_amount, discount, net_amount, paid_amount, status, payment_method, customer_snapshot, source_type, source_warehouse_id, dispatch_details) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [customerId, finalSaleDate, totalAmount, taxAmount, discountAmount, netAmount, effectivePaidAmount, status, paymentMethod, customerSnapshot, sourceType, sourceWarehouseId, dispatchDetailsJson]
  );
  
  const saleId = Number(saleResult.lastInsertId) || (await db.select<{id: number}[]>('SELECT id FROM sales ORDER BY id DESC LIMIT 1'))[0]?.id || 0;
  const saleDateObj = finalSaleDate ? new Date(finalSaleDate.replace(' ', 'T')) : new Date();
  const invoiceNumber = generateAndIncrementInvoiceNumber(saleId, isNaN(saleDateObj.getTime()) ? new Date() : saleDateObj);
  await db.execute(`UPDATE sales SET invoice_number = $1 WHERE id = $2`, [invoiceNumber, saleId]);
  
  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = taxMethodOverride || localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

  for (const item of cart) {
    const originalItemPrice = item.selling_price * item.cart_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    let taxableValue = discountedItemPrice;
    if (taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    const itemTax = taxableValue * ((item.gst_percentage || 0) / 100);
    
    const itemSrcType = item.item_source_type || (sourceType === 'warehouse' ? 'warehouse' : 'shop');
    const itemWhId = item.item_warehouse_id || (itemSrcType === 'warehouse' ? sourceWarehouseId : null);
    let itemWhName = item.item_warehouse_name;
    if (itemSrcType === 'warehouse' && itemWhId && !itemWhName) {
      const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [itemWhId]);
      if (whRes.length > 0) itemWhName = whRes[0].name;
    }

    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage,
      source_type: itemSrcType,
      source_warehouse_id: itemWhId,
      source_warehouse_name: itemWhName || (itemSrcType === 'shop' ? 'Main Shop' : 'Godown')
    });

    // Insert into sale_items
    await db.execute(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit, productSnapshot]
    );
    
    if (itemSrcType === 'warehouse' && itemWhId) {
      // Decrement stock in warehouse_items
      await db.execute(
        `UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3`,
        [item.cart_qty, itemWhId, item.id]
      );
      // Record stock movement
      await db.execute(
        `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ('warehouse', $1, $2, 'shop', 0, 'Customer Sale', $3, $4, $5)`,
        [itemWhId, itemWhName || 'Godown', item.id, item.cart_qty, `Sale Invoice #${invoiceNumber}`]
      );
    } else {
      // Decrement stock in products table (Shop Storage)
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [item.cart_qty, item.id]
      );
    }
  }

  // Record payment and update customer balance without automatically consuming advance credit
  if (customerId !== null) {
    if (paidAmount > 0) {
      await recordPayment(
        'customer', 
        customerId, 
        paidAmount, 
        paymentMethod, 
        invoiceNumber, 
        'Initial Payment at POS',
        chequeNo,
        bankName,
        chequeDate,
        finalSaleDate,
        saleId
      );
    }

    // Re-sync customer balance to the exact total of unpaid invoice dues
    await db.execute(
      `UPDATE customers SET balance = (
        SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
        FROM sales 
        WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
      ) WHERE id = $1`,
      [customerId]
    );
  } else if (paidAmount > 0) {
    // Record walk-in customer payment so cash drawer and payment history include it
    await recordPayment(
      'customer', 
      0, 
      paidAmount, 
      paymentMethod, 
      invoiceNumber, 
      'Walk-in Customer Sale',
      chequeNo,
      bankName,
      chequeDate,
      finalSaleDate
    );
  }
  
  return { invoiceNumber, saleId };
}

export type BillYearFormat = '2digit' | '4digit' | 'fy_short' | 'fy_long' | 'none';

export interface BillFormatSettings {
  prefix: string;
  quotationPrefix: string;
  yearFormat: BillYearFormat;
  separator: string;
  padding: number;
  nextNumber?: number;
  quotationNextNumber?: number;
}

export function getFinancialYear(date: Date = new Date()): { short: string; long: string } {
  const month = date.getMonth(); // 0-11 (0=Jan, 3=Apr)
  const fullYear = date.getFullYear();
  let startYear = fullYear;
  if (month < 3) {
    startYear = fullYear - 1;
  }
  const endYear = startYear + 1;
  const startShort = startYear.toString().slice(-2);
  const endShort = endYear.toString().slice(-2);
  return {
    short: `${startShort}-${endShort}`,     // e.g. "26-27"
    long: `${startYear}-${endShort}`        // e.g. "2026-27"
  };
}

export function getBillFormatSettings(): BillFormatSettings {
  const savedNext = localStorage.getItem('billNextNumber');
  const parsedNext = savedNext !== null && savedNext !== '' && !isNaN(Number(savedNext)) ? Number(savedNext) : undefined;
  
  const savedQuotNext = localStorage.getItem('quotationNextNumber');
  const parsedQuotNext = savedQuotNext !== null && savedQuotNext !== '' && !isNaN(Number(savedQuotNext)) ? Number(savedQuotNext) : undefined;

  return {
    prefix: localStorage.getItem('billPrefix') ?? '',
    quotationPrefix: localStorage.getItem('billQuotationPrefix') ?? 'QT',
    yearFormat: (localStorage.getItem('billYearFormat') as BillYearFormat) || '2digit',
    separator: localStorage.getItem('billSeparator') ?? '-',
    padding: Number(localStorage.getItem('billPadding') || 0),
    nextNumber: parsedNext,
    quotationNextNumber: parsedQuotNext
  };
}

export function formatCustomBillNumber(
  prefix: string,
  seqNumber: number,
  yearFormat: BillYearFormat,
  separator: string,
  padding: number,
  date: Date = new Date()
): string {
  const parts: string[] = [];

  const trimmedPrefix = (prefix || '').trim();
  if (trimmedPrefix) {
    parts.push(trimmedPrefix);
  }

  const validDate = isNaN(date.getTime()) ? new Date() : date;

  if (yearFormat === '2digit') {
    parts.push(validDate.getFullYear().toString().slice(-2));
  } else if (yearFormat === '4digit') {
    parts.push(validDate.getFullYear().toString());
  } else if (yearFormat === 'fy_short') {
    parts.push(getFinancialYear(validDate).short);
  } else if (yearFormat === 'fy_long') {
    parts.push(getFinancialYear(validDate).long);
  }
  // If 'none', year is omitted

  const paddedNum = padding > 0 ? String(seqNumber).padStart(padding, '0') : String(seqNumber);
  parts.push(paddedNum);

  return parts.join(separator);
}

export function generateAndIncrementInvoiceNumber(saleId: number, saleDate: Date = new Date()): string {
  const settings = getBillFormatSettings();
  let seq = saleId;
  if (settings.nextNumber !== undefined && settings.nextNumber > 0) {
    seq = settings.nextNumber;
    localStorage.setItem('billNextNumber', String(seq + 1));
    window.dispatchEvent(new Event('preferencesUpdated'));
  }
  return formatCustomBillNumber(
    settings.prefix,
    seq,
    settings.yearFormat,
    settings.separator,
    settings.padding,
    saleDate
  );
}

export function generateAndIncrementQuotationNumber(quotationId: number, quotationDate: Date = new Date()): string {
  const settings = getBillFormatSettings();
  let seq = quotationId;
  if (settings.quotationNextNumber !== undefined && settings.quotationNextNumber > 0) {
    seq = settings.quotationNextNumber;
    localStorage.setItem('quotationNextNumber', String(seq + 1));
    window.dispatchEvent(new Event('preferencesUpdated'));
  }
  return formatCustomBillNumber(
    settings.quotationPrefix,
    seq,
    settings.yearFormat,
    settings.separator,
    settings.padding,
    quotationDate
  );
}

export async function getNextInvoiceNumber(): Promise<string> {
  const db = await getDb();
  const res = await db.select<{max_id: number}[]>('SELECT MAX(id) as max_id FROM sales');
  const maxId = res[0]?.max_id || 0;
  const settings = getBillFormatSettings();

  let seq = maxId + 1;
  if (settings.nextNumber !== undefined && settings.nextNumber > 0) {
    seq = settings.nextNumber;
  }
  return formatCustomBillNumber(
    settings.prefix,
    seq,
    settings.yearFormat,
    settings.separator,
    settings.padding,
    new Date()
  );
}

export async function getNextQuotationNumber(): Promise<string> {
  const db = await getDb();
  const res = await db.select<{max_id: number}[]>('SELECT MAX(id) as max_id FROM quotations');
  const maxId = res[0]?.max_id || 0;
  const settings = getBillFormatSettings();

  let seq = maxId + 1;
  if (settings.quotationNextNumber !== undefined && settings.quotationNextNumber > 0) {
    seq = settings.quotationNextNumber;
  }
  return formatCustomBillNumber(
    settings.quotationPrefix,
    seq,
    settings.yearFormat,
    settings.separator,
    settings.padding,
    new Date()
  );
}

export interface QuotationItem {
  id?: number;
  quotation_id?: number;
  product_id: number;
  quantity: number;
  unit_price: number;
  tax: number;
  unit?: string;
  product_snapshot?: string;
  name?: string;
  model?: string;
  hsn_code?: string;
  gst_percentage?: number;
  cgst_percentage?: number;
  sgst_percentage?: number;
  stock_quantity?: number;
}

export interface Quotation {
  id: number;
  quotation_number: string;
  customer_id: number | null;
  customer_name?: string;
  date: string;
  total_amount: number;
  tax_amount: number;
  discount: number;
  net_amount: number;
  status: 'Pending' | 'Converted' | 'Cancelled';
  converted_sale_id?: number | null;
  converted_invoice_no?: string | null;
  customer_snapshot?: string | null;
  notes?: string | null;
  items?: QuotationItem[];
}

export async function createQuotation(
  cart: CartItem[],
  totalAmount: number,
  taxAmount: number,
  discountAmount: number,
  netAmount: number,
  customerId: number | null,
  notes: string = '',
  quotationDate?: string | null,
  taxMethodOverride?: 'exclusive' | 'inclusive'
): Promise<string> {
  const db = await getDb();
  
  let customerSnapshot = null;
  if (customerId !== null) {
    const custRes = await db.select<any[]>('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.length > 0) customerSnapshot = JSON.stringify(custRes[0]);
  }

  let finalQuotationDate = null;
  if (quotationDate) {
    const timePart = new Date().toTimeString().split(' ')[0];
    finalQuotationDate = `${quotationDate} ${timePart}`;
  }

  const result = await db.execute(
    `INSERT INTO quotations (customer_id, total_amount, tax_amount, discount, net_amount, status, customer_snapshot, notes, date) 
     VALUES ($1, $2, $3, $4, $5, 'Pending', $6, $7, COALESCE($8, CURRENT_TIMESTAMP))`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, customerSnapshot, notes, finalQuotationDate]
  );
  
  const quotationId = Number(result.lastInsertId) || (await db.select<{id: number}[]>('SELECT id FROM quotations ORDER BY id DESC LIMIT 1'))[0]?.id || 0;
  const quotDateObj = finalQuotationDate ? new Date(finalQuotationDate.replace(' ', 'T')) : new Date();
  const quotationNumber = generateAndIncrementQuotationNumber(quotationId, isNaN(quotDateObj.getTime()) ? new Date() : quotDateObj);
  await db.execute(`UPDATE quotations SET quotation_number = $1 WHERE id = $2`, [quotationNumber, quotationId]);
  
  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = taxMethodOverride || localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

  for (const item of cart) {
    const originalItemPrice = item.selling_price * item.cart_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    let taxableValue = discountedItemPrice;
    if (taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    const itemTax = taxableValue * ((item.gst_percentage || 0) / 100);
    
    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage
    });

    await db.execute(
      `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [quotationId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit, productSnapshot]
    );
    // Note: Stock is NOT deducted and customer balance is NOT modified.
  }
  
  return quotationNumber;
}

export async function updateQuotation(
  quotationId: number,
  cart: CartItem[],
  totalAmount: number,
  taxAmount: number,
  discountAmount: number,
  netAmount: number,
  customerId: number | null,
  notes: string = '',
  quotationDate?: string | null,
  taxMethodOverride?: 'exclusive' | 'inclusive'
): Promise<string> {
  const db = await getDb();
  
  let customerSnapshot = null;
  if (customerId !== null) {
    const custRes = await db.select<any[]>('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.length > 0) customerSnapshot = JSON.stringify(custRes[0]);
  }

  const rows = await db.select<{quotation_number: string}[]>('SELECT quotation_number FROM quotations WHERE id = $1', [quotationId]);
  if (rows.length === 0) throw new Error("Quotation not found");
  const quotationNumber = rows[0].quotation_number;

  let finalQuotationDate = null;
  if (quotationDate) {
    const timePart = new Date().toTimeString().split(' ')[0];
    finalQuotationDate = `${quotationDate} ${timePart}`;
  }

  await db.execute(
    `UPDATE quotations SET customer_id = $1, total_amount = $2, tax_amount = $3, discount = $4, net_amount = $5, customer_snapshot = $6, notes = $7, date = COALESCE($9, date) WHERE id = $8`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, customerSnapshot, notes, quotationId, finalQuotationDate]
  );

  await db.execute('DELETE FROM quotation_items WHERE quotation_id = $1', [quotationId]);

  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = taxMethodOverride || localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

  for (const item of cart) {
    const originalItemPrice = item.selling_price * item.cart_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    let taxableValue = discountedItemPrice;
    if (taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    const itemTax = taxableValue * ((item.gst_percentage || 0) / 100);

    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage
    });

    await db.execute(
      `INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [quotationId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit, productSnapshot]
    );
  }

  return quotationNumber;
}

export async function getQuotations(statusFilter?: string): Promise<Quotation[]> {
  const db = await getDb();
  let query = `
    SELECT q.*, COALESCE(c.name, 'Walk-in Customer') as customer_name
    FROM quotations q
    LEFT JOIN customers c ON q.customer_id = c.id
  `;
  const params: any[] = [];
  if (statusFilter && statusFilter !== 'All') {
    query += ` WHERE q.status = $1`;
    params.push(statusFilter);
  }
  query += ` ORDER BY q.id DESC`;

  return await db.select<Quotation[]>(query, params);
}

export async function getQuotationById(id: number): Promise<Quotation | null> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT q.*, COALESCE(c.name, 'Walk-in Customer') as customer_name
     FROM quotations q
     LEFT JOIN customers c ON q.customer_id = c.id
     WHERE q.id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const quotation = rows[0];

  const items = await db.select<any[]>(
    `SELECT qi.*, p.stock_quantity
     FROM quotation_items qi
     LEFT JOIN products p ON qi.product_id = p.id
     WHERE qi.quotation_id = $1`,
    [id]
  );

  quotation.items = items.map(item => {
    let snap: any = {};
    if (item.product_snapshot) {
      try { snap = JSON.parse(item.product_snapshot); } catch (e) {}
    }
    return {
      ...item,
      name: snap.name || 'Unknown',
      model: snap.model || '',
      hsn_code: snap.hsn_code || '',
      gst_percentage: snap.gst_percentage || 0,
      cgst_percentage: snap.cgst_percentage || 0,
      sgst_percentage: snap.sgst_percentage || 0,
      stock_quantity: item.stock_quantity || 0
    };
  });

  return quotation;
}

export async function markQuotationConverted(quotationId: number, saleId: number, invoiceNumber: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE quotations 
     SET status = 'Converted', converted_sale_id = $1, converted_invoice_no = $2 
     WHERE id = $3`,
    [saleId, invoiceNumber, quotationId]
  );
}

export async function deleteQuotation(id: number): Promise<void> {
  const db = await getDb();
  await db.execute('DELETE FROM quotation_items WHERE quotation_id = $1', [id]);
  await db.execute('DELETE FROM quotations WHERE id = $1', [id]);
}

export async function getSaleById(id: number): Promise<any> {
  const db = await getDb();
  const sales = await db.select<any[]>(`
    SELECT s.*, w.name as source_warehouse_name 
    FROM sales s 
    LEFT JOIN warehouses w ON s.source_warehouse_id = w.id 
    WHERE s.id = $1
  `, [id]);
  if (sales.length === 0) return null;
  const sale = sales[0];
  const items = await db.select<any[]>(
    `SELECT si.*, p.stock_quantity as shop_stock, p.name as prod_name, p.model as prod_model, p.hsn_code as prod_hsn, p.unit as prod_unit, p.gst_percentage as prod_gst, p.cgst_percentage as prod_cgst, p.sgst_percentage as prod_sgst
     FROM sale_items si 
     LEFT JOIN products p ON si.product_id = p.id
     WHERE si.sale_id = $1`, 
    [id]
  );

  let whMap: Record<number, Record<number, number>> = {};
  try {
    const whItems = await db.select<{warehouse_id: number, product_id: number, quantity: number}[]>(`
      SELECT warehouse_id, product_id, quantity FROM warehouse_items
    `);
    for (const wi of whItems) {
      if (!whMap[wi.product_id]) whMap[wi.product_id] = {};
      whMap[wi.product_id][wi.warehouse_id] = wi.quantity;
    }
  } catch (e) {}

  sale.items = items.map(item => {
    let snap: any = {};
    if (item.product_snapshot) {
      try { snap = JSON.parse(item.product_snapshot); } catch (e) {}
    }
    const itemSrcType = snap.source_type || sale.source_type || 'shop';
    const itemWhId = snap.source_warehouse_id || sale.source_warehouse_id || null;
    const stocks = whMap[item.product_id] || {};
    const currentStock = itemSrcType === 'warehouse' && itemWhId ? (stocks[itemWhId] || 0) : (item.shop_stock || 0);

    return {
      ...item,
      name: snap.name || item.prod_name || 'Unknown',
      model: snap.model || item.prod_model || '',
      hsn_code: snap.hsn_code || item.prod_hsn || '',
      unit: item.unit || item.prod_unit || 'Nos',
      gst_percentage: snap.gst_percentage ?? item.prod_gst ?? 0,
      cgst_percentage: snap.cgst_percentage ?? item.prod_cgst ?? 0,
      sgst_percentage: snap.sgst_percentage ?? item.prod_sgst ?? 0,
      item_source_type: itemSrcType,
      item_warehouse_id: itemWhId,
      item_warehouse_name: snap.source_warehouse_name || sale.source_warehouse_name || (itemSrcType === 'shop' ? 'Main Shop' : 'Godown'),
      stock_quantity: currentStock + item.quantity,
      shop_stock: item.shop_stock || 0,
      warehouse_stocks: stocks
    };
  });

  if (sale.dispatch_details) {
    try {
      sale.dispatchDetails = JSON.parse(sale.dispatch_details);
    } catch (e) {
      sale.dispatchDetails = null;
    }
  }

  return sale;
}

export async function updateSaleBill(
  saleId: number,
  customerId: number | null,
  cart: CartItem[],
  totalAmount: number,
  taxAmount: number,
  discountAmount: number,
  netAmount: number,
  paidAmount: number,
  paymentMethod: string = 'Cash',
  chequeNo?: string | null,
  bankName?: string | null,
  chequeDate?: string | null,
  sourceType: 'shop' | 'warehouse' = 'shop',
  sourceWarehouseId: number | null = null,
  saleDate?: string | null,
  dispatchDetails?: DispatchDetails | null,
  taxMethodOverride?: 'exclusive' | 'inclusive'
) {
  const db = await getDb();
  
  // 1. Fetch old sale
  const oldSales = await db.select<{invoice_number: string, net_amount: number, customer_id: number | null, paid_amount: number, source_type: string | null, source_warehouse_id: number | null}[]>(
    'SELECT invoice_number, net_amount, customer_id, paid_amount, source_type, source_warehouse_id FROM sales WHERE id = $1',
    [saleId]
  );
  if (oldSales.length === 0) throw new Error("Sale not found");
  const oldSale = oldSales[0];
  const oldSrcType = oldSale.source_type || 'shop';
  const oldWhId = oldSale.source_warehouse_id;

  // 2. Fetch old sale items
  const oldItems = await db.select<{product_id: number, quantity: number, product_snapshot: string | null}[]>('SELECT product_id, quantity, product_snapshot FROM sale_items WHERE sale_id = $1', [saleId]);

  // 3. Revert stock and customer balance based on where it was originally deducted
  for (const oldItem of oldItems) {
    let itemSrcType = oldSrcType;
    let itemWhId = oldWhId;
    if (oldItem.product_snapshot) {
      try {
        const snap = JSON.parse(oldItem.product_snapshot);
        if (snap.source_type) {
          itemSrcType = snap.source_type;
          itemWhId = snap.source_warehouse_id;
        }
      } catch (e) {}
    }

    if (itemSrcType === 'warehouse' && itemWhId) {
      await db.execute(
        `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
         VALUES ($1, $2, $3) 
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
        [itemWhId, oldItem.product_id, oldItem.quantity]
      );
    } else {
      await db.execute('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [oldItem.quantity, oldItem.product_id]);
    }
  }
  if (oldSale.customer_id !== null) {
    await db.execute('UPDATE customers SET balance = balance - $1 WHERE id = $2', [oldSale.net_amount, oldSale.customer_id]);
  }

  // 4. Delete old items
  await db.execute('DELETE FROM sale_items WHERE sale_id = $1', [saleId]);
  
  // 5. Revert old payments
  const oldPayments = await db.select<{id: number, amount: number, entity_id: number}[]>(
    'SELECT id, amount, entity_id FROM payments WHERE reference_no = $1 AND entity_type = $2',
    [oldSale.invoice_number, 'customer']
  );
  for (const p of oldPayments) {
    // Revert the customer balance for this payment (payment reduced balance, so we add it back)
    await db.execute('UPDATE customers SET balance = balance + $1 WHERE id = $2', [p.amount, p.entity_id]);
    await db.execute('DELETE FROM payments WHERE id = $1', [p.id]);
  }
  
  const isCheque = paymentMethod.toLowerCase() === 'cheque';
  const isPDC = isCheque && isPdcDate(chequeDate);
  const effectivePaidAmount = isPDC ? 0 : paidAmount;

  let status = 'Unpaid';
  if (effectivePaidAmount >= netAmount - 0.01) status = 'Paid';
  else if (effectivePaidAmount > 0) status = 'Partial';
  
  let customerSnapshot = null;
  if (customerId !== null) {
    const custRes = await db.select<any[]>('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.length > 0) customerSnapshot = JSON.stringify(custRes[0]);
  }

  let finalSaleDate: string | null = null;
  if (saleDate && saleDate.trim()) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    finalSaleDate = saleDate.includes(' ') || saleDate.includes('T') ? saleDate : `${saleDate.trim()} ${timeStr}`;
  }

  const dispatchDetailsJson = dispatchDetails ? JSON.stringify(dispatchDetails) : null;
  await db.execute(
    `UPDATE sales SET customer_id = $1, total_amount = $2, tax_amount = $3, discount = $4, net_amount = $5, paid_amount = $6, status = $7, customer_snapshot = $8, payment_method = $9, source_type = $10, source_warehouse_id = $11, date = COALESCE($12, date), dispatch_details = $13 WHERE id = $14`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, effectivePaidAmount, status, customerSnapshot, paymentMethod, sourceType, sourceWarehouseId, finalSaleDate, dispatchDetailsJson, saleId]
  );
  
  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = taxMethodOverride || localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

  // 6. Insert new items and update stock
  for (const item of cart) {
    const originalItemPrice = item.selling_price * item.cart_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    let taxableValue = discountedItemPrice;
    if (taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    const itemTax = taxableValue * ((item.gst_percentage || 0) / 100);
    
    const itemSrcType = item.item_source_type || (sourceType === 'warehouse' ? 'warehouse' : 'shop');
    const itemWhId = item.item_warehouse_id || (itemSrcType === 'warehouse' ? sourceWarehouseId : null);
    let itemWhName = item.item_warehouse_name;
    if (itemSrcType === 'warehouse' && itemWhId && !itemWhName) {
      const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [itemWhId]);
      if (whRes.length > 0) itemWhName = whRes[0].name;
    }

    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage,
      source_type: itemSrcType,
      source_warehouse_id: itemWhId,
      source_warehouse_name: itemWhName || (itemSrcType === 'shop' ? 'Main Shop' : 'Godown')
    });

    await db.execute(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit, productSnapshot]
    );
    
    if (itemSrcType === 'warehouse' && itemWhId) {
      await db.execute(
        `UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3`,
        [item.cart_qty, itemWhId, item.id]
      );
      await db.execute(
        `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ('warehouse', $1, $2, 'shop', 0, 'Customer Sale', $3, $4, $5)`,
        [itemWhId, itemWhName || 'Godown', item.id, item.cart_qty, `Sale Invoice #${oldSale.invoice_number} (Edited)`]
      );
    } else {
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [item.cart_qty, item.id]
      );
    }
  }

  // 7. Apply new customer balance
  if (paidAmount > 0) {
    if (customerId !== null) {
      await recordPayment(
        'customer', 
        customerId, 
        paidAmount, 
        paymentMethod, 
        oldSale.invoice_number, 
        'Initial Payment at POS (Edited)',
        chequeNo,
        bankName,
        chequeDate,
        finalSaleDate
      );
    } else {
      await recordPayment(
        'customer', 
        0, 
        paidAmount, 
        paymentMethod, 
        oldSale.invoice_number, 
        'Walk-in Customer Sale (Edited)',
        chequeNo,
        bankName,
        chequeDate,
        finalSaleDate
      );
    }
  }

  // Authoritatively re-sync customer balance to exact sum of unpaid invoice dues
  if (customerId !== null) {
    await db.execute(
      `UPDATE customers SET balance = (
        SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
        FROM sales 
        WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
      ) WHERE id = $1`,
      [customerId]
    );
  }
  if (oldSale.customer_id !== null && oldSale.customer_id !== customerId) {
    await db.execute(
      `UPDATE customers SET balance = (
        SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
        FROM sales 
        WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
      ) WHERE id = $1`,
      [oldSale.customer_id]
    );
  }
  
  return oldSale.invoice_number;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  balance: number;
  advance_balance?: number;
}

export async function getCustomers(): Promise<Customer[]> {
  const db = await getDb();
  return await db.select('SELECT id, name, phone, email, address, gstin, balance, COALESCE(advance_balance, 0) as advance_balance FROM customers ORDER BY id DESC');
}

export async function addCustomer(name: string, phone: string, email: string, address: string, gstin: string): Promise<number> {
  const db = await getDb();
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : '';
  const result = await db.execute(
    `INSERT INTO customers (name, phone, email, address, gstin, balance, advance_balance) VALUES ($1, $2, $3, $4, $5, 0, 0)`,
    [name, phone, email, address, cleanGstin]
  );
  if (result.lastInsertId) {
    return Number(result.lastInsertId);
  }
  const rows = await db.select<{ id: number }[]>(`SELECT id FROM customers ORDER BY id DESC LIMIT 1`);
  return rows[0]?.id || 0;
}

export async function editCustomer(id: number, name: string, phone: string, email: string, address: string, gstin: string) {
  const db = await getDb();
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : '';
  await db.execute(
    `UPDATE customers SET name = $1, phone = $2, email = $3, address = $4, gstin = $5 WHERE id = $6`,
    [name, phone, email, address, cleanGstin, id]
  );
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gstin: string | null;
  balance: number;
  advance_balance?: number;
}

export async function getSuppliers(): Promise<Supplier[]> {
  const db = await getDb();
  return await db.select('SELECT id, name, phone, email, address, gstin, balance, COALESCE(advance_balance, 0) as advance_balance FROM suppliers ORDER BY id DESC');
}

export async function addSupplier(name: string, phone: string, email: string, address: string, gstin: string): Promise<number> {
  const db = await getDb();
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : '';
  const result = await db.execute(
    `INSERT INTO suppliers (name, phone, email, address, gstin, balance, advance_balance) VALUES ($1, $2, $3, $4, $5, 0, 0)`,
    [name, phone, email, address, cleanGstin]
  );
  if (result.lastInsertId) {
    return Number(result.lastInsertId);
  }
  const rows = await db.select<{ id: number }[]>(`SELECT id FROM suppliers ORDER BY id DESC LIMIT 1`);
  return rows[0]?.id || 0;
}

export async function editSupplier(id: number, name: string, phone: string, email: string, address: string, gstin: string) {
  const db = await getDb();
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : '';
  await db.execute(
    `UPDATE suppliers SET name = $1, phone = $2, email = $3, address = $4, gstin = $5 WHERE id = $6`,
    [name, phone, email, address, cleanGstin, id]
  );
}

export interface PurchaseItem extends Product {
  purchase_qty: number;
}

export async function recordPurchase(
  supplierId: number,
  invoiceNo: string,
  supplierInvoiceDate: string | null,
  items: PurchaseItem[],
  totalAmount: number,
  taxAmount: number,
  discount: number,
  netAmount: number,
  paidAmount: number,
  destinationType: 'shop' | 'warehouse' = 'shop',
  destinationWarehouseId: number | null = null
) {
  const db = await getDb();
  
  let status = 'Unpaid';
  if (paidAmount >= netAmount) status = 'Paid';
  else if (paidAmount > 0) status = 'Partial';

  let supplierSnapshot = null;
  const suppRes = await db.select<any[]>('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
  if (suppRes.length > 0) supplierSnapshot = JSON.stringify(suppRes[0]);
  const suppName = suppRes.length > 0 ? suppRes[0].name : 'Supplier';

  let whName = 'Warehouse';
  if (destinationType === 'warehouse' && destinationWarehouseId) {
    const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [destinationWarehouseId]);
    if (whRes.length > 0) whName = whRes[0].name;
  }

  let finalPurchaseDate: string | null = null;
  if (supplierInvoiceDate && supplierInvoiceDate.trim()) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    finalPurchaseDate = supplierInvoiceDate.includes(' ') || supplierInvoiceDate.includes('T') ? supplierInvoiceDate : `${supplierInvoiceDate.trim()} ${timeStr}`;
  } else {
    finalPurchaseDate = getLocalTimestamp();
  }

  const purchaseResult = await db.execute(
    `INSERT INTO purchases (supplier_id, date, invoice_number, supplier_invoice_date, total_amount, tax_amount, discount, net_amount, paid_amount, status, supplier_snapshot, destination_type, destination_warehouse_id) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [supplierId, finalPurchaseDate, invoiceNo, supplierInvoiceDate, totalAmount, taxAmount, discount, netAmount, paidAmount, status, supplierSnapshot, destinationType, destinationWarehouseId]
  );
  
  const purchaseId = purchaseResult.lastInsertId;
  
  let originalPriceBasis = 0;
  items.forEach(item => { originalPriceBasis += item.purchase_price * item.purchase_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discount / originalPriceBasis) : 0;
  const taxMethod = localStorage.getItem('purchaseTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

  for (const item of items) {
    const originalItemPrice = item.purchase_price * item.purchase_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    let taxableValue = discountedItemPrice;
    if (taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    const itemTax = taxableValue * ((item.gst_percentage || 0) / 100); 
    
    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage
    });

    // Insert into purchase_items
    await db.execute(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_rate, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [purchaseId, item.id, item.purchase_qty, item.purchase_price, itemTax, item.unit, productSnapshot]
    );
    
    if (destinationType === 'warehouse' && destinationWarehouseId) {
      // Upsert directly into warehouse_items
      await db.execute(
        `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
         VALUES ($1, $2, $3)
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
        [destinationWarehouseId, item.id, item.purchase_qty]
      );
      // Record inward movement in stock history
      await db.execute(
        `INSERT INTO stock_movements (date, from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ($1, 'direct_inward', 0, $2, 'warehouse', $3, $4, $5, $6, $7)`,
        [finalPurchaseDate, `Supplier (${suppName})`, destinationWarehouseId, whName, item.id, item.purchase_qty, `Purchase Inward - Inv #${invoiceNo}`]
      );
    } else {
      // Increment stock in products table (Shop Storage)
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`,
        [item.purchase_qty, item.id]
      );
      await db.execute(
        `INSERT INTO stock_movements (date, from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ($1, 'direct_inward', 0, $2, 'shop', 0, 'Main Shop', $3, $4, $5)`,
        [finalPurchaseDate, `Supplier (${suppName})`, item.id, item.purchase_qty, `Purchase Inward - Inv #${invoiceNo}`]
      );
    }
  }

  // Record initial payment and re-sync supplier balance without consuming stored advance
  if (paidAmount > 0) {
    await recordPayment('supplier', supplierId, paidAmount, 'Cash', invoiceNo, 'Initial Payment for Purchase', null, null, null, finalPurchaseDate, purchaseId);
  }

  // Re-sync supplier balance to the exact total of unpaid invoice dues
  await db.execute(
    `UPDATE suppliers SET balance = (
      SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
      FROM purchases 
      WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
    ) WHERE id = $1`,
    [supplierId]
  );
}

export async function updatePurchaseBill(
  purchaseId: number,
  supplierId: number,
  invoiceNo: string,
  supplierInvoiceDate: string | null,
  items: PurchaseItem[],
  totalAmount: number,
  taxAmount: number,
  discount: number,
  netAmount: number,
  paidAmount: number,
  destinationType: 'shop' | 'warehouse' = 'shop',
  destinationWarehouseId: number | null = null
) {
  const db = await getDb();
  
  // 1. Fetch old purchase
  const oldPurchases = await db.select<{invoice_number: string, net_amount: number, supplier_id: number, paid_amount: number, destination_type: string | null, destination_warehouse_id: number | null}[]>(
    'SELECT invoice_number, net_amount, supplier_id, paid_amount, destination_type, destination_warehouse_id FROM purchases WHERE id = $1',
    [purchaseId]
  );
  if (oldPurchases.length === 0) throw new Error("Purchase not found");
  const oldPurchase = oldPurchases[0];
  const oldDestType = oldPurchase.destination_type || 'shop';
  const oldWhId = oldPurchase.destination_warehouse_id;

  // 2. Fetch old purchase items
  const oldItems = await db.select<{product_id: number, quantity: number}[]>('SELECT product_id, quantity FROM purchase_items WHERE purchase_id = $1', [purchaseId]);

  // 3. Revert stock and supplier balance based on where it was originally stored
  for (const oldItem of oldItems) {
    if (oldDestType === 'warehouse' && oldWhId) {
      await db.execute(
        'UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3',
        [oldItem.quantity, oldWhId, oldItem.product_id]
      );
    } else {
      await db.execute('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [oldItem.quantity, oldItem.product_id]);
    }
  }
  await db.execute('UPDATE suppliers SET balance = balance - $1 WHERE id = $2', [oldPurchase.net_amount, oldPurchase.supplier_id]);

  // 4. Delete old items
  await db.execute('DELETE FROM purchase_items WHERE purchase_id = $1', [purchaseId]);

  // 5. Revert old payments
  const oldPayments = await db.select<{id: number, amount: number, entity_id: number}[]>(
    'SELECT id, amount, entity_id FROM payments WHERE reference_no = $1 AND entity_type = $2',
    [invoiceNo, 'supplier']
  );
  for (const p of oldPayments) {
    // Revert the supplier balance for this payment (payment reduced balance, so we add it back)
    await db.execute('UPDATE suppliers SET balance = balance + $1 WHERE id = $2', [p.amount, p.entity_id]);
    await db.execute('DELETE FROM payments WHERE id = $1', [p.id]);
  }

  let status = 'Unpaid';
  if (paidAmount >= netAmount) status = 'Paid';
  else if (paidAmount > 0) status = 'Partial';
  
  let supplierSnapshot = null;
  const suppRes = await db.select<any[]>('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
  if (suppRes.length > 0) supplierSnapshot = JSON.stringify(suppRes[0]);
  const suppName = suppRes.length > 0 ? suppRes[0].name : 'Supplier';

  let whName = 'Warehouse';
  if (destinationType === 'warehouse' && destinationWarehouseId) {
    const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [destinationWarehouseId]);
    if (whRes.length > 0) whName = whRes[0].name;
  }

  // 6. Update purchase record with destination
  await db.execute(
    `UPDATE purchases SET supplier_id = $1, invoice_number = $2, supplier_invoice_date = $3, total_amount = $4, tax_amount = $5, discount = $6, net_amount = $7, paid_amount = $8, status = $9, supplier_snapshot = $10, destination_type = $11, destination_warehouse_id = $12 WHERE id = $13`,
    [supplierId, invoiceNo, supplierInvoiceDate, totalAmount, taxAmount, discount, netAmount, paidAmount, status, supplierSnapshot, destinationType, destinationWarehouseId, purchaseId]
  );

  // 7. Insert new items and apply new stock
  let originalPriceBasis = 0;
  items.forEach(item => { originalPriceBasis += item.purchase_price * item.purchase_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discount / originalPriceBasis) : 0;
  const taxMethod = localStorage.getItem('purchaseTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

  for (const item of items) {
    const originalItemPrice = item.purchase_price * item.purchase_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    let taxableValue = discountedItemPrice;
    if (taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    const itemTax = taxableValue * ((item.gst_percentage || 0) / 100); 
    
    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage
    });

    await db.execute(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_rate, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [purchaseId, item.id, item.purchase_qty, item.purchase_price, itemTax, item.unit, productSnapshot]
    );
    
    if (destinationType === 'warehouse' && destinationWarehouseId) {
      await db.execute(
        `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
         VALUES ($1, $2, $3)
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
        [destinationWarehouseId, item.id, item.purchase_qty]
      );
      await db.execute(
        `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ('direct_inward', 0, $1, 'warehouse', $2, $3, $4, $5, $6)`,
        [`Supplier (${suppName})`, destinationWarehouseId, whName, item.id, item.purchase_qty, `Purchase Inward (Edited) - Inv #${invoiceNo}`]
      );
    } else {
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`,
        [item.purchase_qty, item.id]
      );
    }
  }

  // 8. Apply new payment and authoritatively re-sync supplier balance
  if (paidAmount > 0) {
    await recordPayment('supplier', supplierId, paidAmount, 'Cash', invoiceNo, 'Initial Payment (Edited)');
  }

  await db.execute(
    `UPDATE suppliers SET balance = (
      SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
      FROM purchases 
      WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
    ) WHERE id = $1`,
    [supplierId]
  );
  if (oldPurchase.supplier_id !== supplierId) {
    await db.execute(
      `UPDATE suppliers SET balance = (
        SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
        FROM purchases 
        WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
      ) WHERE id = $1`,
      [oldPurchase.supplier_id]
    );
  }
}

export interface Payment {
  id: number;
  entity_type: 'customer' | 'supplier';
  entity_id: number;
  date: string;
  amount: number;
  payment_mode: string;
  reference_no: string | null;
  notes: string | null;
}

export async function getPayments(entityType: 'customer' | 'supplier', entityId: number): Promise<Payment[]> {
  const db = await getDb();
  return await db.select(
    'SELECT * FROM payments WHERE entity_type = $1 AND entity_id = $2 ORDER BY id DESC', 
    [entityType, entityId]
  );
}

export interface LedgerEntry {
  id: string; // unique string for React key
  date: string;
  type: 'Sale' | 'Purchase' | 'Payment' | 'Return' | 'Advance' | string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  invoice_number?: string;
  original_id: number;
  payment_mode?: string;
  cheque_no?: string | null;
  bank_name?: string | null;
  cheque_date?: string | null;
  cheque_status?: string | null;
  reference_no?: string | null;
  notes?: string | null;
  is_advance?: boolean;
}

export async function getPartyLedger(entityType: 'customer' | 'supplier', entityId: number): Promise<LedgerEntry[]> {
  const db = await getDb();
  const entries: LedgerEntry[] = [];

  // Fetch Payments (Only cleared payments affect ledger balance)
  const payments = await db.select<{
    id: number;
    date: string;
    amount: number;
    payment_mode: string;
    reference_no: string | null;
    notes: string | null;
    cheque_no: string | null;
    bank_name: string | null;
    cheque_date: string | null;
    cheque_status: string | null;
  }[]>(
    "SELECT id, date, amount, payment_mode, reference_no, notes, cheque_no, bank_name, cheque_date, cheque_status FROM payments WHERE entity_type = $1 AND entity_id = $2 AND (cheque_status IS NULL OR cheque_status = 'cleared')",
    [entityType, entityId]
  );
  
  // Fetch Returns with product details and invoice references
  let returns: {
    id: number;
    date: string;
    amount: number;
    reason: string | null;
    transaction_id: number | null;
    product_name?: string;
    quantity?: number;
    invoice_number?: string;
  }[] = [];

  try {
    if (entityType === 'customer') {
      returns = await db.select(
        `SELECT r.id, r.date, r.amount, r.reason, r.transaction_id, r.quantity, p.name as product_name, s.invoice_number
         FROM returns r 
         LEFT JOIN products p ON r.product_id = p.id
         LEFT JOIN sales s ON r.transaction_id = s.id
         WHERE r.entity_type = 'customer' AND r.entity_id = $1`,
        [entityId]
      );
    } else {
      returns = await db.select(
        `SELECT r.id, r.date, r.amount, r.reason, r.transaction_id, r.quantity, p.name as product_name, pu.invoice_number
         FROM returns r 
         LEFT JOIN products p ON r.product_id = p.id
         LEFT JOIN purchases pu ON r.transaction_id = pu.id
         WHERE r.entity_type = 'supplier' AND r.entity_id = $1`,
        [entityId]
      );
    }
  } catch {
    returns = await db.select(
      'SELECT id, date, amount, reason, transaction_id FROM returns WHERE entity_type = $1 AND entity_id = $2',
      [entityType, entityId]
    );
  }

  if (entityType === 'customer') {
    // Customers
    // 1. Fetch Sales
    const sales = await db.select<{
      id: number;
      date: string;
      invoice_number: string;
      net_amount: number;
      paid_amount: number;
      payment_method: string | null;
    }[]>(
      'SELECT id, date, invoice_number, net_amount, COALESCE(paid_amount, 0) as paid_amount, payment_method FROM sales WHERE customer_id = $1',
      [entityId]
    );

    // 2. Add Payments from payments table (Every customer payment is strictly a CREDIT)
    payments.forEach(p => {
      const isAdvance = p.notes === 'Customer Advance Deposit' || (p.notes ? p.notes.toLowerCase().includes('advance') : false) || (p.reference_no ? p.reference_no.includes('ADV') : false);
      if (p.amount > 0) {
        const chq = p.cheque_no ? ` (Chq #${p.cheque_no})` : '';
        const ref = p.reference_no ? ` [Ref: ${p.reference_no}]` : '';
        const desc = p.notes && p.notes !== 'Initial Payment at POS'
          ? p.notes
          : isAdvance
          ? 'Customer Advance Deposit'
          : `Payment Recd (${p.payment_mode}${chq})${ref}`.trim();

        entries.push({
          id: `pay-${p.id}`,
          date: p.date,
          type: isAdvance ? 'Advance' : 'Payment',
          description: desc,
          debit: 0,
          credit: p.amount,
          balance: 0,
          original_id: p.id,
          payment_mode: p.payment_mode,
          cheque_no: p.cheque_no,
          bank_name: p.bank_name,
          cheque_date: p.cheque_date,
          cheque_status: p.cheque_status,
          reference_no: p.reference_no,
          notes: p.notes,
          is_advance: isAdvance
        });
      } else if (p.amount < 0) {
        entries.push({
          id: `pay-${p.id}`,
          date: p.date,
          type: 'Payment',
          description: p.notes || `Cash Refund / Payout (${p.payment_mode})`,
          debit: Math.abs(p.amount),
          credit: 0,
          balance: 0,
          original_id: p.id,
          payment_mode: p.payment_mode,
          cheque_no: p.cheque_no,
          bank_name: p.bank_name,
          cheque_date: p.cheque_date,
          cheque_status: p.cheque_status,
          reference_no: p.reference_no,
          notes: p.notes,
          is_advance: false
        });
      }
    });

    // 3. Add Sales (Every sale/invoice is strictly a DEBIT of its face invoice value)
    const returnsBySale = new Map<number, number>();
    returns.forEach(r => {
      if (r.transaction_id) {
        returnsBySale.set(r.transaction_id, (returnsBySale.get(r.transaction_id) || 0) + r.amount);
      }
    });

    sales.forEach(s => {
      const saleReturnAmt = returnsBySale.get(s.id) || 0;
      const originalInvoiceAmount = s.net_amount + saleReturnAmt;
      const isAdvanceAdjusted = s.payment_method === 'Advance' || (s.payment_method ? s.payment_method.toLowerCase().includes('advance') : false);
      const methodTag = isAdvanceAdjusted 
        ? ' [Paid via Advance Adjustment]' 
        : s.paid_amount >= originalInvoiceAmount && s.payment_method 
        ? ` [Paid via ${s.payment_method}]` 
        : s.paid_amount === 0 
        ? ' [Credit Sale]' 
        : ` [Partially Paid: ₹${s.paid_amount.toFixed(2)}]`;

      entries.push({
        id: `sale-${s.id}`,
        date: s.date,
        type: 'Sale',
        description: `Sale (Inv: ${s.invoice_number || '#' + s.id})${methodTag}`,
        debit: originalInvoiceAmount,
        credit: 0,
        balance: 0,
        invoice_number: s.invoice_number,
        original_id: s.id,
        payment_mode: s.payment_method || (isAdvanceAdjusted ? 'Advance Adjustment' : 'Credit'),
        is_advance: isAdvanceAdjusted
      });
    });

    // 4. Add Returns (Sales returns are CREDITS that reduce customer balance)
    returns.forEach(r => {
      const productDesc = r.product_name ? `${r.quantity ? `${r.quantity}x ` : ''}${r.product_name}` : (r.reason || 'Item return');
      const invRef = r.invoice_number ? ` [Ref: ${r.invoice_number}]` : '';
      entries.push({
        id: `ret-${r.id}`,
        date: r.date,
        type: 'Return',
        description: `Sales Return: ${productDesc}${invRef}`,
        debit: 0,
        credit: r.amount,
        balance: 0,
        original_id: r.id,
        reference_no: r.invoice_number || undefined,
        notes: r.reason || undefined
      });
    });

  } else {
    // Suppliers
    // 1. Fetch Purchases
    const purchases = await db.select<{
      id: number;
      date: string;
      invoice_number: string;
      net_amount: number;
      paid_amount: number;
      payment_method?: string | null;
    }[]>(
      'SELECT id, date, invoice_number, net_amount, COALESCE(paid_amount, 0) as paid_amount, payment_method FROM purchases WHERE supplier_id = $1',
      [entityId]
    );

    // 2. Add Payments to suppliers from payments table (Payment reduces liability: DEBIT)
    payments.forEach(p => {
      const isAdvance = p.notes?.toLowerCase().includes('advance') || p.reference_no?.includes('ADV');
      if (p.amount > 0) {
        const chq = p.cheque_no ? ` (Chq #${p.cheque_no})` : '';
        const ref = p.reference_no ? ` [Ref: ${p.reference_no}]` : '';
        const desc = p.notes && p.notes !== 'Initial Payment'
          ? p.notes
          : isAdvance
          ? 'Supplier Advance Payment'
          : `Payment Made (${p.payment_mode}${chq})${ref}`.trim();

        entries.push({
          id: `pay-${p.id}`,
          date: p.date,
          type: isAdvance ? 'Advance' : 'Payment',
          description: desc,
          debit: p.amount, // Payment reduces what we owe supplier
          credit: 0,
          balance: 0,
          original_id: p.id,
          payment_mode: p.payment_mode,
          cheque_no: p.cheque_no,
          bank_name: p.bank_name,
          cheque_date: p.cheque_date,
          cheque_status: p.cheque_status,
          reference_no: p.reference_no,
          notes: p.notes,
          is_advance: isAdvance
        });
      } else if (p.amount < 0) {
        entries.push({
          id: `pay-${p.id}`,
          date: p.date,
          type: 'Payment',
          description: p.notes || `Cash Refund Recd (${p.payment_mode})`,
          debit: 0,
          credit: Math.abs(p.amount),
          balance: 0,
          original_id: p.id,
          payment_mode: p.payment_mode,
          cheque_no: p.cheque_no,
          bank_name: p.bank_name,
          cheque_date: p.cheque_date,
          cheque_status: p.cheque_status,
          reference_no: p.reference_no,
          notes: p.notes,
          is_advance: false
        });
      }
    });

    // 3. Add Purchases (Every purchase is strictly a CREDIT to supplier liability of its face invoice value)
    const returnsByPurchase = new Map<number, number>();
    returns.forEach(r => {
      if (r.transaction_id) {
        returnsByPurchase.set(r.transaction_id, (returnsByPurchase.get(r.transaction_id) || 0) + r.amount);
      }
    });

    purchases.forEach(pur => {
      const purReturnAmt = returnsByPurchase.get(pur.id) || 0;
      const originalInvoiceAmount = pur.net_amount + purReturnAmt;
      const isAdvanceAdjusted = pur.payment_method === 'Advance' || (pur.payment_method ? pur.payment_method.toLowerCase().includes('advance') : false);
      const methodTag = isAdvanceAdjusted 
        ? ' [Paid via Advance Adjustment]' 
        : pur.paid_amount >= originalInvoiceAmount && pur.payment_method 
        ? ` [Paid via ${pur.payment_method}]` 
        : pur.paid_amount === 0 
        ? ' [Credit Inward]' 
        : ` [Partially Paid: ₹${pur.paid_amount.toFixed(2)}]`;

      entries.push({
        id: `pur-${pur.id}`,
        date: pur.date,
        type: 'Purchase',
        description: `Purchase (Inv: ${pur.invoice_number || '#' + pur.id})${methodTag}`,
        debit: 0,
        credit: originalInvoiceAmount,
        balance: 0,
        invoice_number: pur.invoice_number,
        original_id: pur.id,
        payment_mode: pur.payment_method || (isAdvanceAdjusted ? 'Advance Adjustment' : 'Credit'),
        is_advance: isAdvanceAdjusted
      });
    });

    // 4. Add Purchase Returns (Reduces supplier liability: DEBIT)
    returns.forEach(r => {
      const productDesc = r.product_name ? `${r.quantity ? `${r.quantity}x ` : ''}${r.product_name}` : (r.reason || 'Item return');
      const invRef = r.invoice_number ? ` [Ref: ${r.invoice_number}]` : '';
      entries.push({
        id: `ret-${r.id}`,
        date: r.date,
        type: 'Return',
        description: `Purchase Return: ${productDesc}${invRef}`,
        debit: r.amount,
        credit: 0,
        balance: 0,
        original_id: r.id,
        reference_no: r.invoice_number || undefined,
        notes: r.reason || undefined
      });
    });
  }

  // Sort chronological
  entries.sort((a, b) => {
    const timeA = new Date(a.date.includes('T') ? a.date : a.date.replace(' ', 'T')).getTime();
    const timeB = new Date(b.date.includes('T') ? b.date : b.date.replace(' ', 'T')).getTime();
    const diff = (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
    if (diff !== 0) return diff;
    
    // If exact same timestamp, ensure Sales/Purchases come before Payments
    const getOrder = (type: string) => {
      if (type === 'Sale' || type === 'Purchase') return 1;
      if (type === 'Payment') return 2;
      return 3; // Return
    };
    return getOrder(a.type) - getOrder(b.type);
  });

  // Calculate Running Balance
  let currentBalance = 0;
  entries.forEach(entry => {
    if (entityType === 'customer') {
      currentBalance += entry.debit;
      currentBalance -= entry.credit;
    } else {
      currentBalance += entry.credit;
      currentBalance -= entry.debit;
    }
    entry.balance = Math.round(currentBalance * 100) / 100;
  });

  // Re-sort descending so newest is at the top (simply reverse the chronological array)
  entries.reverse();

  return entries;
}

export interface PartyBillItem {
  id: number;
  invoice_number: string;
  date: string;
  net_amount: number;
  paid_amount: number;
  tax_amount: number;
  discount: number;
  status: string;
  payment_method: string | null;
  item_count: number;
  products_bought: string;
  total_quantity: number;
  taxable_amount: number;
  due_amount: number;
}

export interface PartyPaymentItem {
  id: number;
  date: string;
  amount: number;
  payment_mode: string;
  reference_no: string | null;
  notes: string | null;
  cheque_no: string | null;
  bank_name: string | null;
  cheque_date: string | null;
  cheque_status: string | null;
}

export interface PartyReturnItem {
  id: number;
  date: string;
  amount: number;
  reason: string | null;
  invoice_number: string | null;
}

export interface PartyProfileData {
  bills: PartyBillItem[];
  payments: PartyPaymentItem[];
  returns: PartyReturnItem[];
  ledger: LedgerEntry[];
  cheques: PaymentHistory[];
  totalBilled: number;
  totalPaid: number;
  totalBillsCount: number;
  totalPendingDue: number;
  availableAdvance: number;
}

export async function getPartyProfileData(
  entityType: 'customer' | 'supplier',
  entityId: number
): Promise<PartyProfileData> {
  const db = await getDb();
  const numericId = Number(entityId);

  let bills: PartyBillItem[] = [];
  try {
    if (entityType === 'customer') {
      bills = await db.select<PartyBillItem[]>(`
        SELECT s.id, COALESCE(s.invoice_number, '') as invoice_number, s.date,
               s.net_amount, COALESCE(s.paid_amount, 0) as paid_amount,
               COALESCE(s.tax_amount, 0) as tax_amount, COALESCE(s.discount, 0) as discount,
               COALESCE(s.status, 'Paid') as status, COALESCE(s.payment_method, 'Cash') as payment_method,
               (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) as item_count,
               (SELECT GROUP_CONCAT(p.name || ' x' || si.quantity || ' (₹' || CAST(si.unit_price AS TEXT) || ' / ' || COALESCE(si.unit, p.unit) || ')', char(10)) 
                FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as products_bought,
               (SELECT COALESCE(SUM(si.quantity), 0) FROM sale_items si WHERE si.sale_id = s.id) as total_quantity,
               (s.net_amount - s.tax_amount) as taxable_amount,
               MAX(0, s.net_amount - COALESCE(s.paid_amount, 0)) as due_amount
        FROM sales s
        WHERE s.customer_id = $1
        ORDER BY s.date DESC, s.id DESC
      `, [numericId]);
    } else {
      bills = await db.select<PartyBillItem[]>(`
        SELECT p.id, COALESCE(p.invoice_number, '') as invoice_number, p.date,
               p.net_amount, COALESCE(p.paid_amount, 0) as paid_amount,
               COALESCE(p.tax_amount, 0) as tax_amount, COALESCE(p.discount, 0) as discount,
               COALESCE(p.status, 'Paid') as status, 'Cash' as payment_method,
               (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) as item_count,
               (SELECT GROUP_CONCAT(pr.name || ' x' || pi.quantity || ' (₹' || CAST(pi.purchase_rate AS TEXT) || ' / ' || COALESCE(pi.unit, pr.unit) || ')', char(10)) 
                FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id WHERE pi.purchase_id = p.id) as products_bought,
               (SELECT COALESCE(SUM(pi.quantity), 0) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_quantity,
               (p.net_amount - p.tax_amount) as taxable_amount,
               MAX(0, p.net_amount - COALESCE(p.paid_amount, 0)) as due_amount
        FROM purchases p
        WHERE p.supplier_id = $1
        ORDER BY p.date DESC, p.id DESC
      `, [numericId]);
    }
  } catch (err) {
    console.error('Failed to load party bills:', err);
  }

  let payments: PartyPaymentItem[] = [];
  try {
    payments = await db.select<PartyPaymentItem[]>(`
      SELECT id, date, amount, payment_mode, reference_no, notes, cheque_no, bank_name, cheque_date, cheque_status
      FROM payments
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY date DESC, id DESC
    `, [entityType, numericId]);
  } catch (err) {
    console.error('Failed to load party payments:', err);
  }

  let cheques: PaymentHistory[] = [];
  try {
    cheques = await db.select<PaymentHistory[]>(`
      SELECT p.*, 
             CASE WHEN p.entity_type = 'customer' THEN COALESCE(c.name, 'Walk-in Customer')
                  ELSE COALESCE(s.name, 'Unknown Supplier') END as entity_name
      FROM payments p
      LEFT JOIN customers c ON p.entity_type = 'customer' AND p.entity_id = c.id
      LEFT JOIN suppliers s ON p.entity_type = 'supplier' AND p.entity_id = s.id
      WHERE p.payment_mode = 'Cheque' AND p.entity_type = $1 AND p.entity_id = $2
      ORDER BY CASE WHEN p.cheque_status = 'pdc_pending' THEN 0 ELSE 1 END, p.cheque_date ASC, p.id DESC
    `, [entityType, numericId]);
  } catch (err) {
    console.error('Failed to load party cheques:', err);
  }

  let returns: PartyReturnItem[] = [];
  try {
    returns = await db.select<PartyReturnItem[]>(`
      SELECT id, date, amount, reason, CAST(transaction_id AS TEXT) as invoice_number
      FROM returns
      WHERE entity_type = $1 AND entity_id = $2
      ORDER BY date DESC, id DESC
    `, [entityType, numericId]);
  } catch (err) {
    console.error('Failed to load party returns:', err);
  }

  let ledger: LedgerEntry[] = [];
  try {
    ledger = await getPartyLedger(entityType, numericId);
  } catch (err) {
    console.error('Failed to load party ledger:', err);
  }

  // Bill-wise pending dues and totals
  const totalBilled = bills.reduce((acc, b) => acc + (b.net_amount || 0), 0);
  const totalPaid = payments
    .filter(p => !p.cheque_status || p.cheque_status === 'cleared')
    .reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalPendingDue = bills.reduce((acc, b) => acc + (b.due_amount || 0), 0);

  // Available Advance credit from party record
  let availableAdvance = 0;
  try {
    const table = entityType === 'customer' ? 'customers' : 'suppliers';
    const row = await db.select<{ advance_balance: number }[]>(
      `SELECT COALESCE(advance_balance, 0) as advance_balance FROM ${table} WHERE id = $1`,
      [numericId]
    );
    if (row.length > 0) {
      availableAdvance = row[0].advance_balance || 0;
    }
  } catch (err) {
    console.error('Failed to load party advance_balance:', err);
  }

  return {
    bills,
    payments,
    returns,
    ledger,
    cheques,
    totalBilled,
    totalPaid,
    totalBillsCount: bills.length,
    totalPendingDue,
    availableAdvance
  };
}
export interface PaymentHistory {
  id: number;
  entity_type: string;
  entity_id: number;
  entity_name: string;
  date: string;
  amount: number;
  payment_mode: string;
  reference_no: string | null;
  notes: string | null;
  cheque_no?: string | null;
  bank_name?: string | null;
  cheque_date?: string | null;
  cheque_status?: 'cleared' | 'pdc_pending' | 'bounced' | null;
}

export async function getPaymentsHistory(entityType: 'customer' | 'supplier'): Promise<PaymentHistory[]> {
  const db = await getDb();
  const table = entityType === 'customer' ? 'customers' : 'suppliers';
  return await db.select(
    `SELECT p.*, COALESCE(e.name, 'Walk-in Customer') as entity_name 
     FROM payments p 
     LEFT JOIN ${table} e ON p.entity_id = e.id 
     WHERE p.entity_type = $1 
     ORDER BY p.date DESC`,
    [entityType]
  );
}

export function isPdcDate(dateStr?: string | null): boolean {
  if (!dateStr || !dateStr.trim()) return false;
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const todayStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
  return dateStr.trim() > todayStr;
}

export async function recordPayment(
  entityType: 'customer' | 'supplier',
  entityId: number,
  amount: number,
  paymentMode: string = 'Cash',
  referenceNo: string = '',
  notes: string = '',
  chequeNo?: string | null,
  bankName?: string | null,
  chequeDate?: string | null,
  paymentDate?: string | null,
  targetBillId?: number | null
) {
  const db = await getDb();
  
  let finalPaymentDate: string | null = null;
  if (paymentDate && paymentDate.trim()) {
    const timeStr = new Date().toTimeString().split(' ')[0];
    finalPaymentDate = paymentDate.includes(' ') || paymentDate.includes('T') ? paymentDate : `${paymentDate.trim()} ${timeStr}`;
  } else {
    finalPaymentDate = getLocalTimestamp();
  }

  const isCheque = paymentMode.toLowerCase() === 'cheque';
  const isPDC = isCheque && isPdcDate(chequeDate);
  const chequeStatus = isCheque ? (isPDC ? 'pdc_pending' : 'cleared') : 'cleared';

  await db.execute(
    `INSERT INTO payments (entity_type, entity_id, date, amount, payment_mode, reference_no, notes, cheque_no, bank_name, cheque_date, cheque_status) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      entityType, 
      entityId, 
      finalPaymentDate,
      amount, 
      paymentMode, 
      referenceNo, 
      notes, 
      chequeNo ? chequeNo.trim() : null, 
      bankName ? bankName.trim() : null, 
      chequeDate ? chequeDate.trim() : null, 
      chequeStatus
    ]
  );

  // If Post-Dated Cheque (PDC), balance is NOT deducted until deposited/cleared
  if (isPDC) {
    return { chequeStatus, isPDC: true };
  }

  if (entityType === 'customer') {
    if (entityId > 0) {
      const isInitialPayment = Boolean(notes && notes.includes('Initial Payment'));
      const isAdvanceDeposit = Boolean(notes && notes.toLowerCase().includes('advance deposit'));

      if (isAdvanceDeposit) {
        // Direct advance deposit: increment advance_balance only, never touch bills or unpaid balance
        await db.execute(
          `UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
          [amount, entityId]
        );
      } else if (!isInitialPayment) {
        // Customer pays towards bills: clear bills first; excess goes to advance_balance
        let targetSale: { id: number; net_amount: number; paid_amount: number } | null = null;
        if (targetBillId) {
          const found = await db.select<{ id: number; net_amount: number; paid_amount: number }[]>(
            `SELECT id, net_amount, paid_amount FROM sales WHERE id = $1 AND customer_id = $2`,
            [targetBillId, entityId]
          );
          if (found.length > 0) targetSale = found[0];
        } else if (referenceNo && referenceNo.trim()) {
          const ref = referenceNo.trim();
          const found = await db.select<{ id: number; net_amount: number; paid_amount: number }[]>(
            `SELECT id, net_amount, paid_amount FROM sales WHERE customer_id = $1 AND (invoice_number = $2 OR CAST(id AS TEXT) = $2)`,
            [entityId, ref]
          );
          if (found.length > 0) targetSale = found[0];
        }

        if (targetSale) {
          const due = Math.max(0, targetSale.net_amount - (targetSale.paid_amount || 0));
          const payTowardsThis = Math.min(due, amount);
          const newPaid = (targetSale.paid_amount || 0) + payTowardsThis;
          const newStatus = newPaid >= (targetSale.net_amount - 0.01) ? 'Paid' : 'Partial';
          await db.execute(
            `UPDATE sales SET paid_amount = $1, status = $2 WHERE id = $3`,
            [newPaid, newStatus, targetSale.id]
          );

          // Any excess beyond this bill goes to advance_balance
          const excess = amount - payTowardsThis;
          if (excess > 0) {
            await db.execute(
              `UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
              [excess, entityId]
            );
          }
        } else {
          // General FIFO payment across unpaid bills
          let remainingPayment = amount;
          const unpaidSales = await db.select<{id: number, net_amount: number, paid_amount: number}[]>(
            `SELECT id, net_amount, paid_amount FROM sales WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned' ORDER BY id ASC`,
            [entityId]
          );
          for (const sale of unpaidSales) {
            if (remainingPayment <= 0) break;
            const due = Math.max(0, sale.net_amount - (sale.paid_amount || 0));
            if (due > 0) {
              const payTowardsThis = Math.min(due, remainingPayment);
              const newPaid = (sale.paid_amount || 0) + payTowardsThis;
              const newStatus = newPaid >= (sale.net_amount - 0.01) ? 'Paid' : 'Partial';
              await db.execute(
                `UPDATE sales SET paid_amount = $1, status = $2 WHERE id = $3`,
                [newPaid, newStatus, sale.id]
              );
              remainingPayment -= payTowardsThis;
            }
          }

          // If payment exceeded all outstanding bill dues, credit the rest to advance_balance
          if (remainingPayment > 0) {
            await db.execute(
              `UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
              [remainingPayment, entityId]
            );
          }
        }

        // Re-sync customer balance to exact sum of remaining bill dues
        await db.execute(
          `UPDATE customers SET balance = (
            SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
            FROM sales 
            WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
          ) WHERE id = $1`,
          [entityId]
        );
      }
    }
  } else {
    if (entityId > 0) {
      const isInitialPayment = Boolean(notes && notes.includes('Initial Payment'));
      const isAdvanceDeposit = Boolean(notes && notes.toLowerCase().includes('advance deposit'));

      if (isAdvanceDeposit) {
        // Direct advance payment to supplier: increment advance_balance only, never touch bills or unpaid balance
        await db.execute(
          `UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
          [amount, entityId]
        );
      } else if (!isInitialPayment) {
        // Supplier payment towards bills: clear bills first; excess goes to advance_balance
        let targetPurchase: { id: number; net_amount: number; paid_amount: number } | null = null;
        if (targetBillId) {
          const found = await db.select<{ id: number; net_amount: number; paid_amount: number }[]>(
            `SELECT id, net_amount, paid_amount FROM purchases WHERE id = $1 AND supplier_id = $2`,
            [targetBillId, entityId]
          );
          if (found.length > 0) targetPurchase = found[0];
        } else if (referenceNo && referenceNo.trim()) {
          const ref = referenceNo.trim();
          const found = await db.select<{ id: number; net_amount: number; paid_amount: number }[]>(
            `SELECT id, net_amount, paid_amount FROM purchases WHERE supplier_id = $1 AND (invoice_number = $2 OR CAST(id AS TEXT) = $2)`,
            [entityId, ref]
          );
          if (found.length > 0) targetPurchase = found[0];
        }

        if (targetPurchase) {
          const due = Math.max(0, targetPurchase.net_amount - (targetPurchase.paid_amount || 0));
          const payTowardsThis = Math.min(due, amount);
          const newPaid = (targetPurchase.paid_amount || 0) + payTowardsThis;
          const newStatus = newPaid >= (targetPurchase.net_amount - 0.01) ? 'Paid' : 'Partial';
          await db.execute(
            `UPDATE purchases SET paid_amount = $1, status = $2 WHERE id = $3`,
            [newPaid, newStatus, targetPurchase.id]
          );

          // Any excess beyond this bill goes to advance_balance
          const excess = amount - payTowardsThis;
          if (excess > 0) {
            await db.execute(
              `UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
              [excess, entityId]
            );
          }
        } else {
          // General FIFO payment to supplier across unpaid purchases
          let remainingPayment = amount;
          const unpaidPurchases = await db.select<{id: number, net_amount: number, paid_amount: number}[]>(
            `SELECT id, net_amount, paid_amount FROM purchases WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned' ORDER BY id ASC`,
            [entityId]
          );
          for (const pur of unpaidPurchases) {
            if (remainingPayment <= 0) break;
            const due = Math.max(0, pur.net_amount - (pur.paid_amount || 0));
            if (due > 0) {
              const payTowardsThis = Math.min(due, remainingPayment);
              const newPaid = (pur.paid_amount || 0) + payTowardsThis;
              const newStatus = newPaid >= (pur.net_amount - 0.01) ? 'Paid' : 'Partial';
              await db.execute(
                `UPDATE purchases SET paid_amount = $1, status = $2 WHERE id = $3`,
                [newPaid, newStatus, pur.id]
              );
              remainingPayment -= payTowardsThis;
            }
          }

          // If payment exceeded all outstanding purchase dues, credit the rest to advance_balance
          if (remainingPayment > 0) {
            await db.execute(
              `UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
              [remainingPayment, entityId]
            );
          }
        }

        // Re-sync supplier balance to exact sum of remaining purchase dues
        await db.execute(
          `UPDATE suppliers SET balance = (
            SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
            FROM purchases 
            WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
          ) WHERE id = $1`,
          [entityId]
        );
      }
    }
  }

  return { chequeStatus, isPDC: false };
}

export async function applyAdvanceToClearDues(
  entityType: 'customer' | 'supplier',
  entityId: number,
  amountToApply: number
) {
  const db = await getDb();
  if (amountToApply <= 0 || entityId <= 0) return { clearedCount: 0, appliedAmount: 0 };

  const partyTable = entityType === 'customer' ? 'customers' : 'suppliers';
  const partyRes = await db.select<{ advance_balance: number }[]>(
    `SELECT COALESCE(advance_balance, 0) as advance_balance FROM ${partyTable} WHERE id = $1`,
    [entityId]
  );
  const currentAdvance = partyRes.length > 0 ? partyRes[0].advance_balance : 0;
  const maxToApply = Math.min(amountToApply, currentAdvance);
  if (maxToApply <= 0) return { clearedCount: 0, appliedAmount: 0 };

  let remaining = maxToApply;
  const clearedBills: string[] = [];

  if (entityType === 'customer') {
    const unpaidSales = await db.select<{id: number, invoice_number: string, net_amount: number, paid_amount: number}[]>(
      `SELECT id, invoice_number, net_amount, COALESCE(paid_amount, 0) as paid_amount 
       FROM sales 
       WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned' 
       ORDER BY id ASC`,
      [entityId]
    );

    for (const sale of unpaidSales) {
      if (remaining <= 0) break;
      const due = Math.max(0, sale.net_amount - (sale.paid_amount || 0));
      if (due > 0) {
        const payTowardsThis = Math.min(due, remaining);
        const newPaid = (sale.paid_amount || 0) + payTowardsThis;
        const newStatus = newPaid >= (sale.net_amount - 0.01) ? 'Paid' : 'Partial';
        await db.execute(
          `UPDATE sales SET paid_amount = $1, status = $2 WHERE id = $3`,
          [newPaid, newStatus, sale.id]
        );
        remaining -= payTowardsThis;
        clearedBills.push(sale.invoice_number || `#${sale.id}`);
      }
    }
  } else {
    const unpaidPurchases = await db.select<{id: number, invoice_number: string, net_amount: number, paid_amount: number}[]>(
      `SELECT id, invoice_number, net_amount, COALESCE(paid_amount, 0) as paid_amount 
       FROM purchases 
       WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned' 
       ORDER BY id ASC`,
      [entityId]
    );

    for (const pur of unpaidPurchases) {
      if (remaining <= 0) break;
      const due = Math.max(0, pur.net_amount - (pur.paid_amount || 0));
      if (due > 0) {
        const payTowardsThis = Math.min(due, remaining);
        const newPaid = (pur.paid_amount || 0) + payTowardsThis;
        const newStatus = newPaid >= (pur.net_amount - 0.01) ? 'Paid' : 'Partial';
        await db.execute(
          `UPDATE purchases SET paid_amount = $1, status = $2 WHERE id = $3`,
          [newPaid, newStatus, pur.id]
        );
        remaining -= payTowardsThis;
        clearedBills.push(pur.invoice_number || `#${pur.id}`);
      }
    }
  }

  const appliedAmount = maxToApply - remaining;
  if (appliedAmount > 0 && clearedBills.length > 0) {
    // Deduct applied amount from stored advance_balance
    await db.execute(
      `UPDATE ${partyTable} SET advance_balance = MAX(0, COALESCE(advance_balance, 0) - $1) WHERE id = $2`,
      [appliedAmount, entityId]
    );

    // Re-sync balance to remaining unpaid bill dues
    if (entityType === 'customer') {
      await db.execute(
        `UPDATE customers SET balance = (
          SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
          FROM sales 
          WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
        ) WHERE id = $1`,
        [entityId]
      );
    } else {
      await db.execute(
        `UPDATE suppliers SET balance = (
          SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
          FROM purchases 
          WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
        ) WHERE id = $1`,
        [entityId]
      );
    }

    const billListStr = clearedBills.join(', ');
    await db.execute(
      `INSERT INTO payments (entity_type, entity_id, date, amount, payment_mode, reference_no, notes, cheque_status) 
       VALUES ($1, $2, $3, 0, 'Advance Adjustment', $4, $5, 'cleared')`,
      [
        entityType,
        entityId,
        getLocalTimestamp(),
        `Bills: ${billListStr}`,
        `Cleared dues (₹${appliedAmount.toFixed(2)}) using stored advance balance against ${billListStr}`
      ]
    );
  }

  return { clearedCount: clearedBills.length, appliedAmount };
}

export async function clearPdcCheque(paymentId: number) {
  const db = await getDb();
  const list = await db.select<any[]>('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (list.length === 0) throw new Error('Payment not found');
  const p = list[0];
  if (p.cheque_status === 'cleared') {
    throw new Error('Cheque is already cleared');
  }

  // Mark as cleared
  await db.execute("UPDATE payments SET cheque_status = 'cleared' WHERE id = $1", [paymentId]);

  const amount = Number(p.amount);
  const entityId = Number(p.entity_id);
  const entityType = p.entity_type;
  const ref = (p.reference_no || '').trim();
  const isAdvanceDeposit = Boolean(p.notes && p.notes.toLowerCase().includes('advance deposit'));

  if (entityType === 'customer' && entityId > 0) {
    if (isAdvanceDeposit) {
      await db.execute('UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [amount, entityId]);
    } else {
      // Check if cheque was for a specific sale bill
      let targetSale: { id: number; net_amount: number; paid_amount: number } | null = null;
      if (ref) {
        const found = await db.select<{ id: number; net_amount: number; paid_amount: number }[]>(
          `SELECT id, net_amount, paid_amount FROM sales WHERE customer_id = $1 AND (invoice_number = $2 OR CAST(id AS TEXT) = $2)`,
          [entityId, ref]
        );
        if (found.length > 0) targetSale = found[0];
      }

      if (targetSale) {
        const due = Math.max(0, targetSale.net_amount - (targetSale.paid_amount || 0));
        const payTowardsThis = Math.min(due, amount);
        const newPaid = (targetSale.paid_amount || 0) + payTowardsThis;
        const newStatus = newPaid >= (targetSale.net_amount - 0.01) ? 'Paid' : 'Partial';
        await db.execute('UPDATE sales SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, newStatus, targetSale.id]);

        const excess = amount - payTowardsThis;
        if (excess > 0) {
          await db.execute('UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [excess, entityId]);
        }
      } else {
        let remainingPayment = amount;
        const unpaidSales = await db.select<{id: number, net_amount: number, paid_amount: number}[]>(
          `SELECT id, net_amount, paid_amount FROM sales WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned' ORDER BY id ASC`,
          [entityId]
        );
        for (const sale of unpaidSales) {
          if (remainingPayment <= 0) break;
          const due = Math.max(0, sale.net_amount - (sale.paid_amount || 0));
          if (due > 0) {
            const payTowardsThis = Math.min(due, remainingPayment);
            const newPaid = (sale.paid_amount || 0) + payTowardsThis;
            const newStatus = newPaid >= (sale.net_amount - 0.01) ? 'Paid' : 'Partial';
            await db.execute('UPDATE sales SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, newStatus, sale.id]);
            remainingPayment -= payTowardsThis;
          }
        }
        if (remainingPayment > 0) {
          await db.execute('UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [remainingPayment, entityId]);
        }
      }

      // Re-sync customer balance
      await db.execute(
        `UPDATE customers SET balance = (
          SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
          FROM sales 
          WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
        ) WHERE id = $1`,
        [entityId]
      );
    }
  } else if (entityType === 'supplier' && entityId > 0) {
    if (isAdvanceDeposit) {
      await db.execute('UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [amount, entityId]);
    } else {
      // Check if cheque was for a specific purchase bill
      let targetPurchase: { id: number; net_amount: number; paid_amount: number } | null = null;
      if (ref) {
        const found = await db.select<{ id: number; net_amount: number; paid_amount: number }[]>(
          `SELECT id, net_amount, paid_amount FROM purchases WHERE supplier_id = $1 AND (invoice_number = $2 OR CAST(id AS TEXT) = $2)`,
          [entityId, ref]
        );
        if (found.length > 0) targetPurchase = found[0];
      }

      if (targetPurchase) {
        const due = Math.max(0, targetPurchase.net_amount - (targetPurchase.paid_amount || 0));
        const payTowardsThis = Math.min(due, amount);
        const newPaid = (targetPurchase.paid_amount || 0) + payTowardsThis;
        const newStatus = newPaid >= (targetPurchase.net_amount - 0.01) ? 'Paid' : 'Partial';
        await db.execute('UPDATE purchases SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, newStatus, targetPurchase.id]);

        const excess = amount - payTowardsThis;
        if (excess > 0) {
          await db.execute('UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [excess, entityId]);
        }
      } else {
        let remainingPayment = amount;
        const unpaidPurchases = await db.select<{id: number, net_amount: number, paid_amount: number}[]>(
          `SELECT id, net_amount, paid_amount FROM purchases WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned' ORDER BY id ASC`,
          [entityId]
        );
        for (const pur of unpaidPurchases) {
          if (remainingPayment <= 0) break;
          const due = Math.max(0, pur.net_amount - (pur.paid_amount || 0));
          if (due > 0) {
            const payTowardsThis = Math.min(due, remainingPayment);
            const newPaid = (pur.paid_amount || 0) + payTowardsThis;
            const newStatus = newPaid >= (pur.net_amount - 0.01) ? 'Paid' : 'Partial';
            await db.execute('UPDATE purchases SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, newStatus, pur.id]);
            remainingPayment -= payTowardsThis;
          }
        }
        if (remainingPayment > 0) {
          await db.execute('UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2', [remainingPayment, entityId]);
        }
      }

      // Re-sync supplier balance
      await db.execute(
        `UPDATE suppliers SET balance = (
          SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
          FROM purchases 
          WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
        ) WHERE id = $1`,
        [entityId]
      );
    }
  }
}

export async function bounceCheque(paymentId: number) {
  const db = await getDb();
  const list = await db.select<any[]>('SELECT * FROM payments WHERE id = $1', [paymentId]);
  if (list.length === 0) throw new Error('Payment not found');
  const p = list[0];
  if (p.cheque_status === 'bounced') return;

  const wasCleared = p.cheque_status === 'cleared';
  await db.execute("UPDATE payments SET cheque_status = 'bounced' WHERE id = $1", [paymentId]);

  // If it was previously cleared, revert the party balance and bill paid_amount
  if (wasCleared) {
    const amount = Number(p.amount);
    const entityId = Number(p.entity_id);
    const ref = (p.reference_no || '').trim();

    if (p.entity_type === 'customer' && entityId > 0) {
      await db.execute('UPDATE customers SET balance = balance + $1 WHERE id = $2', [amount, entityId]);
      if (ref) {
        const found = await db.select<{id: number, net_amount: number, paid_amount: number}[]>(
          `SELECT id, net_amount, paid_amount FROM sales WHERE customer_id = $1 AND (invoice_number = $2 OR CAST(id AS TEXT) = $2)`,
          [entityId, ref]
        );
        if (found.length > 0) {
          const s = found[0];
          const newPaid = Math.max(0, (s.paid_amount || 0) - amount);
          const newStatus = newPaid <= 0.01 ? 'Unpaid' : newPaid < (s.net_amount - 0.01) ? 'Partial' : 'Paid';
          await db.execute('UPDATE sales SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, newStatus, s.id]);
        }
      }
    } else if (p.entity_type === 'supplier' && entityId > 0) {
      await db.execute('UPDATE suppliers SET balance = balance + $1 WHERE id = $2', [amount, entityId]);
      if (ref) {
        const found = await db.select<{id: number, net_amount: number, paid_amount: number}[]>(
          `SELECT id, net_amount, paid_amount FROM purchases WHERE supplier_id = $1 AND (invoice_number = $2 OR CAST(id AS TEXT) = $2)`,
          [entityId, ref]
        );
        if (found.length > 0) {
          const pur = found[0];
          const newPaid = Math.max(0, (pur.paid_amount || 0) - amount);
          const newStatus = newPaid <= 0.01 ? 'Unpaid' : newPaid < (pur.net_amount - 0.01) ? 'Partial' : 'Paid';
          await db.execute('UPDATE purchases SET paid_amount = $1, status = $2 WHERE id = $3', [newPaid, newStatus, pur.id]);
        }
      }
    }
  }
}

export async function getChequesRegister(entityType?: 'customer' | 'supplier'): Promise<PaymentHistory[]> {
  const db = await getDb();
  let query = `
    SELECT p.*, 
           CASE WHEN p.entity_type = 'customer' THEN COALESCE(c.name, 'Walk-in Customer')
                ELSE COALESCE(s.name, 'Unknown Supplier') END as entity_name
    FROM payments p
    LEFT JOIN customers c ON p.entity_type = 'customer' AND p.entity_id = c.id
    LEFT JOIN suppliers s ON p.entity_type = 'supplier' AND p.entity_id = s.id
    WHERE p.payment_mode = 'Cheque'
  `;
  const params: any[] = [];
  if (entityType) {
    query += ` AND p.entity_type = $1`;
    params.push(entityType);
  }
  query += ` ORDER BY CASE WHEN p.cheque_status = 'pdc_pending' THEN 0 ELSE 1 END, p.cheque_date ASC, p.id DESC`;
  return await db.select(query, params);
}

export interface Expense {
  id: number;
  category: string;
  amount: number;
  date: string;
  description: string | null;
}

export async function getExpenses(): Promise<Expense[]> {
  const db = await getDb();
  return await db.select('SELECT * FROM expenses ORDER BY id DESC');
}

export async function recordExpense(category: string, amount: number, description: string) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO expenses (category, amount, description) VALUES ($1, $2, $3)`,
    [category, amount, description]
  );
}

export async function updateExpense(id: number, category: string, amount: number, description: string) {
  const db = await getDb();
  await db.execute(
    `UPDATE expenses SET category = $1, amount = $2, description = $3 WHERE id = $4`,
    [category, amount, description, id]
  );
}

export async function deleteExpense(id: number) {
  const db = await getDb();
  await db.execute(`DELETE FROM expenses WHERE id = $1`, [id]);
}

export interface ReturnRecord {
  id: number;
  entity_type: 'customer' | 'supplier';
  entity_id: number;
  transaction_id: number | null;
  product_id: number;
  quantity: number;
  amount: number;
  date: string;
  reason: string | null;
}

export async function getReturns(entityType: 'customer' | 'supplier'): Promise<ReturnRecord[]> {
  const db = await getDb();
  return await db.select('SELECT * FROM returns WHERE entity_type = $1 ORDER BY id DESC', [entityType]);
}

export async function recordReturn(
  entityType: 'customer' | 'supplier',
  entityId: number,
  transactionId: number | null,
  productId: number,
  quantity: number,
  amount: number,
  reason: string,
  refundMethod: 'credit' | 'cash' = 'credit'
) {
  const db = await getDb();
  const numQty = Number(quantity);
  const numAmt = Number(amount);
  if (isNaN(numQty) || numQty <= 0) {
    throw new Error('Return quantity must be greater than zero.');
  }
  if (isNaN(numAmt) || numAmt < 0) {
    throw new Error('Return amount cannot be negative.');
  }

  const returnDate = getLocalTimestamp();

  if (entityType === 'customer') {
    let saleRow: {
      id: number;
      invoice_number: string | null;
      customer_id: number;
      source_type: string | null;
      source_warehouse_id: number | null;
      net_amount: number;
      paid_amount: number;
    } | null = null;

    if (transactionId) {
      const sales = await db.select<{
        id: number;
        invoice_number: string | null;
        customer_id: number;
        source_type: string | null;
        source_warehouse_id: number | null;
        net_amount: number;
        paid_amount: number;
      }[]>(
        `SELECT id, invoice_number, customer_id, source_type, source_warehouse_id, net_amount, COALESCE(paid_amount, 0) as paid_amount 
         FROM sales WHERE id = $1`,
        [transactionId]
      );
      if (sales.length > 0) {
        saleRow = sales[0];
      }

      // Check max returnable for this item
      const itemRow = await db.select<{ quantity: number }[]>(
        `SELECT quantity FROM sale_items WHERE sale_id = $1 AND product_id = $2`,
        [transactionId, productId]
      );
      if (itemRow.length > 0) {
        const billedQty = itemRow[0].quantity;
        const retRes = await db.select<{ total_ret: number }[]>(
          `SELECT COALESCE(SUM(quantity), 0) as total_ret FROM returns WHERE transaction_id = $1 AND product_id = $2 AND entity_type = 'customer'`,
          [transactionId, productId]
        );
        const alreadyRet = retRes[0]?.total_ret || 0;
        const maxReturnable = billedQty - alreadyRet;
        if (numQty > maxReturnable + 0.0001) {
          throw new Error(`Cannot return ${numQty}. Only ${maxReturnable} remaining returnable for this product.`);
        }
      }
    }

    // Insert into returns table
    await db.execute(
      `INSERT INTO returns (entity_type, entity_id, transaction_id, product_id, quantity, amount, date, reason) 
       VALUES ('customer', $1, $2, $3, $4, $5, $6, $7)`,
      [entityId, transactionId, productId, numQty, numAmt, returnDate, reason]
    );

    // Customer return: goods are returned to inventory (restock)
    const custRes = entityId > 0 ? await db.select<{ name: string }[]>('SELECT name FROM customers WHERE id = $1', [entityId]) : [];
    const custName = custRes.length > 0 ? custRes[0].name : 'Walk-in Customer';

    if (saleRow && saleRow.source_type === 'warehouse' && saleRow.source_warehouse_id) {
      await db.execute(
        `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
         VALUES ($1, $2, $3) 
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
        [saleRow.source_warehouse_id, productId, numQty]
      );
      // Log stock movement
      await db.execute(
        `INSERT INTO stock_movements (date, from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ($1, 'customer', $2, $3, 'warehouse', $4, 'Warehouse', $5, $6, $7)`,
        [returnDate, entityId, custName, saleRow.source_warehouse_id, productId, numQty, `Customer Return - Sale #${saleRow.invoice_number || transactionId}`]
      );
    } else {
      await db.execute(`UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [numQty, productId]);
      // Log stock movement
      await db.execute(
        `INSERT INTO stock_movements (date, from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ($1, 'customer', $2, $3, 'shop', 0, 'Main Shop', $4, $5, $6)`,
        [returnDate, entityId, custName, productId, numQty, `Customer Return - Sale #${saleRow?.invoice_number || transactionId || 'POS'}`]
      );
    }

    // Financial adjustment
    if (saleRow && transactionId) {
      const oldNet = saleRow.net_amount;
      const oldPaid = saleRow.paid_amount;
      const newNet = Math.max(0, oldNet - numAmt);

      if (oldPaid > newNet) {
        // Customer overpaid on this bill because the net total reduced below what they paid
        const excessPaid = oldPaid - newNet;
        if (refundMethod === 'credit' && entityId > 0) {
          // Add excess to customer advance balance
          await db.execute(
            `UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
            [excessPaid, entityId]
          );
          await db.execute(`UPDATE sales SET net_amount = $1, paid_amount = $2 WHERE id = $3`, [newNet, newNet, transactionId]);
        } else {
          // Cash refund: payout cash
          await db.execute(
            `INSERT INTO payments (entity_type, entity_id, date, amount, payment_mode, reference_no, notes) 
             VALUES ('customer', $1, $2, $3, 'Cash', $4, 'Cash Refund for Return')`,
            [entityId, returnDate, -excessPaid, saleRow.invoice_number ? `Ret-${saleRow.invoice_number}` : `Ret-Inv-${transactionId}`]
          );
          await db.execute(`UPDATE sales SET net_amount = $1, paid_amount = $2 WHERE id = $3`, [newNet, newNet, transactionId]);
        }
      } else {
        // Bill was unpaid or partially paid; reducing net_amount lowers the pending due
        await db.execute(`UPDATE sales SET net_amount = $1 WHERE id = $2`, [newNet, transactionId]);
      }

      // Update bill status
      const retRes = await db.select<{ total_returned: number }[]>(
        `SELECT SUM(quantity) as total_returned FROM returns WHERE transaction_id = $1 AND entity_type = 'customer'`,
        [transactionId]
      );
      const saleRes = await db.select<{ total_billed: number }[]>(
        `SELECT SUM(quantity) as total_billed FROM sale_items WHERE sale_id = $1`,
        [transactionId]
      );
      const totalReturned = retRes[0]?.total_returned || 0;
      const totalBilled = saleRes[0]?.total_billed || 0;

      const updatedPaidRes = await db.select<{ paid_amount: number; net_amount: number }[]>(
        `SELECT paid_amount, net_amount FROM sales WHERE id = $1`,
        [transactionId]
      );
      const currentPaid = updatedPaidRes[0]?.paid_amount || 0;
      const currentNet = updatedPaidRes[0]?.net_amount || 0;

      let newStatus = 'Unpaid';
      if (totalReturned >= totalBilled && totalBilled > 0) {
        newStatus = 'Returned';
      } else if (currentPaid >= currentNet && currentNet > 0) {
        newStatus = 'Paid';
      } else if (currentPaid > 0) {
        newStatus = 'Partial';
      }
      await db.execute(`UPDATE sales SET status = $1 WHERE id = $2`, [newStatus, transactionId]);
    } else {
      // Standalone return without transactionId
      if (refundMethod === 'credit' && entityId > 0) {
        await db.execute(`UPDATE customers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`, [numAmt, entityId]);
      } else if (refundMethod === 'cash') {
        await db.execute(
          `INSERT INTO payments (entity_type, entity_id, date, amount, payment_mode, reference_no, notes) 
           VALUES ('customer', $1, $2, $3, 'Cash', 'Return', 'Cash Refund for Return')`,
          [entityId, returnDate, -numAmt]
        );
      }
    }

    // Always re-sync customer unpaid balance
    if (entityId > 0) {
      await db.execute(
        `UPDATE customers SET balance = (
           SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
           FROM sales 
           WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'
         ) WHERE id = $1`,
        [entityId]
      );
    }

  } else {
    // SUPPLIER RETURN (Us returning to supplier)
    let purRow: {
      id: number;
      invoice_number: string | null;
      supplier_id: number;
      destination_type: string | null;
      destination_warehouse_id: number | null;
      net_amount: number;
      paid_amount: number;
    } | null = null;

    if (transactionId) {
      const purchases = await db.select<{
        id: number;
        invoice_number: string | null;
        supplier_id: number;
        destination_type: string | null;
        destination_warehouse_id: number | null;
        net_amount: number;
        paid_amount: number;
      }[]>(
        `SELECT id, invoice_number, supplier_id, destination_type, destination_warehouse_id, net_amount, COALESCE(paid_amount, 0) as paid_amount 
         FROM purchases WHERE id = $1`,
        [transactionId]
      );
      if (purchases.length > 0) {
        purRow = purchases[0];
      }

      // Check max returnable for this item
      const itemRow = await db.select<{ quantity: number }[]>(
        `SELECT quantity FROM purchase_items WHERE purchase_id = $1 AND product_id = $2`,
        [transactionId, productId]
      );
      if (itemRow.length > 0) {
        const billedQty = itemRow[0].quantity;
        const retRes = await db.select<{ total_ret: number }[]>(
          `SELECT COALESCE(SUM(quantity), 0) as total_ret FROM returns WHERE transaction_id = $1 AND product_id = $2 AND entity_type = 'supplier'`,
          [transactionId, productId]
        );
        const alreadyRet = retRes[0]?.total_ret || 0;
        const maxReturnable = billedQty - alreadyRet;
        if (numQty > maxReturnable + 0.0001) {
          throw new Error(`Cannot return ${numQty}. Only ${maxReturnable} remaining returnable for this product.`);
        }
      }
    }

    // Check available stock in our inventory before returning to supplier!
    let availableStock = 0;
    if (purRow && purRow.destination_type === 'warehouse' && purRow.destination_warehouse_id) {
      const whStock = await db.select<{ quantity: number }[]>(
        `SELECT COALESCE(quantity, 0) as quantity FROM warehouse_items WHERE warehouse_id = $1 AND product_id = $2`,
        [purRow.destination_warehouse_id, productId]
      );
      availableStock = whStock.length > 0 ? whStock[0].quantity : 0;
    } else {
      const prodStock = await db.select<{ stock_quantity: number }[]>(
        `SELECT COALESCE(stock_quantity, 0) as stock_quantity FROM products WHERE id = $1`,
        [productId]
      );
      availableStock = prodStock.length > 0 ? prodStock[0].stock_quantity : 0;
    }

    if (numQty > availableStock + 0.0001) {
      throw new Error(`Cannot return ${numQty} items to supplier. Only ${availableStock} items currently in stock.`);
    }

    // Insert into returns table
    await db.execute(
      `INSERT INTO returns (entity_type, entity_id, transaction_id, product_id, quantity, amount, date, reason) 
       VALUES ('supplier', $1, $2, $3, $4, $5, $6, $7)`,
      [entityId, transactionId, productId, numQty, numAmt, returnDate, reason]
    );

    // Deduct stock and log movement
    const suppRes = entityId > 0 ? await db.select<{ name: string }[]>('SELECT name FROM suppliers WHERE id = $1', [entityId]) : [];
    const suppName = suppRes.length > 0 ? suppRes[0].name : 'Supplier';

    if (purRow && purRow.destination_type === 'warehouse' && purRow.destination_warehouse_id) {
      await db.execute(
        `UPDATE warehouse_items SET quantity = MAX(0, quantity - $1) WHERE warehouse_id = $2 AND product_id = $3`,
        [numQty, purRow.destination_warehouse_id, productId]
      );
      await db.execute(
        `INSERT INTO stock_movements (date, from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ($1, 'warehouse', $2, 'Warehouse', 'supplier', $3, $4, $5, $6, $7)`,
        [returnDate, purRow.destination_warehouse_id, entityId, suppName, productId, numQty, `Purchase Return - Pur #${purRow.invoice_number || transactionId}`]
      );
    } else {
      await db.execute(`UPDATE products SET stock_quantity = MAX(0, stock_quantity - $1) WHERE id = $2`, [numQty, productId]);
      await db.execute(
        `INSERT INTO stock_movements (date, from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ($1, 'shop', 0, 'Main Shop', 'supplier', $2, $3, $4, $5, $6)`,
        [returnDate, entityId, suppName, productId, numQty, `Purchase Return - Pur #${purRow?.invoice_number || transactionId || 'General'}`]
      );
    }

    // Financial adjustment
    if (purRow && transactionId) {
      const oldNet = purRow.net_amount;
      const oldPaid = purRow.paid_amount;
      const newNet = Math.max(0, oldNet - numAmt);

      if (oldPaid > newNet) {
        const excessPaid = oldPaid - newNet;
        if (refundMethod === 'credit' && entityId > 0) {
          await db.execute(
            `UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`,
            [excessPaid, entityId]
          );
          await db.execute(`UPDATE purchases SET net_amount = $1, paid_amount = $2 WHERE id = $3`, [newNet, newNet, transactionId]);
        } else {
          await db.execute(
            `INSERT INTO payments (entity_type, entity_id, date, amount, payment_mode, reference_no, notes) 
             VALUES ('supplier', $1, $2, $3, 'Cash', $4, 'Cash Refund for Purchase Return')`,
            [entityId, returnDate, -excessPaid, purRow.invoice_number ? `Ret-${purRow.invoice_number}` : `Ret-Pur-${transactionId}`]
          );
          await db.execute(`UPDATE purchases SET net_amount = $1, paid_amount = $2 WHERE id = $3`, [newNet, newNet, transactionId]);
        }
      } else {
        await db.execute(`UPDATE purchases SET net_amount = $1 WHERE id = $2`, [newNet, transactionId]);
      }

      // Update purchase status
      const retRes = await db.select<{ total_returned: number }[]>(
        `SELECT SUM(quantity) as total_returned FROM returns WHERE transaction_id = $1 AND entity_type = 'supplier'`,
        [transactionId]
      );
      const purRes = await db.select<{ total_billed: number }[]>(
        `SELECT SUM(quantity) as total_billed FROM purchase_items WHERE purchase_id = $1`,
        [transactionId]
      );
      const totalReturned = retRes[0]?.total_returned || 0;
      const totalBilled = purRes[0]?.total_billed || 0;

      const updatedPaidRes = await db.select<{ paid_amount: number; net_amount: number }[]>(
        `SELECT paid_amount, net_amount FROM purchases WHERE id = $1`,
        [transactionId]
      );
      const currentPaid = updatedPaidRes[0]?.paid_amount || 0;
      const currentNet = updatedPaidRes[0]?.net_amount || 0;

      let newStatus = 'Unpaid';
      if (totalReturned >= totalBilled && totalBilled > 0) {
        newStatus = 'Returned';
      } else if (currentPaid >= currentNet && currentNet > 0) {
        newStatus = 'Paid';
      } else if (currentPaid > 0) {
        newStatus = 'Partial';
      }
      await db.execute(`UPDATE purchases SET status = $1 WHERE id = $2`, [newStatus, transactionId]);
    } else {
      if (refundMethod === 'credit' && entityId > 0) {
        await db.execute(`UPDATE suppliers SET advance_balance = COALESCE(advance_balance, 0) + $1 WHERE id = $2`, [numAmt, entityId]);
      } else if (refundMethod === 'cash') {
        await db.execute(
          `INSERT INTO payments (entity_type, entity_id, date, amount, payment_mode, reference_no, notes) 
           VALUES ('supplier', $1, $2, $3, 'Cash', 'Return', 'Cash Refund for Purchase Return')`,
          [entityId, returnDate, -numAmt]
        );
      }
    }

    // Always re-sync supplier unpaid balance
    if (entityId > 0) {
      await db.execute(
        `UPDATE suppliers SET balance = (
           SELECT COALESCE(SUM(MAX(0, net_amount - COALESCE(paid_amount, 0))), 0) 
           FROM purchases 
           WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'
         ) WHERE id = $1`,
        [entityId]
      );
    }
  }
}

export interface DashboardStats {
  totalProducts: number;
  lowStockItems: number;
  totalInventoryValue: number;
  totalReceivables: number;
  totalPayables: number;
  totalExpenses: number;
  totalSales: number;
  netProfit: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = await getDb();
  
  // Products stats
  const products = await db.select<{stock_quantity: number, purchase_price: number, selling_price: number}[]>('SELECT stock_quantity, purchase_price, selling_price FROM products WHERE is_group = 0');
  const totalProducts = products.length;
  const threshold = parseInt(localStorage.getItem('lowStockThreshold') || '10', 10);
  const lowStockItems = products.filter(p => p.stock_quantity < threshold).length;
  let totalInventoryValue = products.reduce((sum, p) => sum + (p.stock_quantity * (p.purchase_price > 0 ? p.purchase_price : p.selling_price)), 0);
  try {
    const whStock = await db.select<{quantity: number, purchase_price: number, selling_price: number}[]>(`
      SELECT wi.quantity, p.purchase_price, p.selling_price 
      FROM warehouse_items wi 
      JOIN products p ON wi.product_id = p.id 
      WHERE wi.quantity > 0
    `);
    const whValuation = whStock.reduce((sum, wi) => sum + (wi.quantity * (wi.purchase_price > 0 ? wi.purchase_price : wi.selling_price)), 0);
    totalInventoryValue += whValuation;
  } catch (e) {}
  
  // Receivables (Customers owe us)
  const customers = await db.select<{balance: number}[]>('SELECT balance FROM customers WHERE balance > 0');
  const totalReceivables = customers.reduce((sum, c) => sum + c.balance, 0);
  
  // Payables (We owe suppliers)
  const suppliers = await db.select<{balance: number}[]>('SELECT balance FROM suppliers WHERE balance > 0');
  const totalPayables = suppliers.reduce((sum, s) => sum + s.balance, 0);

  // Expenses total
  const expenses = await db.select<{amount: number}[]>('SELECT amount FROM expenses');
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Total Sales
  const sales = await db.select<{net_amount: number}[]>('SELECT net_amount FROM sales');
  let totalSales = sales.reduce((sum, s) => sum + s.net_amount, 0);
  
  // Subtract returns from sales
  const salesReturns = await db.select<{amount: number}[]>('SELECT amount FROM returns WHERE entity_type = $1', ['customer']);
  const totalSalesReturns = salesReturns.reduce((sum, r) => sum + r.amount, 0);
  totalSales -= totalSalesReturns;
  
  // Gross Profit calculation based on profitTaxMode ('with_gst' vs 'without_gst')
  const profitTaxMode = localStorage.getItem('profitTaxMode') || 'with_gst';
  const taxDeduction = profitTaxMode === 'without_gst' ? ' - s.tax_amount' : '';
  const profitData = await db.select<{profit: number}[]>(`
    SELECT (s.net_amount${taxDeduction} - 
      COALESCE((SELECT SUM(p.purchase_price * si.quantity) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id), 0)
    ) as profit 
    FROM sales s
  `);
  let grossProfit = profitData.reduce((sum, row) => sum + (row.profit || 0), 0);
  
  // Deduct profit lost on returned items
  const returnProfitLossData = await db.select<{loss: number}[]>(`
    SELECT COALESCE(SUM(r.amount - (r.quantity * p.purchase_price)), 0) as loss
    FROM returns r
    JOIN products p ON r.product_id = p.id
    WHERE r.entity_type = 'customer'
  `);
  const returnProfitLoss = returnProfitLossData[0]?.loss || 0;
  grossProfit -= returnProfitLoss;
  
  // Net Profit = Gross Profit - Expenses
  const netProfit = grossProfit - totalExpenses;
  
  return {
    totalProducts,
    lowStockItems,
    totalInventoryValue,
    totalReceivables,
    totalPayables,
    totalExpenses,
    totalSales,
    netProfit
  };
}

export interface DueChequeItem {
  id: number;
  entity_type: 'customer' | 'supplier';
  entity_id: number;
  entity_name: string;
  amount: number;
  cheque_no: string | null;
  bank_name: string | null;
  cheque_date: string | null;
  cheque_status: string;
  days_diff: number;
  status_label: string;
}

export interface DashboardChequesSummary {
  dueTodayCount: number;
  dueTodayAmount: number;
  overdueCount: number;
  overdueAmount: number;
  totalPendingCount: number;
  totalPendingAmount: number;
  chequesList: DueChequeItem[];
}

export interface DashboardExtraData {
  recentSales: { id: number; invoice_number: string; customer_name: string; date: string; net_amount: number; status: string }[];
  weeklySales: { date: string; day: string; amount: number }[];
  topProducts: { id: number; name: string; quantity: number; revenue: number }[];
  lowStockProducts: { id: number; name: string; model: string | null; stock_quantity: number; min_stock: number; unit: string }[];
  chequesSummary: DashboardChequesSummary;
}

export async function getDashboardExtraData(): Promise<DashboardExtraData> {
  const db = await getDb();
  
  // Recent 5 sales
  const recentSales = await db.select<{ id: number; invoice_number: string; customer_name: string; date: string; net_amount: number; status: string }[]>(`
    SELECT s.id, s.invoice_number, COALESCE(c.name, 'Walk-in Customer') as customer_name, s.date, s.net_amount, COALESCE(s.status, 'Paid') as status
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 5
  `);

  // Last 7 days sales
  const dNow = new Date();
  const dStart = new Date();
  dStart.setDate(dNow.getDate() - 6);
  const startStr = dStart.toISOString().split('T')[0];
  const endStr = dNow.toISOString().split('T')[0];

  const weeklyRaw = await db.select<{ day: string; amount: number }[]>(`
    SELECT day, COALESCE(SUM(amt), 0) as amount FROM (
      SELECT substr(date, 1, 10) as day, net_amount as amt FROM sales WHERE substr(date, 1, 10) BETWEEN $1 AND $2
      UNION ALL
      SELECT substr(date, 1, 10) as day, -amount as amt FROM returns WHERE entity_type = 'customer' AND substr(date, 1, 10) BETWEEN $1 AND $2
    )
    GROUP BY day
    ORDER BY day ASC
  `, [startStr, endStr]);

  const weeklySales: { date: string; day: string; amount: number }[] = [];
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = daysOfWeek[d.getDay()];
    const match = weeklyRaw.find(w => w.day === dateStr);
    weeklySales.push({
      date: dateStr,
      day: dayLabel,
      amount: match ? match.amount : 0
    });
  }

  // Top 5 selling products (last 30 days)
  const dThirtyAgo = new Date();
  dThirtyAgo.setDate(dNow.getDate() - 30);
  const thirtyStr = dThirtyAgo.toISOString().split('T')[0];

  const topProducts = await db.select<{ id: number; name: string; quantity: number; revenue: number }[]>(`
    SELECT p.id, p.name, COALESCE(SUM(si.quantity), 0) as quantity, COALESCE(SUM(si.quantity * si.unit_price), 0) as revenue
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    JOIN sales s ON si.sale_id = s.id
    WHERE substr(s.date, 1, 10) >= $1
    GROUP BY p.id, p.name
    ORDER BY quantity DESC
    LIMIT 5
  `, [thirtyStr]);

  // Top 5 low stock products
  const lowStockProducts = await db.select<{ id: number; name: string; model: string | null; stock_quantity: number; min_stock: number; unit: string }[]>(`
    SELECT id, name, model, stock_quantity, COALESCE(min_stock, 5) as min_stock, COALESCE(unit, 'Piece') as unit
    FROM products
    WHERE stock_quantity <= COALESCE(min_stock, 5) AND is_group = 0
    ORDER BY stock_quantity ASC
    LIMIT 5
  `);

  // Cheques due today & PDC register
  const todayD = new Date();
  const tzOffset = todayD.getTimezoneOffset() * 60000;
  const todayStrDate = new Date(todayD.getTime() - tzOffset).toISOString().split('T')[0];

  const pendingChequesRaw = await db.select<{
    id: number;
    entity_type: 'customer' | 'supplier';
    entity_id: number;
    entity_name: string;
    amount: number;
    cheque_no: string | null;
    bank_name: string | null;
    cheque_date: string | null;
    cheque_status: string;
  }[]>(`
    SELECT p.id, p.entity_type, p.entity_id,
           CASE WHEN p.entity_type = 'customer' THEN COALESCE(c.name, 'Walk-in Customer')
                ELSE COALESCE(s.name, 'Unknown Supplier') END as entity_name,
           p.amount, p.cheque_no, p.bank_name, p.cheque_date, COALESCE(p.cheque_status, 'pdc_pending') as cheque_status
    FROM payments p
    LEFT JOIN customers c ON p.entity_type = 'customer' AND p.entity_id = c.id
    LEFT JOIN suppliers s ON p.entity_type = 'supplier' AND p.entity_id = s.id
    WHERE p.payment_mode = 'Cheque' AND COALESCE(p.cheque_status, 'pdc_pending') = 'pdc_pending'
    ORDER BY p.cheque_date ASC, p.id DESC
  `);

  let dueTodayCount = 0;
  let dueTodayAmount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let totalPendingCount = pendingChequesRaw.length;
  let totalPendingAmount = 0;

  const todayTime = new Date(todayStrDate).getTime();

  const chequesList: DueChequeItem[] = pendingChequesRaw.map(chq => {
    const numAmt = Number(chq.amount);
    totalPendingAmount += numAmt;
    const dateVal = chq.cheque_date ? chq.cheque_date.split(' ')[0] : todayStrDate;
    const targetTime = new Date(dateVal).getTime();
    const diffDays = Math.round((targetTime - todayTime) / (1000 * 60 * 60 * 24));

    let status_label = '';
    if (diffDays === 0) {
      dueTodayCount++;
      dueTodayAmount += numAmt;
      status_label = 'Due Today';
    } else if (diffDays < 0) {
      overdueCount++;
      overdueAmount += numAmt;
      const absDays = Math.abs(diffDays);
      status_label = `${absDays}d overdue`;
    } else {
      status_label = `Due in ${diffDays}d`;
    }

    return {
      ...chq,
      amount: numAmt,
      days_diff: diffDays,
      status_label
    };
  });

  // Sort: Due today first (0), then overdue (<0, most overdue first), then upcoming (>0, nearest first)
  chequesList.sort((a, b) => {
    if (a.days_diff === 0 && b.days_diff !== 0) return -1;
    if (b.days_diff === 0 && a.days_diff !== 0) return 1;
    if (a.days_diff < 0 && b.days_diff > 0) return -1;
    if (a.days_diff > 0 && b.days_diff < 0) return 1;
    return a.days_diff - b.days_diff;
  });

  const chequesSummary: DashboardChequesSummary = {
    dueTodayCount,
    dueTodayAmount,
    overdueCount,
    overdueAmount,
    totalPendingCount,
    totalPendingAmount,
    chequesList: chequesList.slice(0, 6)
  };

  return {
    recentSales,
    weeklySales,
    topProducts,
    lowStockProducts,
    chequesSummary
  };
}

export interface SalesReportItem {
  id: number;
  date: string;
  invoice_number: string | null;
  customer_name: string;
  net_amount: number;
  tax_amount: number;
  discount: number;
  payment_method: string;
  status: string | null;
  products_bought: string;
  total_quantity: number;
  source_type?: 'shop' | 'warehouse';
  source_warehouse_id?: number | null;
  source_warehouse_name?: string | null;
}

export async function getSalesReport(startDate: string, endDate: string): Promise<SalesReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT s.id, s.date, s.invoice_number, c.name as customer_name, s.net_amount, s.tax_amount, s.discount, s.payment_method, s.status,
     s.source_type, s.source_warehouse_id, w.name as source_warehouse_name,
     (SELECT GROUP_CONCAT(COALESCE(JSON_EXTRACT(si.product_snapshot, '$.name'), p.name, 'Item') || ' x' || si.quantity || ' (₹' || CAST(si.unit_price AS TEXT) || ' / ' || COALESCE(si.unit, p.unit, 'Nos') || ')', char(10)) FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as products_bought,
     (SELECT SUM(si.quantity) FROM sale_items si WHERE si.sale_id = s.id) as total_quantity
     FROM sales s 
     LEFT JOIN customers c ON s.customer_id = c.id 
     LEFT JOIN warehouses w ON s.source_warehouse_id = w.id
     WHERE date(s.date) BETWEEN date($1) AND date($2)
     ORDER BY s.date DESC`,
    [startDate, endDate]
  );
}

export interface PurchaseReportItem {
  id: number;
  date: string;
  supplier_name: string;
  invoice_number: string;
  supplier_invoice_date: string | null;
  net_amount: number;
  tax_amount: number;
  status: string;
  products_bought: string;
  total_quantity: number;
  destination_type?: 'shop' | 'warehouse';
  destination_warehouse_id?: number | null;
  destination_warehouse_name?: string | null;
}

export async function getPurchaseReport(startDate: string, endDate: string): Promise<PurchaseReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.id, p.date, s.name as supplier_name, p.invoice_number, p.supplier_invoice_date, p.net_amount, p.tax_amount, p.status,
     p.destination_type, p.destination_warehouse_id, w.name as destination_warehouse_name,
     (SELECT GROUP_CONCAT(pr.name || ' x' || pi.quantity || ' (₹' || CAST(pi.purchase_rate AS TEXT) || ' / ' || COALESCE(pi.unit, pr.unit) || ')', char(10)) 
      FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id WHERE pi.purchase_id = p.id) as products_bought,
     (SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_quantity
     FROM purchases p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id 
     LEFT JOIN warehouses w ON p.destination_warehouse_id = w.id
     WHERE date(p.date) BETWEEN date($1) AND date($2)
     ORDER BY p.date DESC`,
    [startDate, endDate]
  );
}

export interface ProductWiseSale {
  product_id: number;
  product_name: string;
  model: string | null;
  unit: string | null;
  total_quantity: number;
  total_revenue: number;
}

export async function getProductWiseSalesReport(startDate: string, endDate: string): Promise<ProductWiseSale[]> {
  const db = await getDb();
  // We calculate net product sales by looking at sale_items minus returns
  return await db.select(
    `SELECT 
       p.id as product_id, 
       p.name as product_name, 
       p.model,
       MAX(COALESCE(si.unit, p.unit)) as unit,
       COALESCE(SUM(si.quantity), 0) - COALESCE((
         SELECT SUM(r.quantity) 
         FROM returns r 
         WHERE r.product_id = p.id AND r.entity_type = 'customer' AND date(r.date) BETWEEN date($1) AND date($2)
       ), 0) as total_quantity,
       COALESCE(SUM(si.quantity * si.unit_price), 0) - COALESCE((
         SELECT SUM(r.amount) 
         FROM returns r 
         WHERE r.product_id = p.id AND r.entity_type = 'customer' AND date(r.date) BETWEEN date($1) AND date($2)
       ), 0) as total_revenue
     FROM products p
     JOIN sale_items si ON p.id = si.product_id
     JOIN sales s ON si.sale_id = s.id
     WHERE date(s.date) BETWEEN date($1) AND date($2)
     GROUP BY p.id, p.name, p.model
     HAVING total_quantity > 0 OR total_revenue > 0
     ORDER BY total_quantity DESC`,
    [startDate, endDate]
  );
}

export async function getExpenseReport(startDate: string, endDate: string): Promise<Expense[]> {
  const db = await getDb();
  return await db.select(
    `SELECT * FROM expenses 
     WHERE date(date) BETWEEN date($1) AND date($2)
     ORDER BY date DESC`,
    [startDate, endDate]
  );
}

export async function getDayBookProfitAndExpenses(startDate: string, endDate: string) {
  const db = await getDb();
  
  const profitTaxMode = localStorage.getItem('profitTaxMode') || 'with_gst';
  const taxDeduction = profitTaxMode === 'without_gst' ? ' - s.tax_amount' : '';
  const profitData = await db.select<{profit: number}[]>(`
    SELECT (s.net_amount${taxDeduction} - 
      COALESCE((
        SELECT SUM(p.purchase_price * (si.quantity - COALESCE((
          SELECT SUM(r.quantity) 
          FROM returns r 
          WHERE r.transaction_id = s.id AND r.product_id = si.product_id AND r.entity_type = 'customer'
        ), 0)))
        FROM sale_items si 
        JOIN products p ON si.product_id = p.id 
        WHERE si.sale_id = s.id
      ), 0)
    ) as profit 
    FROM sales s
    WHERE date(s.date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  
  let grossProfit = profitData.reduce((sum, row) => sum + (row.profit || 0), 0);

  // Deduct profit lost on standalone returns (where return is not linked to a modified sale invoice)
  const standaloneReturnLossData = await db.select<{loss: number}[]>(`
    SELECT COALESCE(SUM(r.amount - (r.quantity * p.purchase_price)), 0) as loss
    FROM returns r
    JOIN products p ON r.product_id = p.id
    WHERE r.entity_type = 'customer' AND r.transaction_id IS NULL AND date(r.date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  const standaloneReturnLoss = standaloneReturnLossData[0]?.loss || 0;
  grossProfit -= standaloneReturnLoss;

  const expensesData = await db.select<{amount: number}[]>(`
    SELECT amount FROM expenses 
    WHERE date(date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  
  const expenses = expensesData.reduce((sum, row) => sum + (row.amount || 0), 0);

  return { grossProfit, expenses, netProfit: grossProfit - expenses };
}

export interface InventoryValuationItem {
  id: number;
  name: string;
  model: string | null;
  hsn_code: string | null;
  group_name: string | null;
  brand_name: string | null;
  stock_quantity: number;
  unit: string;
  purchase_price: number;
  selling_price: number;
  stock_valuation: number;
  retail_valuation: number;
  min_stock?: number;
}

export async function getInventoryValuationReport(): Promise<InventoryValuationItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT 
       p.id, 
       p.name, 
       p.model, 
       p.hsn_code, 
       COALESCE(g.name, 'General') as group_name, 
       COALESCE(b.name, 'Unbranded') as brand_name, 
       p.stock_quantity, 
       COALESCE(p.unit, 'Nos') as unit, 
       p.purchase_price, 
       p.selling_price, 
       COALESCE(p.min_stock, 5) as min_stock,
       (p.stock_quantity * p.purchase_price) as stock_valuation,
       (p.stock_quantity * p.selling_price) as retail_valuation
     FROM products p
     LEFT JOIN item_groups g ON p.group_id = g.id
     LEFT JOIN brands b ON p.brand_id = b.id
     WHERE p.is_group = 0
     ORDER BY p.name ASC`
  );
}

export interface DetailedLedgerResult {
  openingBalance: number;
  entries: LedgerEntry[];
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
}

export async function getPartyDetailedLedger(
  entityType: 'customer' | 'supplier',
  entityId: number,
  startDate?: string,
  endDate?: string
): Promise<DetailedLedgerResult> {
  const allEntries = await getPartyLedger(entityType, entityId);
  const chronological = [...allEntries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let openingBalance = 0;
  const filteredEntries: LedgerEntry[] = [];
  let totalDebit = 0;
  let totalCredit = 0;

  const start = startDate ? new Date(startDate + 'T00:00:00') : null;
  const end = endDate ? new Date(endDate + 'T23:59:59') : null;

  chronological.forEach(entry => {
    const entryDate = new Date(entry.date);
    if (start && entryDate < start) {
      if (entityType === 'customer') {
        openingBalance += entry.debit - entry.credit;
      } else {
        openingBalance += entry.credit - entry.debit;
      }
    } else if (!end || entryDate <= end) {
      filteredEntries.push(entry);
      totalDebit += entry.debit;
      totalCredit += entry.credit;
    }
  });

  let running = openingBalance;
  filteredEntries.forEach(entry => {
    if (entityType === 'customer') {
      running += entry.debit - entry.credit;
    } else {
      running += entry.credit - entry.debit;
    }
    entry.balance = running;
  });

  return {
    openingBalance,
    entries: filteredEntries,
    closingBalance: running,
    totalDebit,
    totalCredit
  };
}

export interface TransactionDetail {
  id: number;
  date: string;
  invoice_number: string | null;
  entity_id: number;
  entity_name: string;
  customer_snapshot?: string | null;
  supplier_snapshot?: string | null;
  net_amount?: number;
  tax_amount?: number;
  discount?: number;
  paid_amount?: number;
  status?: string | null;
  destination_type?: 'shop' | 'warehouse';
  destination_warehouse_id?: number | null;
  destination_warehouse_name?: string | null;
  source_type?: 'shop' | 'warehouse';
  source_warehouse_id?: number | null;
  source_warehouse_name?: string | null;
  items: {
    product_id: number;
    name: string;
    model: string | null;
    quantity: number;
    returned_quantity?: number;
    unit_price: number;
    unit: string;
    hsn_code: string | null;
    cgst_percentage: number;
    sgst_percentage: number;
    gst_percentage: number;
    tax?: number;
    source_type?: 'shop' | 'warehouse' | null;
    source_warehouse_name?: string | null;
  }[];
}

export async function getSaleDetails(query: string): Promise<TransactionDetail[]> {
  const db = await getDb();
  const sales = await db.select<{id: number, date: string, invoice_number: string, customer_id: number, customer_name: string, customer_snapshot: string | null, net_amount: number, tax_amount: number, discount: number, status: string | null, paid_amount: number, source_type: 'shop' | 'warehouse' | null, source_warehouse_id: number | null, source_warehouse_name: string | null}[]>(
    `SELECT s.id, s.date, s.invoice_number, s.customer_id, s.customer_snapshot, c.name as customer_name, s.net_amount, s.tax_amount, s.discount, s.status, s.paid_amount,
            s.source_type, s.source_warehouse_id, w.name as source_warehouse_name
     FROM sales s 
     LEFT JOIN customers c ON s.customer_id = c.id
     LEFT JOIN warehouses w ON s.source_warehouse_id = w.id
     WHERE s.invoice_number LIKE $1 OR COALESCE(c.name, 'Walk-in Customer') LIKE $1 OR s.date LIKE $1 OR CAST(s.id AS TEXT) LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const s of sales) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string, hsn_code: string | null, cgst_percentage: number, sgst_percentage: number, gst_percentage: number, tax: number, product_snapshot: string | null, returned_quantity: number}[]>(
      `SELECT si.product_id, p.name, p.model, si.quantity, si.unit_price, si.unit, p.hsn_code, p.cgst_percentage, p.sgst_percentage, p.gst_percentage, COALESCE(si.tax, 0) as tax, si.product_snapshot,
       COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.transaction_id = si.sale_id AND r.product_id = si.product_id AND r.entity_type = 'customer'), 0) as returned_quantity
       FROM sale_items si LEFT JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [s.id]
    );
    
    const mappedItems = items.map(item => {
      if (item.product_snapshot) {
        try {
          const snap = JSON.parse(item.product_snapshot);
          return { 
            ...item, 
            name: snap.name, 
            model: snap.model, 
            hsn_code: snap.hsn_code, 
            gst_percentage: snap.gst_percentage, 
            cgst_percentage: snap.cgst_percentage, 
            sgst_percentage: snap.sgst_percentage,
            source_type: snap.source_type || s.source_type || 'shop',
            source_warehouse_name: snap.source_warehouse_name || s.source_warehouse_name || 'Main Shop'
          };
        } catch (e) {}
      }
      return item;
    });

    results.push({
      id: s.id,
      date: s.date,
      invoice_number: s.invoice_number,
      entity_id: s.customer_id,
      entity_name: s.customer_snapshot ? JSON.parse(s.customer_snapshot).name : (s.customer_name || 'Walk-in Customer'),
      customer_snapshot: s.customer_snapshot,
      net_amount: s.net_amount,
      tax_amount: s.tax_amount,
      discount: s.discount,
      paid_amount: s.paid_amount,
      status: s.status,
      source_type: (s.source_type as 'shop' | 'warehouse') || 'shop',
      source_warehouse_id: s.source_warehouse_id,
      source_warehouse_name: s.source_warehouse_name,
      items: mappedItems
    });
  }
  return results;
}

export async function getPurchaseDetails(query: string): Promise<TransactionDetail[]> {
  const db = await getDb();
  const purchases = await db.select<{id: number, date: string, invoice_number: string, supplier_id: number, supplier_name: string, supplier_snapshot: string | null, net_amount: number, tax_amount: number, discount: number, status: string | null, destination_type: 'shop' | 'warehouse' | null, destination_warehouse_id: number | null, destination_warehouse_name: string | null}[]>(
    `SELECT p.id, p.date, p.invoice_number, p.supplier_id, p.supplier_snapshot, s.name as supplier_name, p.net_amount, p.tax_amount, p.discount, p.status,
            p.destination_type, p.destination_warehouse_id, w.name as destination_warehouse_name
     FROM purchases p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     LEFT JOIN warehouses w ON p.destination_warehouse_id = w.id
     WHERE p.invoice_number LIKE $1 OR s.name LIKE $1 OR p.date LIKE $1 OR CAST(p.id AS TEXT) LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const p of purchases) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string, hsn_code: string | null, cgst_percentage: number, sgst_percentage: number, gst_percentage: number, tax: number, product_snapshot: string | null, returned_quantity: number}[]>(
      `SELECT pi.product_id, pr.name, pr.model, pi.quantity, pi.purchase_rate as unit_price, pi.unit, pr.hsn_code, pr.cgst_percentage, pr.sgst_percentage, pr.gst_percentage, COALESCE(pi.tax, 0) as tax, pi.product_snapshot,
       COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.transaction_id = pi.purchase_id AND r.product_id = pi.product_id AND r.entity_type = 'supplier'), 0) as returned_quantity
       FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id
       WHERE pi.purchase_id = $1`,
      [p.id]
    );

    const mappedItems = items.map(item => {
      if (item.product_snapshot) {
        try {
          const snap = JSON.parse(item.product_snapshot);
          return { 
            ...item, 
            name: snap.name, 
            model: snap.model, 
            hsn_code: snap.hsn_code, 
            gst_percentage: snap.gst_percentage, 
            cgst_percentage: snap.cgst_percentage, 
            sgst_percentage: snap.sgst_percentage,
            source_type: p.destination_type,
            source_warehouse_name: p.destination_warehouse_name || 'Main Shop'
          };
        } catch (e) {}
      }
      return item;
    });

    results.push({
      id: p.id,
      date: p.date,
      invoice_number: p.invoice_number,
      entity_id: p.supplier_id,
      entity_name: p.supplier_snapshot ? JSON.parse(p.supplier_snapshot).name : p.supplier_name,
      supplier_snapshot: p.supplier_snapshot,
      net_amount: p.net_amount,
      tax_amount: p.tax_amount,
      discount: p.discount,
      status: p.status,
      destination_type: (p.destination_type as 'shop' | 'warehouse') || 'shop',
      destination_warehouse_id: p.destination_warehouse_id,
      destination_warehouse_name: p.destination_warehouse_name,
      items: mappedItems
    });
  }
  return results;
}

export async function getPurchaseById(id: number): Promise<TransactionDetail | null> {
  const db = await getDb();
  const purchases = await db.select<{id: number, date: string, invoice_number: string, supplier_id: number, supplier_name: string, supplier_snapshot: string | null, net_amount: number, tax_amount: number, discount: number, paid_amount: number, status: string | null, destination_type: 'shop' | 'warehouse' | null, destination_warehouse_id: number | null, destination_warehouse_name: string | null}[]>(
    `SELECT p.id, p.date, p.invoice_number, p.supplier_id, p.supplier_snapshot, s.name as supplier_name, p.net_amount, p.tax_amount, p.discount, p.paid_amount, p.status,
            p.destination_type, p.destination_warehouse_id, w.name as destination_warehouse_name
     FROM purchases p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     LEFT JOIN warehouses w ON p.destination_warehouse_id = w.id
     WHERE p.id = $1`,
    [id]
  );
  
  if (purchases.length === 0) return null;
  const p = purchases[0];

  const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string, hsn_code: string | null, cgst_percentage: number, sgst_percentage: number, gst_percentage: number, product_snapshot: string | null, returned_quantity: number}[]>(
    `SELECT pi.product_id, pr.name, pr.model, pi.quantity, pi.purchase_rate as unit_price, pi.unit, pr.hsn_code, pr.cgst_percentage, pr.sgst_percentage, pr.gst_percentage, pi.product_snapshot,
     COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.transaction_id = pi.purchase_id AND r.product_id = pi.product_id AND r.entity_type = 'supplier'), 0) as returned_quantity
     FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id
     WHERE pi.purchase_id = $1`,
    [p.id]
  );

  const mappedItems = items.map(item => {
    if (item.product_snapshot) {
      try {
        const snap = JSON.parse(item.product_snapshot);
        return { ...item, name: snap.name, model: snap.model, hsn_code: snap.hsn_code, gst_percentage: snap.gst_percentage, cgst_percentage: snap.cgst_percentage, sgst_percentage: snap.sgst_percentage };
      } catch (e) {}
    }
    return item;
  });

  return {
    id: p.id,
    date: p.date,
    invoice_number: p.invoice_number,
    entity_id: p.supplier_id,
    entity_name: p.supplier_snapshot ? JSON.parse(p.supplier_snapshot).name : p.supplier_name,
    supplier_snapshot: p.supplier_snapshot,
    net_amount: p.net_amount,
    tax_amount: p.tax_amount,
    discount: p.discount,
    paid_amount: p.paid_amount,
    status: p.status,
    destination_type: (p.destination_type as 'shop' | 'warehouse') || 'shop',
    destination_warehouse_id: p.destination_warehouse_id,
    destination_warehouse_name: p.destination_warehouse_name,
    items: mappedItems
  };
}

export interface ClockTamperStatus {
  isTampered: boolean;
  reason?: string;
}

export async function checkClockTampering(): Promise<ClockTamperStatus> {
  try {
    const nowMs = Date.now();
    const leewayMs = 15 * 60 * 1000; // 15 minutes leeway for minor sync differences

    // 1. Check Windows system files via native Rust backend (winevt System logs & Recent)
    try {
      const res = await invoke<{
        is_tampered: boolean;
        current_timestamp_secs: number;
        max_file_timestamp_secs: number;
        detected_file: string;
      }>('check_system_clock_tamper');

      if (res && res.is_tampered) {
        const fileDate = new Date(res.max_file_timestamp_secs * 1000);
        return {
          isTampered: true,
          reason: `Clock rollback detected: Your computer date (${new Date().toLocaleDateString()}) is earlier than Windows system activity on ${fileDate.toLocaleDateString()} ${fileDate.toLocaleTimeString()}.`
        };
      }
    } catch (err) {
      console.warn("Native clock tamper check unavailable:", err);
    }

    // 2. Check maximum transaction date in SQLite database (sales, purchases, expenses)
    try {
      const db = await getDb();
      const maxTxRows = await db.select<{ max_date: string | null }[]>(`
        SELECT MAX(date) as max_date FROM (
          SELECT MAX(date) as date FROM sales
          UNION ALL
          SELECT MAX(date) as date FROM purchases
          UNION ALL
          SELECT MAX(date) as date FROM expenses
        )
      `);

      if (maxTxRows.length > 0 && maxTxRows[0].max_date) {
        const maxTxDate = new Date(maxTxRows[0].max_date.replace(' ', 'T'));
        if (!isNaN(maxTxDate.getTime()) && nowMs + leewayMs < maxTxDate.getTime()) {
          return {
            isTampered: true,
            reason: `Clock rollback detected: Your computer date (${new Date().toLocaleDateString()}) is earlier than your recorded bills/transactions on ${maxTxDate.toLocaleDateString()}.`
          };
        }
      }
    } catch (dbErr) {
      console.warn("DB transaction clock check error:", dbErr);
    }

    return { isTampered: false };
  } catch (e: any) {
    console.error("checkClockTampering error:", e);
    return { isTampered: false };
  }
}

export function calculateNextMarch31Expiry(): string {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // Jan=0, Feb=1, Mar=2, Apr=3...
  
  // If in April-December (month >= 3) or late March (month === 2), renew for next year's March 31st
  // If in Jan-Feb (month < 2), expires March 31st of the current year
  const targetYear = (currentMonth >= 2) ? currentYear + 1 : currentYear;
  // March 31st at 23:59:59.999 local time
  const expiry = new Date(targetYear, 2, 31, 23, 59, 59, 999);
  return expiry.toISOString();
}

export async function isAppActivated(): Promise<boolean> {
  try {
    // 0. Check clock tampering (Windows files & DB transaction history)
    const tamper = await checkClockTampering();
    if (tamper.isTampered) {
      console.warn("Clock tampering detected:", tamper.reason);
      (window as any).__clockTamperReason = tamper.reason;
      return false;
    } else {
      (window as any).__clockTamperReason = null;
    }

    // 1. Check machine-level license in localStorage first
    const storedExpiry = localStorage.getItem('activation_expiry');
    if (storedExpiry) {
      const expiryDate = new Date(storedExpiry);
      if (expiryDate.getTime() > Date.now()) {
        return true;
      }
    }

    // 2. Check the active database settings table
    const db = await getDb();
    const result = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['activation_expiry']);
    if (result.length > 0) {
      const expiryDate = new Date(result[0].value);
      const isValid = expiryDate.getTime() > Date.now();
      if (isValid) {
        localStorage.setItem('activation_expiry', result[0].value);
        return true;
      }
    }
    
    // 3. Fallback for legacy 'is_activated' key
    const legacyResult = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['is_activated']);
    if (legacyResult.length > 0 && legacyResult[0].value === 'true') {
      return true;
    }

    // 4. If current DB is a secondary company, check the primary database (inventory.db)
    const activeCompDb = getActiveCompanyDbName();
    if (activeCompDb !== 'sqlite:inventory.db') {
      try {
        const defaultDb = await Database.load('sqlite:inventory.db');
        const defResult = await defaultDb.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['activation_expiry']);
        if (defResult.length > 0) {
          const expiryDate = new Date(defResult[0].value);
          const isValid = expiryDate.getTime() > Date.now();
          if (isValid) {
            localStorage.setItem('activation_expiry', defResult[0].value);
            await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['activation_expiry', defResult[0].value]);
            return true;
          }
        }
        const defLegacy = await defaultDb.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['is_activated']);
        if (defLegacy.length > 0 && defLegacy[0].value === 'true') {
          return true;
        }
      } catch (e) {}
    }

    return false;
  } catch (e: any) {
    console.error("isAppActivated error:", e);
    const storedExpiry = localStorage.getItem('activation_expiry');
    if (storedExpiry && new Date(storedExpiry).getTime() > Date.now()) {
      return true;
    }
    return false;
  }
}

export async function activateApp(): Promise<void> {
  const db = await getDb();
  const expiryStr = calculateNextMarch31Expiry();
  localStorage.setItem('activation_expiry', expiryStr);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['activation_expiry', expiryStr]);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['is_activated', 'false']);
}

export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  
  // Disable foreign keys temporarily so records can be wiped cleanly in any order without constraint errors
  try {
    await db.execute('PRAGMA foreign_keys = OFF');
  } catch (e) {
    console.warn('Could not disable foreign keys:', e);
  }

  // Child tables and dependent records first, then master records
  const tables = [
    'quotation_items',
    'quotations',
    'sale_items',
    'purchase_items',
    'stock_movements',
    'warehouse_items',
    'returns',
    'payments',
    'sales',
    'purchases',
    'expenses',
    'products',
    'warehouses',
    'item_groups',
    'categories',
    'brands',
    'customers',
    'suppliers'
  ];

  for (const table of tables) {
    try {
      await db.execute(`DELETE FROM ${table}`);
    } catch (e) {
      console.warn(`Could not delete from ${table}:`, e);
    }
  }

  // Reset auto-increment ID counters back to 1 for all wiped tables
  try {
    await db.execute("DELETE FROM sqlite_sequence WHERE name != 'users'");
  } catch (e) {
    console.warn('Could not reset sqlite_sequence:', e);
  }

  // Preserve license / activation in settings table, wipe all company & store settings
  try {
    await db.execute("DELETE FROM settings WHERE key NOT IN ('activation_expiry', 'is_activated')");
  } catch (e) {
    console.warn('Could not clear non-activation settings:', e);
  }

  // Delete all non-admin staff users (keeps admin so the shop owner is not locked out)
  try {
    await db.execute("DELETE FROM users WHERE role != 'admin'");
  } catch (e) {
    console.warn('Could not delete users:', e);
  }

  // Re-enable foreign keys
  try {
    await db.execute('PRAGMA foreign_keys = ON');
  } catch (e) {
    console.warn('Could not re-enable foreign keys:', e);
  }

  // Reclaim disk space and rebuild database file
  try {
    await db.execute('VACUUM');
  } catch (e) {
    console.warn('Could not vacuum database:', e);
  }

  // Clear localStorage except license/activation keys, session, and profit calculation preference
  const preservedKeys = ['has_activated', 'activation_expiry', 'auth_user', 'profitTaxMode'];
  const preservedValues: Record<string, string> = {};
  preservedKeys.forEach(k => {
    const val = localStorage.getItem(k);
    if (val !== null) preservedValues[k] = val;
  });
  localStorage.clear();
  Object.entries(preservedValues).forEach(([k, v]) => localStorage.setItem(k, v));
}

export interface Warehouse {
  id: number;
  name: string;
  location: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
  total_items?: number;
  total_quantity?: number;
}

export interface WarehouseItem {
  id: number;
  warehouse_id: number;
  product_id: number;
  quantity: number;
  name: string;
  model: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  hsn_code?: string | null;
  barcode?: string | null;
  group_id?: number | null;
  brand_id?: number | null;
  group_name?: string | null;
  brand_name?: string | null;
}

export interface StockMovement {
  id: number;
  date: string;
  from_location_type: 'shop' | 'warehouse' | 'direct_inward';
  from_location_id: number;
  from_location_name: string;
  to_location_type: 'shop' | 'warehouse';
  to_location_id: number;
  to_location_name: string;
  product_id: number;
  product_name?: string;
  quantity: number;
  notes: string | null;
}

export async function getWarehouses(): Promise<Warehouse[]> {
  const db = await getDb();
  return await db.select<Warehouse[]>(`
    SELECT w.*, 
      COUNT(wi.id) as total_items, 
      COALESCE(SUM(wi.quantity), 0) as total_quantity
    FROM warehouses w
    LEFT JOIN warehouse_items wi ON w.id = wi.warehouse_id AND wi.quantity > 0
    GROUP BY w.id
    ORDER BY w.name ASC
  `);
}

export async function addWarehouse(name: string, location: string = '', phone: string = '', notes: string = ''): Promise<number> {
  const db = await getDb();
  const res = await db.execute(
    'INSERT INTO warehouses (name, location, phone, notes) VALUES ($1, $2, $3, $4)',
    [name.trim(), location.trim(), phone.trim(), notes.trim()]
  );
  return res.lastInsertId || 0;
}

export async function updateWarehouse(id: number, name: string, location: string = '', phone: string = '', notes: string = ''): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE warehouses SET name = $1, location = $2, phone = $3, notes = $4 WHERE id = $5',
    [name.trim(), location.trim(), phone.trim(), notes.trim(), id]
  );
}

export async function deleteWarehouse(id: number): Promise<void> {
  const db = await getDb();
  const stockRes = await db.select<{total: number}[]>(
    'SELECT COALESCE(SUM(quantity), 0) as total FROM warehouse_items WHERE warehouse_id = $1',
    [id]
  );
  if (stockRes.length > 0 && stockRes[0].total > 0) {
    throw new Error(`Cannot delete warehouse with existing stock (${stockRes[0].total} units). Please move the stock to Shop Storage or another warehouse first.`);
  }
  await db.execute('DELETE FROM warehouse_items WHERE warehouse_id = $1', [id]);
  await db.execute('DELETE FROM warehouses WHERE id = $1', [id]);
}

export async function getWarehouseStock(warehouseId: number): Promise<WarehouseItem[]> {
  const db = await getDb();
  return await db.select<WarehouseItem[]>(`
    SELECT wi.id, wi.warehouse_id, wi.product_id, wi.quantity,
           p.name, p.model, p.unit, p.purchase_price, p.selling_price, p.hsn_code, p.barcode,
           p.group_id, p.brand_id,
           g.name as group_name, b.name as brand_name
    FROM warehouse_items wi
    JOIN products p ON wi.product_id = p.id
    LEFT JOIN item_groups g ON p.group_id = g.id
    LEFT JOIN brands b ON p.brand_id = b.id
    WHERE wi.warehouse_id = $1 AND wi.quantity > 0
    ORDER BY p.name ASC
  `, [warehouseId]);
}

export async function moveStock(
  fromType: 'shop' | 'warehouse',
  fromId: number,
  toType: 'shop' | 'warehouse',
  toId: number,
  productId: number,
  quantity: number,
  notes: string = ''
): Promise<void> {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  if (fromType === toType && fromId === toId) {
    throw new Error('Source and destination cannot be the same.');
  }

  const db = await getDb();

  const prodRes = await db.select<{name: string, stock_quantity: number}[]>(
    'SELECT name, stock_quantity FROM products WHERE id = $1',
    [productId]
  );
  if (prodRes.length === 0) {
    throw new Error('Product not found.');
  }
  const product = prodRes[0];

  let fromName = 'Shop Storage';
  if (fromType === 'shop') {
    if (product.stock_quantity < quantity) {
      throw new Error(`Insufficient stock in Shop Storage. Available: ${product.stock_quantity}, Requested: ${quantity}`);
    }
  } else {
    const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [fromId]);
    if (whRes.length === 0) throw new Error('Source warehouse not found.');
    fromName = whRes[0].name;

    const stockRes = await db.select<{quantity: number}[]>(
      'SELECT quantity FROM warehouse_items WHERE warehouse_id = $1 AND product_id = $2',
      [fromId, productId]
    );
    const available = stockRes[0]?.quantity || 0;
    if (available < quantity) {
      throw new Error(`Insufficient stock in ${fromName}. Available: ${available}, Requested: ${quantity}`);
    }
  }

  let toName = 'Shop Storage';
  if (toType === 'warehouse') {
    const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [toId]);
    if (whRes.length === 0) throw new Error('Destination warehouse not found.');
    toName = whRes[0].name;
  }

  // Deduct from Source
  if (fromType === 'shop') {
    await db.execute('UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2', [quantity, productId]);
  } else {
    await db.execute(
      'UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3',
      [quantity, fromId, productId]
    );
  }

  // Add to Destination
  if (toType === 'shop') {
    await db.execute('UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2', [quantity, productId]);
  } else {
    await db.execute(
      `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
       VALUES ($1, $2, $3)
       ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
      [toId, productId, quantity]
    );
  }

  // Record movement in history
  await db.execute(
    `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [fromType, fromId, fromName, toType, toId, toName, productId, quantity, notes]
  );
}

export async function getStockMovements(limit = 100): Promise<StockMovement[]> {
  const db = await getDb();
  return await db.select<StockMovement[]>(`
    SELECT sm.*, p.name as product_name
    FROM stock_movements sm
    LEFT JOIN products p ON sm.product_id = p.id
    ORDER BY sm.date DESC
    LIMIT $1
  `, [limit]);
}

export async function addStockDirectlyToWarehouse(
  warehouseId: number,
  productId: number,
  quantity: number,
  notes: string = 'Direct Inward Stock'
): Promise<void> {
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }

  const db = await getDb();

  const prodRes = await db.select<{name: string}[]>('SELECT name FROM products WHERE id = $1', [productId]);
  if (prodRes.length === 0) throw new Error('Product not found.');

  const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [warehouseId]);
  if (whRes.length === 0) throw new Error('Warehouse not found.');

  // Upsert into warehouse_items
  await db.execute(
    `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
     VALUES ($1, $2, $3)
     ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
    [warehouseId, productId, quantity]
  );

  // Record movement in history
  await db.execute(
    `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
     VALUES ('direct_inward', 0, 'Direct Inward / Supplier', 'warehouse', $1, $2, $3, $4, $5)`,
    [warehouseId, whRes[0].name, productId, quantity, notes]
  );
}

export interface VerificationCheckResult {
  category: string;
  check: string;
  expected: string | number;
  actual: string | number;
  passed: boolean;
  delta?: number;
}

export interface VerificationReport {
  timestamp: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  allPassed: boolean;
  checks: VerificationCheckResult[];
}

export async function runComprehensiveCalculationVerification(): Promise<VerificationReport> {
  const db = await getDb();
  const checks: VerificationCheckResult[] = [];

  const assertNum = (category: string, check: string, expected: number, actual: number) => {
    const delta = Math.abs(expected - actual);
    const passed = delta < 0.015;
    checks.push({
      category,
      check,
      expected: Number(expected.toFixed(2)),
      actual: Number(actual.toFixed(2)),
      passed,
      delta: Number(delta.toFixed(2))
    });
  };

  const assertStr = (category: string, check: string, expected: string, actual: string) => {
    const passed = expected.trim().toLowerCase() === (actual || '').trim().toLowerCase();
    checks.push({
      category,
      check,
      expected,
      actual: actual || '',
      passed
    });
  };

  // 1. WIPE ALL DATA
  await wipeAllData();

  // Reset invoice number settings in localStorage
  localStorage.setItem('bill_counter', '1');
  localStorage.setItem('bill_prefix', 'BILL');
  localStorage.setItem('salesTaxMethod', 'exclusive');

  // Verify wipe
  const salesCount = (await db.select<{c: number}[]>('SELECT COUNT(*) as c FROM sales'))[0]?.c || 0;
  const prodCount = (await db.select<{c: number}[]>('SELECT COUNT(*) as c FROM products'))[0]?.c || 0;
  const custCount = (await db.select<{c: number}[]>('SELECT COUNT(*) as c FROM customers'))[0]?.c || 0;
  assertNum('Data Wipe', 'Sales Count after Wipe', 0, salesCount);
  assertNum('Data Wipe', 'Products Count after Wipe', 0, prodCount);
  assertNum('Data Wipe', 'Customers Count after Wipe', 0, custCount);

  // 2. SEED MASTER DATA
  await db.execute("INSERT INTO item_groups (name) VALUES ('Electricals')");
  const groupRes = await db.select<{id: number}[]>('SELECT id FROM item_groups ORDER BY id DESC LIMIT 1');
  const groupId = groupRes[0]?.id || 1;

  await db.execute("INSERT INTO brands (name) VALUES ('Havells')");
  const brandRes = await db.select<{id: number}[]>('SELECT id FROM brands ORDER BY id DESC LIMIT 1');
  const brandId = brandRes[0]?.id || 1;

  // Product 1: LED Bulb 9W (18% GST, Cost: 70, Sell: 100, Stock: 50)
  await addProduct('LED Bulb 9W', {
    group_id: groupId,
    brand_id: brandId,
    model: 'LB-9W',
    hsn_code: '8539',
    purchase_price: 70,
    selling_price: 100,
    mrp: 120,
    unit: 'Piece',
    min_stock: 5,
    stock: 50,
    gst_percentage: 18,
    cgst_percentage: 9,
    sgst_percentage: 9
  });
  const p1 = (await db.select<Product[]>('SELECT * FROM products WHERE name = $1', ['LED Bulb 9W']))[0];

  // Product 2: Ceiling Fan 1200mm (18% GST, Cost: 1500, Sell: 2200, Stock: 20)
  await addProduct('Ceiling Fan 1200mm', {
    group_id: groupId,
    brand_id: brandId,
    model: 'CF-1200',
    hsn_code: '8414',
    purchase_price: 1500,
    selling_price: 2200,
    mrp: 2500,
    unit: 'Piece',
    min_stock: 2,
    stock: 20,
    gst_percentage: 18,
    cgst_percentage: 9,
    sgst_percentage: 9
  });
  const p2 = (await db.select<Product[]>('SELECT * FROM products WHERE name = $1', ['Ceiling Fan 1200mm']))[0];

  // Product 3: Copper Wire Roll 90m (5% GST, Cost: 600, Sell: 850, Stock: 15)
  await addProduct('Copper Wire Roll 90m', {
    group_id: groupId,
    brand_id: brandId,
    model: 'CW-90M',
    hsn_code: '8544',
    purchase_price: 600,
    selling_price: 850,
    mrp: 950,
    unit: 'Roll',
    min_stock: 3,
    stock: 15,
    gst_percentage: 5,
    cgst_percentage: 2.5,
    sgst_percentage: 2.5
  });
  const p3 = (await db.select<Product[]>('SELECT * FROM products WHERE name = $1', ['Copper Wire Roll 90m']))[0];

  // Customers
  const c1Id = await addCustomer('Suresh Electronics', '9876543210', 'suresh@elec.com', 'Market Road, Salem', '33AAAAA0000A1Z5');
  const c2Id = await addCustomer('Rajesh Kumar', '9123456780', 'rajesh@gmail.com', 'Main Street, Chennai', '');

  assertNum('Master Data', 'Products Created', 3, (await getProducts()).length);
  assertNum('Master Data', 'Customers Created', 2, (await getCustomers()).length);

  // 3. EXECUTE SCENARIOS

  // -------------------------------------------------------------
  // Scenario 1: S1 - Standard Cash Sale (100% Paid at POS)
  // 2x LED Bulb @ 100 = 200 taxable + 18% tax (36) = 236. Paid = 236
  // -------------------------------------------------------------
  const cart1: CartItem[] = [{ ...p1, cart_qty: 2 }];
  const s1Res = await recordSale(cart1, 200, 36, 0, 236, 236, 'Cash', c1Id);
  const s1 = (await db.select<{net_amount: number, paid_amount: number, status: string}[]>('SELECT * FROM sales WHERE id = $1', [s1Res.saleId]))[0];
  assertNum('Scenario 1: Cash Sale', 'S1 Net Amount', 236.00, s1.net_amount);
  assertNum('Scenario 1: Cash Sale', 'S1 Paid Amount', 236.00, s1.paid_amount);
  assertStr('Scenario 1: Cash Sale', 'S1 Bill Status', 'Paid', s1.status);

  // -------------------------------------------------------------
  // Scenario 2: S2 - Credit Sale (100% Unpaid)
  // 1x Ceiling Fan @ 2200 = 2200 taxable + 18% tax (396) = 2596. Paid = 0
  // -------------------------------------------------------------
  const cart2: CartItem[] = [{ ...p2, cart_qty: 1 }];
  const s2Res = await recordSale(cart2, 2200, 396, 0, 2596, 0, 'Cash', c1Id);
  const s2 = (await db.select<{net_amount: number, paid_amount: number, status: string}[]>('SELECT * FROM sales WHERE id = $1', [s2Res.saleId]))[0];
  assertNum('Scenario 2: Credit Sale', 'S2 Net Amount', 2596.00, s2.net_amount);
  assertNum('Scenario 2: Credit Sale', 'S2 Paid Amount', 0.00, s2.paid_amount);
  assertStr('Scenario 2: Credit Sale', 'S2 Bill Status', 'Unpaid', s2.status);

  // -------------------------------------------------------------
  // Scenario 3: S3 - Partial Payment Sale
  // 1x Wire Roll @ 850 = 850 taxable + 5% tax (42.50) = 892.50. Paid = 400
  // -------------------------------------------------------------
  const cart3: CartItem[] = [{ ...p3, cart_qty: 1 }];
  const s3Res = await recordSale(cart3, 850, 42.5, 0, 892.5, 400, 'Cash', c2Id);
  const s3 = (await db.select<{net_amount: number, paid_amount: number, status: string}[]>('SELECT * FROM sales WHERE id = $1', [s3Res.saleId]))[0];
  assertNum('Scenario 3: Partial Sale', 'S3 Net Amount', 892.50, s3.net_amount);
  assertNum('Scenario 3: Partial Sale', 'S3 Paid Amount', 400.00, s3.paid_amount);
  assertStr('Scenario 3: Partial Sale', 'S3 Bill Status', 'Partial', s3.status);

  // -------------------------------------------------------------
  // Scenario 4: S4 - Sale with Discount & GST Apportionment
  // 5x LED Bulb @ 100 = 500 - 50 discount = 450 taxable + 18% tax (81) = 531. Paid = 531
  // -------------------------------------------------------------
  const cart4: CartItem[] = [{ ...p1, cart_qty: 5 }];
  const s4Res = await recordSale(cart4, 500, 81, 50, 531, 531, 'Online / UPI', c1Id);
  const s4 = (await db.select<{net_amount: number, paid_amount: number, status: string}[]>('SELECT * FROM sales WHERE id = $1', [s4Res.saleId]))[0];
  assertNum('Scenario 4: Discounted Sale', 'S4 Net Amount', 531.00, s4.net_amount);
  assertNum('Scenario 4: Discounted Sale', 'S4 Paid Amount', 531.00, s4.paid_amount);
  assertStr('Scenario 4: Discounted Sale', 'S4 Bill Status', 'Paid', s4.status);

  // -------------------------------------------------------------
  // Scenario 5: S5 - Post-Dated Cheque (PDC) Sale
  // 1x LED Bulb @ 100 = 100 taxable + 18% tax (18) = 118.
  // Paid via PDC dated 14 days in future -> must be held as pending
  // -------------------------------------------------------------
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 14);
  const pdcDateStr = futureDate.toISOString().split('T')[0];

  const cart5: CartItem[] = [{ ...p1, cart_qty: 1 }];
  const s5Res = await recordSale(cart5, 100, 18, 0, 118, 118, 'Cheque', c1Id, 'CHQ-778899', 'SBI', pdcDateStr);
  const s5 = (await db.select<{net_amount: number, paid_amount: number, status: string}[]>('SELECT * FROM sales WHERE id = $1', [s5Res.saleId]))[0];
  assertNum('Scenario 5: PDC Cheque Sale', 'S5 Net Amount', 118.00, s5.net_amount);
  assertNum('Scenario 5: PDC Cheque Sale', 'S5 Effective Paid Amount (PDC held)', 0.00, s5.paid_amount);
  assertStr('Scenario 5: PDC Cheque Sale', 'S5 Bill Status', 'Unpaid', s5.status);

  // -------------------------------------------------------------
  // Scenario 6: S6 - Payment Clearing Due Bills (FIFO / Target Bill)
  // C1 pays 1500 towards S2
  // -------------------------------------------------------------
  await recordPayment('customer', c1Id, 1500, 'Cash', s2Res.invoiceNumber, 'Payment clearing S2 dues', null, null, null, null, s2Res.saleId);
  const s2AfterPay = (await db.select<{paid_amount: number, status: string}[]>('SELECT paid_amount, status FROM sales WHERE id = $1', [s2Res.saleId]))[0];
  assertNum('Scenario 6: Due Payment', 'S2 Paid Amount after ₹1,500 Payment', 1500.00, s2AfterPay.paid_amount);
  assertStr('Scenario 6: Due Payment', 'S2 Status after ₹1,500 Payment', 'Partial', s2AfterPay.status);

  // -------------------------------------------------------------
  // Scenario 7: S7 - Advance Deposit & Advance Adjustment
  // C2 deposits 1000 Advance
  // -------------------------------------------------------------
  await recordPayment('customer', c2Id, 1000, 'Online / UPI', '', 'Customer Advance Deposit');
  const c2AfterDep = (await db.select<{advance_balance: number, balance: number}[]>('SELECT advance_balance, balance FROM customers WHERE id = $1', [c2Id]))[0];
  assertNum('Scenario 7: Advance Flow', 'C2 Advance Balance after Deposit', 1000.00, c2AfterDep.advance_balance);
  assertNum('Scenario 7: Advance Flow', 'C2 Unpaid Bill Due Balance (unchanged)', 492.50, c2AfterDep.balance);

  // Apply 400 advance to clear part of S3 dues (492.50 - 400 = 92.50 remaining)
  await applyAdvanceToClearDues('customer', c2Id, 400);
  const c2AfterApply = (await db.select<{advance_balance: number, balance: number}[]>('SELECT advance_balance, balance FROM customers WHERE id = $1', [c2Id]))[0];
  const s3AfterApply = (await db.select<{paid_amount: number, status: string}[]>('SELECT paid_amount, status FROM sales WHERE id = $1', [s3Res.saleId]))[0];
  assertNum('Scenario 7: Advance Flow', 'C2 Advance Balance after Applying ₹400', 600.00, c2AfterApply.advance_balance);
  assertNum('Scenario 7: Advance Flow', 'S3 Paid Amount after Advance Applied', 800.00, s3AfterApply.paid_amount);
  assertNum('Scenario 7: Advance Flow', 'C2 Remaining Unpaid Due', 92.50, c2AfterApply.balance);

  // -------------------------------------------------------------
  // Scenario 8: S8 - Sales Return with Credit Note to Advance
  // C1 returns 1x LED Bulb from S1 (originally 2x @ 100 + 18% tax = 236)
  // Return value: 118.00
  // -------------------------------------------------------------
  await recordReturn('customer', c1Id, s1Res.saleId, p1.id, 1, 118, 'Customer surplus return', 'credit');
  const s1AfterRet = (await db.select<{net_amount: number, paid_amount: number, status: string}[]>('SELECT net_amount, paid_amount, status FROM sales WHERE id = $1', [s1Res.saleId]))[0];
  const c1AfterRet = (await db.select<{advance_balance: number}[]>('SELECT advance_balance FROM customers WHERE id = $1', [c1Id]))[0];
  assertNum('Scenario 8: Sales Return', 'S1 Revised Net Amount after 1 Unit Return', 118.00, s1AfterRet.net_amount);
  assertNum('Scenario 8: Sales Return', 'C1 Advance Balance from Return Credit', 118.00, c1AfterRet.advance_balance);

  // -------------------------------------------------------------
  // 4. AUDIT: INVENTORY STOCK LEVELS
  // P1: 50 - 2 (S1) - 5 (S4) - 1 (S5) + 1 (S8 Return) = 43
  // P2: 20 - 1 (S2) = 19
  // P3: 15 - 1 (S3) = 14
  // -------------------------------------------------------------
  const prods = await getProducts();
  const p1Cur = prods.find(p => p.id === p1.id)?.stock_quantity || 0;
  const p2Cur = prods.find(p => p.id === p2.id)?.stock_quantity || 0;
  const p3Cur = prods.find(p => p.id === p3.id)?.stock_quantity || 0;
  assertNum('Stock Audit', 'P1 Stock (Initial 50 - 8 sold + 1 ret)', 43, p1Cur);
  assertNum('Stock Audit', 'P2 Stock (Initial 20 - 1 sold)', 19, p2Cur);
  assertNum('Stock Audit', 'P3 Stock (Initial 15 - 1 sold)', 14, p3Cur);

  // -------------------------------------------------------------
  // 5. AUDIT: CUSTOMER 1 (Suresh Electronics) PROFILE & LEDGER
  // Bills: S1 (118), S2 (2596), S4 (531), S5 (118) => Total Billed: 3363.00
  // Cleared Payments: S1 Cash (236), S4 Online (531), S6 Due Pay (1500) => Total Cleared Paid: 2267.00
  // Unpaid Bill Dues: S2 remaining (1096) + S5 (118) => 1214.00
  // Advance Balance: 118.00 (from return)
  // Double-Entry Ledger Ending Balance:
  //   Debits: S1 face value (236) + S2 (2596) + S4 (531) + S5 (118) = 3481.00
  //   Credits: S1 POS Pay (236) + S4 Pay (531) + Due Pay (1500) + Return (118) = 2385.00
  //   Net Running Balance = 3481 - 2385 = 1096.00 (Dr)
  //   Notice: Unpaid Dues (1214) - Advance Balance (118) = 1096.00 (Dr) exactly!
  // -------------------------------------------------------------
  const c1Profile = await getPartyProfileData('customer', c1Id);
  const c1Ledger = await getPartyLedger('customer', c1Id);
  const c1TotalDebit = c1Ledger.reduce((sum, e) => sum + e.debit, 0);
  const c1TotalCredit = c1Ledger.reduce((sum, e) => sum + e.credit, 0);
  const c1EndingBalance = c1Ledger[0]?.balance || 0;

  assertNum('C1 Profile Audit', 'C1 Total Lifetime Billed', 3363.00, c1Profile.totalBilled);
  assertNum('C1 Profile Audit', 'C1 Cleared Payments Recorded', 2267.00, c1Profile.totalPaid);
  assertNum('C1 Profile Audit', 'C1 Unpaid Bill Dues', 1214.00, c1Profile.totalPendingDue);
  assertNum('C1 Profile Audit', 'C1 Available Advance Credit', 118.00, c1Profile.availableAdvance);
  assertNum('C1 Ledger Audit', 'C1 Total Debits (Original Face Invoices)', 3481.00, c1TotalDebit);
  assertNum('C1 Ledger Audit', 'C1 Total Credits (Payments & Returns)', 2385.00, c1TotalCredit);
  assertNum('C1 Ledger Audit', 'C1 Ending Running Balance (Debit - Credit)', 1096.00, c1EndingBalance);

  // -------------------------------------------------------------
  // 6. AUDIT: CUSTOMER 2 (Rajesh Kumar) PROFILE & LEDGER
  // Bills: S3 (892.50)
  // Cleared Payments: S3 Initial (400) + Advance Deposit (1000) = 1400.00
  // Unpaid Bill Dues: S3 remaining = 92.50
  // Advance Balance: 1000 - 400 applied = 600.00
  // Double-Entry Ledger Ending Balance:
  //   Debits: S3 (892.50)
  //   Credits: Initial (400) + Deposit (1000) = 1400.00
  //   Net Running Balance = 892.50 - 1400 = -507.50 => 507.50 (Cr)
  //   Notice: Advance Balance (600) - Unpaid Due (92.50) = 507.50 (Cr) exactly!
  // -------------------------------------------------------------
  const c2Profile = await getPartyProfileData('customer', c2Id);
  const c2Ledger = await getPartyLedger('customer', c2Id);
  const c2TotalDebit = c2Ledger.reduce((sum, e) => sum + e.debit, 0);
  const c2TotalCredit = c2Ledger.reduce((sum, e) => sum + e.credit, 0);
  const c2EndingBalance = c2Ledger[0]?.balance || 0;

  assertNum('C2 Profile Audit', 'C2 Total Lifetime Billed', 892.50, c2Profile.totalBilled);
  assertNum('C2 Profile Audit', 'C2 Cleared Payments Recorded', 1400.00, c2Profile.totalPaid);
  assertNum('C2 Profile Audit', 'C2 Unpaid Bill Dues', 92.50, c2Profile.totalPendingDue);
  assertNum('C2 Profile Audit', 'C2 Available Advance Credit', 600.00, c2Profile.availableAdvance);
  assertNum('C2 Ledger Audit', 'C2 Total Debits', 892.50, c2TotalDebit);
  assertNum('C2 Ledger Audit', 'C2 Total Credits', 1400.00, c2TotalCredit);
  assertNum('C2 Ledger Audit', 'C2 Ending Running Balance (507.50 Cr)', -507.50, c2EndingBalance);

  // -------------------------------------------------------------
  // 7. AUDIT: DAY BOOK & PROFIT CALCULATIONS
  // Today's Date range
  // Gross Sales: S1 (118) + S2 (2596) + S3 (892.50) + S4 (531) + S5 (118) = 4255.50
  // Profit:
  //   S1 (1x P1 retained): 118 - 70 = 48
  //   S2 (1x P2): 2596 - 1500 = 1096
  //   S3 (1x P3): 892.50 - 600 = 292.50
  //   S4 (5x P1): 531 - 350 = 181
  //   S5 (1x P1): 118 - 70 = 48
  // Total Gross Profit: 48 + 1096 + 292.50 + 181 + 48 = 1665.50
  // -------------------------------------------------------------
  const todayStr = new Date().toISOString().split('T')[0];
  const dayBook = await getDayBookProfitAndExpenses(todayStr, todayStr);
  assertNum('Day Book Audit', 'Day Book Gross Profit', 1665.50, dayBook.grossProfit);
  assertNum('Day Book Audit', 'Day Book Expenses', 0.00, dayBook.expenses);
  assertNum('Day Book Audit', 'Day Book Net Profit', 1665.50, dayBook.netProfit);

  const passedChecks = checks.filter(c => c.passed).length;
  const failedChecks = checks.filter(c => !c.passed).length;

  return {
    timestamp: getLocalTimestamp(),
    totalChecks: checks.length,
    passedChecks,
    failedChecks,
    allPassed: failedChecks === 0,
    checks
  };
}
