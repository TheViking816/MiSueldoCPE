
export type Group = 'I' | 'II' | 'III' | 'IV';
export type DayType = 'LABORABLE' | 'SABADO' | 'FESTIVO';
export type ShiftType = '02-08' | '08-14' | '14-20' | '20-02';
export type FestiveNightTransition = 'FESTIVO_TO_LABORABLE' | 'FESTIVO_TO_FESTIVO';
export type JournalType = 'TUR' | 'NUD';

export interface SalaryRow {
  [key: string]: number;
}

export interface GroupSalaries {
  LABORABLE: Partial<Record<ShiftType, number>>;
  SABADO: Partial<Record<ShiftType, number>>;
  FESTIVO: Partial<Record<ShiftType, number>>;
}

export interface SalaryTable {
  I: GroupSalaries;
  II: GroupSalaries;
  III: GroupSalaries;
  IV: GroupSalaries;
}

export type FestiveNightRates = Record<FestiveNightTransition, Record<Group, number>>;

export interface ShiftEntry {
  id: string;
  date: string;
  group: Group;
  dayType: DayType;
  shift: ShiftType;
  base: number;
  production: number;
  total: number; // Bruto
  net: number;   // Neto tras IRPF
  irpf: number;  // % aplicado
  label: string; 
  specialty?: string;
  company?: string;
  ship?: string;
  journalType?: JournalType;
}
