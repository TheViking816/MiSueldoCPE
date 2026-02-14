
import { Group, DayType, ShiftType, ShiftEntry, SalaryTable, FestiveNightRates } from '../types';
import { VALENCIA_HOLIDAYS_2026, SALARY_TABLE_2025 } from '../constants';

const COMPANY_REGEX = /(CSP|IBERIAN|TERMINAL|MEDITERRANEAN|MSCTV|APM|VTE)/i;

const parseLocalDate = (dateString: string): Date => {
  const [y, m, d] = String(dateString).split('-').map(Number);
  if (!y || !m || !d) return new Date(dateString);
  return new Date(y, m - 1, d);
};

const toYmd = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getNextDay = (dateString: string): string => {
  const d = parseLocalDate(dateString);
  d.setDate(d.getDate() + 1);
  return toYmd(d);
};

const extractProductionAmount = (text: string): number => {
  const matches = text.match(/\d+[.,]\d+/g);
  if (!matches || matches.length === 0) return 0;
  const last = matches[matches.length - 1].replace(',', '.');
  const amount = Number(last);
  return Number.isNaN(amount) ? 0 : amount;
};

const parseShiftKey = (line: string): ShiftType | null => {
  const upper = line.toUpperCase().replace(/\s+/g, ' ').trim();
  if (/\b0?2\D+0?8\b/.test(upper)) return '02-08';
  if (/\b0?8\D+14\b/.test(upper)) return '08-14';
  if (/\b14\D+20\b/.test(upper)) return '14-20';
  if (/\b20\D+0?2\b/.test(upper)) return '20-02';
  return null;
};

const findDayTokenInLine = (line: string): number | null => {
  const withoutShift = line.replace(/DE\s*\d{1,2}\s*[A\-]\s*\d{1,2}\s*H?\.?/ig, ' ');
  const tokens = withoutShift.match(/\b\d{1,2}\b/g);
  if (!tokens) return null;
  for (const token of tokens) {
    const day = Number(token);
    if (day >= 1 && day <= 31) return day;
  }
  return null;
};

export const isHoliday = (dateString: string): boolean => {
  const date = parseLocalDate(dateString);
  const day = date.getDay(); 
  return day === 0 || VALENCIA_HOLIDAYS_2026.includes(dateString);
};

