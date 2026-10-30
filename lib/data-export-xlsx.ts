import 'server-only';
import ExcelJS from 'exceljs';
import type { Column, ExportResult } from './data-export';

// Planilha "Meus dados na Artenós": Resumo + uma aba por assunto. Cabeçalho
// marrom com texto branco, primeira linha congelada, filtro ligado, linhas
// alternadas, datas dd/mm/aaaa hh:mm (Brasília) e valores em R$.

const BROWN = 'FF4B3026';
const ZEBRA = 'FFFBF5EF';
const LINE = 'FFE8DCD0';
const MONEY = '"R$" #,##0.00';
const DATE = 'dd/mm/yyyy hh:mm';

/** Excel não guarda fuso: grava a hora "de parede" de Brasília. */
function brasilia(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute));
}

function cellValue(column: Column, value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (column.type === 'date') return brasilia(value);
  if (column.type === 'money' || column.type === 'int') return Number(value);
  return String(value);
}

function styleHeader(row: ExcelJS.Row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BROWN } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  });
}

function widthFor(column: Column, rows: Record<string, unknown>[]) {
  if (column.type === 'long') return 60;
  if (column.type === 'date') return 20;
  if (column.type === 'money') return 18;
  const longest = rows.reduce<number>((max, row) => Math.max(max, String(row[column.key] ?? '').length), column.header.length);
  return Math.min(Math.max(longest + 4, 12), 50);
}

export async function exportToXlsx(result: ExportResult): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Artenós';
  workbook.created = new Date(result.generatedAt);

  // Resumo -------------------------------------------------------------------
  const summary = workbook.addWorksheet('Resumo', { views: [{ showGridLines: false }], pageSetup: { fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
  summary.columns = [{ width: 30 }, { width: 60 }];
  summary.addRow(['Meus dados na Artenós']).font = { bold: true, size: 16, color: { argb: BROWN } };
  summary.addRow([]);
  const info: [string, unknown][] = [
    ['Nome', result.account.name || '—'], ['E-mail', result.account.email],
    ['Conta criada em', brasilia(result.account.createdAt)], ['Exportado em', brasilia(result.generatedAt)],
  ];
  for (const [key, value] of info) {
    const row = summary.addRow([key, value]);
    row.getCell(1).font = { bold: true };
    if (value instanceof Date) { row.getCell(2).numFmt = DATE; row.getCell(2).alignment = { horizontal: 'left' }; }
  }
  summary.addRow([]);
  const indexHeader = summary.addRow(['Aba', 'Registros']);
  styleHeader(indexHeader);
  result.sheets.forEach((sheet, position) => {
    const row = summary.addRow([sheet.name, sheet.rows.length]);
    row.getCell(1).value = { text: sheet.name, hyperlink: `#'${sheet.name}'!A1` };
    row.getCell(1).font = { color: { argb: 'FF5A6B3F' }, underline: true };
    row.getCell(2).alignment = { horizontal: 'left' };
    if (position % 2) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }; });
  });
  summary.addRow([]);
  const note = summary.addRow(['Pedidos, pagamentos e notas fiscais seguem guardados pelo prazo legal. Senhas, chaves e dados de cartão nunca aparecem aqui.']);
  summary.mergeCells(note.number, 1, note.number, 2);
  note.height = 30;
  note.getCell(1).font = { italic: true, color: { argb: 'FF7A6A5F' } };
  note.getCell(1).alignment = { wrapText: true, vertical: 'top' };

  // Uma aba por assunto ----------------------------------------------------------
  for (const sheet of result.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), {
      views: [{ state: 'frozen', ySplit: 1 }],
      // Impressão: paisagem, todas as colunas na largura da folha.
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    worksheet.columns = sheet.columns.map((column) => ({ header: column.header, key: column.key, width: widthFor(column, sheet.rows) }));
    styleHeader(worksheet.getRow(1));
    // Título alinhado como o conteúdo (valores e datas à direita).
    sheet.columns.forEach((column, index) => {
      if (column.type === 'money' || column.type === 'int' || column.type === 'date') {
        worksheet.getRow(1).getCell(index + 1).alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
      }
    });
    sheet.rows.forEach((source, position) => {
      const row = worksheet.addRow(Object.fromEntries(sheet.columns.map((column) => [column.key, cellValue(column, source[column.key])])));
      sheet.columns.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        if (column.type === 'money') cell.numFmt = MONEY;
        if (column.type === 'date') cell.numFmt = DATE;
        const numeric = column.type === 'money' || column.type === 'int' || column.type === 'date';
        cell.alignment = { vertical: 'top', horizontal: numeric ? 'right' : 'left', wrapText: column.type === 'long', indent: 1 };
        cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
        if (position % 2) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      });
    });
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
