import React from 'react';
import { createPortal } from 'react-dom';
import type { CartItem, DispatchDetails } from '../lib/db';

export interface ReceiptData {
  invoiceNumber: string;
  isQuotation?: boolean;
  quotationNumber?: string;
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
  paymentMethod?: string;
  chequeNo?: string;
  bankName?: string;
  chequeDate?: string;
  sourceLocationName?: string;
  dispatchDetails?: DispatchDetails;
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
  const shopGSTIN = (localStorage.getItem('shopGSTIN') || '27XXXXX1234X1X1').toUpperCase();

  const disp = data.dispatchDetails || {};
  const hasDispatch = Boolean(
    disp.ewayBillNo || disp.dispatchDocNo || disp.motorVehicleNo || 
    disp.dispatchedThrough || disp.destination || disp.carrierName || disp.billOfLadingNo || disp.termsOfDelivery
  );

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
          @page { size: A4 portrait; margin: 5mm 6mm; }
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #printable-receipt {
              display: block !important;
              width: 100% !important;
              max-width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
            .tally-table { width: 100%; border-collapse: collapse; }
            .tally-table th, .tally-table td { 
              border: 1px solid #000; 
              padding: 2px 4px !important; 
              line-height: 1.2 !important; 
            }
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

      <h1 className="text-center text-lg font-bold mb-1">
        {data.isQuotation ? 'ESTIMATE / QUOTATION' : 'TAX INVOICE'}
      </h1>
      
      <div className="tally-border flex flex-col w-full text-[10.5px] leading-tight">
        
        {/* Top Section */}
        <div className="flex w-full tally-border-b">
          {/* Left Column */}
          <div className="w-1/2 tally-border-r flex flex-col">
            <div className="p-1.5 tally-border-b">
              <div className="font-bold text-sm">{shopName}</div>
              <div>{shopAddress}</div>
              <div>Mobile no. : {shopPhone}</div>
              <div>GSTIN : {shopGSTIN}</div>
            </div>
            <div className="p-1.5">
              <div>{data.isQuotation ? 'Quotation For' : 'Billed To'}</div>
              <div className="font-bold">{data.customerDetails?.name || data.customerName}</div>
              <div>{data.customerDetails?.address}</div>
              {data.customerDetails?.phone && <div>Mobile: {data.customerDetails.phone}</div>}
              {data.customerDetails?.gstin && <div>GSTIN: {data.customerDetails.gstin.toUpperCase()}</div>}
            </div>
          </div>
          
