import ExcelJS from 'exceljs';
export { formatDateDDMMYYYY } from './formatDate';

// ExcelJS renderiza fuera del DOM y no puede resolver custom properties de CSS,
// así que estos ARGB son el espejo literal de la paleta definida en src/index.css :root.
// Si se cambia el tema ahí, actualizar también acá.
export const ACCENT_ARGB = 'FFB3312F';
export const SUCCESS_ARGB = 'FF10B981';
export const DANGER_ARGB = 'FFEF4444';
export const URGENT_ARGB = 'FFF97316';
export const CAUTION_ARGB = 'FFEAB308';
export const NEUTRAL_ARGB = 'FFA0A0AB';

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
  if (pct < 3) return URGENT_ARGB;
  if (pct < 7) return CAUTION_ARGB;
  return NEUTRAL_ARGB;
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
