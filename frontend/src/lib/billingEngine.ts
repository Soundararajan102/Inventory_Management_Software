// Centralized Authoritative Billing & Calculation Engine
// Single Source of Truth for Sales, Purchases, Quotations, View Mode, and Receipts

export interface LineItemCalculationInput {
  id?: number | string;
  unit_price: number;
  quantity: number;
  discount_percent?: number; // 0 to 100
  discount_amount?: number; // fallback in ₹ if percent was missing
  cgst_percentage?: number;
  sgst_percentage?: number;
  gst_percentage?: number;
}

export interface CalculatedLineItem {
  id?: number | string;
  unit_price: number;
  quantity: number;
  line_gross: number;
  discount_percent: number;
  discount_amount: number;
  line_net_before_bill_disc: number;
  line_net_after_bill_disc: number;
  taxable_amount: number;
  cgst_percentage: number;
  sgst_percentage: number;
  gst_percentage: number;
  cgst_amount: number;
  sgst_amount: number;
  tax_amount: number;
  line_net_total: number;
}

export interface BillCalculationResult {
  subtotal: number; // Gross amount before any discounts
  total_item_discounts: number; // Total ₹ amount of line item discounts
  net_after_item_discounts: number;
  bill_discount_percent: number;
  bill_discount_amount: number; // Overall bill discount in ₹
  taxable_amount: number; // Total taxable value
  tax_amount: number; // Total GST amount
  exact_grand_total: number; // Taxable + Tax (unrounded)
  grand_total: number; // Math.round(exact_grand_total)
  round_off: number; // grand_total - exact_grand_total
  cgst_breakdown: Record<number, number>;
  sgst_breakdown: Record<number, number>;
  items: CalculatedLineItem[];
}

/**
 * Calculates complete, accurate billing totals.
 * Handles both 'exclusive' (tax added on top) and 'inclusive' (tax extracted from discounted price).
 */
export function calculateBillTotals(
  rawItems: LineItemCalculationInput[],
  billDiscountPercent: number = 0,
  taxMethod: 'exclusive' | 'inclusive' = 'exclusive',
  enableGST: boolean = true
): BillCalculationResult {
  // Step 1: Clean line items & calculate gross + item-level discounts
  let subtotal = 0;
  let totalItemDiscounts = 0;
  let netAfterItemDiscounts = 0;

  const preppedItems = (rawItems || []).map(item => {
    const unitPrice = Math.max(0, Number(item.unit_price) || 0);
    const qty = Math.max(0, Number(item.quantity) || 0);
    const lineGross = unitPrice * qty;

    let discPct = Number(item.discount_percent || 0);
    if ((discPct <= 0 || discPct > 100) && Number(item.discount_amount || 0) > 0 && lineGross > 0) {
      discPct = Math.min(100, Math.max(0, Number(((Number(item.discount_amount) / lineGross) * 100).toFixed(2))));
    } else {
      discPct = Math.min(100, Math.max(0, discPct));
    }

    const lineDiscAmt = (lineGross * discPct) / 100;
    const lineNet = Math.max(0, lineGross - lineDiscAmt);

    subtotal += lineGross;
    totalItemDiscounts += lineDiscAmt;
    netAfterItemDiscounts += lineNet;

    let cgstPct = enableGST ? Math.max(0, Number(item.cgst_percentage) || 0) : 0;
    let sgstPct = enableGST ? Math.max(0, Number(item.sgst_percentage) || 0) : 0;
    const totalGstPct = enableGST ? ((item.gst_percentage !== undefined ? Number(item.gst_percentage) : (cgstPct + sgstPct)) || 0) : 0;
    if (enableGST && totalGstPct > 0 && cgstPct === 0 && sgstPct === 0) {
      cgstPct = totalGstPct / 2;
      sgstPct = totalGstPct / 2;
    }

    return {
      id: item.id,
      unit_price: unitPrice,
      quantity: qty,
      line_gross: lineGross,
      discount_percent: discPct,
      discount_amount: lineDiscAmt,
      line_net_before_bill_disc: lineNet,
      cgst_percentage: cgstPct,
      sgst_percentage: sgstPct,
      gst_percentage: totalGstPct
    };
  });

  // Step 2: Bill-level discount (percentage 0 - 100)
  const cleanBillDiscPct = Math.min(100, Math.max(0, Number(billDiscountPercent) || 0));
  const billDiscountAmount = (netAfterItemDiscounts * cleanBillDiscPct) / 100;
  const billDiscountRatio = netAfterItemDiscounts > 0 ? Math.min(1, billDiscountAmount / netAfterItemDiscounts) : 0;

  // Step 3: Calculate Line-by-Line Taxable and Tax Amounts
  let totalTaxableValue = 0;
  let totalTaxSum = 0;
  const cgstBreakdown: Record<number, number> = {};
  const sgstBreakdown: Record<number, number> = {};

  const finalItems: CalculatedLineItem[] = preppedItems.map(item => {
    const netAfterBillDisc = item.line_net_before_bill_disc * (1 - billDiscountRatio);

    let taxableValue = netAfterBillDisc;
    if (enableGST && taxMethod === 'inclusive') {
      const gstRate = item.cgst_percentage + item.sgst_percentage;
      taxableValue = gstRate > 0 ? netAfterBillDisc / (1 + (gstRate / 100)) : netAfterBillDisc;
    }

    let cgstAmt = 0;
    let sgstAmt = 0;
    if (enableGST) {
      if (item.cgst_percentage > 0) {
        cgstAmt = taxableValue * (item.cgst_percentage / 100);
        cgstBreakdown[item.cgst_percentage] = (cgstBreakdown[item.cgst_percentage] || 0) + cgstAmt;
      }
      if (item.sgst_percentage > 0) {
        sgstAmt = taxableValue * (item.sgst_percentage / 100);
        sgstBreakdown[item.sgst_percentage] = (sgstBreakdown[item.sgst_percentage] || 0) + sgstAmt;
      }
    }

    const lineTax = cgstAmt + sgstAmt;
    const lineTotal = taxMethod === 'inclusive' ? netAfterBillDisc : (taxableValue + lineTax);

    totalTaxableValue += taxableValue;
    totalTaxSum += lineTax;

    return {
      ...item,
      line_net_after_bill_disc: netAfterBillDisc,
      taxable_amount: taxableValue,
      cgst_amount: cgstAmt,
      sgst_amount: sgstAmt,
      tax_amount: lineTax,
      line_net_total: lineTotal
    };
  });

  const exactGrandTotal = taxMethod === 'inclusive'
    ? Math.max(0, netAfterItemDiscounts - billDiscountAmount)
    : Math.max(0, totalTaxableValue + totalTaxSum);

  const grandTotal = Math.round(exactGrandTotal);
  const roundOff = Number((grandTotal - exactGrandTotal).toFixed(2));

  return {
    subtotal,
    total_item_discounts: totalItemDiscounts,
    net_after_item_discounts: netAfterItemDiscounts,
    bill_discount_percent: cleanBillDiscPct,
    bill_discount_amount: billDiscountAmount,
    taxable_amount: totalTaxableValue,
    tax_amount: totalTaxSum,
    exact_grand_total: exactGrandTotal,
    grand_total: grandTotal,
    round_off: roundOff,
    cgst_breakdown: cgstBreakdown,
    sgst_breakdown: sgstBreakdown,
    items: finalItems
  };
}
