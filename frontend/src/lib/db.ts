import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

// Always loads the local, offline SQLite file (inventory.db)
export async function getDb() {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:inventory.db');
  }
  return dbInstance;
}

export interface Product {
  id: number;
  name: string;
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
  variants?: Product[];
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDb();
  const allProducts = await db.select<Product[]>('SELECT * FROM products ORDER BY id DESC');
  
  const groups = allProducts.filter(p => p.is_group);
  const variants = allProducts.filter(p => p.parent_id !== null);
  const orphans = allProducts.filter(p => !p.is_group && p.parent_id === null);

  const finalProducts: Product[] = [...groups, ...orphans];
  
  for (const p of finalProducts) {
    if (p.is_group) {
      p.variants = variants.filter(v => v.parent_id === p.id);
    }
  }

  return finalProducts;
}

export async function getSellableProducts(): Promise<Product[]> {
  const db = await getDb();
  return await db.select<Product[]>('SELECT * FROM products WHERE is_group = 0 ORDER BY id DESC');
}

export interface ProductBaseData {
  barcode: string;
  model: string;
  hsn_code: string;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  unit: string;
  min_stock: number;
  stock: number;
  gst_percentage: number;
}

export interface ProductVariantData {
  model: string;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  min_stock: number;
  stock: number;
  barcode: string;
}

export async function addProduct(
  name: string, 
  baseData: ProductBaseData,
  variants: ProductVariantData[] = []
) {
  const db = await getDb();
  if (variants.length === 0) {
    await db.execute(
      `INSERT INTO products 
        (name, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock_quantity, is_group, parent_id, gst_percentage) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, NULL, $11)`,
      [name, baseData.barcode, baseData.model, baseData.hsn_code, baseData.purchase_price, baseData.selling_price, baseData.mrp, baseData.unit, baseData.min_stock, baseData.stock, baseData.gst_percentage]
    );
  } else {
    // Create parent group
    const res = await db.execute(
      `INSERT INTO products (name, is_group, hsn_code, unit, selling_price, purchase_price, gst_percentage) VALUES ($1, 1, $2, $3, 0, 0, $4)`,
      [name, baseData.hsn_code, baseData.unit, baseData.gst_percentage]
    );
    const parentId = res.lastInsertId;
    
    // Insert variants
    for (const v of variants) {
      await db.execute(
        `INSERT INTO products 
          (name, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock_quantity, is_group, parent_id, gst_percentage) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12)`,
        [name + ' - ' + v.model, v.barcode, v.model, baseData.hsn_code, v.purchase_price, v.selling_price, v.mrp, baseData.unit, v.min_stock, v.stock, parentId, baseData.gst_percentage]
      );
    }
  }
}

