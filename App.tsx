
import React, { useState, useEffect, useMemo } from 'react';
import { Group, ShiftEntry, ShiftType } from './types';
import { PROFESSIONAL_GROUPS } from './constants';
import { parseBulkText, calculateShiftTotal, getDayType } from './utils/parser';
import { parseSalaryTableCsv, parseFestiveNightRatesCsv } from './utils/salaryTable';
import appLogo from './assets/logo.png';
import salaryTableCsv from './tabla_salarios_base.csv?raw';

// --- FIREBASE SDK ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, collection, addDoc, onSnapshot, query, orderBy, 
  deleteDoc, doc, setDoc, getDoc, getDocs, writeBatch 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- CONFIGURACIN PARA EL PROYECTO: mi-sueldo-cpe ---
const firebaseConfig = {
  apiKey: "AIzaSyCHNvmk2M4Okno25TVS3b2AlmUOaDr5ubs",
  authDomain: "mi-sueldo-cpe.firebaseapp.com",
  projectId: "mi-sueldo-cpe",
  storageBucket: "mi-sueldo-cpe.firebasestorage.app",
  messagingSenderId: "157298631829",
  appId: "1:157298631829:web:da4eacab34bb86d6bbe79c"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const historyCollection = collection(db, "jornales_valencia");
const settingsDocRef = doc(db, "settings", "user_config");

type ThemeMode = 'light' | 'dark';

// --- COMPONENTES AUXILIARES ---

const ViewTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-6 px-1">
    <h2 className="text-2xl font-extrabold text-navy-950 dark:text-white tracking-tight">{title}</h2>
    {subtitle && <p className="text-xs font-semibold text-safety uppercase tracking-widest">{subtitle}</p>}
  </div>
);

