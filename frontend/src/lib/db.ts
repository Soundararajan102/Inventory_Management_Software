import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;
let dbLoadPromise: Promise<Database> | null = null;

// Always loads the local, offline SQLite file (inventory.db)
export async function getDb() {
  if (dbInstance) return dbInstance;
  if (!dbLoadPromise) {
    dbLoadPromise = Database.load('sqlite:inventory.db').then(async (db) => {
      dbInstance = db;
      
      // Force create tables if migrations failed
      try {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS item_groups (
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
        // Ignore errors for ADD COLUMN as they might already exist
        try { await db.execute('ALTER TABLE products ADD COLUMN group_id INTEGER'); } catch (e) {}
        try { await db.execute('ALTER TABLE products ADD COLUMN brand_id INTEGER'); } catch (e) {}

        // Ensure all GST numbers in customers and suppliers are uppercase
        try {
          await db.execute("UPDATE customers SET gstin = UPPER(TRIM(gstin)) WHERE gstin IS NOT NULL");
          await db.execute("UPDATE suppliers SET gstin = UPPER(TRIM(gstin)) WHERE gstin IS NOT NULL");
        } catch (e) {}

        // Ensure cheque columns exist in payments table
        try { await db.execute('ALTER TABLE payments ADD COLUMN cheque_no TEXT'); } catch (e) {}
        try { await db.execute('ALTER TABLE payments ADD COLUMN bank_name TEXT'); } catch (e) {}
        try { await db.execute('ALTER TABLE payments ADD COLUMN cheque_date TEXT'); } catch (e) {}
        try { await db.execute("ALTER TABLE payments ADD COLUMN cheque_status TEXT DEFAULT 'cleared'"); } catch (e) {}

        // Ensure purchase destination columns exist in purchases table
        try { await db.execute("ALTER TABLE purchases ADD COLUMN destination_type TEXT DEFAULT 'shop'"); } catch (e) {}
        try { await db.execute("ALTER TABLE purchases ADD COLUMN destination_warehouse_id INTEGER"); } catch (e) {}

        // Ensure sales source columns exist in sales table
        try { await db.execute("ALTER TABLE sales ADD COLUMN source_type TEXT DEFAULT 'shop'"); } catch (e) {}
        try { await db.execute("ALTER TABLE sales ADD COLUMN source_warehouse_id INTEGER"); } catch (e) {}
      } catch (e) {
        console.error("Error creating tables manually:", e);
      }
      
      return db;
    }).catch(err => {
      dbLoadPromise = null;
      throw err;
    });
  }
  return await dbLoadPromise;
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
  if (warehouseId) {
    return await db.select<Product[]>(`
      SELECT products.*, 
             COALESCE(wi.quantity, 0) as stock_quantity,
             item_groups.name as group_name, 
             brands.name as brand_name 
      FROM products 
      LEFT JOIN warehouse_items wi ON products.id = wi.product_id AND wi.warehouse_id = $1
      LEFT JOIN item_groups ON products.group_id = item_groups.id 
      LEFT JOIN brands ON products.brand_id = brands.id 
      WHERE products.is_group = 0 
      ORDER BY products.id DESC
    `, [warehouseId]);
  }
  return await db.select<Product[]>(`
    SELECT products.*, item_groups.name as group_name, brands.name as brand_name 
    FROM products 
    LEFT JOIN item_groups ON products.group_id = item_groups.id 
    LEFT JOIN brands ON products.brand_id = brands.id 
    WHERE products.is_group = 0 
    ORDER BY products.id DESC
  `);
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
  sourceWarehouseId: number | null = null
) {
  const db = await getDb();
  
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

  let whName = 'Warehouse';
  if (sourceType === 'warehouse' && sourceWarehouseId) {
    const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [sourceWarehouseId]);
    if (whRes.length > 0) whName = whRes[0].name;
  }

  const saleResult = await db.execute(
    `INSERT INTO sales (customer_id, total_amount, tax_amount, discount, net_amount, paid_amount, status, payment_method, customer_snapshot, source_type, source_warehouse_id) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, effectivePaidAmount, status, paymentMethod, customerSnapshot, sourceType, sourceWarehouseId]
  );
  
  const saleId = saleResult.lastInsertId;
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const invoiceNumber = `${currentYear}-${saleId}`;
  await db.execute(`UPDATE sales SET invoice_number = $1 WHERE id = $2`, [invoiceNumber, saleId]);
  
  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

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

    // Insert into sale_items
    await db.execute(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit, productSnapshot]
    );
    
    if (sourceType === 'warehouse' && sourceWarehouseId) {
      // Decrement stock in warehouse_items
      await db.execute(
        `UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3`,
        [item.cart_qty, sourceWarehouseId, item.id]
      );
      // Record stock movement
      await db.execute(
        `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ('warehouse', $1, $2, 'shop', 0, 'Customer Sale', $3, $4, $5)`,
        [sourceWarehouseId, whName, item.id, item.cart_qty, `Sale Invoice #${invoiceNumber}`]
      );
    } else {
      // Decrement stock in products table (Shop Storage)
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [item.cart_qty, item.id]
      );
    }
  }

  // Increment customer balance (positive means they owe us, negative means we owe them / advance)
  if (customerId !== null) {
    await db.execute(
      `UPDATE customers SET balance = balance + $1 WHERE id = $2`,
      [netAmount, customerId]
    );
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
        chequeDate
      );
    }
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
      chequeDate
    );
  }
  
  return invoiceNumber;
}

