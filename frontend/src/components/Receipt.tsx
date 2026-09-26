import React from 'react';
import { createPortal } from 'react-dom';
import type { CartItem } from '../lib/db';

export interface ReceiptData {
  invoiceNumber: string;
  date: string;
  customerName: string;
  customerDetails?: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
  };
  items: CartItem[];
  subtotal: number;
  taxAmount: number;
  taxBreakdown?: { cgst: Record<number, number>, sgst: Record<number, number> };
  taxMethod?: 'exclusive' | 'inclusive';
  discount: number;
  netAmount: number;
  paidAmount: number;
}

interface ReceiptProps {
  data: ReceiptData | null;
}

function numberToWords(num: number): string {
  if (num === 0) return 'Zero';
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  const convert = (n: number): string => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : ' ');
    if (n < 1000) return a[Math.floor(n / 100)] + 'Hundred ' + (n % 100 !== 0 ? 'And ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + 'Thousand ' + (n % 1000 !== 0 ? convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + 'Lakh ' + (n % 100000 !== 0 ? convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + 'Crore ' + (n % 10000000 !== 0 ? convert(n % 10000000) : '');
  };

  const str = String(num);
  const parts = str.split('.');
  const rupees = parseInt(parts[0], 10);
  const paise = parts.length > 1 ? parseInt(parts[1].padEnd(2, '0').slice(0, 2), 10) : 0;
  
  let res = 'Indian Rupee ' + convert(rupees).trim();
  if (paise > 0) {
    res += ' And ' + convert(paise).trim() + ' paisa';
  }
  return res + ' Only';
}

