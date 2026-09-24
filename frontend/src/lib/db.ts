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
  barcode: string;
  model: string | null;
  hsn_code: string | null;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  unit: string;
  min_stock: number;
  stock_quantity: number;
}

export async function getProducts(): Promise<Product[]> {
  const db = await getDb();
  return await db.select('SELECT * FROM products ORDER BY id DESC');
}

export async function addProduct(
  name: string, 
  barcode: string, 
  model: string,
  hsn_code: string,
  purchase_price: number,
  selling_price: number,
  mrp: number,
  unit: string,
  min_stock: number,
  stock: number
) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO products 
      (name, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock_quantity) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [name, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock]
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
  
  for (const item of cart) {
    const itemTax = (item.selling_price * 0.18) * item.cart_qty; // 18% GST example
    
    // Insert into sale_items
    await db.execute(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, tax) 
       VALUES ($1, $2, $3, $4, $5)`,
      [saleId, item.id, item.cart_qty, item.selling_price, itemTax]
    );
    
    // Decrement stock in products table
    await db.execute(
      `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`,
      [item.cart_qty, item.id]
    );
  }

  // Increment customer balance if not fully paid
  const pendingAmount = netAmount - paidAmount;
  if (pendingAmount > 0 && customerId !== null) {
    await db.execute(
      `UPDATE customers SET balance = balance + $1 WHERE id = $2`,
      [pendingAmount, customerId]
    );
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
    const itemTax = (item.purchase_price * 0.18) * item.purchase_qty; 
    
    // Insert into purchase_items
    await db.execute(
      `INSERT INTO purchase_items (purchase_id, product_id, quantity, purchase_rate, tax) 
       VALUES ($1, $2, $3, $4, $5)`,
      [purchaseId, item.id, item.purchase_qty, item.purchase_price, itemTax]
    );
    
    // Increment stock in products table
    await db.execute(
      `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`,
      [item.purchase_qty, item.id]
    );
  }

  // Increment supplier balance if not fully paid
  const pendingAmount = netAmount - paidAmount;
  if (pendingAmount > 0) {
    await db.execute(
      `UPDATE suppliers SET balance = balance + $1 WHERE id = $2`,
      [pendingAmount, supplierId]
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
  } else {
    // We pay supplier -> our balance owed goes down
    await db.execute(
      `UPDATE suppliers SET balance = balance - $1 WHERE id = $2`,
      [amount, entityId]
    );
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
  productId: number,
  quantity: number,
  amount: number,
  reason: string
) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO returns (entity_type, entity_id, product_id, quantity, amount, reason) 
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [entityType, entityId, productId, quantity, amount, reason]
  );

  if (entityType === 'customer') {
    // Customer returned item to us. We get stock back, we owe customer money (balance drops into negative if they paid us, or their pending balance reduces).
    await db.execute(`UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2`, [quantity, productId]);
    await db.execute(`UPDATE customers SET balance = balance - $1 WHERE id = $2`, [amount, entityId]);
  } else {
    // We returned item to supplier. We lose stock, supplier owes us money (balance drops).
    await db.execute(`UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2`, [quantity, productId]);
    await db.execute(`UPDATE suppliers SET balance = balance - $1 WHERE id = $2`, [amount, entityId]);
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
  const products = await db.select<{stock_quantity: number, purchase_price: number}[]>('SELECT stock_quantity, purchase_price FROM products');
  const totalProducts = products.length;
  const lowStockItems = products.filter(p => p.stock_quantity < 10).length;
  const totalInventoryValue = products.reduce((sum, p) => sum + (p.stock_quantity * p.purchase_price), 0);
  
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
  const totalSales = sales.reduce((sum, s) => sum + s.net_amount, 0);
  
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
  customer_name: string;
  net_amount: number;
  tax_amount: number;
  payment_method: string;
}

export async function getSalesReport(startDate: string, endDate: string): Promise<SalesReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT s.id, s.date, c.name as customer_name, s.net_amount, s.tax_amount, s.payment_method 
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
}

export async function getPurchaseReport(startDate: string, endDate: string): Promise<PurchaseReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT p.id, p.date, s.name as supplier_name, p.invoice_number, p.net_amount, p.tax_amount, p.status 
     FROM purchases p 
     LEFT JOIN suppliers s ON p.supplier_id = s.id 
     WHERE date(p.date) BETWEEN date($1) AND date($2)
     ORDER BY p.date DESC`,
    [startDate, endDate]
  );
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
