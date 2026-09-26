import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;

// Always loads the local, offline SQLite file (inventory.db)
export async function getDb() {
  if (!dbInstance) {
    dbInstance = await Database.load('sqlite:inventory.db');
    
    // Force create tables if migrations failed
    try {
      await dbInstance.execute(`
        CREATE TABLE IF NOT EXISTS item_groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );
      `);
      await dbInstance.execute(`
        CREATE TABLE IF NOT EXISTS brands (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE
        );
      `);
      // Ignore errors for ADD COLUMN as they might already exist
      try { await dbInstance.execute('ALTER TABLE products ADD COLUMN group_id INTEGER'); } catch (e) {}
      try { await dbInstance.execute('ALTER TABLE products ADD COLUMN brand_id INTEGER'); } catch (e) {}
    } catch (e) {
      console.error("Error creating tables manually:", e);
    }
  }
  return dbInstance;
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

export async function getSellableProducts(): Promise<Product[]> {
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

export async function getItemGroups(): Promise<ItemGroup[]> {
  const db = await getDb();
  return await db.select<ItemGroup[]>('SELECT * FROM item_groups ORDER BY name ASC');
}

export async function addGroup(name: string) {
  const db = await getDb();
  await db.execute('INSERT INTO item_groups (name) VALUES ($1)', [name]);
}

export async function deleteGroup(id: number) {
  const db = await getDb();
  await db.execute('DELETE FROM item_groups WHERE id = $1', [id]);
}

export async function getBrands(): Promise<Brand[]> {
  const db = await getDb();
  return await db.select<Brand[]>('SELECT * FROM brands ORDER BY name ASC');
}

export async function addBrand(name: string) {
  const db = await getDb();
  await db.execute('INSERT INTO brands (name) VALUES ($1)', [name]);
}

export async function deleteBrand(id: number) {
  const db = await getDb();
  await db.execute('DELETE FROM brands WHERE id = $1', [id]);
}

export interface ProductBaseData {
  group_id: number | null;
  brand_id: number | null;
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
  cgst_percentage: number;
  sgst_percentage: number;
}

// Removed ProductVariantData as variants are no longer needed

export async function addProduct(
  name: string, 
  baseData: ProductBaseData
) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO products 
      (name, group_id, brand_id, barcode, model, hsn_code, purchase_price, selling_price, mrp, unit, min_stock, stock_quantity, is_group, parent_id, gst_percentage, cgst_percentage, sgst_percentage) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, NULL, $13, $14, $15)`,
    [name, baseData.group_id, baseData.brand_id, baseData.barcode, baseData.model, baseData.hsn_code, baseData.purchase_price, baseData.selling_price, baseData.mrp, baseData.unit, baseData.min_stock, baseData.stock, baseData.gst_percentage, baseData.cgst_percentage, baseData.sgst_percentage]
  );
}

export async function updateProduct(
  id: number,
  name: string, 
  group_id: number | null,
  brand_id: number | null,
  barcode: string, 
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
  
  let customerSnapshot = null;
  if (customerId !== null) {
    const custRes = await db.select<any[]>('SELECT * FROM customers WHERE id = $1', [customerId]);
    if (custRes.length > 0) customerSnapshot = JSON.stringify(custRes[0]);
  }

  const saleResult = await db.execute(
    `INSERT INTO sales (customer_id, total_amount, tax_amount, discount, net_amount, paid_amount, status, payment_method, customer_snapshot) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [customerId, totalAmount, taxAmount, discountAmount, netAmount, paidAmount, status, paymentMethod, customerSnapshot]
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
  
  return invoiceNumber;
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

  let supplierSnapshot = null;
  const suppRes = await db.select<any[]>('SELECT * FROM suppliers WHERE id = $1', [supplierId]);
  if (suppRes.length > 0) supplierSnapshot = JSON.stringify(suppRes[0]);

  const purchaseResult = await db.execute(
    `INSERT INTO purchases (supplier_id, invoice_number, total_amount, tax_amount, discount, net_amount, paid_amount, status, supplier_snapshot) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [supplierId, invoiceNo, totalAmount, taxAmount, discount, netAmount, paidAmount, status, supplierSnapshot]
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
  const products = await db.select<{stock_quantity: number, purchase_price: number, selling_price: number}[]>('SELECT stock_quantity, purchase_price, selling_price FROM products WHERE is_group = 0');
  const totalProducts = products.length;
  const threshold = parseInt(localStorage.getItem('lowStockThreshold') || '10', 10);
  const lowStockItems = products.filter(p => p.stock_quantity < threshold).length;
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
  
  // Gross Profit = True Revenue (Net - Tax) - COGS
  const profitData = await db.select<{profit: number}[]>(`
    SELECT (s.net_amount - s.tax_amount - 
      COALESCE((SELECT SUM(p.purchase_price * si.quantity) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id), 0)
    ) as profit 
    FROM sales s
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
  discount: number;
  payment_method: string;
  status: string | null;
  products_bought: string;
  total_quantity: number;
}

export async function getSalesReport(startDate: string, endDate: string): Promise<SalesReportItem[]> {
  const db = await getDb();
  return await db.select(
    `SELECT s.id, s.date, s.invoice_number, c.name as customer_name, s.net_amount, s.tax_amount, s.discount, s.payment_method, s.status,
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

export async function getDayBookProfitAndExpenses(startDate: string, endDate: string) {
  const db = await getDb();
  
  const profitData = await db.select<{profit: number}[]>(`
    SELECT (s.net_amount - s.tax_amount - 
      COALESCE((SELECT SUM(p.purchase_price * si.quantity) FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = s.id), 0)
    ) as profit 
    FROM sales s
    WHERE date(s.date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  
  const grossProfit = profitData.reduce((sum, row) => sum + (row.profit || 0), 0);

  const expensesData = await db.select<{amount: number}[]>(`
    SELECT amount FROM expenses 
    WHERE date(date) BETWEEN date($1) AND date($2)
  `, [startDate, endDate]);
  
  const expenses = expensesData.reduce((sum, row) => sum + (row.amount || 0), 0);

  return { grossProfit, expenses, netProfit: grossProfit - expenses };
}

export interface TransactionDetail {
  id: number;
  date: string;
  invoice_number: string | null;
  entity_id: number;
  entity_name: string;
  customer_snapshot?: string | null;
  supplier_snapshot?: string | null;
  items: {
    product_id: number;
    name: string;
    model: string | null;
    quantity: number;
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
  const sales = await db.select<{id: number, date: string, invoice_number: string, customer_id: number, customer_name: string, customer_snapshot: string | null}[]>(
    `SELECT s.id, s.date, s.invoice_number, s.customer_id, s.customer_snapshot, c.name as customer_name
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.invoice_number LIKE $1 OR c.name LIKE $1 OR s.date LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const s of sales) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string, hsn_code: string | null, cgst_percentage: number, sgst_percentage: number, gst_percentage: number, product_snapshot: string | null}[]>(
      `SELECT si.product_id, p.name, p.model, si.quantity, si.unit_price, si.unit, p.hsn_code, p.cgst_percentage, p.sgst_percentage, p.gst_percentage, si.product_snapshot
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
      items: mappedItems
    });
  }
  return results;
}

export async function getPurchaseDetails(query: string): Promise<TransactionDetail[]> {
  const db = await getDb();
  const purchases = await db.select<{id: number, date: string, invoice_number: string, supplier_id: number, supplier_name: string, supplier_snapshot: string | null}[]>(
    `SELECT p.id, p.date, p.invoice_number, p.supplier_id, p.supplier_snapshot, s.name as supplier_name
     FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.invoice_number LIKE $1 OR s.name LIKE $1 OR p.date LIKE $1`,
    [`%${query}%`]
  );
  
  const results: TransactionDetail[] = [];
  for (const p of purchases) {
    const items = await db.select<{product_id: number, name: string, model: string, quantity: number, unit_price: number, unit: string, hsn_code: string | null, cgst_percentage: number, sgst_percentage: number, gst_percentage: number, product_snapshot: string | null}[]>(
      `SELECT pi.product_id, pr.name, pr.model, pi.quantity, pi.purchase_rate as unit_price, pi.unit, pr.hsn_code, pr.cgst_percentage, pr.sgst_percentage, pr.gst_percentage, pi.product_snapshot
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
      items: mappedItems
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
  expiry.setMonth(expiry.getMonth() + 6);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['activation_expiry', expiry.toISOString()]);
  await db.execute('INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)', ['is_activated', 'false']); // Remove legacy permanent activation
}

export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  const tables = [
    'products', 'item_groups', 'categories', 'brands', 'suppliers', 'customers', 
    'sales', 'sale_items', 'purchases', 'purchase_items', 
    'payments', 'expenses', 'returns', 'settings'
  ];
  for (const table of tables) {
    try {
      await db.execute(`DELETE FROM ${table}`);
    } catch (e) {
      console.warn(`Could not delete from ${table}:`, e);
    }
    try {
      await db.execute(`DELETE FROM sqlite_sequence WHERE name='${table}'`);
    } catch (e) {
      // sqlite_sequence might not have an entry for the table yet, ignore
    }
  }
  try {
    await db.execute("DELETE FROM users WHERE role != 'admin'");
  } catch (e) {
    console.warn('Could not delete users:', e);
  }
  
  // Also clear localStorage to reset all settings to defaults
  localStorage.clear();
}
