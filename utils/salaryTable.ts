import { DayType, FestiveNightRates, Group, SalaryTable, ShiftType } from '../types';
import { SALARY_TABLE_2025 } from '../constants';

const GROUPS: Group[] = ['I', 'II', 'III', 'IV'];
const DAY_TYPES: DayType[] = ['LABORABLE', 'SABADO', 'FESTIVO'];
const SHIFTS: ShiftType[] = ['02-08', '08-14', '14-20', '20-02'];
const FESTIVE_NIGHT_TYPES = ['FESTIVO_TO_LABORABLE', 'FESTIVO_TO_FESTIVO'] as const;

export const parseSalaryTableCsv = (csvText: string): SalaryTable => {
  const table: SalaryTable = structuredClone(SALARY_TABLE_2025);
  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return table;

  for (let i = 1; i < lines.length; i += 1) {
    const [groupRaw, dayTypeRaw, shiftRaw, amountRaw] = lines[i].split(',').map((v) => v?.trim());
    const group = groupRaw as Group;
    const dayType = dayTypeRaw as DayType;
    const shift = shiftRaw as ShiftType;
    const amount = Number(amountRaw?.replace(',', '.'));

    if (!GROUPS.includes(group)) continue;
    if (!DAY_TYPES.includes(dayType)) continue;
    if (!SHIFTS.includes(shift)) continue;
    if (Number.isNaN(amount)) continue;

    table[group][dayType][shift] = Number(amount.toFixed(2));
  }

  return table;
};

export const parseFestiveNightRatesCsv = (csvText: string, salaryTable: SalaryTable): FestiveNightRates => {
  const fallbackFromTable = {
    I: Number(salaryTable.I.FESTIVO['20-02'] ?? 0),
    II: Number(salaryTable.II.FESTIVO['20-02'] ?? 0),
    III: Number(salaryTable.III.FESTIVO['20-02'] ?? 0),
    IV: Number(salaryTable.IV.FESTIVO['20-02'] ?? 0)
  };

  const rates: FestiveNightRates = {
    FESTIVO_TO_LABORABLE: { ...fallbackFromTable },
    FESTIVO_TO_FESTIVO: { ...fallbackFromTable }
  };

  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) return rates;

  for (let i = 1; i < lines.length; i += 1) {
    const [groupRaw, dayTypeRaw, shiftRaw, amountRaw] = lines[i].split(',').map((v) => v?.trim());
    const group = groupRaw as Group;
    const dayType = dayTypeRaw as typeof FESTIVE_NIGHT_TYPES[number];
    const shift = shiftRaw as ShiftType;
    const amount = Number(amountRaw?.replace(',', '.'));

    if (!GROUPS.includes(group)) continue;
    if (!FESTIVE_NIGHT_TYPES.includes(dayType)) continue;
    if (shift !== '20-02') continue;
    if (Number.isNaN(amount)) continue;

    rates[dayType][group] = Number(amount.toFixed(2));
  }

  return rates;
};