export async function getNextInvoiceNumber(): Promise<string> {
  const db = await getDb();
  const res = await db.select<{max_id: number}[]>('SELECT MAX(id) as max_id FROM sales');
  const nextId = (res[0]?.max_id || 0) + 1;
  const currentYear = new Date().getFullYear().toString().slice(-2);
  return `${currentYear}-${nextId}`;
}

export async function getNextQuotationNumber(): Promise<string> {
  const db = await getDb();
  const res = await db.select<{max_id: number}[]>('SELECT MAX(id) as max_id FROM quotations');
  const nextId = (res[0]?.max_id || 0) + 1;
  const currentYear = new Date().getFullYear().toString().slice(-2);
  return `QT-${currentYear}-${nextId}`;
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
  notes: string = ''
): Promise<string> {
  const db = await getDb();
  
  let customerSnapshot = null;
  if (customerId !== null) {
    const custRes = await db.select<any[]>('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.length > 0) customerSnapshot = JSON.stringify(custRes[0]);
  }

  const result = await db.execute(
    `INSERT INTO quotations (customer_id, total_amount, tax_amount, discount, net_amount, status, customer_snapshot, notes) 
     VALUES ($1, $2, $3, $4, $5, 'Pending', $6, $7)`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, customerSnapshot, notes]
  );
  
  const quotationId = result.lastInsertId;
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const quotationNumber = `QT-${currentYear}-${quotationId}`;
  await db.execute(`UPDATE quotations SET quotation_number = $1 WHERE id = $2`, [quotationNumber, quotationId]);
  
  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

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
  const isWh = sale.source_type === 'warehouse' && sale.source_warehouse_id;
  const items = await db.select<any[]>(
    `SELECT si.*, 
            ${isWh ? 'COALESCE(wi.quantity, 0) as stock_quantity' : 'p.stock_quantity'}
     FROM sale_items si 
     LEFT JOIN products p ON si.product_id = p.id
     ${isWh ? 'LEFT JOIN warehouse_items wi ON si.product_id = wi.product_id AND wi.warehouse_id = ' + Number(sale.source_warehouse_id) : ''}
     WHERE si.sale_id = $1`, 
    [id]
  );
  sale.items = items.map(item => {
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
      stock_quantity: (item.stock_quantity || 0) + item.quantity
    };
  });
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
  sourceWarehouseId: number | null = null
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
  const oldItems = await db.select<{product_id: number, quantity: number}[]>('SELECT product_id, quantity FROM sale_items WHERE sale_id = $1', [saleId]);

  // 3. Revert stock and customer balance based on where it was originally deducted
  for (const oldItem of oldItems) {
    if (oldSrcType === 'warehouse' && oldWhId) {
      await db.execute(
        `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
         VALUES ($1, $2, $3) 
         ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
        [oldWhId, oldItem.product_id, oldItem.quantity]
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

  let whName = 'Warehouse';
  if (sourceType === 'warehouse' && sourceWarehouseId) {
    const whRes = await db.select<{name: string}[]>('SELECT name FROM warehouses WHERE id = $1', [sourceWarehouseId]);
    if (whRes.length > 0) whName = whRes[0].name;
  }

  await db.execute(
    `UPDATE sales SET customer_id = $1, total_amount = $2, tax_amount = $3, discount = $4, net_amount = $5, paid_amount = $6, status = $7, customer_snapshot = $8, payment_method = $9, source_type = $10, source_warehouse_id = $11 WHERE id = $12`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, effectivePaidAmount, status, customerSnapshot, paymentMethod, sourceType, sourceWarehouseId, saleId]
  );
  
  let originalPriceBasis = 0;
  cart.forEach(item => { originalPriceBasis += item.selling_price * item.cart_qty; });
  const discountRatio = originalPriceBasis > 0 ? (discountAmount / originalPriceBasis) : 0;
  const taxMethod = localStorage.getItem('salesTaxMethod') || localStorage.getItem('taxMethod') || 'exclusive';

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
    
    const productSnapshot = JSON.stringify({
      name: item.name,
      model: item.model,
      hsn_code: item.hsn_code,
      gst_percentage: item.gst_percentage,
      cgst_percentage: item.cgst_percentage,
      sgst_percentage: item.sgst_percentage
    });

    await db.execute(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax, unit, product_snapshot) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [saleId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit, productSnapshot]
    );
    
    if (sourceType === 'warehouse' && sourceWarehouseId) {
      await db.execute(
        `UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3`,
        [item.cart_qty, sourceWarehouseId, item.id]
      );
      await db.execute(
        `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ('warehouse', $1, $2, 'shop', 0, 'Customer Sale', $3, $4, $5)`,
        [sourceWarehouseId, whName, item.id, item.cart_qty, `Sale Invoice #${oldSale.invoice_number} (Edited)`]
      );
    } else {
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
        [item.cart_qty, item.id]
      );
    }
  }

  // 7. Apply new customer balance
  if (customerId !== null) {
    await db.execute(
      `UPDATE customers SET balance = balance + $1 WHERE id = $2`,
      [netAmount, customerId]
    );
    if (paidAmount > 0) {
      await recordPayment(
        'customer', 
        customerId, 
        paidAmount, 
        paymentMethod, 
        oldSale.invoice_number, 
        'Initial Payment at POS (Edited)',
        chequeNo,
        bankName,
        chequeDate
      );
    }
  } else if (paidAmount > 0) {
    await recordPayment(
      'customer', 
      0, 
      paidAmount, 
      paymentMethod, 
      oldSale.invoice_number, 
      'Walk-in Customer Sale (Edited)',
      chequeNo,
      bankName,
      chequeDate
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
}

export async function getCustomers(): Promise<Customer[]> {
  const db = await getDb();
  return await db.select('SELECT * FROM customers ORDER BY id DESC');
}

export async function addCustomer(name: string, phone: string, email: string, address: string, gstin: string) {
  const db = await getDb();
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : '';
  await db.execute(
    `INSERT INTO customers (name, phone, email, address, gstin, balance) VALUES ($1, $2, $3, $4, $5, 0)`,
    [name, phone, email, address, cleanGstin]
  );
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
}

export async function getSuppliers(): Promise<Supplier[]> {
  const db = await getDb();
  return await db.select('SELECT * FROM suppliers ORDER BY id DESC');
}

export async function addSupplier(name: string, phone: string, email: string, address: string, gstin: string) {
  const db = await getDb();
  const cleanGstin = gstin ? gstin.trim().toUpperCase() : '';
  await db.execute(
    `INSERT INTO suppliers (name, phone, email, address, gstin, balance) VALUES ($1, $2, $3, $4, $5, 0)`,
    [name, phone, email, address, cleanGstin]
  );
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

  const purchaseResult = await db.execute(
    `INSERT INTO purchases (supplier_id, invoice_number, supplier_invoice_date, total_amount, tax_amount, discount, net_amount, paid_amount, status, supplier_snapshot, destination_type, destination_warehouse_id) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [supplierId, invoiceNo, supplierInvoiceDate, totalAmount, taxAmount, discount, netAmount, paidAmount, status, supplierSnapshot, destinationType, destinationWarehouseId]
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
        `INSERT INTO stock_movements (from_location_type, from_location_id, from_location_name, to_location_type, to_location_id, to_location_name, product_id, quantity, notes)
         VALUES ('direct_inward', 0, $1, 'warehouse', $2, $3, $4, $5, $6)`,
        [`Supplier (${suppName})`, destinationWarehouseId, whName, item.id, item.purchase_qty, `Purchase Inward - Inv #${invoiceNo}`]
      );
    } else {
      // Increment stock in products table (Shop Storage)
      await db.execute(
        `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`,
        [item.purchase_qty, item.id]
      );
    }
  }

  // Increment supplier balance (positive means we owe them, negative means they owe us / advance)
  await db.execute(
    `UPDATE suppliers SET balance = balance + $1 WHERE id = $2`,
    [netAmount, supplierId]
  );
  if (paidAmount > 0) {
    await recordPayment('supplier', supplierId, paidAmount, 'Cash', invoiceNo, 'Initial Payment for Purchase');
  }
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

  // 8. Apply new supplier balance
  await db.execute(
    `UPDATE suppliers SET balance = balance + $1 WHERE id = $2`,
    [netAmount, supplierId]
  );

  if (paidAmount > 0) {
    await recordPayment('supplier', supplierId, paidAmount, 'Cash', invoiceNo, 'Initial Payment (Edited)');
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
  type: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  invoice_number?: string;
  original_id: number;
}

