import React from 'react';
import { createPortal } from 'react-dom';

export interface ReportSummaryCard {
  label: string;
  value: string | number;
  highlight?: boolean;
}

export interface ReportColumn {
  header: string;
  accessor: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface PrintableReportData {
  reportTitle: string;
  subTitle?: string;
  dateRange?: string;
  partyDetails?: {
    name: string;
    phone?: string;
    address?: string;
    gstin?: string;
    type?: 'Customer' | 'Supplier';
    openingBalance?: number;
    closingBalance?: number;
  };
  summaryCards?: ReportSummaryCard[];
  columns: ReportColumn[];
  rows: any[];
  totalRow?: Record<string, any>;
  footerNotes?: string;
}

interface PrintableReportProps {
  data: PrintableReportData | null;
}

export const PrintableReport: React.FC<PrintableReportProps> = ({ data }) => {
  if (!data) return null;

  const shopName = localStorage.getItem('shopName') || 'Electro Hub';
  const shopAddress = localStorage.getItem('shopAddress') || '123 Market Street, City';
  const shopPhone = localStorage.getItem('shopPhone') || '+91 9876543210';
  const shopGstin = localStorage.getItem('shopGSTIN') || localStorage.getItem('gstin') || '';

  const getBalanceSuffix = (bal: number, type?: string) => {
    if (Math.abs(bal) < 0.005) return '';
    return type === 'Supplier'
      ? (bal > 0 ? ' (Cr)' : ' (Dr)')
      : (bal > 0 ? ' (Dr)' : ' (Cr)');
  };

  const reportContent = (
    <div id="printable-report" className="hidden print:block bg-white text-black p-6 font-sans text-xs">
      <style dangerouslySetInnerHTML={{ __html: `
        @page {
          size: A4 portrait;
          margin: 8mm 10mm;
        }
        @media print {
          #printable-report tfoot {
            display: table-row-group !important;
          }
          #printable-report tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}} />
      
      {/* 1. Official Header */}
      <div className="border-b-2 border-black pb-4 mb-4 flex justify-between items-start break-inside-avoid">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black uppercase">{shopName}</h1>
          <p className="text-gray-700 text-xs mt-0.5 max-w-md">{shopAddress}</p>
          <div className="flex gap-4 text-xs text-gray-800 mt-1">
            {shopPhone && <span>Phone: <strong className="font-semibold">{shopPhone}</strong></span>}
            {shopGstin && <span>GSTIN: <strong className="font-semibold uppercase">{shopGstin}</strong></span>}
          </div>
        </div>

        <div className="text-right">
          <div className="inline-block bg-black text-white px-3 py-1 font-bold text-sm uppercase tracking-wide rounded-sm">
            {data.reportTitle}
          </div>
          {data.dateRange && (
            <p className="text-xs text-gray-800 font-semibold mt-1.5">
              Period: {data.dateRange}
            </p>
          )}
          {data.subTitle && !data.dateRange && (
            <p className="text-xs text-gray-700 mt-1">{data.subTitle}</p>
          )}
          <p className="text-[10px] text-gray-500 mt-1">
            Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}, {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* 2. Party Information Box (For Ledger Statements) */}
      {data.partyDetails && (
        <div className="border border-black rounded-sm p-3 mb-4 bg-gray-50 flex justify-between items-start text-xs break-inside-avoid">
          <div>
            <span className="text-[10px] uppercase font-bold text-gray-600 block">
              {data.partyDetails.type || 'Party'} Details
            </span>
            <div className="text-sm font-bold text-black mt-0.5">{data.partyDetails.name}</div>
            {data.partyDetails.address && (
              <div className="text-gray-700 mt-0.5">{data.partyDetails.address}</div>
            )}
            <div className="flex gap-4 text-gray-700 mt-1">
              {data.partyDetails.phone && <span>Phone: <strong>{data.partyDetails.phone}</strong></span>}
              {data.partyDetails.gstin && <span>GSTIN: <strong className="uppercase">{data.partyDetails.gstin}</strong></span>}
            </div>
          </div>

          <div className="text-right flex flex-col justify-between">
            {typeof data.partyDetails.openingBalance === 'number' && (
              <div className="mb-1">
                <span className="text-[10px] uppercase text-gray-600 block">Opening Balance</span>
                <span className="font-bold text-xs">
                  ₹{Math.abs(data.partyDetails.openingBalance).toFixed(2)}{getBalanceSuffix(data.partyDetails.openingBalance, data.partyDetails.type)}
                </span>
              </div>
            )}
            {typeof data.partyDetails.closingBalance === 'number' && (
              <div className={typeof data.partyDetails.openingBalance === 'number' ? 'border-t border-gray-300 pt-1 mt-1' : ''}>
                <span className="text-[10px] uppercase font-bold text-black block">Closing Balance</span>
                <span className="font-bold text-sm text-black">
                  ₹{Math.abs(data.partyDetails.closingBalance).toFixed(2)}{getBalanceSuffix(data.partyDetails.closingBalance, data.partyDetails.type)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Summary KPI Cards */}
      {data.summaryCards && data.summaryCards.length > 0 && (
        <div className={`grid ${
          data.summaryCards.length === 1 ? 'grid-cols-1' :
          data.summaryCards.length === 2 ? 'grid-cols-2' :
          data.summaryCards.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
        } gap-2 mb-4 break-inside-avoid`}>
          {data.summaryCards.map((card, idx) => (
            <div 
              key={idx} 
              className={`p-2.5 rounded-sm border break-inside-avoid ${card.highlight ? 'border-black bg-gray-100 font-bold' : 'border-gray-300 bg-gray-50'}`}
            >
              <span className="text-[10px] uppercase font-semibold text-gray-600 block tracking-wider">
                {card.label}
              </span>
              <span className="text-sm font-bold text-black mt-0.5 block">
                {card.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 4. Data Table */}
      <div className="mb-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-y-2 border-black bg-gray-100">
              <th className="py-2 px-2 text-left font-bold text-[10px] uppercase text-black w-8">#</th>
              {data.columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className={`py-2 px-2 font-bold text-[10px] uppercase text-black ${
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                  } ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={data.columns.length + 1} className="py-6 text-center text-gray-500 italic">
                  No records found for the selected criteria
                </td>
              </tr>
            ) : (
              data.rows.map((row, rIdx) => (
                <tr key={rIdx} className="break-inside-avoid hover:bg-gray-50">
                  <td className="py-1.5 px-2 text-left text-gray-600 text-[11px] font-mono">{rIdx + 1}</td>
                  {data.columns.map((col, cIdx) => {
                    const val = row[col.accessor];
                    return (
                      <td 
                        key={cIdx} 
                        className={`py-1.5 px-2 text-[11px] ${
                          col.align === 'right' ? 'text-right font-mono' : col.align === 'center' ? 'text-center' : 'text-left'
                        } ${col.className || ''}`}
                      >
                        {val !== undefined && val !== null ? String(val) : '-'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>

          {/* Table Totals Row */}
          {data.totalRow && (
            <tfoot>
              <tr className="border-t-2 border-b-2 border-black bg-gray-100 font-bold break-inside-avoid">
                <td className="py-2 px-2 text-left text-[11px] uppercase font-bold">TOTAL</td>
                {data.columns.map((col, idx) => {
                  const val = data.totalRow?.[col.accessor];
                  return (
                    <td 
                      key={idx} 
                      className={`py-2 px-2 text-[11px] font-bold ${
                        col.align === 'right' ? 'text-right font-mono' : col.align === 'center' ? 'text-center' : 'text-left'
                      }`}
                    >
                      {val !== undefined && val !== null ? String(val) : ''}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* 5. Document Footer & Signatory */}
      <div className="mt-8 pt-4 border-t border-gray-300 flex justify-between items-end text-xs break-inside-avoid">
        <div className="text-[10px] text-gray-500">
          <div>This is a computer-generated report from {shopName}.</div>
          <div>Records verified & extracted from system database.</div>
        </div>

        <div className="text-right">
          <div className="text-xs font-semibold">for {shopName}</div>
          <div className="mt-12 text-[11px] text-gray-700 border-t border-gray-400 pt-1 inline-block min-w-36 text-center">
            Authorised Signatory
          </div>
        </div>
      </div>

    </div>
  );

  return createPortal(reportContent, document.body);
};
