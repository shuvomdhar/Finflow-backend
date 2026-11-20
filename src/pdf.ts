import type { Response } from 'express';
import PDFDocument from 'pdfkit';
import { resolveCurrency } from './fx.js';
import { getReport, listExpenses, listIncomes } from './services/finance.js';
import type { DbUser, Expense, Income } from './types.js';

const COLORS = {
  emerald: '#059669',
  indigo: '#4F46E5',
  sky: '#0EA5E9',
  navy: '#0F172A',
  slate: '#475569',
  muted: '#64748B',
  line: '#E2E8F0',
  soft: '#F8FAFC',
  white: '#FFFFFF',
};

const PAGE_MARGIN = 48;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

function moneyFormatter(
  rate: number,
  label: string,
): (value: number) => string {
  return (value: number) => {
    const converted = value * rate;
    return `${label}${converted.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };
}

function pretty(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
}

function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - 72) {
    doc.addPage();
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string): void {
  ensureSpace(doc, 40);
  doc
    .moveDown(1)
    .fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(title);
  doc.moveDown(0.4);
}

function tableHeader(
  doc: PDFKit.PDFDocument,
  columns: { label: string; x: number; width: number; align?: 'left' | 'right' }[],
): void {
  ensureSpace(doc, 30);
  const y = doc.y;
  doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 22).fill(COLORS.soft);
  doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(8);
  for (const column of columns) {
    doc.text(column.label.toUpperCase(), column.x, y + 7, {
      width: column.width,
      align: column.align ?? 'left',
      lineBreak: false,
    });
  }
  doc.y = y + 28;
}

function tableRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  columns: { x: number; width: number; align?: 'left' | 'right' }[],
  options: { mutedFirst?: boolean } = {},
): void {
  ensureSpace(doc, 24);
  const y = doc.y;
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.navy);
  values.forEach((value, index) => {
    const column = columns[index];
    doc.fillColor(
      options.mutedFirst && index === 0 ? COLORS.muted : COLORS.navy,
    );
    doc.text(value, column.x, y, {
      width: column.width,
      align: column.align ?? 'left',
      lineBreak: false,
      ellipsis: true,
    });
  });
  doc
    .moveTo(PAGE_MARGIN, y + 14)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y + 14)
    .strokeColor(COLORS.line)
    .lineWidth(0.5)
    .stroke();
  doc.y = y + 20;
}

function summaryCards(
  doc: PDFKit.PDFDocument,
  totals: { income: number; expense: number; balance: number },
  money: (value: number) => string,
): void {
  ensureSpace(doc, 80);
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * 2) / 3;
  const y = doc.y;
  const cards = [
    { label: 'Income', value: totals.income, color: COLORS.emerald },
    { label: 'Expenses', value: totals.expense, color: COLORS.indigo },
    { label: 'Balance', value: totals.balance, color: COLORS.sky },
  ];

  cards.forEach((card, index) => {
    const x = PAGE_MARGIN + index * (width + gap);
    doc.roundedRect(x, y, width, 62, 8).fill(card.color);
    doc
      .fillColor(COLORS.white)
      .font('Helvetica')
      .fontSize(8)
      .text(card.label.toUpperCase(), x + 14, y + 14, { width: width - 28 });
    doc
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(money(card.value), x + 14, y + 29, { width: width - 28 });
  });

  doc.y = y + 78;
}

function categoryBreakdown(
  doc: PDFKit.PDFDocument,
  categories: { category: string; total: number }[],
  money: (value: number) => string,
): void {
  sectionTitle(doc, 'Spending by category');

  if (categories.length === 0) {
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(9)
      .text('No expenses recorded for this period.');
    return;
  }

  const max = Math.max(...categories.map((category) => category.total), 1);
  const barWidth = CONTENT_WIDTH - 250;

  for (const category of categories) {
    ensureSpace(doc, 26);
    const y = doc.y;
    doc
      .fillColor(COLORS.navy)
      .font('Helvetica')
      .fontSize(9)
      .text(pretty(category.category), PAGE_MARGIN, y, {
        width: 120,
        lineBreak: false,
      });
    doc
      .roundedRect(PAGE_MARGIN + 128, y + 1, barWidth, 10, 5)
      .fill(COLORS.line);
    doc
      .roundedRect(
        PAGE_MARGIN + 128,
        y + 1,
        Math.max((category.total / max) * barWidth, 3),
        10,
        5,
      )
      .fill(COLORS.emerald);
    doc
      .fillColor(COLORS.slate)
      .font('Helvetica-Bold')
      .fontSize(9)
      .text(money(category.total), PAGE_MARGIN + 128 + barWidth + 12, y, {
        width: 70,
        align: 'right',
        lineBreak: false,
      });
    doc.y = y + 20;
  }
}

function incomeTable(
  doc: PDFKit.PDFDocument,
  incomes: Income[],
  money: (value: number) => string,
): void {
  sectionTitle(doc, 'Income');
  if (incomes.length === 0) {
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(9)
      .text('No income recorded for this period.');
    return;
  }

  const columns = [
    { label: 'Month', x: PAGE_MARGIN, width: 70 },
    { label: 'Source', x: PAGE_MARGIN + 74, width: 170 },
    { label: 'Category', x: PAGE_MARGIN + 250, width: 90 },
    { label: 'Amount', x: PAGE_MARGIN + 348, width: CONTENT_WIDTH - 348, align: 'right' as const },
  ];

  tableHeader(doc, columns);
  for (const income of incomes) {
    tableRow(
      doc,
      [
        formatMonth(income.month),
        income.source,
        pretty(income.category),
        money(income.amount),
      ],
      columns,
      { mutedFirst: true },
    );
  }
}

function expenseTable(
  doc: PDFKit.PDFDocument,
  expenses: Expense[],
  money: (value: number) => string,
): void {
  sectionTitle(doc, 'Expenses');
  if (expenses.length === 0) {
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(9)
      .text('No expenses recorded for this period.');
    return;
  }

  const columns = [
    { label: 'Date', x: PAGE_MARGIN, width: 64 },
    { label: 'Description', x: PAGE_MARGIN + 68, width: 175 },
    { label: 'Category', x: PAGE_MARGIN + 247, width: 85 },
    { label: 'Payment', x: PAGE_MARGIN + 336, width: 65 },
    { label: 'Amount', x: PAGE_MARGIN + 405, width: CONTENT_WIDTH - 405, align: 'right' as const },
  ];

  tableHeader(doc, columns);
  for (const expense of expenses) {
    tableRow(
      doc,
      [
        formatDate(expense.spentOn),
        expense.title,
        pretty(expense.category),
        pretty(expense.paymentMethod),
        money(expense.amount),
      ],
      columns,
      { mutedFirst: true },
    );
  }
}

export async function streamReportPdf(
  response: Response,
  user: DbUser,
  year: number,
  month?: string,
  currency?: string,
): Promise<void> {
  const [report, incomes, expenses, display] = await Promise.all([
    getReport(user.id, year, month),
    listIncomes(user.id, month ? { month } : { year }),
    listExpenses(user.id, month ? { month } : { year }),
    resolveCurrency(currency),
  ]);

  const money = moneyFormatter(display.rate, display.label);
  const periodLabel = `${month ? formatMonth(month) : `Year ${year}`}  ·  All amounts in ${display.code}`;
  const fileName = month
    ? `finflow-report-${month}.pdf`
    : `finflow-report-${year}.pdf`;

  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="${fileName}"`,
  );

  const doc = new PDFDocument({
    size: 'A4',
    margin: PAGE_MARGIN,
    info: {
      Title: `FinFlow ${periodLabel} expense report`,
      Author: 'FinFlow',
    },
  });

  doc.pipe(response);

  doc.rect(0, 0, doc.page.width, 8).fill(COLORS.emerald);

  doc
    .fillColor(COLORS.emerald)
    .font('Helvetica-Bold')
    .fontSize(22)
    .text('FinFlow', PAGE_MARGIN, 46);

  doc
    .fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('Expense report', PAGE_MARGIN, 78);

  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(9)
    .text(periodLabel, PAGE_MARGIN, 102);

  doc
    .text(
      `${user.name ?? 'FinFlow user'}  ·  ${user.email}`,
      PAGE_MARGIN,
      116,
      { width: CONTENT_WIDTH },
    );

  doc
    .text(
      `Generated ${new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}`,
      PAGE_MARGIN,
      116,
      { width: CONTENT_WIDTH, align: 'right' },
    );

  doc.y = 144;
  summaryCards(doc, report.totals, money);
  incomeTable(doc, incomes, money);
  expenseTable(doc, expenses, money);
  categoryBreakdown(doc, report.categories, money);

  ensureSpace(doc, 50);
  doc
    .moveDown(1.5)
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(8)
    .text('Generated by FinFlow · Your money, clearly.', PAGE_MARGIN, doc.y, {
      width: CONTENT_WIDTH,
      align: 'center',
    });

  doc.end();
}