export const getDayType = (dateString: string): DayType => {
  if (isHoliday(dateString)) return 'FESTIVO';
  const date = parseLocalDate(dateString);
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
  const shiftKey = parseShiftKey(upperLine) || undefined;
  const shiftLabel = shiftKey || '';
  
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

  // Extraer Produccion evitando capturar los numeros del turno/fecha.
  const productionSource = line
    .replace(/DE\s*\d{1,2}\s*A\s*\d{1,2}\s*H\.?/ig, ' ')
    .replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, ' ');
  result.production = extractProductionAmount(productionSource);

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
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const results: Partial<ShiftEntry>[] = [];

  const shiftIndexes = lines
    .map((line, index) => (parseShiftKey(line) ? index : -1))
    .filter((index) => index >= 0);

  if (shiftIndexes.length === 0) {
    let inferredDay: number | null = null;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (const line of lines) {
      if (/^\d{1,2}$/.test(line)) {
        const day = Number(line);
        if (day >= 1 && day <= 31) inferredDay = day;
        continue;
      }

      const parsed = parseSingleLine(line, currentGroup);
      if (!parsed) continue;

      if (inferredDay && parsed.shift && !line.match(/\d{1,2}[\/-]\d{1,2}/)) {
        parsed.date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(inferredDay).padStart(2, '0')}`;
      }

      results.push(parsed);
    }
    return results;
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const findStandaloneDay = (segment: string[], shiftPos: number): number | null => {
    for (let i = shiftPos - 1; i >= 0; i -= 1) {
      if (/^\d{1,2}$/.test(segment[i])) {
        const day = Number(segment[i]);
        if (day >= 1 && day <= 31) return day;
      }
    }
    for (let i = shiftPos + 1; i < segment.length; i += 1) {
      if (/^\d{1,2}$/.test(segment[i])) {
        const day = Number(segment[i]);
        if (day >= 1 && day <= 31) return day;
      }
    }
    return null;
  };

  const findNearbyDayToken = (segment: string[], shiftPos: number): number | null => {
    for (let i = shiftPos; i >= 0; i -= 1) {
      const day = findDayTokenInLine(segment[i]);
      if (day !== null) return day;
    }
    for (let i = shiftPos + 1; i < segment.length; i += 1) {
      const day = findDayTokenInLine(segment[i]);
      if (day !== null) return day;
    }
    return null;
  };

  for (let i = 0; i < shiftIndexes.length; i += 1) {
    const shiftIndex = shiftIndexes[i];
    const nextShiftIndex = shiftIndexes[i + 1] ?? lines.length;
    const segmentStart = i === 0 ? 0 : shiftIndexes[i - 1] + 1;
    const segment = lines.slice(segmentStart, nextShiftIndex);
    const shiftPos = shiftIndex - segmentStart;
    const shiftLine = segment[shiftPos];
    const shift = parseShiftKey(shiftLine);
    if (!shift) continue;

    const ddMm = segment.join(' ').match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    let date = '';
    if (ddMm) {
      const day = Number(ddMm[1]);
      const month = Number(ddMm[2]);
      const rawYear = ddMm[3];
      const year = rawYear ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear) : currentYear;
      date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } else {
      const day = findStandaloneDay(segment, shiftPos) ?? findNearbyDayToken(segment, shiftPos) ?? now.getDate();
      date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const company = segment.find((line) => COMPANY_REGEX.test(line));

    const specialtyLine = segment
      .slice(shiftPos + 1)
      .find((line) =>
        /[A-Za-z]/.test(line) &&
        !COMPANY_REGEX.test(line) &&
        !/^CONT[.\s/]/i.test(line) &&
        !/^(TUR|NUD)$/i.test(line)
      );

    const companyIndex = company ? segment.indexOf(company) : -1;
    const ship = companyIndex >= 0
      ? segment
          .slice(companyIndex + 1)
          .find((line) =>
            /[A-Za-z]/.test(line) &&
            !COMPANY_REGEX.test(line) &&
            !/^CONT[.\s/]/i.test(line) &&
            !/^(TUR|NUD)$/i.test(line)
          )
      : undefined;

    const production = extractProductionAmount(segment.slice(shiftPos + 1).join(' '));

    const specialty = specialtyLine ? specialtyLine.toUpperCase() : undefined;
    const group = specialty?.includes('CONDUCTOR 1A') ? 'II' : currentGroup;
    const shiftLabel = shift;

    results.push({
      group,
      shift,
      date,
      production,
      specialty,
      company: company ? company.toUpperCase() : undefined,
      ship: ship ? ship.toUpperCase() : undefined,
      label: specialty ? `${shiftLabel} ${specialty}` : `${shiftLabel} JORNAL ESTIBA`
    });
  }

  return results;
};

export const calculateShiftTotal = (
  entry: Partial<ShiftEntry>,
  irpfPercent: number = 0,
  salaryTable: SalaryTable = SALARY_TABLE_2025,
  festiveNightRates?: FestiveNightRates
): ShiftEntry | null => {
  if (!entry.date || !entry.group || !entry.shift) return null;
  
  const cleanProduction = Number(entry.production) || 0;
  const dayType = getDayType(entry.date);
  
  // Regla especial: jornada 20-02 en festivo depende de si el dia siguiente tambien es festivo.
  let base = salaryTable[entry.group][dayType][entry.shift] || 0;
  if (dayType === 'FESTIVO' && entry.shift === '20-02') {
    const nextDay = getNextDay(entry.date);
    const nextIsFestive = isHoliday(nextDay);
    const key = nextIsFestive ? 'FESTIVO_TO_FESTIVO' : 'FESTIVO_TO_LABORABLE';
    const fallback = salaryTable[entry.group].FESTIVO['20-02'] || 0;
    base = festiveNightRates?.[key]?.[entry.group] ?? fallback;
  }

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
