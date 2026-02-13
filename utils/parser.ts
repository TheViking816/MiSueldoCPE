
import { Group, DayType, ShiftType, ShiftEntry, SalaryTable } from '../types';
import { VALENCIA_HOLIDAYS_2026, SALARY_TABLE_2025 } from '../constants';

export const isHoliday = (dateString: string): boolean => {
  const date = new Date(dateString);
  const day = date.getDay(); 
  return day === 0 || VALENCIA_HOLIDAYS_2026.includes(dateString);
};

export const getDayType = (dateString: string): DayType => {
  if (isHoliday(dateString)) return 'FESTIVO';
  const date = new Date(dateString);
  if (date.getDay() === 6) return 'SABADO';
  return 'LABORABLE';
};

/**
 * Procesa una sola lnea de texto para extraer un jornal
 */
export const parseSingleLine = (line: string, currentGroup: Group): Partial<ShiftEntry> | null => {
  const upperLine = line.toUpperCase().trim();
  if (!upperLine || upperLine.length < 5) return null;

  const result: Partial<ShiftEntry> = { group: currentGroup };

  // Regla Especial: Conductor 1a -> Grupo II
  if (upperLine.includes('CONDUCTOR 1A')) {
    result.group = 'II';
  }

  // Identificar Turno
  let shiftKey: ShiftType | undefined;
  let shiftLabel = '';
  if (upperLine.includes('02 A 08')) { shiftKey = '02-08'; shiftLabel = '02-08'; }
  else if (upperLine.includes('08 A 14')) { shiftKey = '08-14'; shiftLabel = '08-14'; }
  else if (upperLine.includes('14 A 20')) { shiftKey = '14-20'; shiftLabel = '14-20'; }
  else if (upperLine.includes('20 A 02')) { shiftKey = '20-02'; shiftLabel = '20-02'; }
  
  if (!shiftKey) return null; // Si no hay turno, no es una lnea vlida de jornal
  result.shift = shiftKey;

  // Extraer Fecha (DD/MM o DD-MM)
  const dateMatch = line.match(/(\d{1,2})[\/-](\d{1,2})/);
  const currentYear = new Date().getFullYear();
  if (dateMatch) {
    result.date = `${currentYear}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`;
  } else {
    const today = new Date();
    result.date = `${currentYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  // Extraer Produccin (nmero al final o tras el turno)
  // Intentamos buscar un nmero decimal al final de la lnea
  const numbers = line.match(/\d+([.,]\d+)?/g);
  if (numbers && numbers.length > 0) {
    const lastNum = numbers[numbers.length - 1].replace(',', '.');
    // Si el ltimo nmero parece un ID (ej. 4052) y no una produccin (ej. 80.42), 
    // pero el usuario dice que est al final, lo tomamos.
    result.production = parseFloat(lastNum);
  } else {
    result.production = 0;
  }

  // Extraer Detalles (Especialidad, Empresa, Buque)
  // Formato: ... DE 02 A 08 H. [ESPECIALIDAD] [EMPRESA] [BUQUE] ...
  const detailsPattern = /DE \d{2} A \d{2} H\.\s+([A-Z0-9\s]+?)\s+(CSP|MSCTV|APM|VTE|TES|TERMINAL|MEDITERRANEAN|IBERIAN)/i;
  const match = upperLine.match(detailsPattern);

  if (match) {
    const specialty = match[1].trim();
    const company = match[2].trim();
    result.specialty = specialty;
    result.company = company;
    
    // El buque suele venir despus de la empresa en el pegado de tabla
    const remaining = upperLine.split(company)[1] || '';
    const shipMatch = remaining.trim().split(/\t|\s{2,}/)[0];
    if (shipMatch) result.ship = shipMatch.trim();

    result.label = `${shiftLabel} ${specialty}`;
  } else {
    result.label = `${shiftLabel} JORNAL ESTIBA`;
  }

  return result;
};

/**
 * Procesa un bloque de texto que puede contener mltiples jornales
 */
export const parseBulkText = (text: string, currentGroup: Group): Partial<ShiftEntry>[] => {
  const lines = text.split(/\n/);
  const results: Partial<ShiftEntry>[] = [];

  for (const line of lines) {
    const parsed = parseSingleLine(line, currentGroup);
    if (parsed) results.push(parsed);
  }

  return results;
};

export const calculateShiftTotal = (
  entry: Partial<ShiftEntry>,
  irpfPercent: number = 0,
  salaryTable: SalaryTable = SALARY_TABLE_2025
): ShiftEntry | null => {
  if (!entry.date || !entry.group || !entry.shift) return null;
  
  const cleanProduction = Number(entry.production) || 0;
  const dayType = getDayType(entry.date);
  
  // Obtener salario base de la tabla 2025
  const base = salaryTable[entry.group][dayType][entry.shift] || 0;
  const totalBruto = base + cleanProduction;
  const totalNeto = totalBruto * (1 - (irpfPercent / 100));

  return {
    id: entry.id || crypto.randomUUID(),
    date: String(entry.date),
    group: entry.group,
    dayType: dayType,
    shift: entry.shift,
    base: Number(base.toFixed(2)),
    production: Number(cleanProduction.toFixed(2)),
    total: Number(totalBruto.toFixed(2)),
    net: Number(totalNeto.toFixed(2)),
    irpf: Number(irpfPercent),
    label: String(entry.label || 'Jornal Estiba'),
    specialty: entry.specialty ? String(entry.specialty) : null,
    company: entry.company ? String(entry.company) : null,
    ship: entry.ship ? String(entry.ship) : null
  } as ShiftEntry;
};
