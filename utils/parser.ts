
import { Group, DayType, ShiftType, ShiftEntry, SalaryTable, FestiveNightRates, JournalType } from '../types';
import { VALENCIA_HOLIDAYS_2026, SALARY_TABLE_2025 } from '../constants';

const COMPANY_REGEX = /(CSP|IBERIAN|TERMINAL|MEDITERRANEAN|MSCTV|APM|VTE)/i;
const MONTH_MAP_ES: Record<string, number> = {
  ENERO: 1,
  FEBRERO: 2,
  MARZO: 3,
  ABRIL: 4,
  MAYO: 5,
  JUNIO: 6,
  JULIO: 7,
  AGOSTO: 8,
  SEPTIEMBRE: 9,
  SETIEMBRE: 9,
  OCTUBRE: 10,
  NOVIEMBRE: 11,
  DICIEMBRE: 12
};

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

const parseJournalType = (line: string): JournalType | undefined => {
  const upper = line.toUpperCase();
  if (/\bNUD\b/.test(upper)) return 'NUD';
  if (/\bTUR\b/.test(upper)) return 'TUR';
  return undefined;
};

const normalizeCompanyCode = (company?: string): string | undefined => {
  const cleaned = String(company || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return undefined;
  if (cleaned.includes('CSP')) return 'CSP';
  if (cleaned.includes('MEDITERRANEAN') || cleaned.includes('MSCTV') || cleaned.includes('MSC')) return 'MSC';
  if (cleaned.includes('APM')) return 'APM';
  if (cleaned.includes('VTE')) return 'VTE';
  return cleaned;
};

const parseShiftKey = (line: string): ShiftType | null => {
  const upper = line.toUpperCase().replace(/\s+/g, ' ').trim();
  if (/\b0?2\D+0?8\b/.test(upper)) return '02-08';
  if (/\b0?8\D+14\b/.test(upper)) return '08-14';
  if (/\b14\D+20\b/.test(upper)) return '14-20';
  if (/\b20\D+0?2\b/.test(upper)) return '20-02';
  return null;
};

const extractMonthYearFromHeader = (text: string): { month: number; year: number } | null => {
  const headerMatch = text.toUpperCase().match(/JORNALES\s+DE\s+([A-ZÁÉÍÓÚÜ]+)\s+DE\s+(\d{4})/);
  if (!headerMatch) return null;

  const monthName = headerMatch[1]
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const month = MONTH_MAP_ES[monthName];
  const year = Number(headerMatch[2]);
  if (!month || Number.isNaN(year)) return null;
  return { month, year };
};

const parseCompactTableRows = (text: string, currentGroup: Group): Partial<ShiftEntry>[] => {
  const header = extractMonthYearFromHeader(text);
  const now = new Date();
  const month = header?.month ?? now.getMonth() + 1;
  const year = header?.year ?? now.getFullYear();

  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const rowRegex = /^(\d{1,3})\s+(\d{3,6})\s+(\d{1,2})\s+([A-Z]{3,4})\s+DE\s*(02|08|14|20)\s*A\s*(08|14|20|02)\s*H\.?\s+(.+?)\s+(CSP IBERIAN VALENCIA TERMINAL|MEDITERRANEAN SHIPPING C\.\s*TV|APM(?: TERMINALS VALENCIA,? S\.?A\.?)?|VTE)\s+(.+?)\s+CONT\..*?(?:\s+(\d+[.,]\d+)\s*€?)?$/i;
  const out: Partial<ShiftEntry>[] = [];

  for (const line of lines) {
    const m = line.match(rowRegex);
    if (!m) continue;

    const day = Number(m[3]);
    if (day < 1 || day > 31) continue;

    const shift = parseShiftKey(`DE ${m[5]} A ${m[6]} H.`);
    if (!shift) continue;

    const specialty = m[7].trim().toUpperCase();
    const company = normalizeCompanyCode(m[8]);
    const ship = m[9].trim().toUpperCase();
    const group = specialty.includes('CONDUCTOR 1A') ? 'II' : currentGroup;
    const journalType = parseJournalType(m[4]);
    const production = extractProductionAmount(m[10] || '');

    out.push({
      group,
      shift,
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      production,
      specialty: specialty || undefined,
      company: company || undefined,
      ship: ship || undefined,
      journalType,
      label: specialty ? `${shift} ${specialty}` : `${shift} JORNAL ESTIBA`
    });
  }

  return out;
};

const parsePortalTableText = (text: string, currentGroup: Group): Partial<ShiftEntry>[] => {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const header = extractMonthYearFromHeader(text);
  const now = new Date();
  const month = header?.month ?? now.getMonth() + 1;
  const year = header?.year ?? now.getFullYear();

  const productionHeaderIndex = lines.findIndex((line) => /^PRODUCCI[ÓO]N$/i.test(line));
  const startIndex = productionHeaderIndex >= 0 ? productionHeaderIndex + 1 : 0;
  const data = lines.slice(startIndex).filter((line) => !/^VOLVER$/i.test(line));
  const results: Partial<ShiftEntry>[] = [];

  const isRecordStart = (idx: number): boolean => {
    const jornal = data[idx];
    const parte = data[idx + 1];
    const day = data[idx + 2];
    const tipo = data[idx + 3];
    const jornada = data[idx + 4];
    if (!jornal || !parte || !day || !tipo || !jornada) return false;
    if (!/^\d{1,3}$/.test(jornal)) return false;
    if (!/^\d{3,6}$/.test(parte)) return false;
    const dayNum = Number(day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return false;
    if (!/^[A-Z]{3,4}$/i.test(tipo)) return false;
    if (!parseShiftKey(jornada)) return false;
    return true;
  };

  const isMergedRecordStart = (idx: number): boolean => {
    const journalParte = data[idx];
    const day = data[idx + 1];
    const tipo = data[idx + 2];
    const jornada = data[idx + 3];
    if (!journalParte || !day || !tipo || !jornada) return false;
    if (!/^\d{4,7}$/.test(journalParte)) return false;
    const dayNum = Number(day);
    if (!Number.isInteger(dayNum) || dayNum < 1 || dayNum > 31) return false;
    if (!/^[A-Z]{3,4}$/i.test(tipo)) return false;
    if (!parseShiftKey(jornada)) return false;
    return true;
  };

  let i = 0;
  while (i < data.length) {
    const normalStart = isRecordStart(i);
    const mergedStart = !normalStart && isMergedRecordStart(i);
    if (!normalStart && !mergedStart) {
      i += 1;
      continue;
    }

    const baseOffset = mergedStart ? 1 : 2;
    const tipoOffset = mergedStart ? 2 : 3;
    const jornadaOffset = mergedStart ? 3 : 4;
    const specialtyOffset = mergedStart ? 4 : 5;
    const companyOffset = mergedStart ? 5 : 6;
    const shipOffset = mergedStart ? 6 : 7;
    const operationOffset = mergedStart ? 7 : 8;

    const day = Number(data[i + baseOffset]);
    const tipoRaw = data[i + tipoOffset] || '';
    const shift = parseShiftKey(data[i + jornadaOffset]);
    if (!shift) {
      i += 1;
      continue;
    }

    const specialtyRaw = data[i + specialtyOffset] || '';
    const companyRaw = data[i + companyOffset] || '';
    const shipRaw = data[i + shipOffset] || '';
    const operationRaw = data[i + operationOffset] || '';
    let cursor = i + operationOffset + 1;

    let production = 0;
    const maybeProduction = data[cursor];
    if (maybeProduction && !isRecordStart(cursor) && !isMergedRecordStart(cursor) && /\d/.test(maybeProduction)) {
      production = extractProductionAmount(maybeProduction);
      cursor += 1;
    }

    const specialty = specialtyRaw.toUpperCase();
    const group = specialty.includes('CONDUCTOR 1A') ? 'II' : currentGroup;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const journalType = parseJournalType(tipoRaw);

    results.push({
      group,
      shift,
      date,
      production,
      specialty: specialty || undefined,
      company: normalizeCompanyCode(companyRaw),
      ship: shipRaw ? shipRaw.toUpperCase() : undefined,
      journalType,
      label: specialty ? `${shift} ${specialty}` : `${shift} JORNAL ESTIBA`
    });

    // Safety skip for malformed rows without operation text.
    if (!operationRaw && cursor === i + operationOffset + 1) cursor = i + operationOffset + 1;
    i = cursor;
  }

  return results;
};

const findDayTokenInLine = (line: string): number | null => {
  const withoutShift = line.replace(/DE\s*\d{1,2}\s*[A\-]\s*\d{1,2}\s*H?\.?/ig, ' ');
  const tokens = withoutShift.match(/\b\d{1,2}\b/g);
  if (!tokens) return null;
  // In compact table rows the first token can be "Jornal" (e.g. 3/4).
  // Prefer the last short numeric token, which aligns with "Dia" in that format.
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const day = Number(tokens[i]);
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
  result.journalType = parseJournalType(upperLine);

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
  const detailsPattern = /DE \d{2} A \d{2} H\.\s+([A-Z0-9\s]+?)\s+(CSP(?:\s+IBERIAN\s+VALENCIA\s+TERMINAL)?|MEDITERRANEAN\s+SHIPPING\s+C\.\s*TV|MSCTV|APM(?:\s+TERMINALS\s+VALENCIA,?\s*S\.?A\.?)?|VTE|TES|TERMINAL|MEDITERRANEAN|IBERIAN)\s*(.*)$/i;
  const match = upperLine.match(detailsPattern);

  if (match) {
    const specialty = match[1].trim();
    const company = match[2].trim();
    const shipRaw = (match[3] || '')
      .replace(/\s+CONT\..*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    result.specialty = specialty;
    result.company = normalizeCompanyCode(company);
    
    // El buque suele venir despus de la empresa en el pegado de tabla
    if (shipRaw) result.ship = shipRaw;

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
  const portalTableParsed = parsePortalTableText(text, currentGroup);
  if (portalTableParsed.length > 0) return portalTableParsed;

  const compactRowsParsed = parseCompactTableRows(text, currentGroup);
  if (compactRowsParsed.length > 0) return compactRowsParsed;

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
    const journalType =
      segment.map((s) => parseJournalType(s)).find((t) => t === 'NUD' || t === 'TUR') ||
      parseJournalType(shiftLine);

    results.push({
      group,
      shift,
      date,
      production,
      specialty,
      company: normalizeCompanyCode(company),
      ship: ship ? ship.toUpperCase() : undefined,
      journalType,
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
  const cleanExtras = Number(entry.extras) || 0;
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

  const totalBruto = base + cleanProduction + cleanExtras;
  const totalNeto = totalBruto * (1 - (irpfPercent / 100));

  return {
    id: entry.id || crypto.randomUUID(),
    date: String(entry.date),
    group: entry.group,
    dayType: dayType,
    shift: entry.shift,
    base: Number(base.toFixed(2)),
    production: Number(cleanProduction.toFixed(2)),
    extras: Number(cleanExtras.toFixed(2)),
    total: Number(totalBruto.toFixed(2)),
    net: Number(totalNeto.toFixed(2)),
    irpf: Number(irpfPercent),
    label: String(entry.label || 'Jornal Estiba'),
    specialty: entry.specialty ? String(entry.specialty) : null,
    company: entry.company ? String(entry.company) : null,
    ship: entry.ship ? String(entry.ship) : null,
    journalType: entry.journalType === 'NUD' ? 'NUD' : entry.journalType === 'TUR' ? 'TUR' : undefined
  } as ShiftEntry;
};