          {/* Right Column */}
          <div className="w-1/2 flex flex-col text-[10px]">
            {hasDispatch ? (
              <>
                {/* Row 1: Invoice No | e-Way Bill No. | Dated */}
                <div className="flex tally-border-b">
                  <div className="w-1/3 tally-border-r p-1">
                    <div className="text-[9px] text-gray-700">Invoice No.</div>
                    <div className="font-bold text-[10.5px] truncate min-h-[14px]">{data.isQuotation ? (data.quotationNumber || data.invoiceNumber) : data.invoiceNumber}</div>
                  </div>
                  <div className="w-1/3 tally-border-r p-1">
                    <div className="text-[9px] text-gray-700">e-Way Bill No.</div>
                    <div className="font-bold text-[10.5px] truncate min-h-[14px]">{disp.ewayBillNo || ''}</div>
                  </div>
                  <div className="w-1/3 p-1">
                    <div className="text-[9px] text-gray-700">Dated</div>
                    <div className="font-bold text-[10.5px] truncate min-h-[14px]">{data.date}</div>
                  </div>
                </div>

                {/* Row 2: Delivery Note / Dispatch Doc | Mode/Terms of Payment */}
                <div className="flex tally-border-b">
                  <div className="w-1/2 tally-border-r p-1">
                    <div className="text-[9px] text-gray-700">Delivery Note / Dispatch Doc</div>
                    <div className="font-bold truncate min-h-[14px]">{disp.dispatchDocNo || ''}</div>
                  </div>
                  <div className="w-1/2 p-1">
                    <div className="text-[9px] text-gray-700">Mode/Terms of Payment</div>
                    <div className="font-bold truncate min-h-[14px]">{data.isQuotation ? 'Valid for 30 Days' : (data.paidAmount >= data.netAmount ? (data.paymentMethod || 'Cash/Paid') : 'Credit')}</div>
                  </div>
                </div>

                {/* Row 3: Dispatched through | Destination */}
                <div className="flex tally-border-b">
                  <div className="w-1/2 tally-border-r p-1">
                    <div className="text-[9px] text-gray-700">Dispatched through</div>
                    <div className="font-bold truncate min-h-[14px]">{disp.dispatchedThrough || disp.carrierName || ''}</div>
                  </div>
                  <div className="w-1/2 p-1">
                    <div className="text-[9px] text-gray-700">Destination</div>
                    <div className="font-bold truncate min-h-[14px]">{disp.destination || ''}</div>
                  </div>
                </div>

                {/* Row 4: Bill of Lading/LR-RR No. | Motor Vehicle No. */}
                <div className="flex tally-border-b flex-1">
                  <div className="w-1/2 tally-border-r p-1">
                    <div className="text-[9px] text-gray-700">Bill of Lading / LR-RR No.</div>
                    <div className="font-bold truncate min-h-[14px]">{disp.billOfLadingNo || ''}</div>
                  </div>
                  <div className="w-1/2 p-1">
                    <div className="text-[9px] text-gray-700">Motor Vehicle No.</div>
                    <div className="font-bold text-[10.5px] truncate min-h-[14px]">{disp.motorVehicleNo || ''}</div>
                  </div>
                </div>

                {/* Row 5: Terms of Delivery */}
                {disp.termsOfDelivery && (
                  <div className="p-1">
                    <span className="text-[9px] text-gray-700">Terms of Delivery: </span>
                    <span className="font-semibold">{disp.termsOfDelivery}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex tally-border-b">
                  <div className="w-1/2 tally-border-r p-1.5">
                    <div>{data.isQuotation ? 'Quotation No.' : 'Invoice No.'}</div>
                    <div className="font-bold">{data.isQuotation ? (data.quotationNumber || data.invoiceNumber) : data.invoiceNumber}</div>
                  </div>
                  <div className="w-1/2 p-1.5">
                    <div>Dated</div>
                    <div className="font-bold">{data.date}</div>
                  </div>
                </div>
                <div className="flex tally-border-b flex-1">
                  <div className="w-1/2 tally-border-r p-1.5">
                    <div>{data.isQuotation ? 'Validity' : 'Mode/Terms of Payment'}</div>
                    <div className="font-bold">{data.isQuotation ? 'Valid for 30 Days' : (data.paidAmount >= data.netAmount ? (data.paymentMethod || 'Cash/Paid') : 'Credit')}</div>
                  </div>
                  <div className="w-1/2 p-1.5">
                    {data.sourceLocationName && data.sourceLocationName !== 'Main Shop' ? (
                      <>
                        <div>Dispatched From</div>
                        <div className="font-bold">{data.sourceLocationName}</div>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Items Table */}
        <table className="tally-table text-[10.5px]">
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
                <td className="text-center py-0.5">{i + 1}</td>
                <td className="py-0.5">
                  <div className="font-bold">{item.name}</div>
                  {item.model && !item.name.includes(item.model) && <div className="text-[9.5px]">Model : {item.model}</div>}
                </td>
                <td className="text-center py-0.5">{item.hsn_code}</td>
                <td className="text-right font-bold py-0.5">{item.cart_qty} <span className="font-normal">{item.unit || 'no'}</span></td>
                <td className="text-right py-0.5">{item.selling_price.toFixed(2)}</td>
                <td className="text-center py-0.5">{item.unit || 'no'}</td>
                <td className="text-right py-0.5">
                  {discountRatio > 0 ? (discountRatio * 100).toFixed(2) + '%' : ''}
                </td>
                <td className="text-right font-bold py-0.5">{item.taxableValue.toFixed(2)}</td>
              </tr>
            ))}
            
            {/* Dynamic minimal filler only for small bills */}
            {mappedItems.length < 3 && (
              <tr className="item-row">
                <td style={{ height: `${(3 - mappedItems.length) * 20}px` }}></td>
                <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>
            )}

            {/* Total Row */}
            <tr className="font-bold">
              <td colSpan={3} className="text-right py-1">Total</td>
              <td className="text-right py-1">{totalQty}</td>
              <td colSpan={3} className="text-right py-1 font-semibold text-gray-700">Taxable Subtotal</td>
              <td className="text-right py-1">{totalTaxableValue.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        {/* Bill Summary Block: Words & Payment on Left, Tax & Grand Total on Right */}
        <div className="flex w-full tally-border-b border-t-0 text-[10.5px]">
          {/* Left Column: Words and Payment Details */}
          <div className="w-[55%] tally-border-r p-1.5 flex flex-col justify-between">
            <div>
              <div className="text-gray-600 text-[10px]">Amount Chargeable (in words)</div>
              <div className="font-bold text-[11px] leading-snug">{numberToWords(Math.round(data.netAmount))}</div>
            </div>
            {!data.isQuotation && (
              <div className="mt-2 text-[10px]">
                <div>Mode of Payment: <span className="font-bold">{data.paymentMethod || 'Cash'}</span></div>
                {data.chequeNo && (
                  <div className="font-mono">Chq #{data.chequeNo} {data.bankName ? `(${data.bankName})` : ''}</div>
                )}
                <div>Paid: <span className="font-bold">₹{data.paidAmount.toFixed(2)}</span> | Balance: <span className="font-bold">₹{Math.max(0, data.netAmount - data.paidAmount).toFixed(2)}</span></div>
              </div>
            )}
          </div>

          {/* Right Column: Tax Breakdown & Invoice Total */}
          <div className="w-[45%] p-1.5 flex flex-col justify-between">
            <div className="space-y-0.5">
              <div className="flex justify-between py-0.5">
                <span className="text-gray-700">Taxable Value:</span>
                <span className="font-bold">₹{totalTaxableValue.toFixed(2)}</span>
              </div>
              {Object.entries(taxBreakdown.cgst).map(([pct, amt]) => (
                <div key={'cgst' + pct} className="flex justify-between py-0.5 text-gray-700">
                  <span>Central Tax / CGST ({pct}%):</span>
                  <span>₹{amt.toFixed(2)}</span>
                </div>
              ))}
              {Object.entries(taxBreakdown.sgst).map(([pct, amt]) => (
                <div key={'sgst' + pct} className="flex justify-between py-0.5 text-gray-700">
                  <span>State Tax / SGST ({pct}%):</span>
                  <span>₹{amt.toFixed(2)}</span>
                </div>
              ))}
              {Math.abs(roundOff) > 0.001 && (
                <div className="flex justify-between py-0.5 text-gray-700">
                  <span>Round Off:</span>
                  <span>{roundOff >= 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}</span>
                </div>
              )}
            </div>
            <div className="flex justify-between items-center border-t border-black pt-1 mt-1 font-bold text-[11.5px]">
              <span>Invoice Total:</span>
              <span>₹{data.netAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* HSN Summary */}
        <table className="tally-table text-[10px] border-t-0">
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
                <td className="text-center py-0.5">{hsn}</td>
                <td className="text-right py-0.5">{sum.taxable.toFixed(2)}</td>
                <td className="text-right py-0.5">{sum.cgstRate}%</td>
                <td className="text-right py-0.5">{sum.cgstAmount.toFixed(2)}</td>
                <td className="text-right py-0.5">{sum.sgstRate}%</td>
                <td className="text-right py-0.5">{sum.sgstAmount.toFixed(2)}</td>
                <td className="text-right py-0.5">{(sum.cgstAmount + sum.sgstAmount).toFixed(2)}</td>
              </tr>
            ))}
            <tr>
              <td className="text-right font-bold py-0.5">Total</td>
              <td className="text-right font-bold py-0.5">{totalTaxableValue.toFixed(2)}</td>
              <td></td>
              <td className="text-right font-bold py-0.5">{totalCgst.toFixed(2)}</td>
              <td></td>
              <td className="text-right font-bold py-0.5">{totalSgst.toFixed(2)}</td>
              <td className="text-right font-bold py-0.5">{(totalCgst + totalSgst).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div className="p-1.5 tally-border-b border-t-0 text-[10.5px]">
          <div>Tax Amount (in words)</div>
          <div className="font-bold">{numberToWords(totalCgst + totalSgst)}</div>
        </div>

        <div className="p-1.5 border-t-0 flex text-[10.5px]">
          <div className="w-1/2">
            <div>Company's GST No. : <span className="font-bold">{shopGSTIN}</span></div>
            <div className="mt-1.5">
              <div className="underline mb-0.5 font-semibold">Declaration</div>
              {data.isQuotation ? (
                <div>We declare that this quotation/estimate is valid for 30 days unless revoked and is issued for information purposes.</div>
              ) : (
                <>
                  <div>We declare that this invoice shows the actual price of the goods</div>
                  <div>described and that all particulars are true and correct</div>
                </>
              )}
            </div>
          </div>
          <div className="w-1/2 tally-border-l tally-border-t p-1.5 flex flex-col justify-between -m-1.5 ml-1.5">
            <div className="text-right font-bold">for {shopName}</div>
            <div className="text-right mt-6">Authorised Signatory</div>
          </div>
        </div>
      </div>
      
      <div className="text-center mt-1 text-[9.5px] text-gray-600">
        {data.isQuotation ? 'This is a Computer Generated Quotation / Estimate' : 'This is a Computer Generated Invoice'}
      </div>
    </div>
  );

  return createPortal(receiptContent, document.body);
};