export async function updateProduct(
  id: number,
  name: string, 
  barcode: string, 
  model: string,
  hsn_code: string,
  purchase_price: number,
  selling_price: number,
  mrp: number,
  unit: string,
  min_stock: number,
  stock: number,
  gst_percentage: number
) {
  const db = await getDb();
  await db.execute(
    `UPDATE products SET 
      name = $1, barcode = $2, model = $3, hsn_code = $4, purchase_price = $5, selling_price = $6, mrp = $7, unit = $8, min_stock = $9, stock_quantity = $10, gst_percentage = $11 
     WHERE id = $12`,
    [name, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock, gst_percentage, id]
  );
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
  paymentMethod: string,
  customerId: number | null
) {
  const db = await getDb();
  
  let status = 'Unpaid';
  if (paidAmount >= netAmount) status = 'Paid';
  else if (paidAmount > 0) status = 'Partial';
  
  // Note: tauri-plugin-sql handles queries asynchronously.
  // We insert the sale, get the ID, then insert items and update stock.
  
  const saleResult = await db.execute(
    `INSERT INTO sales (customer_id, total_amount, tax_amount, discount, net_amount, paid_amount, status, payment_method) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, paidAmount, status, paymentMethod]
  );
  
  const saleId = saleResult.lastInsertId;
  const currentYear = new Date().getFullYear().toString().slice(-2);
  const invoiceNumber = `${currentYear}-${saleId}`;
  await db.execute(`UPDATE sales SET invoice_number = $1 WHERE id = $2`, [invoiceNumber, saleId]);
  
  for (const item of cart) {
    const itemTax = (item.selling_price * (item.gst_percentage || 0) / 100) * item.cart_qty;
    
    // Insert into sale_items
    await db.execute(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax, unit) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [saleId, item.id, item.cart_qty, item.selling_price, itemTax, item.unit]
    );
    
    // Decrement stock in products table
    await db.execute(
      `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
      [item.cart_qty, item.id]
    );
  }

  // Increment customer balance (positive means they owe us, negative means we owe them / advance)
  if (customerId !== null) {
    await db.execute(
      `UPDATE customers SET balance = balance + $1 WHERE id = $2`,
      [netAmount, customerId]
    );
    if (paidAmount > 0) {
      await recordPayment('customer', customerId, paidAmount, paymentMethod, invoiceNumber, 'Initial Payment at POS');
    }
  }
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
  await db.execute(
    `INSERT INTO customers (name, phone, email, address, gstin, balance) VALUES ($1, $2, $3, $4, $5, 0)`,
    [name, phone, email, address, gstin]
  );
}