const normalizeTerminal = (company?: string | null): string => {
  const cleaned = String(company || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  if (cleaned.includes('CSP IBERIAN VALENCIA TERMINAL') || cleaned.includes('CSP')) return 'CSP';
  if (
    cleaned.includes('MEDITERRANEAN SHIPPING C. TV') ||
    cleaned.includes('MEDITERRANEAN') ||
    cleaned.includes('MEDITERRANEAN SHIPPING') ||
    cleaned.includes('MSCTV') ||
    cleaned.includes('TV MSC') ||
    cleaned === 'MSC' ||
    cleaned.includes(' MSC')
  ) return 'MSC';
  if (cleaned.includes('APM')) return 'APM';
  if (cleaned.includes('VTE')) return 'VTE';

  return '';
};

const parseLocalYmd = (value: string): Date => {
  const [y, m, d] = String(value).split('-').map(Number);
  if (!y || !m || !d) return new Date(value);
  return new Date(y, m - 1, d);
};

const EditModal: React.FC<{ 
  entry: ShiftEntry, 
  onClose: () => void, 
  onSave: (updated: Partial<ShiftEntry>) => void 
}> = ({ entry, onClose, onSave }) => {
  const [date, setDate] = useState(entry.date);
  const [shift, setShift] = useState<ShiftType>(entry.shift);
  const [prod, setProd] = useState(entry.production.toString());
  const [label, setLabel] = useState(entry.label);
  const [group, setGroup] = useState<Group>(entry.group);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-navy-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-navy-900 w-full max-w-md rounded-[2rem] p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-300 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-black text-navy-950 dark:text-white uppercase tracking-tight">Editar Jornal</h3>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-navy-950 dark:hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Turno</label>
              <select value={shift} onChange={e => setShift(e.target.value as any)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20">
                <option value="02-08">02-08H</option><option value="08-14">08-14H</option><option value="14-20">14-20H</option><option value="20-02">20-02H</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Grupo</label>
              <select value={group} onChange={e => setGroup(e.target.value as Group)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20">
                {PROFESSIONAL_GROUPS.map(g => <option key={g} value={g}>Grupo {g}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Produccion (EUR)</label>
              <input type="number" step="0.01" value={prod} onChange={e => setProd(e.target.value)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20" />
            </div>
          </div>
          <button 
            onClick={() => onSave({ date, shift, production: Number(prod), label, group })}
            className="w-full bg-safety text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-safety/20 mt-4 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined">save</span> GUARDAR CAMBIOS
          </button>
        </div>
      </div>
    </div>
  );
};

const ShiftCard: React.FC<{ 
  entry: ShiftEntry, 
  currentIrpf: number,
  onDelete: (id: string) => void,
  onEdit: (entry: ShiftEntry) => void 
}> = ({ entry, currentIrpf, onDelete, onEdit }) => {
  const [showDetails, setShowDetails] = useState(false);
  const dateObj = parseLocalYmd(entry.date);
  const displayDayType = getDayType(entry.date);
  const monthNames = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const terminalCode = normalizeTerminal(entry.company);
  const grossTotal = Number(entry.total || 0);
  const netWithCurrentIrpf = Number((grossTotal * (1 - currentIrpf / 100)).toFixed(2));
  
  return (
    <div 
      className="bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-800 p-4 rounded-2xl flex flex-col shadow-sm group hover:border-safety/30 transition-all cursor-pointer active:scale-[0.99]"
      onClick={() => setShowDetails(!showDetails)}
    >
      <div className="flex items-center justify-between">
        <div className="flex gap-3 items-center">
          <div className="flex flex-col items-center justify-center bg-slate-100 dark:bg-navy-800 rounded-xl min-w-[44px] h-11 border border-slate-200 dark:border-navy-700">
            <span className="text-[8px] font-black text-slate-400 uppercase leading-none mb-0.5">{monthNames[dateObj.getMonth()]}</span>
            <span className="text-sm font-black text-navy-950 dark:text-white leading-none">{dateObj.getDate()}</span>
          </div>
          <div className="overflow-hidden">
            <h4 className="font-bold text-xs text-navy-950 dark:text-slate-200 tracking-tight truncate uppercase mb-0.5">{entry.label}</h4>
            <p className="text-[9px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-tighter">
              G.{entry.group} - {displayDayType} {terminalCode ? `- ${terminalCode}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-navy-950 dark:text-white font-black text-base leading-none">{grossTotal.toFixed(2)} EUR</p>
          <p className="text-emerald-500 font-black text-[11px] mt-1">{netWithCurrentIrpf.toFixed(2)} EUR NETO</p>
        </div>
      </div>
      
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-navy-800 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 dark:bg-navy-950 p-2 rounded-xl">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Base</p>
              <p className="text-xs font-bold text-navy-950 dark:text-white">{(entry.base || 0).toFixed(2)} EUR</p>
            </div>
            <div className="bg-slate-50 dark:bg-navy-950 p-2 rounded-xl">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Produccion</p>
              <p className="text-xs font-bold text-safety">{(entry.production || 0).toFixed(2)} EUR</p>
            </div>
          </div>
          {entry.ship && (
            <div className="bg-slate-50 dark:bg-navy-950 p-2 rounded-xl">
              <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Buque / Terminal</p>
              <p className="text-xs font-bold text-navy-950 dark:text-white truncate">{entry.ship} en {terminalCode || '-'}</p>
            </div>
          )}
          <div className="flex justify-between items-center px-1 pt-2">
            <span className="text-[9px] font-black text-slate-400 uppercase">IRPF {currentIrpf}%</span>
            <div className="flex items-center gap-4">
               <button 
                onClick={(e) => { e.stopPropagation(); onEdit(entry); }}
                className="text-navy-950 dark:text-white text-[10px] font-black uppercase flex items-center gap-1 hover:text-safety transition-colors"
              >
                <span className="material-symbols-outlined text-sm">edit</span> Editar
              </button>
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onDelete(entry.id); 
                }}
                className="text-red-500 text-[10px] font-black uppercase flex items-center gap-1 hover:text-red-700 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">delete</span> Borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- APP ---

const App: React.FC = () => {
  type PeriodFilter = 'Q1' | 'Q2' | 'MONTH';
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentQuincena: PeriodFilter = now.getDate() <= 15 ? 'Q1' : 'Q2';
  const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

  const [currentView, setCurrentView] = useState<'resumen' | 'historial' | 'perfil'>('resumen');
  const [entryMode, setEntryMode] = useState<'smart' | 'manual'>('smart');
  const [selectedGroup, setSelectedGroup] = useState<Group>('II');
  const [irpf, setIrpf] = useState<number>(15);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>(currentQuincena);
  const [history, setHistory] = useState<ShiftEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ShiftEntry | null>(null);
  const [inputText, setInputText] = useState('');
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualShift, setManualShift] = useState<ShiftType>('08-14');
  const [manualGroup, setManualGroup] = useState<Group>('II');
  const [manualProduction, setManualProduction] = useState('0');
  const [manualSpecialty, setManualSpecialty] = useState('Conductor de 1a');
  const [manualTerminal, setManualTerminal] = useState('CSP');
  const [manualShip, setManualShip] = useState('');
  const salaryTable = useMemo(() => parseSalaryTableCsv(salaryTableCsv), []);
  const festiveNightRates = useMemo(() => parseFestiveNightRatesCsv(salaryTableCsv, salaryTable), [salaryTable]);

  const recalculateHistoryIrpf = async (nextIrpf: number): Promise<number> => {
    const snapshot = await getDocs(historyCollection);
    if (snapshot.empty) return 0;

    const docs = snapshot.docs;
    const chunkSize = 450;
    let updatedCount = 0;

    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(db);
      const chunk = docs.slice(i, i + chunkSize);

      chunk.forEach((docSnap) => {
        const data = docSnap.data() as Partial<ShiftEntry>;
        const total = Number(data.total ?? ((Number(data.base) || 0) + (Number(data.production) || 0)));
        const net = Number((total * (1 - (nextIrpf / 100))).toFixed(2));

        batch.set(doc(db, "jornales_valencia", docSnap.id), {
          irpf: nextIrpf,
          net,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        updatedCount += 1;
      });

      await batch.commit();
    }

    return updatedCount;
  };
  
  // Cargar Ajustes y Jornales
  useEffect(() => {
    // 1. Cargar preferencias locales mientras llegan las de la nube
    const localIrpf = localStorage.getItem('estiba_irpf');
    const localGroup = localStorage.getItem('estiba_group') as Group;
    if (localIrpf) setIrpf(Number(localIrpf));
    if (localGroup) setSelectedGroup(localGroup);
    if (localGroup) setManualGroup(localGroup);

    const localTheme = localStorage.getItem('estiba_theme');
    if (localTheme === 'dark' || localTheme === 'light') {
      setTheme(localTheme);
    } else {
      setTheme('light');
    }

    // 2. Cargar preferencias de la nube (settings)
    getDoc(settingsDocRef).then((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const savedIrpf = Number(data.irpf);
        if (!Number.isNaN(savedIrpf)) setIrpf(savedIrpf);
        if (typeof data.group === 'string') setSelectedGroup(data.group as Group);
      }
    });

    // 3. Sincronizar Historial
    console.log("Sincronizando con MiSueldoCPE...");
    const q = query(historyCollection, orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Partial<ShiftEntry>;
        return {
          ...data,
          id: docSnap.id,
          total: Number(data.total ?? ((Number(data.base) || 0) + (Number(data.production) || 0))),
          net: Number(data.net ?? 0),
          irpf: Number(data.irpf ?? 0)
        } as ShiftEntry;
      });
      setHistory(entries);
      setIsLoading(false);
    }, (err) => {
      console.error("Error Firestore:", err.message);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('estiba_theme', theme);
  }, [theme]);

  useEffect(() => {
    setManualGroup(selectedGroup);
  }, [selectedGroup]);

  // Funcion para guardar ajustes en la nube
  const handleSaveSettings = async () => {
    setIsSettingsSaving(true);
    try {
      await setDoc(settingsDocRef, {
        irpf: irpf,
        group: selectedGroup,
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      localStorage.setItem('estiba_irpf', String(irpf));
      localStorage.setItem('estiba_group', selectedGroup);

      const updated = await recalculateHistoryIrpf(irpf);
      if (updated > 0) {
        alert(`Preferencias guardadas. Se recalcularon ${updated} jornales al ${irpf}% de IRPF.`);
      } else {
        alert('Preferencias guardadas en la nube.');
      }
    } catch (e: any) {
      alert('Error al guardar ajustes: ' + e.message);
    } finally {
      setIsSettingsSaving(false);
    }
  };

  const handleAddSmart = async () => {
    if (!inputText.trim()) return alert("Pega el texto del portal primero.");
    setIsSaving(true);
    try {
      const partials = parseBulkText(inputText, selectedGroup);
      if (partials.length === 0) {
        alert("No se han detectado jornales validos.");
        setIsSaving(false);
        return;
      }
      const saves = partials.map(p => {
        const fullEntry = calculateShiftTotal(p, irpf, salaryTable, festiveNightRates);
        if (fullEntry) return addDoc(historyCollection, fullEntry);
        return Promise.resolve(null);
      });
      await Promise.all(saves);
      alert(`Se han guardado ${partials.length} jornales!`);
      setInputText('');
      setCurrentView('historial');
    } catch (e: any) {
      alert("Error al guardar: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!docId || !confirm("Borrar este jornal de la nube?")) return;
    try {
      await deleteDoc(doc(db, "jornales_valencia", docId));
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  const handleUpdate = async (updated: Partial<ShiftEntry>) => {
    if (!editingEntry) return;
    const final = calculateShiftTotal({ ...editingEntry, ...updated }, irpf, salaryTable, festiveNightRates);
    if (final) {
      try {
        await setDoc(doc(db, "jornales_valencia", editingEntry.id), final, { merge: true });
        setEditingEntry(null);
      } catch (e) { alert("Error al actualizar"); }
    }
  };

  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    history.forEach((entry) => {
      const rawDate = String(entry.date || '');
      const match = rawDate.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!match) return;
      const monthKey = `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`;
      keys.add(monthKey);
    });
    const sorted = Array.from(keys).sort((a, b) => b.localeCompare(a));
    return sorted.length > 0 ? sorted : [currentMonthKey];
  }, [history, currentMonthKey]);

  const formatMonthLabel = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const monthIdx = Number(month) - 1;
    return `${monthNames[monthIdx] || month} ${year}`;
  };

  const handleAddManual = async () => {
    const production = Number(manualProduction.replace(',', '.'));
    if (!manualDate) return alert("Indica la fecha del jornal.");
    if (Number.isNaN(production)) return alert("La produccion no es valida.");

    const defaultLabel = `${manualShift} ${manualSpecialty.trim() || 'JORNAL MANUAL'}`.trim();
    const partial: Partial<ShiftEntry> = {
      date: manualDate,
      shift: manualShift,
      group: manualGroup,
      production,
      specialty: manualSpecialty.trim() || undefined,
      company: manualTerminal.trim() || undefined,
      ship: manualShip.trim() || undefined,
      label: defaultLabel
    };

    setIsSaving(true);
    try {
      const fullEntry = calculateShiftTotal(partial, irpf, salaryTable, festiveNightRates);
      if (!fullEntry) {
        alert("No se pudo calcular el jornal manual.");
        return;
      }

      await addDoc(historyCollection, fullEntry);
      alert("Jornal manual guardado.");
      setManualProduction('0');
      setManualSpecialty('Conductor de 1a');
      setManualShip('');
      setCurrentView('historial');
    } catch (e: any) {
      alert("Error al guardar manual: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const calculateTotals = (entries: ShiftEntry[]) => {
    return entries.reduce((acc, curr) => {
      const bruto = Number(curr.total || 0);
      return {
        bruto: acc.bruto + bruto,
        neto: acc.neto + (bruto * (1 - irpf / 100))
      };
    }, { bruto: 0, neto: 0 });
  };

  const getDateParts = (value: string): { monthKey: string | null; day: number | null } => {
    const match = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return { monthKey: null, day: null };
    return {
      monthKey: `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`,
      day: Number(match[3])
    };
  };

  const monthEntries = useMemo(() => {
    return history.filter((entry) => {
      const { monthKey } = getDateParts(String(entry.date || ''));
      return monthKey === selectedMonth;
    });
  }, [history, selectedMonth]);

  const firstHalfEntries = useMemo(() => {
    return monthEntries.filter((entry) => {
      const { day } = getDateParts(String(entry.date || ''));
      return day !== null && day <= 15;
    });
  }, [monthEntries]);

  const secondHalfEntries = useMemo(() => {
    return monthEntries.filter((entry) => {
      const { day } = getDateParts(String(entry.date || ''));
      return day !== null && day >= 16;
    });
  }, [monthEntries]);

  useEffect(() => {
    // Por defecto mantenemos el mes mas reciente con datos.
    if (monthOptions.length > 0 && !monthOptions.includes(selectedMonth)) {
      setSelectedMonth(monthOptions[0]);
    }
  }, [monthOptions, selectedMonth]);

  const periodEntries = useMemo(() => {
    if (selectedPeriod === 'MONTH') return monthEntries;
    if (selectedPeriod === 'Q1') return firstHalfEntries;
    return secondHalfEntries;
  }, [selectedPeriod, monthEntries, firstHalfEntries, secondHalfEntries]);

  const selectedTotals = useMemo(() => calculateTotals(periodEntries), [periodEntries, irpf]);
  const monthTotals = useMemo(() => calculateTotals(monthEntries), [monthEntries, irpf]);
  const firstHalfTotals = useMemo(() => calculateTotals(firstHalfEntries), [firstHalfEntries, irpf]);
  const secondHalfTotals = useMemo(() => calculateTotals(secondHalfEntries), [secondHalfEntries, irpf]);

  const selectedPeriodLabel = selectedPeriod === 'MONTH'
    ? 'MES COMPLETO'
    : selectedPeriod === 'Q1'
      ? '1A QUINCENA'
      : '2A QUINCENA';

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-navy-950 flex flex-col relative transition-colors font-sans overflow-x-hidden">
      
      {editingEntry && <EditModal entry={editingEntry} onClose={() => setEditingEntry(null)} onSave={handleUpdate} />}

      <header className="sticky top-0 z-50 bg-white dark:bg-navy-950/85 ios-blur border-b border-slate-200 dark:border-navy-900 px-5 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg shadow-safety/20 bg-white p-1">
            <img src={appLogo} alt="MiSueldoCPE" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-base font-bold text-navy-950 dark:text-white leading-none">MiSueldoCPE</h1>
            <p className="text-[9px] font-black text-safety uppercase tracking-widest mt-0.5">Valencia 2025</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
          <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">{isLoading ? 'Cargando' : 'Nube OK'}</span>
        </div>
      </header>

      <main className="flex-1 px-5 py-6 overflow-y-auto pb-32 custom-scrollbar">
        {currentView === 'resumen' && (
          <div className="space-y-6">
            <section className="bg-navy-950 dark:bg-navy-900 rounded-[2rem] p-7 shadow-2xl border border-navy-800">
               <div className="flex items-center justify-between gap-3 mb-4">
                 <label className="text-[9px] font-bold text-navy-400 uppercase tracking-widest opacity-70">Periodo resumen</label>
                 <select
                   value={selectedMonth}
                   onChange={(e) => setSelectedMonth(e.target.value)}
                   className="bg-navy-800 text-white text-[10px] font-black rounded-lg px-3 py-2 border border-navy-700"
                 >
                   {monthOptions.map((monthKey) => (
                     <option key={monthKey} value={monthKey}>{formatMonthLabel(monthKey)}</option>
                   ))}
                 </select>
               </div>

               <div className="grid grid-cols-3 gap-2 mb-4">
                 <button
                   onClick={() => setSelectedPeriod('Q1')}
                   className={`py-2 rounded-lg text-[9px] font-black transition-all ${selectedPeriod === 'Q1' ? 'bg-safety text-white' : 'bg-navy-800 text-navy-300'}`}
                 >
                   1A Q
                 </button>
                 <button
                   onClick={() => setSelectedPeriod('Q2')}
                   className={`py-2 rounded-lg text-[9px] font-black transition-all ${selectedPeriod === 'Q2' ? 'bg-safety text-white' : 'bg-navy-800 text-navy-300'}`}
                 >
                   2A Q
                 </button>
                 <button
                   onClick={() => setSelectedPeriod('MONTH')}
                   className={`py-2 rounded-lg text-[9px] font-black transition-all ${selectedPeriod === 'MONTH' ? 'bg-safety text-white' : 'bg-navy-800 text-navy-300'}`}
                 >
                   MES
                 </button>
               </div>

               <p className="text-[9px] font-bold text-navy-400 uppercase tracking-widest mb-1 opacity-70">{`Balance Neto ${selectedPeriodLabel} - ${formatMonthLabel(selectedMonth)}`}</p>
               <div className="flex items-baseline gap-1">
                 <h2 className="text-4xl font-black text-white tracking-tighter">{selectedTotals.neto.toFixed(2)}</h2>
                 <span className="text-xl font-bold text-safety">EUR</span>
               </div>
               <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-white/5">
                 <div>
                   <p className="text-[8px] font-bold text-navy-400 uppercase mb-0.5">Bruto Total</p>
                   <p className="text-base font-bold text-white">{selectedTotals.bruto.toFixed(2)} EUR</p>
                 </div>
                 <div>
                   <p className="text-[8px] font-bold text-navy-400 uppercase mb-0.5">Retencion IRPF</p>
                   <p className="text-base font-bold text-red-400">{(selectedTotals.bruto - selectedTotals.neto).toFixed(2)} EUR</p>
                 </div>
               </div>

               <div className="grid grid-cols-3 gap-2 mt-5 pt-5 border-t border-white/5">
                 <div className="bg-navy-800 rounded-xl p-2">
                   <p className="text-[8px] font-black text-navy-300 uppercase mb-1">Mes</p>
                   <p className="text-[11px] font-black text-white">{monthTotals.neto.toFixed(2)} EUR</p>
                 </div>
                 <div className="bg-navy-800 rounded-xl p-2">
                   <p className="text-[8px] font-black text-navy-300 uppercase mb-1">1A Quincena</p>
                   <p className="text-[11px] font-black text-white">{firstHalfTotals.neto.toFixed(2)} EUR</p>
                 </div>
                 <div className="bg-navy-800 rounded-xl p-2">
                   <p className="text-[8px] font-black text-navy-300 uppercase mb-1">2A Quincena</p>
                   <p className="text-[11px] font-black text-white">{secondHalfTotals.neto.toFixed(2)} EUR</p>
                 </div>
               </div>
            </section>

            <section className="bg-white dark:bg-navy-900 rounded-3xl p-5 border dark:border-navy-800 shadow-sm space-y-4">
              <div className="flex bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
                <button onClick={() => setEntryMode('smart')} className={`flex-1 py-2 text-[9px] font-black rounded-lg ${entryMode === 'smart' ? 'bg-white dark:bg-navy-700 text-navy-950 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}>CARGA INTELIGENTE</button>
                <button onClick={() => setEntryMode('manual')} className={`flex-1 py-2 text-[9px] font-black rounded-lg ${entryMode === 'manual' ? 'bg-white dark:bg-navy-700 text-navy-950 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}>MANUAL</button>
              </div>

              {entryMode === 'smart' ? (
                <div className="space-y-4">
                  <textarea 
                    value={inputText} 
                    onChange={e => setInputText(e.target.value)} 
                    className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-2xl p-4 text-xs h-40 resize-none placeholder:text-slate-400 focus:ring-1 ring-safety/30 font-mono" 
                    placeholder="Pega aqui una o varias lineas del portal..." 
                  />
                  <p className="text-[9px] text-slate-400 px-2 leading-relaxed">
                    Extrae automaticamente: Fecha, Turno, Especialidad, Empresa y Buque. 
                    Se calcula con tu IRPF actual ({irpf}%).
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Fecha</label>
                      <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Turno</label>
                      <select value={manualShift} onChange={e => setManualShift(e.target.value as ShiftType)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20">
                        <option value="02-08">02-08H</option><option value="08-14">08-14H</option><option value="14-20">14-20H</option><option value="20-02">20-02H</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Grupo</label>
                      <select value={manualGroup} onChange={e => setManualGroup(e.target.value as Group)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20">
                        {PROFESSIONAL_GROUPS.map(g => <option key={g} value={g}>Grupo {g}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Produccion (EUR)</label>
                      <input type="number" step="0.01" value={manualProduction} onChange={e => setManualProduction(e.target.value)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Especialidad</label>
                    <select value={manualSpecialty} onChange={e => setManualSpecialty(e.target.value)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20">
                      <option value="Conductor de 1a">Conductor de 1a</option>
                      <option value="Conductor de 2a">Conductor de 2a</option>
                      <option value="Especialista">Especialista</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Terminal</label>
                    <select value={manualTerminal} onChange={e => setManualTerminal(e.target.value)} className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm focus:ring-2 focus:ring-safety/20">
                      <option value="CSP">CSP</option>
                      <option value="MSC">MSC</option>
                      <option value="APM">APM</option>
                      <option value="VTE">VTE</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase ml-2">Buque</label>
                    <input type="text" value={manualShip} onChange={e => setManualShip(e.target.value)} placeholder="Nombre del buque" className="w-full bg-slate-50 dark:bg-navy-950 border-none rounded-xl p-3 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-safety/20" />
                  </div>

                </div>
              )}
              
              <button 
                onClick={entryMode === 'smart' ? handleAddSmart : handleAddManual}
                disabled={isSaving}
                className="w-full bg-navy-950 dark:bg-safety text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-xl shadow-safety/10 disabled:opacity-50"
              >
                <span className="material-symbols-outlined">{isSaving ? 'sync' : 'add_task'}</span>
                {isSaving ? 'GUARDANDO...' : 'GUARDAR JORNALES'}
              </button>
            </section>
          </div>
        )}

        {currentView === 'historial' && (
          <div className="space-y-4">
            <ViewTitle title="Mis Registros" />
            <div className="space-y-3">
              {history.map(entry => <ShiftCard key={entry.id} entry={entry} currentIrpf={irpf} onDelete={handleDelete} onEdit={setEditingEntry} />)}
              {history.length === 0 && !isLoading && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400 opacity-40">
                  <span className="material-symbols-outlined text-4xl mb-2">cloud_off</span>
                  <p className="text-[10px] font-black uppercase tracking-widest text-center leading-relaxed">Sin datos guardados</p>
                </div>
              )}
            </div>
          </div>
        )}

        {currentView === 'perfil' && (
          <div className="space-y-6">
            <ViewTitle title="Ajustes" subtitle="Configuracion de Cuenta" />
            <div className="bg-white dark:bg-navy-900 rounded-3xl p-6 border dark:border-navy-800 space-y-8 shadow-sm">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-300 uppercase tracking-widest ml-1">Tema</label>
                <div className="flex bg-slate-100 dark:bg-navy-800 rounded-xl p-1">
                  <button onClick={() => setTheme('light')} className={`flex-1 py-2 text-[10px] font-black rounded-lg ${theme === 'light' ? 'bg-white text-navy-950 shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}>CLARO</button>
                  <button onClick={() => setTheme('dark')} className={`flex-1 py-2 text-[10px] font-black rounded-lg ${theme === 'dark' ? 'bg-navy-700 text-white shadow-sm' : 'text-slate-500 dark:text-slate-300'}`}>OSCURO</button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tu Grupo Profesional</label>
                <div className="grid grid-cols-4 gap-2">
                  {PROFESSIONAL_GROUPS.map(g => (
                    <button 
                      key={g} 
                      onClick={() => setSelectedGroup(g)}
                      className={`py-3 rounded-xl font-black text-sm transition-all ${selectedGroup === g ? 'bg-safety text-white shadow-lg shadow-safety/20' : 'bg-slate-100 dark:bg-navy-800 text-slate-400'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IRPF aplicado (%)</label>
                  <span className="text-2xl font-black text-navy-950 dark:text-white">{irpf}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="45" 
                  value={irpf} 
                  onChange={e => setIrpf(Number(e.target.value))} 
                  className="w-full h-2 bg-slate-200 dark:bg-navy-800 rounded-lg appearance-none cursor-pointer accent-safety" 
                />
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleSaveSettings}
                  disabled={isSettingsSaving}
                  className="w-full bg-navy-950 dark:bg-navy-800 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-navy-950/20 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">{isSettingsSaving ? 'sync' : 'cloud_upload'}</span>
                  {isSettingsSaving ? 'SINCRONIZANDO...' : 'GUARDAR PREFERENCIAS'}
                </button>
                <p className="text-[9px] text-slate-400 text-center mt-3 uppercase font-bold tracking-widest">Al guardar, tus nuevos jornales usaran estos valores por defecto.</p>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-navy-950/95 ios-blur border-t border-slate-200 dark:border-navy-900 px-10 py-4 pb-10 flex justify-between items-center z-50">
        {[
          { id: 'resumen', icon: 'dashboard', label: 'Inicio' },
          { id: 'historial', icon: 'history', label: 'Registros' },
          { id: 'perfil', icon: 'settings', label: 'Ajustes' }
        ].map(item => (
          <button key={item.id} onClick={() => setCurrentView(item.id as any)} className={`flex flex-col items-center gap-0.5 transition-all ${currentView === item.id ? 'text-safety scale-110' : 'text-slate-500 dark:text-slate-300'}`}>
            <span className="material-symbols-outlined text-[30px] font-light">{item.icon}</span>
            <span className="text-[11px] font-black uppercase tracking-tight">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default App;
