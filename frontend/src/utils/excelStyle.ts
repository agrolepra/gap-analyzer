import ExcelJS from 'exceljs';

export const ACCENT_ARGB = 'FF6366F1';
export const SUCCESS_ARGB = 'FF10B981';
export const DANGER_ARGB = 'FFEF4444';

export function styleHeaderRow(worksheet: ExcelJS.Worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ACCENT_ARGB } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

export function autoFitColumns(worksheet: ExcelJS.Worksheet, minWidth = 10) {
  worksheet.columns.forEach(col => {
    let max = minWidth;
    col.eachCell?.({ includeEmpty: true }, cell => {
      const len = cell.value != null ? String(cell.value).length : 0;
      if (len > max) max = len;
    });
    col.width = max + 2;
  });
}

// Mismos umbrales que getDistColor() en GapTable.tsx, para que el Excel coincida visualmente con la tabla.
export function distColorArgb(pct: number): string {
  if (pct < 3) return 'FFF97316'; // naranja urgente
  if (pct < 7) return 'FFEAB308'; // amarillo
  return 'FFA0A0AB'; // gris normal
}

// Convierte "yyyy-mm-dd" o "yyyy-mm-dd HH:MM:SS" a "dd-mm-aaaa"
export function formatDateDDMMYYYY(dateStr: string | undefined | null): string {
  if (!dateStr) return '';
  const datePart = dateStr.split(' ')[0];
  const [y, m, d] = datePart.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}-${m}-${y}`;
}

export async function downloadWorkbook(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