export async function editCustomer(id: number, name: string, phone: string, email: string, address: string, gstin: string) {
  const db = await getDb();
  await db.execute(
    `UPDATE customers SET name = $1, phone = $2, email = $3, address = $4, gstin = $5 WHERE id = $6`,
    [name, phone, email, address, gstin, id]
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
  await db.execute(
    `INSERT INTO suppliers (name, phone, email, address, gstin, balance) VALUES ($1, $2, $3, $4, $5, 0)`,
    [name, phone, email, address, gstin]
  );
}

export async function editSupplier(id: number, name: string, phone: string, email: string, address: string, gstin: string) {
  const db = await getDb();
  await db.execute(
    `UPDATE suppliers SET name = $1, phone = $2, email = $3, address = $4, gstin = $5 WHERE id = $6`,
    [name, phone, email, address, gstin, id]
  );
}

export interface PurchaseItem extends Product {
  purchase_qty: number;
}

export async function recordPurchase(
  supplierId: number,
  invoiceNo: string,
  items: PurchaseItem[],
  totalAmount: number,
  taxAmount: number,
  discount: number,
  netAmount: number,
  paidAmount: number
) {
  const db = await getDb();
  
  let status = 'Unpaid';
  if (paidAmount >= netAmount) status = 'Paid';
  else if (paidAmount > 0) status = 'Partial';

  const purchaseResult = await db.execute(
    `INSERT INTO purchases (supplier_id, invoice_number, total_amount, tax_amount, discount, net_amount, paid_amount, status) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [supplierId, invoiceNo, totalAmount, taxAmount, discount, netAmount, paidAmount, status]
  );
  
  const purchaseId = purchaseResult.lastInsertId;
  
  for (const item of items) {
    const itemTax = (item.purchase_price * (item.gst_percentage || 0) / 100) * item.purchase_qty; 
    
    // Insert into purchase_items
    await db.execute(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_rate, tax, unit) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [purchaseId, item.id, item.purchase_qty, item.purchase_price, itemTax, item.unit]
    );
    
    // Increment stock in products table
    await db.execute(
      `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`,
      [item.purchase_qty, item.id]
    );
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
}

export async function getPaymentsHistory(entityType: 'customer' | 'supplier'): Promise<PaymentHistory[]> {
  const db = await getDb();
  const table = entityType === 'customer' ? 'customers' : 'suppliers';
  return await db.select(
    `SELECT p.*, e.name as entity_name 
     FROM payments p 
     JOIN ${table} e ON p.entity_id = e.id 
     WHERE p.entity_type = $1 
     ORDER BY p.date DESC`,
    [entityType]
  );
}

export async function recordPayment(
  entityType: 'customer' | 'supplier',
  entityId: number,
  amount: number,
  paymentMode: string,
  referenceNo: string,
  notes: string
) {
  const db = await getDb();
  
  await db.execute(
    `INSERT INTO payments (entity_type, entity_id, amount, payment_mode, reference_no, notes) 
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, amount, paymentMode, referenceNo, notes]
  );

  if (entityType === 'customer') {
    // Customer pays us -> their balance goes down (they owe us less)
    await db.execute(
      `UPDATE customers SET balance = balance - $1 WHERE id = $2`,
      [amount, entityId]
    );
    const updated = await db.select<{balance: number}[]>('SELECT balance FROM customers WHERE id = $1', [entityId]);
    if (updated.length > 0 && updated[0].balance <= 0.01) {
       // If balance is cleared, mark all old partial/unpaid sales as Paid (this app lacks per-invoice tracking for payments)
       // Note: the sales table currently doesn't have a 'status' column, so we just clear balance.
    }
  } else {
    // We pay supplier -> our balance owed goes down
    await db.execute(
      `UPDATE suppliers SET balance = balance - $1 WHERE id = $2`,
      [amount, entityId]
    );
    const updated = await db.select<{balance: number}[]>('SELECT balance FROM suppliers WHERE id = $1', [entityId]);
    if (updated.length > 0 && updated[0].balance <= 0.01) {
       // If balance is cleared, mark all purchases for this supplier as Paid
       await db.execute(`UPDATE purchases SET status = 'Paid' WHERE supplier_id = $1 AND status != 'Paid'`, [entityId]);
    }
  }
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
  reason: string
) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO returns (entity_type, entity_id, transaction_id, product_id, quantity, amount, reason) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entityType, entityId, transactionId, productId, quantity, amount, reason]
  );

  if (entityType === 'customer') {
    await db.execute(`UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [quantity, productId]);
    if (entityId > 0) {
      await db.execute(`UPDATE customers SET balance = balance - $1 WHERE id = $2`, [amount, entityId]);
    }
    if (transactionId) {
      await db.execute(`UPDATE sales SET status = 'Returned' WHERE id = $1`, [transactionId]);
    }
  } else {
    await db.execute(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [quantity, productId]);
    if (entityId > 0) {
      await db.execute(`UPDATE suppliers SET balance = balance - $1 WHERE id = $2`, [amount, entityId]);
    }
    if (transactionId) {
      await db.execute(`UPDATE purchases SET status = 'Returned' WHERE id = $1`, [transactionId]);
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
  const products = await db.select<{stock_quantity: number, purchase_price: number, selling_price: number}[]>('SELECT stock_quantity, purchase_price, selling_price FROM products');
  const totalProducts = products.length;
  const lowStockItems = products.filter(p => p.stock_quantity < 10).length;
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock_quantity * (p.purchase_price > 0 ? p.purchase_price : p.selling_price)), 0);
  
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
  
  // Gross Profit = (Selling Price - Purchase Price) * Qty
  const profitData = await db.select<{profit: number}[]>(`
    SELECT ((si.unit_price - p.purchase_price) * si.quantity) as profit 
    FROM sale_items si 
    JOIN products p ON si.product_id = p.id

  `);
  const grossProfit = profitData.reduce((sum, row) => sum + (row.profit || 0), 0);
  
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
  payment_method: string;
  status: string | null;
  products_bought: string;
  total_quantity: number;
}

export async function getSalesReport(startDate: string, endDate: string): Promise<SalesReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT s.id, s.date, s.invoice_number, c.name as customer_name, s.net_amount, s.tax_amount, s.payment_method, s.status,
     (SELECT GROUP_CONCAT(p.name || ' x' || si.quantity || ' (₹' || CAST(si.unit_price AS TEXT) || ' / ' || COALESCE(si.unit, p.unit) || ')', char(10)) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id) as products_bought,
     (SELECT SUM(si.quantity) FROM sale_items si WHERE si.sale_id = s.id) as total_quantity
     FROM sales s 
     LEFT JOIN customers c ON s.customer_id = c.id 
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
  net_amount: number;
  tax_amount: number;
  status: string;
  products_bought: string;
  total_quantity: number;
}

export async function getPurchaseReport(startDate: string, endDate: string): Promise<PurchaseReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.id, p.date, s.name as supplier_name, p.invoice_number, p.net_amount, p.tax_amount, p.status,
     (SELECT GROUP_CONCAT(pr.name || ' x' || pi.quantity || ' (₹' || CAST(pi.purchase_rate AS TEXT) || ' / ' || COALESCE(pi.unit, pr.unit) || ')', char(10)) 
      FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id WHERE pi.purchase_id = p.id) as products_bought,
     (SELECT SUM(pi.quantity) FROM purchase_items pi WHERE pi.purchase_id = p.id) as total_quantity
     FROM purchases p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id 
     WHERE date(p.date) BETWEEN date($1) AND date($2)
     ORDER BY p.date DESC`,
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

export interface TransactionDetail {
  id: number;
  date: string;
  invoice_number: string | null;
  entity_id: number;
  entity_name: string;
  items: {
    product_id: number;
    name: string;
    model: string | null;
    quantity: number;
    unit_price: number;
    unit: string;
  }[];
}

export async function getSaleDetails(query: string): Promise<TransactionDetail[]> {
  const db = await getDb();
  const sales = await db.select<{id: number, date: string, invoice_number: string, customer_id: number, customer_name: string}[]>(
    `SELECT s.id, s.date, s.invoice_number, s.customer_id, c.name as customer_name
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.invoice_number LIKE $1 OR c.name LIKE $1 OR s.date LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const s of sales) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string}[]>(
      `SELECT si.product_id, p.name, p.model, si.quantity, si.unit_price, si.unit
       FROM sale_items si JOIN products p ON si.product_id = p.id
       WHERE si.sale_id = $1`,
      [s.id]
    );
    results.push({
      id: s.id,
      date: s.date,
      invoice_number: s.invoice_number,
      entity_id: s.customer_id,
      entity_name: s.customer_name || 'Walk-in Customer',
      items
    });
  }
  return results;
}

export async function getPurchaseDetails(query: string): Promise<TransactionDetail[]> {
  const db = await getDb();
  const purchases = await db.select<{id: number, date: string, invoice_number: string, supplier_id: number, supplier_name: string}[]>(
    `SELECT p.id, p.date, p.invoice_number, p.supplier_id, s.name as supplier_name
     FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.invoice_number LIKE $1 OR s.name LIKE $1 OR p.date LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const p of purchases) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string}[]>(
      `SELECT pi.product_id, pr.name, pr.model, pi.quantity, pi.purchase_rate as unit_price, pi.unit
       FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id
       WHERE pi.purchase_id = $1`,
      [p.id]
    );
    results.push({
      id: p.id,
      date: p.date,
      invoice_number: p.invoice_number,
      entity_id: p.supplier_id,
      entity_name: p.supplier_name,
      items
    });
  }
  return results;
}

export async function isAppActivated(): Promise<boolean> {
  try {
    const db = await getDb();
    const result = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['activation_expiry']);
    if (result.length > 0) {
      const expiryDate = new Date(result[0].value);
      return expiryDate > new Date();
    }
    
    // Fallback for previous 'is_activated' key before 1-year expiry feature was added
    const legacyResult = await db.select<{value: string}[]>('SELECT value FROM settings WHERE key = $1', ['is_activated']);
    return legacyResult.length > 0 && legacyResult[0].value === 'true';
  } catch (e) {
    return false;
  }
}

export async function activateApp(): Promise<void> {
  const db = await getDb();
  const expiry = new Date();
  expiry.setFullYear(expiry.getFullYear() + 1);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['activation_expiry', expiry.toISOString()]);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['is_activated', 'false']); // Remove legacy permanent activation
}