export const Receipt: React.FC<ReceiptProps> = ({ data }) => {
  if (!data) return null;

  let originalPriceBasis = 0;
  data.items.forEach(item => {
    originalPriceBasis += item.selling_price * item.cart_qty;
  });

  const discountRatio = originalPriceBasis > 0 ? (data.discount / originalPriceBasis) : 0;
  
  const taxBreakdown = { cgst: {} as Record<number, number>, sgst: {} as Record<number, number> };
  let totalQty = 0;
  let totalTaxableValue = 0;
  
  const mappedItems = data.items.map(item => {
    totalQty += item.cart_qty;
    const originalItemPrice = item.selling_price * item.cart_qty;
    const discountedItemPrice = originalItemPrice * (1 - discountRatio);
    
    let taxableValue = discountedItemPrice;
    if (data.taxMethod === 'inclusive') {
      const gstPercent = (item.cgst_percentage || 0) + (item.sgst_percentage || 0);
      taxableValue = discountedItemPrice / (1 + (gstPercent / 100));
    }
    totalTaxableValue += taxableValue;

    const cgstPercent = item.cgst_percentage || 0;
    const sgstPercent = item.sgst_percentage || 0;
    
    if (cgstPercent > 0) {
      taxBreakdown.cgst[cgstPercent] = (taxBreakdown.cgst[cgstPercent] || 0) + (taxableValue * (cgstPercent / 100));
    }
    if (sgstPercent > 0) {
      taxBreakdown.sgst[sgstPercent] = (taxBreakdown.sgst[sgstPercent] || 0) + (taxableValue * (sgstPercent / 100));
    }
    
    return {
      ...item,
      taxableValue
    };
  });

  let totalCgst = 0;
  let totalSgst = 0;
  Object.values(taxBreakdown.cgst).forEach(v => totalCgst += v);
  Object.values(taxBreakdown.sgst).forEach(v => totalSgst += v);
  
  const mathTotal = totalTaxableValue + totalCgst + totalSgst;
  const roundOff = data.netAmount - mathTotal;

  const shopName = localStorage.getItem('shopName') || 'Electro Hub';
  const shopAddress = localStorage.getItem('shopAddress') || '123 Market Street, City';
  const shopPhone = localStorage.getItem('shopPhone') || '+91 9876543210';
  const shopGSTIN = localStorage.getItem('shopGSTIN') || '27XXXXX1234X1X1';

  // HSN summary grouping
  const hsnSummary: Record<string, { taxable: number, cgstRate: number, cgstAmount: number, sgstRate: number, sgstAmount: number }> = {};
  mappedItems.forEach(item => {
    const hsn = item.hsn_code || 'Unknown';
    if (!hsnSummary[hsn]) {
      hsnSummary[hsn] = { taxable: 0, cgstRate: item.cgst_percentage || 0, cgstAmount: 0, sgstRate: item.sgst_percentage || 0, sgstAmount: 0 };
    }
    hsnSummary[hsn].taxable += item.taxableValue;
    hsnSummary[hsn].cgstAmount += item.taxableValue * ((item.cgst_percentage || 0) / 100);
    hsnSummary[hsn].sgstAmount += item.taxableValue * ((item.sgst_percentage || 0) / 100);
  });

  const receiptContent = (
    <div id="printable-receipt" className="hidden print:block bg-white text-black font-sans w-full max-w-4xl mx-auto" style={{ boxSizing: 'border-box' }}>
      <style>
        {`
          @page { size: A4; margin: 10mm; }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .tally-table { width: 100%; border-collapse: collapse; }
            .tally-table th, .tally-table td { border: 1px solid #000; padding: 4px; }
            .tally-border { border: 1px solid #000; }
            .tally-border-b { border-bottom: 1px solid #000; }
            .tally-border-r { border-right: 1px solid #000; }
            .tally-border-l { border-left: 1px solid #000; }
            .tally-border-t { border-top: 1px solid #000; }
            .no-border-top { border-top: none !important; }
            .no-border-bottom { border-bottom: none !important; }
            
            /* Tally-specific borders for item rows */
            .item-row td { border-top: none; border-bottom: none; }
          }
        `}
      </style>

      <h1 className="text-center text-xl font-bold mb-1">TAX INVOICE</h1>
      
      <div className="tally-border flex flex-col w-full text-[11px] leading-tight">
        
        {/* Top Section */}
        <div className="flex w-full tally-border-b">
          {/* Left Column */}
          <div className="w-1/2 tally-border-r flex flex-col">
            <div className="p-2 tally-border-b min-h-[100px]">
              <div className="font-bold text-sm">{shopName}</div>
              <div>{shopAddress}</div>
              <div>Mobile no. : {shopPhone}</div>
              <div>GSTIN : {shopGSTIN}</div>
            </div>
            <div className="p-2 min-h-[120px]">
              <div>Billed To</div>
              <div className="font-bold">{data.customerDetails?.name || data.customerName}</div>
              <div>{data.customerDetails?.address}</div>
              {data.customerDetails?.phone && <div>Mobile: {data.customerDetails.phone}</div>}
              {data.customerDetails?.gstin && <div>GSTIN: {data.customerDetails.gstin}</div>}
            </div>
          </div>
          
          {/* Right Column */}
          <div className="w-1/2 flex flex-col">
            <div className="flex tally-border-b">
              <div className="w-1/2 tally-border-r p-2">
                <div>Invoice No.</div>
                <div className="font-bold">{data.invoiceNumber}</div>
              </div>
              <div className="w-1/2 p-2">
                <div>Dated</div>
                <div className="font-bold">{data.date}</div>
              </div>
            </div>
            <div className="flex tally-border-b flex-1">
              <div className="w-1/2 tally-border-r p-2">
                <div>Mode/Terms of Payment</div>
                <div className="font-bold">{data.paidAmount >= data.netAmount ? 'Cash/Paid' : 'Credit'}</div>
              </div>
              <div className="w-1/2 p-2">
                {/* Empty block to fill space */}
              </div>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <table className="tally-table text-[11px]">
          <thead>
            <tr>
              <th className="w-[5%] font-normal">Sr<br/>No.</th>
              <th className="w-[35%] font-normal">Description of Goods/Services</th>
              <th className="w-[10%] font-normal">HSN/SAC</th>
              <th className="w-[10%] font-normal text-right">Quantity</th>
              <th className="w-[10%] font-normal text-right">Rate</th>
              <th className="w-[5%] font-normal">per</th>
              <th className="w-[10%] font-normal text-right">Disc. %</th>
              <th className="w-[15%] font-normal text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {mappedItems.map((item, i) => (
              <tr key={i} className="item-row align-top">
                <td className="text-center pt-2 pb-1">{i + 1}</td>
                <td className="pt-2 pb-1">
                  <div className="font-bold">{item.name}</div>
                  {item.model && !item.name.includes(item.model) && <div>Model : {item.model}</div>}
                </td>
                <td className="text-center pt-2 pb-1">{item.hsn_code}</td>
                <td className="text-right font-bold pt-2 pb-1">{item.cart_qty} <span className="font-normal">{item.unit || 'no'}</span></td>
                <td className="text-right pt-2 pb-1">{item.selling_price.toFixed(2)}</td>
                <td className="text-center pt-2 pb-1">{item.unit || 'no'}</td>
                <td className="text-right pt-2 pb-1">
                  {discountRatio > 0 ? (discountRatio * 100).toFixed(2) + '%' : ''}
                </td>
                <td className="text-right font-bold pt-2 pb-1">{item.taxableValue.toFixed(2)}</td>
              </tr>
            ))}
            
            {/* Filler row to push taxes down and simulate Tally's min-height */}
            <tr className="item-row">
              <td className="h-[40px]"></td>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>

            {/* Taxes */}
            {Object.entries(taxBreakdown.cgst).map(([pct, amt]) => (
               <tr key={'cgst'+pct} className="item-row">
                 <td></td>
                 <td className="text-right font-bold pt-1 pb-1">CGST @ {pct}%</td>
                 <td></td><td></td>
                 <td className="text-right pt-1 pb-1">{pct}</td>
                 <td className="text-center pt-1 pb-1">%</td>
                 <td></td>
                 <td className="text-right font-bold pt-1 pb-1">{amt.toFixed(2)}</td>
               </tr>
            ))}
            {Object.entries(taxBreakdown.sgst).map(([pct, amt]) => (
               <tr key={'sgst'+pct} className="item-row">
                 <td></td>
                 <td className="text-right font-bold pt-1 pb-1">SGST @ {pct}%</td>
                 <td></td><td></td>
                 <td className="text-right pt-1 pb-1">{pct}</td>
                 <td className="text-center pt-1 pb-1">%</td>
                 <td></td>
                 <td className="text-right font-bold pt-1 pb-1">{amt.toFixed(2)}</td>
               </tr>
            ))}
            {Math.abs(roundOff) > 0.001 && (
               <tr className="item-row">
                 <td></td>
                 <td className="text-right font-bold pt-1 pb-1">Round Off</td>
                 <td></td><td></td><td></td><td></td><td></td>
                 <td className="text-right font-bold pt-1 pb-1">{roundOff.toFixed(2)}</td>
               </tr>
            )}
            
            {/* Total Row */}
            <tr>
              <td colSpan={3} className="text-right font-bold">Total</td>
              <td className="text-right font-bold">{totalQty}</td>
              <td colSpan={3}></td>
              <td className="text-right font-bold">{data.netAmount.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* Amount Chargeable in words */}
        <div className="p-2 tally-border-b border-t-0">
          <div>Amount Chargeable (in words)</div>
          <div className="font-bold">{numberToWords(Math.round(data.netAmount))}</div>
        </div>

        {/* HSN Summary */}
        <table className="tally-table text-[11px] border-t-0">
          <thead>
            <tr>
              <th rowSpan={2} className="font-normal w-[20%]">HSN/SAC</th>
              <th rowSpan={2} className="font-normal w-[15%]">Taxable<br/>Value</th>
              <th colSpan={2} className="font-normal w-[25%]">Central Tax</th>
              <th colSpan={2} className="font-normal w-[25%]">State Tax</th>
              <th rowSpan={2} className="font-normal w-[15%]">Total<br/>Tax Amount</th>
            </tr>
            <tr>
              <th className="font-normal">Rate</th>
              <th className="font-normal">Amount</th>
              <th className="font-normal">Rate</th>
              <th className="font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(hsnSummary).map(([hsn, sum]) => (
              <tr key={hsn}>
                <td className="text-center">{hsn}</td>
                <td className="text-right">{sum.taxable.toFixed(2)}</td>
                <td className="text-right">{sum.cgstRate}%</td>
                <td className="text-right">{sum.cgstAmount.toFixed(2)}</td>
                <td className="text-right">{sum.sgstRate}%</td>
                <td className="text-right">{sum.sgstAmount.toFixed(2)}</td>
                <td className="text-right">{(sum.cgstAmount + sum.sgstAmount).toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td className="text-right font-bold">Total</td>
              <td className="text-right font-bold">{totalTaxableValue.toFixed(2)}</td>
              <td></td>
              <td className="text-right font-bold">{totalCgst.toFixed(2)}</td>
              <td></td>
              <td className="text-right font-bold">{totalSgst.toFixed(2)}</td>
              <td className="text-right font-bold">{(totalCgst + totalSgst).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="p-2 tally-border-b border-t-0">
          <div>Tax Amount (in words)</div>
          <div className="font-bold">{numberToWords(totalCgst + totalSgst)}</div>
        </div>

        <div className="p-2 border-t-0 flex">
          <div className="w-1/2">
            <div>Company's GST No. : <span className="font-bold">{shopGSTIN}</span></div>
            <div className="mt-4">
              <div className="underline mb-1">Declaration</div>
              <div>We declare that this invoice shows the actual price of the goods</div>
              <div>described and that all particulars are true and correct</div>
            </div>
          </div>
          <div className="w-1/2 tally-border-l tally-border-t p-2 flex flex-col justify-between -m-2 ml-2">
            <div className="text-right font-bold">for {shopName}</div>
            <div className="text-right mt-16">Authorised Signatory</div>
          </div>
        </div>
      </div>
      
      <div className="text-center mt-2 text-xs">
        This is a Computer Generated Invoice
      </div>
    </div>
  );

  return createPortal(receiptContent, document.body);
};