export async function getPartyLedger(entityType: 'customer' | 'supplier', entityId: number): Promise<LedgerEntry[]> {
  const db = await getDb();
  const entries: LedgerEntry[] = [];

  // Fetch Payments (Only cleared payments affect ledger balance)
  const payments = await db.select<{id: number, date: string, amount: number, payment_mode: string, reference_no: string, notes: string, cheque_no: string | null}[]>(
    "SELECT id, date, amount, payment_mode, reference_no, notes, cheque_no FROM payments WHERE entity_type = $1 AND entity_id = $2 AND (cheque_status IS NULL OR cheque_status = 'cleared')",
    [entityType, entityId]
  );
  
  // Fetch Returns
  const returns = await db.select<{id: number, date: string, amount: number, reason: string}[]>(
    'SELECT id, date, amount, reason FROM returns WHERE entity_type = $1 AND entity_id = $2',
    [entityType, entityId]
  );

  if (entityType === 'customer') {
    // Customers
    // Fetch Sales
    const sales = await db.select<{id: number, date: string, invoice_number: string, net_amount: number}[]>(
      'SELECT id, date, invoice_number, net_amount FROM sales WHERE customer_id = $1',
      [entityId]
    );

    // Assemble Customer entries
    sales.forEach(s => entries.push({
      id: `sale-${s.id}`, date: s.date, type: 'Sale',
      description: `Sale (Inv: ${s.invoice_number})`,
      debit: s.net_amount, credit: 0, balance: 0,
      invoice_number: s.invoice_number,
      original_id: s.id
    }));
    payments.forEach(p => {
      if (p.amount > 0) {
        const chq = p.cheque_no ? ` (Chq #${p.cheque_no})` : '';
        entries.push({
          id: `pay-${p.id}`, date: p.date, type: 'Payment',
          description: `Payment Recd (${p.payment_mode}${chq}) ${p.reference_no || ''}`.trim(),
          debit: 0, credit: p.amount, balance: 0,
          original_id: p.id
        });
      }
    });
    returns.forEach(r => entries.push({
      id: `ret-${r.id}`, date: r.date, type: 'Return',
      description: `Sales Return (${r.reason || ''})`,
      debit: 0, credit: r.amount, balance: 0,
      original_id: r.id
    }));

  } else {
    // Suppliers
    // Fetch Purchases
    const purchases = await db.select<{id: number, date: string, invoice_number: string, net_amount: number}[]>(
      'SELECT id, date, invoice_number, net_amount FROM purchases WHERE supplier_id = $1',
      [entityId]
    );

    // Assemble Supplier entries
    purchases.forEach(p => entries.push({
      id: `pur-${p.id}`, date: p.date, type: 'Purchase',
      description: `Purchase (Inv: ${p.invoice_number})`,
      debit: 0, credit: p.net_amount, balance: 0,
      invoice_number: p.invoice_number,
      original_id: p.id
    }));
    payments.forEach(p => {
      if (p.amount > 0) {
        const chq = p.cheque_no ? ` (Chq #${p.cheque_no})` : '';
        entries.push({
          id: `pay-${p.id}`, date: p.date, type: 'Payment',
          description: `Payment Made (${p.payment_mode}${chq}) ${p.reference_no || ''}`.trim(),
          debit: p.amount, credit: 0, balance: 0,
          original_id: p.id
        });
      }
    });
    returns.forEach(r => entries.push({
      id: `ret-${r.id}`, date: r.date, type: 'Return',
      description: `Purchase Return (${r.reason || ''})`,
      debit: r.amount, credit: 0, balance: 0,
      original_id: r.id
    }));
  }

  // Sort chronological
  entries.sort((a, b) => {
    const diff = new Date(a.date).getTime() - new Date(b.date).getTime();
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
    entry.balance = currentBalance;
  });

  // Re-sort descending so newest is at the top (simply reverse the chronological array)
  entries.reverse();

  return entries;
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
  chequeDate?: string | null
) {
  const db = await getDb();
  
  const isCheque = paymentMode.toLowerCase() === 'cheque';
  const isPDC = isCheque && isPdcDate(chequeDate);
  const chequeStatus = isCheque ? (isPDC ? 'pdc_pending' : 'cleared') : 'cleared';

  await db.execute(
    `INSERT INTO payments (entity_type, entity_id, amount, payment_mode, reference_no, notes, cheque_no, bank_name, cheque_date, cheque_status) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      entityType, 
      entityId, 
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
      // Customer pays us -> their balance goes down (they owe us less)
      await db.execute(
        `UPDATE customers SET balance = balance - $1 WHERE id = $2`,
        [amount, entityId]
      );

      // Allocate payment towards customer's unpaid sales (oldest first)
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

      const updated = await db.select<{balance: number}[]>('SELECT balance FROM customers WHERE id = $1', [entityId]);
      if (updated.length > 0 && updated[0].balance <= 0.01) {
         // If balance is fully cleared (or advance paid), mark all sales as Paid
         await db.execute(
           `UPDATE sales SET status = 'Paid', paid_amount = net_amount WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'`,
           [entityId]
         );
      }
    }
  } else {
    if (entityId > 0) {
      // We pay supplier -> our balance owed goes down
      await db.execute(
        `UPDATE suppliers SET balance = balance - $1 WHERE id = $2`,
        [amount, entityId]
      );

      // Allocate payment towards supplier's unpaid purchases (oldest first)
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

      const updated = await db.select<{balance: number}[]>('SELECT balance FROM suppliers WHERE id = $1', [entityId]);
      if (updated.length > 0 && updated[0].balance <= 0.01) {
         // If balance is cleared, mark all purchases for this supplier as Paid
         await db.execute(
           `UPDATE purchases SET status = 'Paid', paid_amount = net_amount WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'`,
           [entityId]
         );
      }
    }
  }

  return { chequeStatus, isPDC: false };
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

  if (entityType === 'customer' && entityId > 0) {
    await db.execute('UPDATE customers SET balance = balance - $1 WHERE id = $2', [amount, entityId]);
    
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
    const updated = await db.select<{balance: number}[]>('SELECT balance FROM customers WHERE id = $1', [entityId]);
    if (updated.length > 0 && updated[0].balance <= 0.01) {
      await db.execute(`UPDATE sales SET status = 'Paid', paid_amount = net_amount WHERE customer_id = $1 AND status != 'Paid' AND status != 'Returned'`, [entityId]);
    }
  } else if (entityType === 'supplier' && entityId > 0) {
    await db.execute('UPDATE suppliers SET balance = balance - $1 WHERE id = $2', [amount, entityId]);
    
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
    const updated = await db.select<{balance: number}[]>('SELECT balance FROM suppliers WHERE id = $1', [entityId]);
    if (updated.length > 0 && updated[0].balance <= 0.01) {
      await db.execute(`UPDATE purchases SET status = 'Paid', paid_amount = net_amount WHERE supplier_id = $1 AND status != 'Paid' AND status != 'Returned'`, [entityId]);
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

  // If it was previously cleared, revert the party balance
  if (wasCleared) {
    const amount = Number(p.amount);
    const entityId = Number(p.entity_id);
    if (p.entity_type === 'customer' && entityId > 0) {
      await db.execute('UPDATE customers SET balance = balance + $1 WHERE id = $2', [amount, entityId]);
    } else if (p.entity_type === 'supplier' && entityId > 0) {
      await db.execute('UPDATE suppliers SET balance = balance + $1 WHERE id = $2', [amount, entityId]);
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
  await db.execute(
    `INSERT INTO returns (entity_type, entity_id, transaction_id, product_id, quantity, amount, reason) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entityType, entityId, transactionId, productId, quantity, amount, reason]
  );

  if (entityType === 'customer') {
    if (transactionId) {
      const saleSrc = await db.select<{source_type: string | null, source_warehouse_id: number | null}[]>(
        'SELECT source_type, source_warehouse_id FROM sales WHERE id = $1',
        [transactionId]
      );
      if (saleSrc.length > 0 && saleSrc[0].source_type === 'warehouse' && saleSrc[0].source_warehouse_id) {
        await db.execute(
          `INSERT INTO warehouse_items (warehouse_id, product_id, quantity) 
           VALUES ($1, $2, $3) 
           ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity + $3`,
          [saleSrc[0].source_warehouse_id, productId, quantity]
        );
      } else {
        await db.execute(`UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [quantity, productId]);
      }
    } else {
      await db.execute(`UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [quantity, productId]);
    }
    
    if (refundMethod === 'credit' && entityId > 0) {
      await db.execute(`UPDATE customers SET balance = balance - $1 WHERE id = $2`, [amount, entityId]);
    } else if (refundMethod === 'cash') {
      await db.execute(
        `INSERT INTO payments (entity_type, entity_id, amount, payment_mode, reference_no, notes) 
         VALUES ('customer', $1, $2, 'Cash', $3, 'Cash Refund for Return')`,
        [entityId, -amount, transactionId ? `Ret-Inv-${transactionId}` : '']
      );
    }

    if (transactionId) {
      const retRes = await db.select<{total_returned: number}[]>(
        `SELECT SUM(quantity) as total_returned FROM returns WHERE transaction_id = $1 AND entity_type = 'customer'`,
        [transactionId]
      );
      const saleRes = await db.select<{total_billed: number}[]>(
        `SELECT SUM(quantity) as total_billed FROM sale_items WHERE sale_id = $1`,
        [transactionId]
      );
      const totalReturned = retRes[0]?.total_returned || 0;
      const totalBilled = saleRes[0]?.total_billed || 0;
      
      const newStatus = totalReturned >= totalBilled ? 'Returned' : 'Partial Return';
      await db.execute(`UPDATE sales SET status = $1 WHERE id = $2`, [newStatus, transactionId]);
    }
  } else {
    // If returning against a purchase assigned to a warehouse, deduct from that warehouse
    if (transactionId) {
      const purDest = await db.select<{destination_type: string | null, destination_warehouse_id: number | null}[]>(
        'SELECT destination_type, destination_warehouse_id FROM purchases WHERE id = $1',
        [transactionId]
      );
      if (purDest.length > 0 && purDest[0].destination_type === 'warehouse' && purDest[0].destination_warehouse_id) {
        await db.execute(
          'UPDATE warehouse_items SET quantity = quantity - $1 WHERE warehouse_id = $2 AND product_id = $3',
          [quantity, purDest[0].destination_warehouse_id, productId]
        );
      } else {
        await db.execute(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [quantity, productId]);
      }
    } else {
      await db.execute(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [quantity, productId]);
    }
    
    if (refundMethod === 'credit' && entityId > 0) {
      await db.execute(`UPDATE suppliers SET balance = balance - $1 WHERE id = $2`, [amount, entityId]);
    } else if (refundMethod === 'cash') {
      await db.execute(
        `INSERT INTO payments (entity_type, entity_id, amount, payment_mode, reference_no, notes) 
         VALUES ('supplier', $1, $2, 'Cash', $3, 'Cash Refund for Purchase Return')`,
        [entityId, -amount, transactionId ? `Ret-Pur-${transactionId}` : '']
      );
    }

    if (transactionId) {
      const retRes = await db.select<{total_returned: number}[]>(
        `SELECT SUM(quantity) as total_returned FROM returns WHERE transaction_id = $1 AND entity_type = 'supplier'`,
        [transactionId]
      );
      const purRes = await db.select<{total_billed: number}[]>(
        `SELECT SUM(quantity) as total_billed FROM purchase_items WHERE purchase_id = $1`,
        [transactionId]
      );
      const totalReturned = retRes[0]?.total_returned || 0;
      const totalBilled = purRes[0]?.total_billed || 0;
      
      const newStatus = totalReturned >= totalBilled ? 'Returned' : 'Partial Return';
      await db.execute(`UPDATE purchases SET status = $1 WHERE id = $2`, [newStatus, transactionId]);
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
     (SELECT GROUP_CONCAT(p.name || ' x' || si.quantity || ' (₹' || CAST(si.unit_price AS TEXT) || ' / ' || COALESCE(si.unit, p.unit) || ')', char(10)) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as products_bought,
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
      COALESCE((SELECT SUM(p.purchase_price * si.quantity) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id), 0)
    ) as profit 
    FROM sales s
    WHERE date(s.date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  
  let grossProfit = profitData.reduce((sum, row) => sum + (row.profit || 0), 0);

  // Deduct profit lost on returns within date range
  const returnProfitLossData = await db.select<{loss: number}[]>(`
    SELECT COALESCE(SUM(r.amount - (r.quantity * p.purchase_price)), 0) as loss
    FROM returns r
    JOIN products p ON r.product_id = p.id
    WHERE r.entity_type = 'customer' AND date(r.date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  const returnProfitLoss = returnProfitLossData[0]?.loss || 0;
  grossProfit -= returnProfitLoss;

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
     WHERE s.invoice_number LIKE $1 OR c.name LIKE $1 OR s.date LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const s of sales) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string, hsn_code: string | null, cgst_percentage: number, sgst_percentage: number, gst_percentage: number, product_snapshot: string | null, returned_quantity: number}[]>(
      `SELECT si.product_id, p.name, p.model, si.quantity, si.unit_price, si.unit, p.hsn_code, p.cgst_percentage, p.sgst_percentage, p.gst_percentage, si.product_snapshot,
       COALESCE((SELECT SUM(r.quantity) FROM returns r WHERE r.transaction_id = si.sale_id AND r.product_id = si.product_id AND r.entity_type = 'customer'), 0) as returned_quantity
       FROM sale_items si JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [s.id]
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
     WHERE p.invoice_number LIKE $1 OR s.name LIKE $1 OR p.date LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const p of purchases) {
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

export async function isAppActivated(): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['activation_expiry']);
    if (result.length > 0) {
      const expiryDate = new Date(result[0].value);
      const isValid = expiryDate > new Date();
      if (!isValid) alert("License expired. Expiry: " + result[0].value);
      return isValid;
    }
    
    // Fallback for previous 'is_activated' key before 1-year expiry feature was added
    const legacyResult = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['is_activated']);
    return legacyResult.length > 0 && legacyResult[0].value === 'true';
  } catch (e: any) {
    console.error("isAppActivated error:", e);
    return false;
  }
}

export async function activateApp(): Promise<void> {
  const db = await getDb();
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + 6);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['activation_expiry', expiry.toISOString()]);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['is_activated', 'false']); // Remove legacy permanent activation
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
