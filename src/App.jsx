import { useState, useRef, useCallback, useEffect } from "react";
import { flushSync } from "react-dom";
import { supabase } from "./supabase.js";
import { loadTasks, loadTrash, trashTaskDB, restoreTaskDB, loadEvents, loadLists, addTaskDB, updateTaskDB, deleteTaskDB, addEventDB, updateEventDB, deleteEventDB, addListDB, updateListDB, deleteListDB, seedDefaultListsDB, loadAgents, addAgentDB, updateAgentDB, deleteAgentDB, loadShareLists, setShareLists, loadPersonColors, setPersonColorDB, removePersonColorDB } from "./db.js";
import { t, LANGUAGES, DAYS_BY_LANG, MONTHS_BY_LANG, MONTHS_SHORT_BY_LANG } from "./i18n.js";
import { createContext, useContext } from "react";
const LangContext = createContext('nl');
const useLang = () => useContext(LangContext);

const today = new Date();
const getTodayKey = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
};
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
const DAYS_NL = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
const MONTHS_NL = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const MONTHS_SHORT_NL = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00–21:00

function getWeekDates(base) {
  const d = new Date(base);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate()+i); return x; });
}

function formatDeadline(dk, lang) {
  if (!dk) return "—";
  const tk = getTodayKey();
  if (dk === tk) return t(lang || 'nl', 'today');
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  const tomKey = dateKey(tom);
  const yes = new Date(); yes.setDate(yes.getDate()-1);
  const yesKey = dateKey(yes);
  if (dk === tomKey) return t(lang || 'nl', 'tomorrow');
  if (dk === yesKey) return t(lang || 'nl', 'yesterday');
  const d = new Date(dk + "T12:00:00");
  const ms = MONTHS_SHORT_BY_LANG[lang] || MONTHS_SHORT_NL;
  return d.getDate() + " " + ms[d.getMonth()];
}

const PRIO_COLOR = { "": "#9ca3af", hoog: "#DC2626", midden: "#E6B400", laag: "#2563EB" };
const PRIO_BG    = { "": "#f3f4f6", hoog: "#FEE2E2", midden: "#FFF176", laag: "#DBEAFE" };
const STATUS_COLOR = { "": "#9ca3af", open: "#2563EB", bezig: "#E6B400", klaar: "#2563EB" };
const STATUS_BG    = { "": "#f3f4f6", open: "#DBEAFE", bezig: "#FFF176", klaar: "#DBEAFE" };
const EVENT_BG     = { blue: "#DBEAFE", red: "#FEE2E2", yellow: "#FFF176" };
const EVENT_BORDER = { blue: "#2563EB", red: "#DC2626", yellow: "#E6B400" };

// Secundaire kleuren — uitsluitend voor uitgenodigde personen (toegewezen in instellingen)
const PERSON_COLOR_KEYS = ["zwart", "oranje", "paars", "groen"];
const PERSON_COLORS = {
  zwart:  { dot: "#111827", bg: "#E5E7EB", border: "#111827", text: "#111827" },
  oranje: { dot: "#EA580C", bg: "#FFEDD5", border: "#EA580C", text: "#9A3412" },
  paars:  { dot: "#9333EA", bg: "#F3E8FF", border: "#9333EA", text: "#6B21A8" },
  groen:  { dot: "#16A34A", bg: "#DCFCE7", border: "#15803D", text: "#15803D" },
};

const pastDate    = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()-2));
const futureDate  = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()+5));

const DEFAULT_LISTS = [
  { id: "mine",       label: "Mijn taken",  color: "#2563EB" },
  { id: "school",     label: "School",      color: "#E6B400" },
  { id: "huishouden", label: "Huishouden",  color: "#DC2626" },
  { id: "werk",       label: "Werk",        color: "#DC2626" },
];

const HARDCODED_AGENTS = [
  { id: "bart",        name: "Bart",        role: "Centrale dispatcher",     model: "sonnet", emoji: "📬" },
  { id: "teacher",     name: "Teacher",     role: "Verbetert alle agents",   model: "opus",   emoji: "📚" },
  { id: "agent-maker", name: "Agent Maker", role: "Bouwt nieuwe agents",     model: "opus",   emoji: "🔨" },
  { id: "piet",        name: "Piet",        role: "Portfolio manager",        model: "opus",   emoji: "📈" },
  { id: "alex",        name: "Alex",        role: "Accountant & adviseur",   model: "sonnet", emoji: "💼" },
  { id: "dick",        name: "Dick",        role: "Advocaat",                model: "opus",   emoji: "⚖️" },
  { id: "scott",       name: "Scott",       role: "Verkenner & onderzoeker", model: "sonnet", emoji: "🔭" },
  { id: "ivo",         name: "Ivo",         role: "Tech & AI monitor",       model: "sonnet", emoji: "📡" },
  { id: "bram",        name: "Bram",        role: "Brand manager",           model: "sonnet", emoji: "✍️" },
  { id: "wes",         name: "Wes",         role: "Website manager",         model: "sonnet", emoji: "🌐" },
  { id: "baby",        name: "Baby",        role: "Ontwikkelingsagent",      model: "haiku",  emoji: "👶" },
  { id: "chris",       name: "Chris",       role: "Kritisch adviseur",       model: "opus",   emoji: "🎯" },
  { id: "handy",       name: "Handy",       role: "Tips & werkwijzen",       model: "haiku",  emoji: "💡" },
  { id: "stage",       name: "Stage",       role: "Stageplek zoeker",        model: "opus",   emoji: "🎓" },
];
const MODEL_BADGE_COLOR = { opus: "#7c3aed", sonnet: "#2563EB", haiku: "#059669" };

// Namespace voor gedeelde lijst-/taak-IDs zodat ze niet botsen met eigen IDs
const prefixSharedId = (ownerId, id) => `s:${ownerId}:${id}`;
const parseSharedId = (id) => {
  if (typeof id !== "string" || !id.startsWith("s:")) return null;
  const rest = id.slice(2); const c = rest.indexOf(":");
  if (c === -1) return null;
  return { ownerId: rest.slice(0, c), originalId: rest.slice(c + 1) };
};


// ── DATE PICKER ──────────────────────────────────────────────────────────────
function DatePicker({ value, onChange, onClose }) {
  const lang = useLang();
  const initial = value ? new Date(value + "T12:00:00") : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());
  const yearListRef = useRef(null);

  const years = Array.from({ length: 20 }, (_, i) => initial.getFullYear() - 5 + i);

  useEffect(() => {
    // Scroll year into view
    if (yearListRef.current) {
      const active = yearListRef.current.querySelector("[data-active='true']");
      if (active) active.scrollIntoView({ block: "center" });
    }
  }, []);

  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const firstDay = (y, m) => { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; };

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); };

  const selectDay = (day) => {
    const key = viewYear + "-" + String(viewMonth+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
    onChange(key);
    onClose();
  };

  const clearDate = () => { onChange(null); onClose(); };

  const days = daysInMonth(viewYear, viewMonth);
  const offset = firstDay(viewYear, viewMonth);
  const cells = Array(offset).fill(null).concat(Array.from({ length: days }, (_, i) => i + 1));
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedKey = value;
  const todayKey2 = getTodayKey();

  return (
    <div style={{ position:"absolute", zIndex:100, background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", width:260, padding:0, overflow:"hidden" }}
      onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", padding:"10px 12px 6px", borderBottom:"1px solid #f3f4f6" }}>
        <button onClick={prevMonth} style={{ background:"none", border:"none", cursor:"pointer", color:"#374151", fontSize:16, padding:"2px 6px" }}>‹</button>
        <div style={{ flex:1, textAlign:"center", fontSize:13, fontWeight:700, color:"#111827" }}>
          {MONTHS_BY_LANG[lang][viewMonth]} {viewYear}
        </div>
        <button onClick={nextMonth} style={{ background:"none", border:"none", cursor:"pointer", color:"#374151", fontSize:16, padding:"2px 6px" }}>›</button>
      </div>

      {/* Year scroll */}
      <div ref={yearListRef} style={{ display:"flex", gap:4, overflowX:"auto", padding:"6px 12px", borderBottom:"1px solid #f3f4f6", scrollbarWidth:"none" }}>
        {years.map(y => (
          <button key={y} data-active={y === viewYear ? "true" : "false"} onClick={() => setViewYear(y)} style={{
            flexShrink:0, padding:"2px 8px", borderRadius:4, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
            background: y === viewYear ? "#2563EB" : "#f3f4f6",
            color: y === viewYear ? "#fff" : "#6b7280"
          }}>{y}</button>
        ))}
      </div>

      {/* Day headers */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"6px 8px 2px" }}>
        {DAYS_BY_LANG[lang].map(d => (
          <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:"#9ca3af", padding:"2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"2px 8px 8px", gap:2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const key = viewYear + "-" + String(viewMonth+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
          const isSelected = key === selectedKey;
          const isToday = key === todayKey2;
          return (
            <button key={i} onClick={() => selectDay(day)} style={{
              textAlign:"center", fontSize:12, padding:"5px 2px", borderRadius:4, border:"none", cursor:"pointer",
              background: isSelected ? "#2563EB" : isToday ? "#DBEAFE" : "transparent",
              color: isSelected ? "#fff" : isToday ? "#2563EB" : "#111827",
              fontWeight: isSelected || isToday ? 700 : 400
            }}>{day}</button>
          );
        })}
      </div>

      {/* Clear */}
      <div style={{ borderTop:"1px solid #f3f4f6", padding:"6px 12px" }}>
        <button onClick={clearDate} style={{ fontSize:11, color:"#9ca3af", background:"none", border:"none", cursor:"pointer" }}>{t(lang, 'clearDate')}</button>
      </div>
    </div>
  );
}

// ── TASK PANEL ────────────────────────────────────────────────────────────────
function TaskPanel({ tasks, setTasks, trash, setTrash, lists, setLists, sharedLists = [], sharedTasks = [], personColors = {}, userId, panelWidth }) {
  const lang = useLang();
  const showSidebar = panelWidth > 400;
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [activeList, setActiveList] = useState("mine");
  const [fadingOut, setFadingOut] = useState({}); // id -> true when animating out
  const [frozenPrio, setFrozenPrio] = useState({}); // id -> priority used for sorting (lags real value while editing)
  const [prioSettling, setPrioSettling] = useState({}); // id -> true during the brief fade before re-sorting
  const prioTimers = useRef({}); // id -> debounce timeout handle
  const [datePickerOpen, setDatePickerOpen] = useState(null); // task id
  const [openNoteId, setOpenNoteId] = useState(null);
  const [noteValue, setNoteValue] = useState("");

  // Gedeelde lijst tonen in de kleur van de persoon (zo zie je meteen van wie)
  const listColor = (l) => (l.isShared ? (PERSON_COLORS[personColors[l.ownerEmail]]?.dot || l.color) : l.color);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [editingListName, setEditingListName] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editListValue, setEditListValue] = useState("");

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  const visibleTrash = trash.filter(t => new Date(t.completedAt) > oneMonthAgo);

  const isShared = sharedLists.some(l => l.id === activeList);
  const isTrash  = activeList === "trash";

  const allTasks = [...tasks.map(t => ({ ...t, list: t.list || "mine" })), ...sharedTasks];
  const visibleTasks = allTasks.filter(t => t.list === activeList);
  // Eerst op datum (vroegste boven, geen datum onderaan), dan binnen elke
  // datumgroep op prioriteit: hoog → midden → laag → geen prioriteit
  const PRIO_RANK = { hoog: 0, midden: 1, laag: 2, "": 3 };
  const sorted = [...visibleTasks].sort((a, b) => {
    if (a.deadline && b.deadline) {
      if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
    } else if (a.deadline && !b.deadline) return -1;
    else if (!a.deadline && b.deadline) return 1;
    // zelfde datum (of beide zonder datum) → op prioriteit.
    // frozenPrio houdt de oude positie vast terwijl je nog doorklikt.
    const pa = frozenPrio[a.id] !== undefined ? frozenPrio[a.id] : a.priority;
    const pb = frozenPrio[b.id] !== undefined ? frozenPrio[b.id] : b.priority;
    return (PRIO_RANK[pa] ?? 3) - (PRIO_RANK[pb] ?? 3);
  });

  // Bereken de volgende herhaal-deadline: altijd strikt ná vandaag
  const nextRecurDeadline = (currentDeadline, recurrence) => {
    const today = new Date(); today.setHours(0,0,0,0);
    let base = currentDeadline ? new Date(currentDeadline + 'T00:00:00') : new Date(today);
    base.setHours(0,0,0,0);
    const step = () => {
      if (recurrence === 'daily')    base.setDate(base.getDate() + 1);
      else if (recurrence === 'weekly')   base.setDate(base.getDate() + 7);
      else if (recurrence === 'biweekly') base.setDate(base.getDate() + 14);
      else if (recurrence === 'monthly')  base.setMonth(base.getMonth() + 1);
    };
    step();
    // Als de berekende datum nog steeds vandaag of in het verleden valt, spring naar morgen of later
    while (base <= today) step();
    return dateKey(base); // lokale datum, niet UTC — anders schuift de deadline een dag terug
  };

  const completeDone = (id) => {
    setFadingOut(f => ({ ...f, [id]: true }));
    setTimeout(() => {
      const task = tasks.find(t => t.id === id);
      if (task) {
        if (task.recurrence) {
          // Herhalende taak: niet naar de prullenbak, maar deadline opschuiven
          const newDeadline = nextRecurDeadline(task.deadline, task.recurrence);
          const updated = {
            ...task,
            status: '',
            deadline: newDeadline,
            lastCompletedAt: new Date().toISOString(),
          };
          updateTaskDB(updated);
          setTasks(t => t.map(x => x.id === id ? updated : x));
        } else {
          const completedAt = new Date().toISOString();
          trashTaskDB(id); // zacht verwijderen: blijft in Supabase met deleted_at
          setTrash(tr => [...tr, { ...task, completedAt }]);
          setTasks(t => t.filter(x => x.id !== id));
        }
      }
      setFadingOut(f => { const n = { ...f }; delete n[id]; return n; });
    }, 2000);
  };

  const restoreTask = (id) => {
    const task = visibleTrash.find(t => t.id === id);
    if (task) {
      restoreTaskDB(id); // zelfde rij terug, behoudt id/datum/prioriteit
      const { completedAt, ...restored } = task;
      setTasks(t => [...t, restored]);
      setTrash(tr => tr.filter(t => t.id !== id));
    }
  };

  const deleteForever = (id) => {
    deleteTaskDB(id); // definitief uit Supabase verwijderen
    setTrash(tr => tr.filter(t => t.id !== id));
  };

  const addTask = () => {
    if (!newTitle.trim()) return;
    const taskData = { title: newTitle.trim(), priority: "", status: "", deadline: null, list: activeList };
    addTaskDB(userId, taskData).then(saved => setTasks(t => [...t, saved]));
    setNewTitle(""); setAdding(false);
  };
  const remove = (id) => {
    deleteTaskDB(id);
    setTasks(t => t.filter(x => x.id !== id));
  };
  const cyclePrio = (id) => {
    const next = { "":"hoog", hoog:"midden", midden:"laag", laag:"" };
    setTasks(t => t.map(x => {
      if (x.id !== id) return x;
      const updated = { ...x, priority: next[x.priority] };
      updateTaskDB(updated);
      // Bevries de huidige (oude) sorteer-prioriteit zodat de taak op zijn
      // plek blijft staan terwijl je doorklikt — alleen de eerste klik in
      // een reeks legt het beginpunt vast.
      setFrozenPrio(f => (f[id] !== undefined ? f : { ...f, [id]: x.priority }));
      return updated;
    }));
    // Reset de debounce: pas ~2,5s na de láátste klik schuift de taak weg.
    if (prioTimers.current[id]) clearTimeout(prioTimers.current[id]);
    setPrioSettling(s => { if (!s[id]) return s; const n = { ...s }; delete n[id]; return n; });
    prioTimers.current[id] = setTimeout(() => {
      // Stap 1: laat de taak rustig vervagen op zijn oude plek.
      setPrioSettling(s => ({ ...s, [id]: true }));
      setTimeout(() => {
        // Stap 2: geef de echte prioriteit vrij → hij sorteert naar de nieuwe plek en komt weer op.
        setFrozenPrio(f => { const n = { ...f }; delete n[id]; return n; });
        setPrioSettling(s => { const n = { ...s }; delete n[id]; return n; });
        delete prioTimers.current[id];
      }, 450);
    }, 2500);
  };
  const cycleStatus = (id) => {
    const next = { "":"open", open:"bezig", bezig:"klaar", klaar:"" };
    setTasks(t => t.map(x => {
      if (x.id !== id) return x;
      const updated = { ...x, status: next[x.status] };
      updateTaskDB(updated);
      return updated;
    }));
  };
  const addList = () => {
    if (!newListName.trim()) return;
    const colors = ["#2563EB","#DC2626","#E6B400","#2563EB","#DC2626"];
    const color = colors[lists.length % colors.length];
    const id = "list_" + Date.now();
    const newList = { id, label: newListName.trim(), color };
    addListDB(userId, newList);
    setLists(l => [...l, newList]);
    setNewListName(""); setAddingList(false); setActiveList(id);
  };
  const deleteList = () => {
    if (lists.length <= 1) return;
    const tasksToDelete = tasks.filter(x => (x.list||"mine") === activeList);
    tasksToDelete.forEach(t => deleteTaskDB(t.id));
    deleteListDB(activeList);
    setLists(l => l.filter(x => x.id !== activeList));
    setTasks(t => t.filter(x => (x.list||"mine") !== activeList));
    setActiveList(lists.find(l => l.id !== activeList)?.id || "mine");
  };
  const startRename = () => {
    const label = lists.find(l => l.id===activeList)?.label || "";
    setEditListValue(label);
    setEditingListName(true);
  };
  const confirmRename = () => {
    if (!editListValue.trim()) { setEditingListName(false); return; }
    setLists(l => l.map(x => {
      if (x.id !== activeList) return x;
      const updated = { ...x, label: editListValue.trim() };
      updateListDB(updated);
      return updated;
    }));
    setEditingListName(false);
  };

  const activeColor = [...lists, ...sharedLists].find(l => l.id===activeList)?.color || "#2563EB";
  const activeLabel = isTrash ? t(lang, 'trash') : ([...lists, ...sharedLists].find(l => l.id===activeList)?.label || t(lang, 'tasks'));

  const COL = { name: 200, date: 100, prio: 88, status: 80, recur: 34, del: 28 };
  const TABLE_MIN = COL.name + COL.date + COL.prio + COL.recur + COL.del + 41;
  const cb = { borderRight: "1px solid #e5e7eb" };
  const prioLabel   = (p) => p==="hoog" ? t(lang,'prioHigh') : p==="midden" ? t(lang,'prioMid') : p==="laag" ? t(lang,'prioLow') : "—";
  const statusLabel = (s) => s==="open" ? t(lang,'statusOpen') : s==="bezig" ? t(lang,'statusBusy') : s==="klaar" ? t(lang,'statusDone') : "—";
  // Aantal kalenderdagen achterstand t.o.v. vandaag
  const overdueDaysCount = (deadline) => {
    if (!deadline) return 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const dl = new Date(deadline + 'T00:00:00');
    return Math.max(0, Math.round((today - dl) / 86400000));
  };

  return (
    <div style={{ display:"flex", height:"100%", background:"#ffffff" }}>
      <style>{`
        @keyframes fadeStrike { 0% { opacity:1; } 100% { opacity:0; } }
        .fading-task { animation: fadeStrike 2s ease forwards; text-decoration: line-through; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: showSidebar ? 160 : 0, flexShrink:0, background:"#18181b", display:"flex", flexDirection:"column", borderRight: showSidebar ? "1px solid #27272a" : "none", overflow:"hidden", transition:"width 1.5s ease" }}>
        <div style={{ padding:"16px 12px 8px", fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2 }}>{t(lang, 'myLists')}</div>
        {lists.map(l => (
          <div key={l.id} onClick={() => setActiveList(l.id)} style={{
            display:"flex", alignItems:"center", gap:8, padding:"7px 12px", cursor:"pointer", overflow:"hidden",
            background: activeList===l.id ? "#27272a" : "transparent",
            borderLeft: activeList===l.id ? "3px solid "+l.color : "3px solid transparent"
          }}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:l.color, flexShrink:0 }} />
            <span style={{ fontSize:12, color: activeList===l.id ? "#f4f4f5" : "#a1a1aa", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", minWidth:0, display:"block" }}>{l.label}</span>
          </div>
        ))}
        {addingList ? (
          <div style={{ padding:"6px 12px" }}>
            <input value={newListName} onChange={e => setNewListName(e.target.value)}
              onKeyDown={e => { if(e.key==="Enter") addList(); if(e.key==="Escape"){ setAddingList(false); setNewListName(""); } }}
              placeholder={t(lang, 'listNamePlaceholder')} autoFocus
              style={{ width:"100%", background:"#27272a", border:"none", borderBottom:"2px solid #2563EB", color:"#f4f4f5", fontSize:12, padding:"4px", outline:"none", boxSizing:"border-box" }} />
          </div>
        ) : (
          <div onClick={() => setAddingList(true)} style={{ padding:"6px 12px", fontSize:11, color:"#52525b", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            {t(lang, 'newList')}
          </div>
        )}

        {sharedLists.length > 0 && (
          <div style={{ padding:"14px 12px 8px", fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2, marginTop:8, borderTop:"1px solid #27272a" }}>
            <span>{t(lang, 'shared')}</span>
          </div>
        )}
        {sharedLists.map(l => {
          const c = listColor(l);
          return (
            <div key={l.id} onClick={() => setActiveList(l.id)} style={{
              display:"flex", alignItems:"center", gap:8, padding:"7px 12px", cursor:"pointer", overflow:"hidden",
              background: activeList===l.id ? "#27272a" : "transparent",
              borderLeft: activeList===l.id ? "3px solid "+c : "3px solid transparent"
            }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }} />
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:12, color: activeList===l.id ? "#f4f4f5" : "#a1a1aa", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{l.label}</div>
                <div style={{ fontSize:10, color:"#52525b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{(l.ownerEmail||"").split("@")[0]}</div>
              </div>
            </div>
          );
        })}

        {/* Trash — pinned to bottom */}
        <div style={{ flex:1 }} />
        <div onClick={() => setActiveList("trash")} style={{
          display:"flex", alignItems:"center", gap:8, padding:"10px 12px", cursor:"pointer", borderTop:"1px solid #27272a",
          background: activeList==="trash" ? "#27272a" : "transparent",
          borderLeft: activeList==="trash" ? "3px solid #6b7280" : "3px solid transparent"
        }}>
          <span style={{ fontSize:14 }}>🗑</span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12, color: activeList==="trash" ? "#f4f4f5" : "#71717a" }}>{t(lang, 'trash')}</div>
            {visibleTrash.length > 0 && <div style={{ fontSize:10, color:"#52525b" }}>{visibleTrash.length} {t(lang, 'completed')}</div>}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }} onClick={() => setDatePickerOpen(null)}>
        <div style={{ padding:"14px 16px 10px", borderBottom:"1px solid #e5e7eb", flexShrink:0, display:"flex", alignItems:"center", gap:10, position:"relative" }}>
          {isTrash ? <span style={{ fontSize:16 }}>🗑</span> : (
            <div style={{ position:"relative" }}>
              <div onClick={() => !isTrash && !isShared && setShowColorPicker(p => !p)}
                style={{ width:14, height:14, borderRadius:"50%", background:activeColor, cursor: !isTrash && !isShared ? "pointer" : "default", flexShrink:0 }} />
              {showColorPicker && !isTrash && !isShared && (
                <div style={{ position:"absolute", top:20, left:0, background:"#fff", border:"1px solid #e5e7eb", borderRadius:6, padding:"8px", display:"flex", gap:8, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", zIndex:20 }}>
                  {["#2563EB","#DC2626","#E6B400"].map(hex => (
                    <div key={hex} onClick={() => { setLists(l => l.map(x => { if (x.id!==activeList) return x; const u={...x,color:hex}; updateListDB(u); return u; })); setShowColorPicker(false); }}
                      style={{ width:18, height:18, borderRadius:"50%", background:hex, cursor:"pointer", border: activeColor===hex ? "3px solid #111827" : "2px solid transparent", boxSizing:"border-box" }} />
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Editable title — only for own lists */}
          {!isTrash && !isShared && editingListName ? (
            <input value={editListValue} onChange={e => setEditListValue(e.target.value)} autoFocus
              onKeyDown={e => { if(e.key==="Enter") confirmRename(); if(e.key==="Escape") setEditingListName(false); }}
              onBlur={confirmRename}
              style={{ fontFamily:"'DM Sans', sans-serif", fontSize:17, fontWeight:700, color:"#111827", border:"none", borderBottom:"2px solid #2563EB", outline:"none", background:"transparent", padding:"0 2px", minWidth:40, maxWidth:200 }} />
          ) : (
            <div onClick={() => { if(!isTrash && !isShared) { setShowColorPicker(false); startRename(); } }}
              style={{ fontFamily:"'DM Sans', sans-serif", fontSize:17, fontWeight:700, color:"#111827", cursor: !isTrash && !isShared ? "text" : "default" }}>
              {activeLabel}
            </div>
          )}
          {isShared && <span style={{ fontSize:10, background:"#f3f4f6", color:"#6b7280", borderRadius:4, padding:"2px 6px", fontWeight:700 }}>{t(lang, 'sharedBadge')}</span>}
          {isTrash && <span style={{ fontSize:11, color:"#9ca3af", marginLeft:4 }}>{t(lang, 'trashAutoDelete')}</span>}
          {!isTrash && !isShared && lists.length > 1 && (
            <button onClick={deleteList} title={t(lang, 'deleteList')}
              style={{ marginLeft:"auto", background:"none", border:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, lineHeight:1, padding:"2px 4px", borderRadius:3 }}
              onMouseEnter={e => e.currentTarget.style.color="#DC2626"}
              onMouseLeave={e => e.currentTarget.style.color="#d1d5db"}>
              🗑
            </button>
          )}
        </div>

        {/* TRASH VIEW */}
        {isTrash ? (
          <div style={{ flex:1, overflowY:"auto" }}>
            {visibleTrash.length === 0 ? (
              <div style={{ padding:"40px 24px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>{t(lang, 'trashEmpty')}</div>
            ) : (
              <div style={{ minWidth:TABLE_MIN }}>
                <div style={{ display:"flex", alignItems:"stretch", borderBottom:"2px solid #e5e7eb", background:"#f9fafb", position:"sticky", top:0, zIndex:5 }}>
                  <div style={{ width:COL.name+41, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>{t(lang, 'colName')}</div>
                  <div style={{ width:COL.date, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>{t(lang, 'colCompletedOn')}</div>
                  <div style={{ width:COL.prio, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", textAlign:"center", ...cb, background:"#f9fafb" }}>{t(lang, 'colPriority')}</div>
                  <div style={{ flex:1, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", background:"#f9fafb" }}>{t(lang, 'colActions')}</div>
                </div>
                {[...visibleTrash].sort((a,b) => b.completedAt > a.completedAt ? 1 : -1).map(task => {
                  const d = new Date(task.completedAt);
                  const completedStr = d.getDate() + " " + (MONTHS_SHORT_BY_LANG[lang] || MONTHS_SHORT_NL)[d.getMonth()];
                  return (
                    <div key={task.id} style={{ display:"flex", alignItems:"center", borderBottom:"1px solid #f3f4f6", background:"#fff" }}
                      onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                      onMouseLeave={e => e.currentTarget.style.background="#fff"}>
                      <div style={{ width:41, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", ...cb, alignSelf:"stretch" }}>
                        <div style={{ width:15, height:15, borderRadius:"50%", background:"#2563EB", border:"2px solid #2563EB", flexShrink:0 }} />
                      </div>
                      <div style={{ width:COL.name, flexShrink:0, fontSize:13, color:"#6b7280", padding:"8px 10px", textDecoration:"line-through", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", ...cb }}>{task.title}</div>
                      <div style={{ width:COL.date, flexShrink:0, fontSize:12, color:"#6b7280", padding:"8px 10px", ...cb }}>{completedStr}</div>
                      <div style={{ width:COL.prio, flexShrink:0, display:"flex", justifyContent:"center", padding:"8px 6px", ...cb }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:4, background:PRIO_BG[task.priority], color:PRIO_COLOR[task.priority] }}>{prioLabel(task.priority)}</span>
                      </div>
                      <div style={{ flex:1, display:"flex", alignItems:"center", gap:8, padding:"8px 10px" }}>
                        <button onClick={() => restoreTask(task.id)} style={{ fontSize:11, background:"#2563EB", color:"#fff", border:"none", borderRadius:3, padding:"3px 10px", cursor:"pointer", fontWeight:700 }}>{t(lang, 'restore')}</button>
                        <button onClick={() => deleteForever(task.id)} style={{ fontSize:11, background:"none", color:"#DC2626", border:"1px solid #DC2626", borderRadius:3, padding:"3px 10px", cursor:"pointer" }}>{t(lang, 'deleteForever')}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* NORMAL TASK VIEW */
          <div style={{ flex:1, overflowY:"auto", overflowX:"auto" }}>
            <div style={{ minWidth:TABLE_MIN }}>
              <div style={{ display:"flex", alignItems:"stretch", borderBottom:"2px solid #e5e7eb", background:"#f9fafb", position:"sticky", top:0, zIndex:5 }}>
                <div style={{ width:COL.name+41, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>{t(lang, 'colName')}</div>
                <div style={{ width:COL.date, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>{t(lang, 'colDeadline')}</div>
                <div style={{ width:COL.prio, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", textAlign:"center", ...cb, background:"#f9fafb" }}>{t(lang, 'colPriority')}</div>
                <div style={{ width:COL.recur, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 4px", textAlign:"center", ...cb, background:"#f9fafb" }}>{t(lang, 'recurCol')}</div>
                <div style={{ width:COL.del, flexShrink:0, background:"#f9fafb" }} />
              </div>
              {sorted.map(task => {
                const tk = getTodayKey();
                const dlColor = !task.deadline ? "#9ca3af" : task.deadline < tk ? "#DC2626" : task.deadline===tk ? "#2563EB" : "#111827";
                const dlWeight = task.deadline && task.deadline <= tk ? 700 : 400;
                const isFading = fadingOut[task.id];
                const isSettling = prioSettling[task.id];
                return (
                  <div key={task.id} className={isFading ? "fading-task" : ""}
                    style={{ borderBottom:"1px solid #f3f4f6", background:"#fff", opacity: isSettling ? 0.25 : 1, transition:"opacity 0.45s ease" }}
                    onMouseEnter={e => { if(!isFading) e.currentTarget.firstChild.style.background="#f9fafb"; }}
                    onMouseLeave={e => { if(e.currentTarget.firstChild) e.currentTarget.firstChild.style.background="#fff"; }}>
                    <div style={{ display:"flex", alignItems:"center", background:"inherit" }}>
                    <div style={{ width:41, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", ...cb, alignSelf:"stretch" }}>
                      <button onClick={() => !isShared && completeDone(task.id)} style={{ width:15, height:15, borderRadius:"50%", cursor: isShared ? "default" : "pointer", border:"2px solid #d1d5db", background:"transparent", flexShrink:0 }} />
                    </div>
                    <div onClick={() => { if(!isShared) { const next = openNoteId===task.id ? null : task.id; setOpenNoteId(next); if(next) setNoteValue(task.note||""); } }}
                      style={{ width:COL.name, flexShrink:0, fontSize:13, color:"#111827", padding:"8px 10px", textDecoration: isFading ? "line-through" : "none", opacity: isFading ? 0.4 : 1, overflow: openNoteId===task.id ? "visible" : "hidden", textOverflow: openNoteId===task.id ? "clip" : "ellipsis", whiteSpace: openNoteId===task.id ? "normal" : "nowrap", cursor: isShared ? "default" : "pointer", ...cb, display:"flex", alignItems: openNoteId===task.id ? "flex-start" : "center", gap:5 }}>
                      <span style={{ overflow: openNoteId===task.id ? "visible" : "hidden", textOverflow: openNoteId===task.id ? "clip" : "ellipsis", whiteSpace: openNoteId===task.id ? "normal" : "nowrap" }}>{task.title}</span>
                      {task.note && <span title="Notitie aanwezig" style={{ flexShrink:0, fontSize:10, color:"#9ca3af" }}>📝</span>}
                    </div>
                    <div style={{ width:COL.date, flexShrink:0, fontSize:12, padding:"8px 10px", color:dlColor, fontWeight:dlWeight, ...cb, cursor:"pointer", position:"relative" }}
                      onClick={e => { e.stopPropagation(); if(!isShared && !isFading) setDatePickerOpen(datePickerOpen===task.id ? null : task.id); }}>
                      {formatDeadline(task.deadline, lang)}
                      {task.recurrence && task.deadline && task.deadline < getTodayKey() && (
                        <span title={overdueDaysCount(task.deadline) + ' ' + t(lang, 'overdueDays')} style={{ marginLeft:4, fontSize:9, color:"#DC2626", fontWeight:700 }}>
                          {'· ' + overdueDaysCount(task.deadline) + 'd'}
                        </span>
                      )}
                      {datePickerOpen === task.id && (
                        <DatePicker
                          value={task.deadline}
                          onChange={(dk) => setTasks(t => t.map(x => { if (x.id!==task.id) return x; const u={...x,deadline:dk}; updateTaskDB(u); return u; }))}
                          onClose={() => setDatePickerOpen(null)}
                        />
                      )}
                    </div>
                    <div style={{ width:COL.prio, flexShrink:0, display:"flex", justifyContent:"center", padding:"8px 6px", ...cb }}>
                      <span onClick={() => !isShared && cyclePrio(task.id)} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:4, cursor: isShared ? "default" : "pointer", background:PRIO_BG[task.priority], color:PRIO_COLOR[task.priority], userSelect:"none" }}>{prioLabel(task.priority)}</span>
                    </div>
                    <div
                      title={t(lang, task.recurrence ? 'recur' + task.recurrence.charAt(0).toUpperCase() + task.recurrence.slice(1) : 'recurNone')}
                      onClick={() => { if (!isShared && !isFading) {
                        const cycle = { null: 'daily', daily: 'weekly', weekly: 'biweekly', biweekly: 'monthly', monthly: null };
                        const next = cycle[task.recurrence || 'null'] !== undefined ? cycle[task.recurrence || 'null'] : null;
                        const updated = { ...task, recurrence: next || null };
                        updateTaskDB(updated);
                        setTasks(t => t.map(x => x.id === task.id ? updated : x));
                      }}}
                      style={{ width:COL.recur, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", ...cb, cursor: isShared ? "default" : "pointer", userSelect:"none", padding:"4px 2px" }}>
                      <span style={{ fontSize:13, color: task.recurrence ? "#2563EB" : "#d4d4d8", lineHeight:1 }}>↻</span>
                      {task.recurrence && (
                        <span style={{ fontSize:8, color:"#2563EB", lineHeight:1, marginTop:1 }}>
                          {t(lang, 'recur' + task.recurrence.charAt(0).toUpperCase() + task.recurrence.slice(1) + 'Short')}
                        </span>
                      )}
                    </div>
                    <div style={{ width:COL.del, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {!isShared && <button onClick={() => remove(task.id)} style={{ background:"none", border:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, lineHeight:1 }}>x</button>}
                    </div>
                    </div>
                    {openNoteId === task.id && !isShared && (
                      <div style={{ padding:"6px 12px 10px 52px", borderTop:"1px solid #f3f4f6", background:"#fafafa" }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#111827", marginBottom:6, wordBreak:"break-word", lineHeight:1.4 }}>{task.title}</div>
                        <textarea
                          autoFocus
                          value={noteValue}
                          onChange={e => setNoteValue(e.target.value)}
                          onBlur={() => { setTasks(t => t.map(x => { if (x.id!==task.id) return x; const u={...x,note:noteValue}; updateTaskDB(u); return u; })); }}
                          placeholder={t(lang, 'notePlaceholder')}
                          rows={2}
                          style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"6px 8px", fontSize:12, outline:"none", resize:"none", color:"#374151", background:"#fff", fontFamily:"'DM Sans', sans-serif", boxSizing:"border-box", display:"block" }}
                        />
                        <button onClick={() => { setTasks(t => t.map(x => { if (x.id!==task.id) return x; const u={...x,note:noteValue}; updateTaskDB(u); return u; })); setOpenNoteId(null); }}
                          style={{ marginTop:5, background:"#2563EB", color:"#fff", border:"none", borderRadius:3, padding:"3px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          {t(lang, 'save')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!isShared && (adding ? (
                <div style={{ display:"flex", alignItems:"center", borderBottom:"1px solid #f3f4f6" }}>
                  <div style={{ width:41, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", ...cb, padding:"8px 0" }}>
                    <div style={{ width:15, height:15, borderRadius:"50%", border:"2px solid #d1d5db" }} />
                  </div>
                  <div style={{ width:COL.name, flexShrink:0, padding:"6px 10px", ...cb }}>
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if(e.key==="Enter") addTask(); if(e.key==="Escape"){ setAdding(false); setNewTitle(""); } }}
                      placeholder={t(lang, 'taskNamePlaceholder')} autoFocus
                      style={{ width:"100%", border:"none", borderBottom:"2px solid "+activeColor, fontSize:13, outline:"none", padding:"2px 0", color:"#111827" }} />
                  </div>
                  <div style={{ flex:1, padding:"6px 10px", display:"flex", gap:8, alignItems:"center" }}>
                    <button onClick={addTask} style={{ fontSize:11, background:activeColor, color:"#fff", border:"none", borderRadius:3, padding:"3px 8px", cursor:"pointer" }}>{t(lang, 'addBtn')}</button>
                    <button onClick={() => { setAdding(false); setNewTitle(""); }} style={{ fontSize:11, background:"none", color:"#9ca3af", border:"none", cursor:"pointer" }}>{t(lang, 'cancel')}</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => setAdding(true)} style={{ padding:"7px 12px 8px 52px", fontSize:12, color:"#9ca3af", cursor:"pointer", borderBottom:"1px solid #f3f4f6" }}
                  onMouseEnter={e => { e.currentTarget.style.color=activeColor; e.currentTarget.style.background="#f9fafb"; }}
                  onMouseLeave={e => { e.currentTarget.style.color="#9ca3af"; e.currentTarget.style.background="transparent"; }}>
                  {t(lang, 'addTask')}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CALENDAR PANEL ────────────────────────────────────────────────────────────
function CalendarPanel({ events, setEvents, tasks, sharedEvents = [], personColors = {}, invitees = [], userId, panelWidth }) {
  const lang = useLang();
  const showSidebar = panelWidth > 400;
  const NEUTRAL_PERSON = { dot: "#9ca3af", bg: "#F3F4F6", border: "#9ca3af", text: "#6b7280" };
  const personStyle = (email) => PERSON_COLORS[personColors[email]] || NEUTRAL_PERSON;
  const [modalSharedWith, setModalSharedWith] = useState([]);
  const [editSharedWith, setEditSharedWith]   = useState([]);
  const toggleIn = (arr, v) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];
  const [weekBase, setWeekBase] = useState(new Date(today));
  const [adding, setAdding] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const weekDates = getWeekDates(weekBase);

  const prevWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate()-7); setWeekBase(d); };
  const nextWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate()+7); setWeekBase(d); };

  const goToMonth = (monthIdx) => {
    const d = new Date(weekBase);
    d.setMonth(monthIdx);
    d.setDate(1);
    setWeekBase(d);
    setMonthPickerOpen(false);
  };

  const goToYear = (year) => {
    const d = new Date(weekBase);
    d.setFullYear(year);
    setWeekBase(d);
    setYearPickerOpen(false);
  };

  const currentMonth = weekDates[0].getMonth();
  const currentYear  = weekDates[0].getFullYear();
  const yearRange    = Array.from({ length: 30 }, (_, i) => currentYear - 10 + i);

  const [myAgendas, setMyAgendas] = useState([
    { id: "rinse", label: "Rinse N", color: "#2563EB", on: true },
  ]);
  const [otherAgendas, setOtherAgendas] = useState([]);
  const [myOpen, setMyOpen]     = useState(true);
  const [otherOpen, setOtherOpen] = useState(true);
  const [addingAgenda, setAddingAgenda] = useState(false);
  const [newAgendaName, setNewAgendaName] = useState("");

  const toggleAgenda = (id, list, setter) =>
    setter(list.map(a => a.id===id ? { ...a, on: !a.on } : a));

  const addAgenda = () => {
    if (!newAgendaName.trim()) return;
    const colors = ["#2563EB","#DC2626","#E6B400"];
    const color = colors[otherAgendas.length % 3];
    setOtherAgendas(a => [...a, { id: "agenda_"+Date.now(), label: newAgendaName.trim(), color, on: true }]);
    setNewAgendaName(""); setAddingAgenda(false);
  };

  const [modalNote, setModalNote] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editNote, setEditNote] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStartH, setEditStartH] = useState(9);
  const [editStartM, setEditStartM] = useState(0);
  const [editEndH, setEditEndH] = useState(10);
  const [editEndM, setEditEndM] = useState(0);
  const [editColor, setEditColor] = useState('blue');
  const [modalColor, setModalColor] = useState('blue');
  const [modalStartH, setModalStartH] = useState(9);
  const [modalStartM, setModalStartM] = useState(0);
  const [modalEndH,   setModalEndH]   = useState(10);
  const [modalEndM,   setModalEndM]   = useState(0);

  const openAdding = (date, hour) => {
    setAdding({ date, hour });
    setModalStartH(hour);
    setModalStartM(0);
    setModalEndH(hour + 1);
    setModalEndM(0);
    setNewTitle("");
    setModalNote("");
    setModalColor("blue");
    setModalSharedWith([]);
  };

  const addEvent = () => {
    if (!newTitle.trim() || !adding) return;
    const eventData = { title: newTitle.trim(), note: modalNote.trim(), date: adding.date, startH: modalStartH, startM: modalStartM, endH: modalEndH, endM: modalEndM, color: modalColor, shared: modalSharedWith.length > 0, sharedWith: modalSharedWith };
    addEventDB(userId, eventData).then(saved => setEvents(ev => [...ev, saved]));
    setNewTitle(""); setAdding(null);
  };

  const TimeSelect = ({ h, m, onChangeH, onChangeM }) => (
    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
      <select value={h} onChange={e => onChangeH(Number(e.target.value))}
        style={{ border:"1px solid #e5e7eb", borderRadius:4, padding:"4px 6px", fontSize:13, outline:"none", cursor:"pointer", background:"#fff" }}>
        {Array.from({ length: 24 }, (_, i) => (
          <option key={i} value={i}>{pad(i)}</option>
        ))}
      </select>
      <span style={{ color:"#6b7280", fontWeight:700 }}>:</span>
      <select value={m} onChange={e => onChangeM(Number(e.target.value))}
        style={{ border:"1px solid #e5e7eb", borderRadius:4, padding:"4px 6px", fontSize:13, outline:"none", cursor:"pointer", background:"#fff" }}>
        {[0,15,30,45].map(min => (
          <option key={min} value={min}>{pad(min)}</option>
        ))}
      </select>
    </div>
  );

  const HOUR_H = 52;
  // Hele-dag-afspraak: omspant (vrijwel) het hele zichtbare raster → toon als
  // smalle band over de volle hoogte i.p.v. een blok dat buiten beeld begint.
  const evMin = (h, m) => h * 60 + m;
  const isAllDay = (e) => evMin(e.startH, e.startM) <= HOURS[0] * 60 && evMin(e.endH, e.endM) >= (HOURS[HOURS.length - 1] + 1) * 60;
  const openEvent = (ev) => { setSelectedEvent(ev); setEditNote(ev.note || ""); setEditMode(false); setEditTitle(ev.title); setEditStartH(ev.startH); setEditStartM(ev.startM); setEditEndH(ev.endH); setEditEndM(ev.endM); setEditColor(ev.color || 'blue'); setEditSharedWith(ev.sharedWith || []); };

  return (
    <div style={{ display:"flex", height:"100%", background:"#ffffff" }}>

      {/* Sidebar */}
      <div style={{ width: showSidebar ? 160 : 0, flexShrink:0, background:"#18181b", display:"flex", flexDirection:"column", borderRight: showSidebar ? "1px solid #27272a" : "none", overflow:"hidden", transition:"width 1.5s ease" }}>

        {/* Maken knop */}
        <div style={{ padding:"14px 12px 10px" }}>
          <button onClick={() => openAdding(getTodayKey(), 9)} style={{ width:"100%", background:"#27272a", border:"none", borderRadius:5, color:"#f4f4f5", fontSize:12, fontWeight:700, padding:"8px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
            onMouseEnter={e => e.currentTarget.style.background="#3f3f46"}
            onMouseLeave={e => e.currentTarget.style.background="#27272a"}>
            {t(lang, 'make')}
          </button>
        </div>

        {/* Mijn agenda's */}
        <div style={{ borderTop:"1px solid #27272a" }}>
          <div onClick={() => setMyOpen(o => !o)} style={{ padding:"10px 12px 6px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2 }}>{t(lang, 'myCalendars')}</span>
            <span style={{ fontSize:10, color:"#52525b" }}>{myOpen ? "▲" : "▼"}</span>
          </div>
          {myOpen && myAgendas.map(a => (
            <div key={a.id} onClick={() => toggleAgenda(a.id, myAgendas, setMyAgendas)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", cursor:"pointer" }}
              onMouseEnter={e => e.currentTarget.style.background="#27272a"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              <div style={{ width:13, height:13, borderRadius:3, border:"2px solid "+a.color, background: a.on ? a.color : "transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {a.on && <span style={{ color:"#fff", fontSize:9, lineHeight:1, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:12, color: a.on ? "#f4f4f5" : "#52525b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{a.label}</span>
            </div>
          ))}
        </div>

        {/* Andere agenda's */}
        <div style={{ borderTop:"1px solid #27272a", marginTop:4 }}>
          <div onClick={() => setOtherOpen(o => !o)} style={{ padding:"10px 12px 6px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2 }}>{t(lang, 'otherCalendars')}</span>
            <span style={{ fontSize:10, color:"#52525b" }}>{otherOpen ? "▲" : "▼"}</span>
          </div>
          {otherOpen && otherAgendas.map(a => (
            <div key={a.id} onClick={() => toggleAgenda(a.id, otherAgendas, setOtherAgendas)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", cursor:"pointer" }}
              onMouseEnter={e => e.currentTarget.style.background="#27272a"}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              <div style={{ width:13, height:13, borderRadius:3, border:"2px solid "+a.color, background: a.on ? a.color : "transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                {a.on && <span style={{ color:"#fff", fontSize:9, lineHeight:1, fontWeight:700 }}>✓</span>}
              </div>
              <span style={{ fontSize:12, color: a.on ? "#f4f4f5" : "#52525b", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{a.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main calendar area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"14px 16px 10px", borderBottom:"1px solid #e5e7eb", position:"relative" }} onClick={() => { setMonthPickerOpen(false); setYearPickerOpen(false); }}>

        {/* Month picker */}
        <div style={{ position:"relative" }}>
          <span onClick={e => { e.stopPropagation(); setMonthPickerOpen(o => !o); setYearPickerOpen(false); }}
            style={{ fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#111827", cursor:"pointer", borderBottom: monthPickerOpen ? "2px solid #2563EB" : "2px solid transparent", paddingBottom:1 }}>
            {MONTHS_BY_LANG[lang][currentMonth]}
          </span>
          {monthPickerOpen && (
            <div onClick={e => e.stopPropagation()} style={{ position:"absolute", top:"110%", left:0, zIndex:50, background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", width:140, maxHeight:260, overflowY:"auto", padding:"4px 0" }}>
              {MONTHS_BY_LANG[lang].map((m, i) => (
                <div key={i} onClick={() => goToMonth(i)} style={{
                  padding:"7px 14px", fontSize:13, cursor:"pointer",
                  fontWeight: i===currentMonth ? 700 : 400,
                  background: i===currentMonth ? "#DBEAFE" : "transparent",
                  color: i===currentMonth ? "#2563EB" : "#111827"
                }}
                  onMouseEnter={e => { if(i!==currentMonth) e.currentTarget.style.background="#f9fafb"; }}
                  onMouseLeave={e => { if(i!==currentMonth) e.currentTarget.style.background="transparent"; }}>
                  {m}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Year picker */}
        <div style={{ position:"relative" }}>
          <span onClick={e => { e.stopPropagation(); setYearPickerOpen(o => !o); setMonthPickerOpen(false); }}
            style={{ fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#111827", cursor:"pointer", borderBottom: yearPickerOpen ? "2px solid #2563EB" : "2px solid transparent", paddingBottom:1 }}>
            {currentYear}
          </span>
          {yearPickerOpen && (
            <div onClick={e => e.stopPropagation()} style={{ position:"absolute", top:"110%", left:0, zIndex:50, background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", width:90, maxHeight:260, overflowY:"auto", padding:"4px 0" }}
              ref={el => { if(el) { const active = el.querySelector("[data-active='true']"); if(active) active.scrollIntoView({ block:"center" }); } }}>
              {yearRange.map(y => (
                <div key={y} data-active={y===currentYear ? "true" : "false"} onClick={() => goToYear(y)} style={{
                  padding:"7px 14px", fontSize:13, cursor:"pointer",
                  fontWeight: y===currentYear ? 700 : 400,
                  background: y===currentYear ? "#DBEAFE" : "transparent",
                  color: y===currentYear ? "#2563EB" : "#111827"
                }}
                  onMouseEnter={e => { if(y!==currentYear) e.currentTarget.style.background="#f9fafb"; }}
                  onMouseLeave={e => { if(y!==currentYear) e.currentTarget.style.background="transparent"; }}>
                  {y}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
          <button onClick={prevWeek} style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:3, width:28, height:28, cursor:"pointer", color:"#374151", fontSize:14 }}>‹</button>
          <button onClick={() => setWeekBase(new Date(today))} style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:3, padding:"0 8px", height:28, cursor:"pointer", color:"#374151", fontSize:11, fontWeight:700 }}>{t(lang, 'now')}</button>
          <button onClick={nextWeek} style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:3, width:28, height:28, cursor:"pointer", color:"#374151", fontSize:14 }}>›</button>
        </div>
      </div>
      <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb" }}>
        <div style={{ width:44, flexShrink:0 }} />
        {weekDates.map((d, i) => {
          const isToday = dateKey(d) === getTodayKey();
          return (
            <div key={i} style={{ flex:1, textAlign:"center", padding:"6px 0" }}>
              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, letterSpacing:1 }}>{DAYS_BY_LANG[lang][i]}</div>
              <div style={{ fontSize:16, fontWeight:700, width:28, height:28, lineHeight:"28px", borderRadius:"50%", margin:"2px auto 0", background: isToday ? "#2563EB" : "transparent", color: isToday ? "#fff" : "#111827" }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div style={{ flex:1, overflowY:"scroll", scrollbarGutter:"stable", position:"relative" }}>
        {(() => {
          const CHIP_H = 18;
          const maxTasks = Math.max(0, ...weekDates.map(d => (tasks||[]).filter(t => t.deadline === dateKey(d)).length));
          const extraH = maxTasks * CHIP_H;
          return (
            <div style={{ display:"flex", minHeight: HOURS.length * HOUR_H + extraH }}>
              <div style={{ width:44, flexShrink:0 }}>
                {HOURS.map(h => (
                  <div key={h} style={{ height: h === HOURS[0] ? HOUR_H + extraH : HOUR_H, borderBottom:"1px solid #f3f4f6", paddingRight:6, display:"flex", alignItems:"flex-start", justifyContent:"flex-end" }}>
                    <span style={{ fontSize:10, color:"#9ca3af", paddingTop:4 }}>{pad(h)}:00</span>
                  </div>
                ))}
              </div>
              {weekDates.map((d, di) => {
                const dk = dateKey(d);
                const dayTasks = (tasks||[]).filter(t => t.deadline === dk);
                const dayEvents = events.filter(e => e.date===dk);
                return (
                  <div key={di} style={{ flex:1, minWidth:0, overflow:"hidden", position:"relative", borderLeft:"1px solid #f3f4f6" }}>
                    {HOURS.map(h => (
                      <div key={h} onClick={() => openAdding(dk, h)}
                        style={{ height: h === HOURS[0] ? HOUR_H + extraH : HOUR_H, borderBottom:"1px solid #f3f4f6", cursor:"pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                        onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                        {h === HOURS[0] && extraH > 0 && (
                          <div style={{ display:"flex", flexDirection:"column", gap:2, padding:"2px 2px 0", overflow:"hidden", width:"100%" }} onClick={e => e.stopPropagation()}>
                            {dayTasks.map(task => (
                              <div key={task.id} title={task.title} style={{
                                height: CHIP_H - 2,
                                background: PRIO_BG[task.priority] || "#f3f4f6",
                                borderLeft: "2px solid " + (PRIO_COLOR[task.priority] || "#9ca3af"),
                                borderRadius:2,
                                padding:"0 4px",
                                fontSize:10,
                                fontWeight:600,
                                color: PRIO_COLOR[task.priority] || "#6b7280",
                                overflow:"hidden",
                                textOverflow:"ellipsis",
                                whiteSpace:"nowrap",
                                display:"flex",
                                alignItems:"center",
                                minWidth:0,
                              }}>
                                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", minWidth:0, flex:1 }}>{task.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {/* Hele-dag-afspraken: smalle band over de volle hoogte */}
                    {dayEvents.filter(isAllDay).map((ev, i) => (
                      <div key={"ad-"+ev.id} onClick={e => { e.stopPropagation(); openEvent(ev); }}
                        title={ev.title}
                        style={{ position:"absolute", top: extraH, left: 2 + i*8, width:"42%", height: HOURS.length * HOUR_H - 2, background: EVENT_BG[ev.color]||"#DBEAFE", border:"1px solid "+(EVENT_BORDER[ev.color]||"#2563EB"), borderLeft:"3px solid "+(EVENT_BORDER[ev.color]||"#2563EB"), borderRadius:3, padding:"3px 5px", overflow:"hidden", zIndex:1, cursor:"pointer" }}>
                        <div style={{ fontSize:11, fontWeight:700, color: EVENT_BORDER[ev.color]||"#2563EB", overflow:"hidden", textOverflow:"ellipsis" }}>{ev.title}</div>
                      </div>
                    ))}
                    {dayEvents.filter(e => !isAllDay(e)).map(ev => {
                      const rawTop = extraH + (ev.startH - HOURS[0] + ev.startM/60) * HOUR_H;
                      const top    = Math.max(extraH, rawTop);
                      const bottom = extraH + (ev.endH - HOURS[0] + ev.endM/60) * HOUR_H;
                      const height = Math.max(bottom - top - 2, 16);
                      return (
                        <div key={ev.id} onClick={e => { e.stopPropagation(); openEvent(ev); }}
                          style={{ position:"absolute", top, left:2, right:2, height, background: EVENT_BG[ev.color]||"#DBEAFE", borderLeft:"3px solid "+(EVENT_BORDER[ev.color]||"#2563EB"), borderRadius:3, padding:"3px 5px", overflow:"hidden", zIndex:2, cursor:"pointer" }}>
                          <div style={{ fontSize:11, fontWeight:700, color: EVENT_BORDER[ev.color]||"#2563EB", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ev.title}</div>
                          <div style={{ fontSize:10, color:"#6b7280" }}>{pad(ev.startH)}:{pad(ev.startM)}</div>
                        </div>
                      );
                    })}
                    {/* Gedeelde afspraken van anderen — hele-dag-band (rechts, in hun kleur) */}
                    {sharedEvents.filter(e => e.date===dk && isAllDay(e)).map(ev => {
                      const ps = personStyle(ev.ownerEmail);
                      return (
                        <div key={"shad-"+ev.id} title={ev.title}
                          onClick={e => { e.stopPropagation(); window.alert(`${ev.title}\n${(ev.ownerEmail||"").split("@")[0]} · hele dag`); }}
                          style={{ position:"absolute", top: extraH, right: 2, width:"40%", height: HOURS.length * HOUR_H - 2, background: ps.bg, border:"1px dashed "+ps.border, borderLeft:"3px solid "+ps.border, borderRadius:3, padding:"3px 5px", overflow:"hidden", zIndex:1, cursor:"pointer" }}>
                          <div style={{ fontSize:9, fontWeight:800, color: ps.text, textTransform:"uppercase" }}>{(ev.ownerEmail||"").split("@")[0]}</div>
                          <div style={{ fontSize:11, fontWeight:700, color: ps.text, overflow:"hidden", textOverflow:"ellipsis" }}>{ev.title}</div>
                        </div>
                      );
                    })}
                    {/* Gedeelde afspraken van anderen — getimed, eronder, steekt onderaan uit */}
                    {sharedEvents.filter(e => e.date===dk && !isAllDay(e)).map(ev => {
                      const ps = personStyle(ev.ownerEmail);
                      const rawTop = extraH + (ev.startH - HOURS[0] + ev.startM/60) * HOUR_H;
                      const top    = Math.max(extraH, rawTop);
                      const bottom = extraH + (ev.endH - HOURS[0] + ev.endM/60) * HOUR_H;
                      const height = Math.max(bottom - top - 2, 16) + 8;
                      return (
                        <div key={"sh-"+ev.id} title={ev.title}
                          onClick={e => { e.stopPropagation(); window.alert(`${ev.title}\n${(ev.ownerEmail||"").split("@")[0]} · ${pad(ev.startH)}:${pad(ev.startM)}–${pad(ev.endH)}:${pad(ev.endM)}`); }}
                          style={{ position:"absolute", top, left:5, right:5, height, background: ps.bg, border:"1px dashed "+ps.border, borderRadius:3, padding:"2px 5px", overflow:"hidden", zIndex:1, cursor:"pointer" }}>
                          <div style={{ fontSize:8, fontWeight:800, color: ps.text, textTransform:"uppercase", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{(ev.ownerEmail||"").split("@")[0]}</div>
                          <div style={{ fontSize:10, fontWeight:700, color: ps.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ev.title}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>
      {selectedEvent && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:60, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setSelectedEvent(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:8, padding:20, width:300, boxShadow:"0 20px 40px rgba(0,0,0,0.15)", maxHeight:"90vh", overflowY:"auto" }}>

            {/* Header: title + edit button */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background: EVENT_BORDER[editMode ? editColor : selectedEvent.color]||"#2563EB", flexShrink:0 }} />
              {editMode
                ? <input value={editTitle} onChange={e => setEditTitle(e.target.value)} autoFocus
                    style={{ flex:1, fontWeight:700, fontSize:15, border:"none", borderBottom:"2px solid #2563EB", outline:"none", padding:"0 2px", color:"#111827" }} />
                : <div style={{ flex:1, fontWeight:700, fontSize:15, color:"#111827" }}>{selectedEvent.title}</div>
              }
              <button onClick={() => setEditMode(m => !m)}
                style={{ flexShrink:0, background: editMode ? "#DBEAFE" : "#f3f4f6", border:"none", borderRadius:4, padding:"3px 8px", fontSize:11, fontWeight:700, cursor:"pointer", color: editMode ? "#2563EB" : "#6b7280" }}>
                {editMode ? t(lang, 'cancelEdit') : t(lang, 'editBtn')}
              </button>
            </div>

            {/* Time — view or edit */}
            {editMode ? (
              <div style={{ display:"flex", flexDirection:"column", gap:6, margin:"10px 0 14px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#6b7280", width:36 }}>{t(lang, 'from')}</span>
                  <TimeSelect h={editStartH} m={editStartM} onChangeH={setEditStartH} onChangeM={setEditStartM} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#6b7280", width:36 }}>{t(lang, 'to')}</span>
                  <TimeSelect h={editEndH} m={editEndM} onChangeH={setEditEndH} onChangeM={setEditEndM} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                  <span style={{ fontSize:12, color:"#6b7280", width:36 }}>{t(lang, 'color')}</span>
                  {[["blue","#2563EB"],["red","#DC2626"],["yellow","#E6B400"]].map(([key, hex]) => (
                    <div key={key} onClick={() => setEditColor(key)} style={{ width:20, height:20, borderRadius:"50%", background:hex, cursor:"pointer", border: editColor===key ? "3px solid #111827" : "3px solid transparent", boxSizing:"border-box" }} />
                  ))}
                </div>
                {invitees.length > 0 && (
                  <div style={{ marginTop:4 }}>
                    <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>Zichtbaar voor</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                      <div onClick={() => setEditSharedWith([])}
                        style={{ fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:12, cursor:"pointer", border:"1px solid "+(editSharedWith.length===0?"#374151":"#e5e7eb"), background: editSharedWith.length===0?"#374151":"#fff", color: editSharedWith.length===0?"#fff":"#374151" }}>Alleen ik</div>
                      {invitees.map(em => {
                        const on = editSharedWith.includes(em);
                        return (
                          <div key={em} onClick={() => setEditSharedWith(sw => toggleIn(sw, em))}
                            style={{ fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:12, cursor:"pointer", border:"1px solid "+(on?"#2563EB":"#e5e7eb"), background: on?"#2563EB":"#fff", color: on?"#fff":"#374151" }}>{on?"✓ ":""}{em.split("@")[0]}</div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <button onClick={() => {
                  const updated = { ...selectedEvent, title: editTitle, startH: editStartH, startM: editStartM, endH: editEndH, endM: editEndM, color: editColor, shared: editSharedWith.length > 0, sharedWith: editSharedWith };
                  updateEventDB(updated);
                  setEvents(evs => evs.map(x => x.id===selectedEvent.id ? updated : x));
                  setSelectedEvent(updated);
                  setEditMode(false);
                }} style={{ marginTop:4, background:"#2563EB", color:"#fff", border:"none", borderRadius:4, padding:"7px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  {t(lang, 'saveChanges')}
                </button>
              </div>
            ) : (
              <div style={{ fontSize:12, color:"#6b7280", marginBottom:14 }}>
                {selectedEvent.date} &nbsp;·&nbsp; {pad(selectedEvent.startH)}:{pad(selectedEvent.startM)} – {pad(selectedEvent.endH)}:{pad(selectedEvent.endM)}
              </div>
            )}

            {/* Note */}
            <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:6 }}>{t(lang, 'note')}</div>
            <div style={{ marginBottom:12 }}>
              <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                placeholder={t(lang, 'notePlaceholderAdd')}
                rows={3}
                style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 10px", fontSize:12, outline:"none", boxSizing:"border-box", resize:"none", color:"#374151", fontFamily:"'DM Sans', sans-serif", display:"block" }} />
              <button onClick={() => { const updated = {...selectedEvent, note: editNote}; updateEventDB(updated); setEvents(evs => evs.map(x => x.id===selectedEvent.id ? updated : x)); setSelectedEvent(null); }}
                style={{ marginTop:6, background:"#2563EB", color:"#fff", border:"none", borderRadius:3, padding:"4px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                {t(lang, 'save')}
              </button>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { deleteEventDB(selectedEvent.id); setEvents(evs => evs.filter(x => x.id!==selectedEvent.id)); setSelectedEvent(null); }}
                style={{ flex:1, background:"#FEE2E2", color:"#DC2626", border:"none", borderRadius:4, padding:"8px 12px", cursor:"pointer", fontSize:13, fontWeight:700 }}>{t(lang, 'delete')}</button>
              <button onClick={() => setSelectedEvent(null)}
                style={{ background:"#f3f4f6", color:"#374151", border:"none", borderRadius:4, padding:"8px 12px", cursor:"pointer", fontSize:13 }}>{t(lang, 'close')}</button>
            </div>
          </div>
        </div>
      )}
      {adding && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:8, padding:20, width:300, boxShadow:"0 20px 40px rgba(0,0,0,0.15)" }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"#111827" }}>{t(lang, 'addEvent')}</div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addEvent()}
              placeholder={t(lang, 'titlePlaceholder')} autoFocus
              style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 10px", fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:14 }} />
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:"#6b7280", width:36 }}>{t(lang, 'from')}</span>
                <TimeSelect h={modalStartH} m={modalStartM} onChangeH={setModalStartH} onChangeM={setModalStartM} />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:"#6b7280", width:36 }}>{t(lang, 'to')}</span>
                <TimeSelect h={modalEndH} m={modalEndM} onChangeH={setModalEndH} onChangeM={setModalEndM} />
              </div>
            </div>
            {/* Color picker */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ fontSize:12, color:"#6b7280", width:36 }}>{t(lang, 'color')}</span>
              {[["blue","#2563EB"],["red","#DC2626"],["yellow","#E6B400"]].map(([key, hex]) => (
                <div key={key} onClick={() => setModalColor(key)} style={{ width:22, height:22, borderRadius:"50%", background:hex, cursor:"pointer", border: modalColor===key ? "3px solid #111827" : "3px solid transparent", boxSizing:"border-box" }} />
              ))}
            </div>
            {/* Zichtbaar voor */}
            {invitees.length > 0 && (
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>Zichtbaar voor</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  <div onClick={() => setModalSharedWith([])}
                    style={{ fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:12, cursor:"pointer", border:"1px solid "+(modalSharedWith.length===0?"#374151":"#e5e7eb"), background: modalSharedWith.length===0?"#374151":"#fff", color: modalSharedWith.length===0?"#fff":"#374151" }}>Alleen ik</div>
                  {invitees.map(em => {
                    const on = modalSharedWith.includes(em);
                    return (
                      <div key={em} onClick={() => setModalSharedWith(sw => toggleIn(sw, em))}
                        style={{ fontSize:11, fontWeight:600, padding:"4px 10px", borderRadius:12, cursor:"pointer", border:"1px solid "+(on?"#2563EB":"#e5e7eb"), background: on?"#2563EB":"#fff", color: on?"#fff":"#374151" }}>{on?"✓ ":""}{em.split("@")[0]}</div>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Note */}
            <div style={{ marginBottom:14 }}>
              <textarea value={modalNote} onChange={e => setModalNote(e.target.value)}
                placeholder={t(lang, 'notePlaceholderOptional')}
                rows={3}
                style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 10px", fontSize:12, outline:"none", boxSizing:"border-box", resize:"none", color:"#374151", fontFamily:"'DM Sans', sans-serif", display:"block" }} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={addEvent} style={{ flex:1, background:"#2563EB", color:"#fff", border:"none", borderRadius:4, padding:"8px", cursor:"pointer", fontSize:13, fontWeight:700 }}>{t(lang, 'add')}</button>
              <button onClick={() => setAdding(null)} style={{ background:"#f3f4f6", color:"#374151", border:"none", borderRadius:4, padding:"8px 12px", cursor:"pointer", fontSize:13 }}>{t(lang, 'cancel2')}</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ── AI PANEL ──────────────────────────────────────────────────────────────────
function AIPanel({ tasks, events, setTasks, setEvents, userId }) {
  const lang = useLang();
  const STORAGE_KEY = `jmp_chat_${userId}`;
  const MEMORY_KEY  = `jmp_memory_${userId}`;
  const THREE_WEEKS = 21 * 24 * 60 * 60 * 1000;

  const loadMessages = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const cutoff = Date.now() - THREE_WEEKS;
      const recent = stored.filter(m => !m.ts || m.ts > cutoff);
      if (recent.length > 0) return recent;
    } catch {}
    return [{ role: "assistant", content: t('nl', 'aiGreeting'), ts: Date.now() }];
  };

  const [messages, setMessages] = useState(loadMessages);
  const [memory, setMemory] = useState(() => {
    try { return localStorage.getItem(MEMORY_KEY) || ''; } catch { return ''; }
  });
  const saveMemory = (content) => {
    setMemory(content);
    try { localStorage.setItem(MEMORY_KEY, content); } catch {}
  };
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [attachments, setAttachments] = useState([]);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

  // Sla berichten op in localStorage bij elke wijziging
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const handleFiles = (files) => {
    Array.from(files).forEach(file => {
      const isImage = file.type.startsWith("image/");
      const isText = file.type === "text/plain" || file.name.endsWith(".md") || file.name.endsWith(".csv");
      if (!isImage && !isText) return;
      const reader = new FileReader();
      if (isImage) {
        reader.onload = e => {
          const data = e.target.result.split(",")[1];
          setAttachments(a => [...a, { type: "image", name: file.name, mediaType: file.type, data, preview: e.target.result }]);
        };
        reader.readAsDataURL(file);
      } else {
        reader.onload = e => {
          setAttachments(a => [...a, { type: "text", name: file.name, content: e.target.result }]);
        };
        reader.readAsText(file);
      }
    });
  };

  const executeActions = async (actions) => {
    for (const action of actions) {
      if (action.type === "create_event") {
        const d = action.data;
        const eventData = { title: d.title, date: d.date, startH: d.start_h, startM: d.start_m, endH: d.end_h, endM: d.end_m, color: d.color || "blue", note: "" };
        const saved = await addEventDB(userId, eventData);
        setEvents(ev => [...ev, saved]);
      } else if (action.type === "create_task") {
        const d = action.data;
        const taskData = { title: d.title, deadline: d.deadline || null, priority: d.priority || "", status: "", list: "mine", note: "" };
        const saved = await addTaskDB(userId, taskData);
        setTasks(t => [...t, saved]);
      } else if (action.type === "update_task") {
        const d = action.data;
        const existing = tasks.find(x => x.id === d.task_id);
        if (!existing) continue;
        const updated = {
          ...existing,
          ...(d.status   !== undefined && { status:   d.status }),
          ...(d.deadline !== undefined && { deadline: d.deadline }),
          ...(d.priority !== undefined && { priority: d.priority }),
        };
        setTasks(t => t.map(x => x.id === d.task_id ? updated : x));
        await updateTaskDB(updated);
      }
    }
  };

  const formatMessagesForAPI = (msgs) => msgs.map(m => {
    if (!m.attachments?.length) return { role: m.role, content: m.content };
    const content = [];
    for (const att of m.attachments) {
      if (att.type === "image") content.push({ type: "image", source: { type: "base64", media_type: att.mediaType, data: att.data } });
      else if (att.type === "text") content.push({ type: "text", text: `[Bestand: ${att.name}]\n${att.content}` });
    }
    if (m.content) content.push({ type: "text", text: m.content });
    return { role: m.role, content };
  });

  const send = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (loading) return;
    const userMsg = input.trim();
    const currentAttachments = [...attachments];
    setInput("");
    setAttachments([]);
    const newMsg = { role:"user", content:userMsg, attachments: currentAttachments, ts: Date.now() };
    const newMessages = [...messages, newMsg];
    setMessages(newMessages);
    setLoading(true);
    setLoadingStatus("Denkt na...");
    try {
      const todayStr = today.getFullYear() + "-" + String(today.getMonth()+1).padStart(2,"0") + "-" + String(today.getDate()).padStart(2,"0");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: formatMessagesForAPI(newMessages),
          tasks,
          events,
          today: todayStr,
          memory,
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      // Toon het antwoord direct zichtbaar, stop "Denkt na..."
      flushSync(() => {
        setMessages(m => [...m, { role:"assistant", content: data.reply, ts: Date.now() }]);
        if (data.newMemory !== undefined) saveMemory(data.newMemory);
        if (data.actions?.length > 0) {
          setLoadingStatus(`Voert ${data.actions.length} actie${data.actions.length > 1 ? "s" : ""} uit...`);
        } else {
          setLoading(false);
          setLoadingStatus("");
        }
      });

      if (data.actions?.length > 0) {
        await executeActions(data.actions);
        setLoading(false);
        setLoadingStatus("");
      }
    } catch(err) {
      setMessages(m => [...m, { role:"assistant", content:"Er is een fout opgetreden: " + err.message, ts: Date.now() }]);
      setLoading(false);
      setLoadingStatus("");
    }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#fafafa" }}>
      <div style={{ padding:"18px 16px 12px", borderBottom:"1px solid #e5e7eb" }}>
        <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#111827" }}>{t(lang, 'assistant')}</div>
        <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{tasks.length} {t(lang, 'aiTasks')} - {events.length} {t(lang, 'aiEvents')}</div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "center" }}>
            <div style={{ width: m.role==="user" ? "auto" : "100%", maxWidth: m.role==="user" ? "85%" : "100%", display:"flex", flexDirection:"column", gap:4, alignItems: m.role==="user" ? "flex-end" : "flex-start" }}>
              {m.attachments?.map((att, j) => att.type === "image"
                ? <img key={j} src={att.preview} alt={att.name} style={{ maxWidth:180, maxHeight:180, borderRadius:8, objectFit:"cover", border:"1px solid #e5e7eb" }} />
                : <div key={j} style={{ background:"#f3f4f6", borderRadius:8, padding:"6px 10px", fontSize:11, color:"#6b7280" }}>📄 {att.name}</div>
              )}
              {m.content && (
                <div style={{ padding:"10px 13px", borderRadius: m.role==="user" ? "12px 12px 2px 12px" : "12px", background: m.role==="user" ? "#2563EB" : "#ffffff", color: m.role==="user" ? "#fff" : "#111827", fontSize:13, lineHeight:1.5, whiteSpace:"pre-wrap", boxShadow:"0 1px 3px rgba(0,0,0,0.08)", border: m.role==="assistant" ? "1px solid #e5e7eb" : "none", width: m.role==="assistant" ? "100%" : "auto", boxSizing:"border-box" }}>
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:"#fff", borderRadius:"12px 12px 12px 2px", width:"fit-content", border:"1px solid #e5e7eb", boxShadow:"0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display:"flex", gap:4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width:7, height:7, borderRadius:"50%", background:"#2563EB", animation:"bounce 1.2s infinite", animationDelay:(i*0.2)+"s" }} />)}
            </div>
            {loadingStatus && <span style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Sans', sans-serif" }}>{loadingStatus}</span>}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding:"6px 14px", display:"flex", gap:6, flexWrap:"wrap", borderTop:"1px solid #e5e7eb" }}>
        {[t(lang,'quickQ1'), t(lang,'quickQ2'), t(lang,'quickQ3')].map(q => (
          <button key={q} onClick={() => setInput(q)} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:20, padding:"4px 10px", fontSize:11, cursor:"pointer", color:"#374151", whiteSpace:"nowrap" }}>{q}</button>
        ))}
      </div>
      {attachments.length > 0 && (
        <div style={{ padding:"6px 14px", display:"flex", gap:6, flexWrap:"wrap", borderTop:"1px solid #e5e7eb" }}>
          {attachments.map((att, i) => (
            <div key={i} style={{ position:"relative", display:"inline-flex" }}>
              {att.type === "image"
                ? <img src={att.preview} alt={att.name} style={{ width:48, height:48, objectFit:"cover", borderRadius:6, border:"1px solid #e5e7eb" }} />
                : <div style={{ background:"#f3f4f6", borderRadius:6, padding:"6px 8px", fontSize:11, color:"#374151", maxWidth:100, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>📄 {att.name}</div>
              }
              <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                style={{ position:"absolute", top:-4, right:-4, width:16, height:16, borderRadius:"50%", background:"#374151", border:"none", color:"#fff", fontSize:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}>✕</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding:"10px 14px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8, alignItems:"center" }}>
        <input ref={fileInputRef} type="file" accept="image/*,.txt,.md,.csv" multiple style={{ display:"none" }} onChange={e => { handleFiles(e.target.files); e.target.value = ""; }} />
        <button onClick={() => fileInputRef.current?.click()}
          title="Foto of bestand toevoegen"
          style={{ width:32, height:32, borderRadius:"50%", background:"#f3f4f6", border:"none", cursor:"pointer", color:"#6b7280", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>📎</button>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && !e.shiftKey && send()}
          placeholder={t(lang, 'askPlaceholder')}
          style={{ flex:1, border:"1px solid #e5e7eb", borderRadius:20, padding:"8px 14px", fontSize:13, outline:"none", background:"#fff" }} />
        <button onClick={send} disabled={loading || (!input.trim() && attachments.length === 0)} style={{ width:36, height:36, borderRadius:"50%", background: (input.trim() || attachments.length > 0) ? "#2563EB" : "#e5e7eb", border:"none", cursor: (input.trim() || attachments.length > 0) ? "pointer" : "default", color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>&#8593;</button>
      </div>
    </div>
  );
}

// ── SPLITTER ──────────────────────────────────────────────────────────────────
// ── AGENTS PANEL ─────────────────────────────────────────────────────────────
const AGENT_MODELS = [["opus","Opus"],["sonnet","Sonnet"],["haiku","Haiku"]];
const AGENT_EMOJIS = ["🤖","📬","📈","💼","⚖️","🔭","📡","✍️","🌐","🎯","💡","🎓","📚","🔨","👶","🧠","🛠️","📊"];

function AgentsPanel({ session }) {
  const uid = session.user.id;
  const [agents, setAgents]     = useState([]);
  const [selected, setSelected] = useState(null);     // chat
  const [editing, setEditing]   = useState(undefined); // undefined=dicht, null=nieuw, obj=bewerken
  const [input, setInput]       = useState("");
  const [running, setRunning]   = useState(false);
  const [output, setOutput]     = useState(null);
  const [form, setForm]         = useState({ name:"", role:"", emoji:"🤖", model:"sonnet", system_prompt:"" });

  const reload = () => loadAgents(uid).then(setAgents);
  useEffect(() => { reload(); }, [session]); // eslint-disable-line

  const trigger = async () => {
    if (!selected || !input.trim()) return;
    setRunning(true); setOutput(null);
    try {
      const res  = await fetch('/api/agent-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ agent_id: selected.id, message: input }),
      });
      const data = await res.json();
      setOutput(data.reply || data.error || 'Geen response');
    } catch (err) { setOutput('Fout: ' + err.message); }
    setRunning(false);
  };

  const openNew  = () => { setForm({ name:"", role:"", emoji:"🤖", model:"sonnet", system_prompt:"" }); setEditing(null); };
  const openEdit = (a) => { setForm({ name:a.name||"", role:a.role||"", emoji:a.emoji||"🤖", model:a.model||"sonnet", system_prompt:a.system_prompt||"" }); setEditing(a); };
  const saveAgent = async () => {
    if (!form.name.trim()) return;
    if (editing?.id) await updateAgentDB({ ...form, id: editing.id });
    else await addAgentDB(uid, form);
    await reload(); setEditing(undefined);
  };
  const removeAgent = async () => { if (editing?.id) { await deleteAgentDB(editing.id); await reload(); } setEditing(undefined); };

  const headerStyle = { padding:"12px 14px", borderBottom:"2px solid #27272a", background:"#18181b", flexShrink:0, display:"flex", alignItems:"center", gap:10 };
  const label = { fontSize:10, color:"#9ca3af", fontWeight:700, letterSpacing:0.8, textTransform:"uppercase", margin:"12px 0 6px" };
  const field = { width:"100%", border:"1px solid #e5e7eb", borderRadius:6, padding:"8px 10px", fontSize:13, outline:"none", color:"#111827", background:"#fff", fontFamily:"'DM Sans', sans-serif", boxSizing:"border-box" };

  // ── BEWERKEN / AANMAKEN ──
  if (editing !== undefined) {
    return (
      <div style={{ height:"100%", display:"flex", flexDirection:"column", background:"#fff", fontFamily:"'DM Sans', sans-serif" }}>
        <div style={headerStyle}>
          <button onClick={() => setEditing(undefined)} style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:16 }}>←</button>
          <div style={{ flex:1, fontSize:13, fontWeight:700, color:"#f9fafb" }}>{editing ? "Agent bewerken" : "Nieuwe agent"}</div>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"4px 14px 14px" }}>
          <div style={label}>Naam</div>
          <input style={field} value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="Bijv. Boodschapper" />
          <div style={label}>Emoji</div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {AGENT_EMOJIS.map(e => (
              <div key={e} onClick={() => setForm(f => ({ ...f, emoji:e }))}
                style={{ width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, borderRadius:6, cursor:"pointer", border: form.emoji===e ? "2px solid #2563EB" : "2px solid #f3f4f6", background:"#fafafa" }}>{e}</div>
            ))}
          </div>
          <div style={label}>Model</div>
          <div style={{ display:"flex", gap:6 }}>
            {AGENT_MODELS.map(([val, lbl]) => (
              <div key={val} onClick={() => setForm(f => ({ ...f, model:val }))}
                style={{ flex:1, textAlign:"center", padding:"7px 0", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:700, color: form.model===val ? "#fff" : "#6b7280", background: form.model===val ? (MODEL_BADGE_COLOR[val]||"#374151") : "#f3f4f6" }}>{lbl}</div>
            ))}
          </div>
          <div style={label}>Rol (kort)</div>
          <input style={field} value={form.role} onChange={e => setForm(f => ({ ...f, role:e.target.value }))} placeholder="Bijv. houdt je boodschappen bij" />
          <div style={label}>System prompt</div>
          <textarea style={{ ...field, minHeight:90, resize:"vertical" }} value={form.system_prompt} onChange={e => setForm(f => ({ ...f, system_prompt:e.target.value }))} placeholder="Je bent ... Antwoord kort en in het Nederlands." />
          <button onClick={saveAgent} disabled={!form.name.trim()}
            style={{ marginTop:16, width:"100%", padding:"9px 0", background: form.name.trim() ? "#2563EB" : "#e5e7eb", color: form.name.trim() ? "#fff" : "#9ca3af", border:"none", borderRadius:6, fontSize:13, fontWeight:700, cursor: form.name.trim() ? "pointer" : "default" }}>
            {editing ? "Opslaan" : "Aanmaken"}
          </button>
          {editing && (
            <button onClick={removeAgent} style={{ marginTop:8, width:"100%", padding:"8px 0", background:"#FEE2E2", color:"#DC2626", border:"none", borderRadius:6, fontSize:12, fontWeight:600, cursor:"pointer" }}>Verwijderen</button>
          )}
        </div>
      </div>
    );
  }

  // ── CHAT ──
  if (selected) {
    return (
      <div style={{ height:"100%", display:"flex", flexDirection:"column", background:"#fff", fontFamily:"'DM Sans', sans-serif" }}>
        <div style={headerStyle}>
          <button onClick={() => { setSelected(null); setOutput(null); setInput(""); }}
            style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:16, padding:"2px 4px", lineHeight:1 }}>←</button>
          <span style={{ fontSize:18, lineHeight:1 }}>{selected.emoji}</span>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#f9fafb", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.name}</div>
            <div style={{ fontSize:11, color:"#6b7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{selected.role}</div>
          </div>
          <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background: MODEL_BADGE_COLOR[selected.model] || "#374151", color:"#fff", flexShrink:0 }}>
            {selected.model}
          </span>
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"12px 14px" }}>
          {output && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Response</div>
              <div style={{ padding:"10px 12px", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, fontSize:13, color:"#166534", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{output}</div>
            </div>
          )}
          {running && (
            <div style={{ display:"flex", alignItems:"center", gap:8, color:"#9ca3af", fontSize:12 }}>
              <span style={{ animation:"bounce 1.2s infinite" }}>●</span> Agent is bezig...
            </div>
          )}
        </div>
        <div style={{ padding:"12px 14px", borderTop:"1px solid #e5e7eb", background:"#fafafa", flexShrink:0 }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) trigger(); }}
            placeholder={`Stuur een bericht naar ${selected.name}...`} rows={3}
            style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:6, padding:"8px 10px", fontSize:12, outline:"none", resize:"none", color:"#111827", background:"#fff", fontFamily:"'DM Sans', sans-serif", boxSizing:"border-box", display:"block" }} />
          <button onClick={trigger} disabled={running || !input.trim()}
            style={{ marginTop:8, width:"100%", padding:"8px 0", background: running || !input.trim() ? "#e5e7eb" : "#2563EB", color: running || !input.trim() ? "#9ca3af" : "#fff", border:"none", borderRadius:6, fontSize:13, fontWeight:700, cursor: running || !input.trim() ? "default" : "pointer" }}>
            {running ? "Bezig..." : "Verstuur"}
          </button>
        </div>
      </div>
    );
  }

  // ── LIJST ──
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", background:"#fff", fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ padding:"8px 14px", borderBottom:"2px solid #e5e7eb", background:"#f9fafb", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, textTransform:"uppercase" }}>Agents</div>
        <button onClick={openNew} style={{ background:"#2563EB", color:"#fff", border:"none", borderRadius:5, fontSize:11, fontWeight:700, padding:"4px 9px", cursor:"pointer" }}>+ Nieuw</button>
      </div>
      <div style={{ flex:1, overflowY:"auto" }}>
        {agents.length === 0 && (
          <div style={{ padding:"30px 20px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>Nog geen agents. Maak je eerste agent aan met “+ Nieuw”.</div>
        )}
        {agents.map(agent => (
          <div key={agent.id}
            style={{ display:"flex", alignItems:"center", gap:9, padding:"9px 14px", borderBottom:"1px solid #f3f4f6", background:"#fff" }}
            onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
            onMouseLeave={e => e.currentTarget.style.background="#fff"}>
            <div onClick={() => setSelected(agent)} style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:9, cursor:"pointer" }}>
              <span style={{ fontSize:15, flexShrink:0, lineHeight:1 }}>{agent.emoji}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{agent.name}</div>
                <div style={{ fontSize:11, color:"#6b7280", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{agent.role}</div>
              </div>
              <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:3, background: MODEL_BADGE_COLOR[agent.model] || "#374151", color:"#fff", flexShrink:0 }}>
                {(agent.model||"sonnet").toUpperCase()}
              </span>
            </div>
            <button onClick={() => openEdit(agent)} title="Bewerken"
              style={{ background:"none", border:"none", color:"#9ca3af", cursor:"pointer", fontSize:13, padding:"2px 4px", flexShrink:0 }}>✎</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Splitter({ onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{ width:6, flexShrink:0, background:"#e5e7eb", cursor:"col-resize", display:"flex", alignItems:"center", justifyContent:"center", zIndex:10, userSelect:"none" }}
      onMouseEnter={e => e.currentTarget.style.background="#2563EB"}
      onMouseLeave={e => e.currentTarget.style.background="#e5e7eb"}
    >
      <div style={{ width:2, height:30, background:"rgba(255,255,255,0.6)", borderRadius:2 }} />
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
function LoginPage() {
  const [mode, setMode]         = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(null);
  const [loading, setLoading]   = useState(false);

  const handleEmail = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      if (error) setError(error.message);
      else setSuccess("Check je e-mail voor de resetlink.");
    }
    setLoading(false);
  };

  const switchMode = (m) => { setMode(m); setError(null); setSuccess(null); };

  const handleOAuth = async (provider) => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.href.split('#')[0].split('?')[0] } });
    if (error) setError(error.message);
  };

  const providers = [
    { id: "google", label: "Google",    icon: "G" },
    { id: "azure",  label: "Microsoft", icon: "M" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#111827", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* Logo */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:40 }}>
        <span style={{ fontSize:22, fontWeight:700, color:"#f9fafb", letterSpacing:0.5 }}>justmyplan</span>
        <div style={{ display:"flex", gap:5 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#DC2626" }} />
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#E6B400" }} />
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#2563EB" }} />
        </div>
      </div>

      {/* Card */}
      <div style={{ background:"#18181b", borderRadius:16, padding:"36px 40px", width:"100%", maxWidth:400, boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
        <h2 style={{ color:"#f9fafb", fontSize:20, fontWeight:700, marginBottom:24, textAlign:"center" }}>
          {mode === "login" ? "Inloggen" : mode === "signup" ? "Account aanmaken" : "Wachtwoord vergeten"}
        </h2>

        {mode !== "forgot" && <>
          {/* OAuth buttons */}
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:24 }}>
            {providers.map(p => (
              <button key={p.id} onClick={() => handleOAuth(p.id)}
                style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:10, padding:"11px 0", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#f9fafb", fontSize:14, fontWeight:500, cursor:"pointer", transition:"background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background="#3f3f46"}
                onMouseLeave={e => e.currentTarget.style.background="#27272a"}>
                <span style={{ fontWeight:700, fontSize:15 }}>{p.icon}</span> Doorgaan met {p.label}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24 }}>
            <div style={{ flex:1, height:1, background:"#3f3f46" }} />
            <span style={{ color:"#71717a", fontSize:12 }}>of</span>
            <div style={{ flex:1, height:1, background:"#3f3f46" }} />
          </div>
        </>}

        {/* Email form */}
        <form onSubmit={handleEmail} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <input type="email" placeholder="E-mailadres" value={email} onChange={e => setEmail(e.target.value)} required
            style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#f9fafb", fontSize:14, outline:"none" }} />
          {mode !== "forgot" && (
            <input type="password" placeholder="Wachtwoord (min. 6 tekens)" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#f9fafb", fontSize:14, outline:"none" }} />
          )}
          {mode === "login" && (
            <div style={{ textAlign:"right", marginTop:-4 }}>
              <span onClick={() => switchMode("forgot")} style={{ color:"#60a5fa", fontSize:12, cursor:"pointer" }}>
                Wachtwoord vergeten?
              </span>
            </div>
          )}
          {error && <div style={{ color:"#FCA5A5", fontSize:13 }}>{error}</div>}
          {success && <div style={{ color:"#86efac", fontSize:13 }}>{success}</div>}
          {!success && (
            <button type="submit" disabled={loading}
              style={{ padding:"11px 0", borderRadius:8, border:"none", background:"#2563EB", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", opacity: loading ? 0.7 : 1, transition:"opacity 0.15s" }}>
              {loading ? "Laden..." : mode === "login" ? "Inloggen" : mode === "signup" ? "Account aanmaken" : "Resetlink sturen"}
            </button>
          )}
        </form>

        {/* Toggle mode */}
        <div style={{ textAlign:"center", marginTop:20, fontSize:13, color:"#71717a" }}>
          {mode === "forgot" ? (
            <span onClick={() => switchMode("login")} style={{ color:"#60a5fa", cursor:"pointer", fontWeight:500 }}>Terug naar inloggen</span>
          ) : mode === "login" ? <>
            Nog geen account?{" "}
            <span onClick={() => switchMode("signup")} style={{ color:"#60a5fa", cursor:"pointer", fontWeight:500 }}>Aanmaken</span>
          </> : <>
            Al een account?{" "}
            <span onClick={() => switchMode("login")} style={{ color:"#60a5fa", cursor:"pointer", fontWeight:500 }}>Inloggen</span>
          </>}
        </div>
      </div>
    </div>
  );
}

function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);
  const [loading, setLoading]   = useState(false);

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== password2) { setError("Wachtwoorden komen niet overeen."); return; }
    if (password.length < 6)    { setError("Wachtwoord moet minimaal 6 tekens zijn."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else { setSuccess(true); setTimeout(onDone, 1500); }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:"#111827", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:40 }}>
        <span style={{ fontSize:22, fontWeight:700, color:"#f9fafb" }}>justmyplan</span>
        <div style={{ display:"flex", gap:5 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#DC2626" }} />
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#E6B400" }} />
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#2563EB" }} />
        </div>
      </div>
      <div style={{ background:"#18181b", borderRadius:16, padding:"36px 40px", width:"100%", maxWidth:400, boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }}>
        <h2 style={{ color:"#f9fafb", fontSize:20, fontWeight:700, marginBottom:24, textAlign:"center" }}>Nieuw wachtwoord instellen</h2>
        {success ? (
          <div style={{ color:"#86efac", fontSize:14, textAlign:"center" }}>Wachtwoord gewijzigd! Je bent nu ingelogd.</div>
        ) : (
          <form onSubmit={handleReset} style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <input type="password" placeholder="Nieuw wachtwoord" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#f9fafb", fontSize:14, outline:"none" }} />
            <input type="password" placeholder="Herhaal wachtwoord" value={password2} onChange={e => setPassword2(e.target.value)} required
              style={{ padding:"10px 14px", borderRadius:8, border:"1px solid #3f3f46", background:"#27272a", color:"#f9fafb", fontSize:14, outline:"none" }} />
            {error && <div style={{ color:"#FCA5A5", fontSize:13 }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ padding:"11px 0", borderRadius:8, border:"none", background:"#2563EB", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Opslaan..." : "Wachtwoord opslaan"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [lang, setLang]           = useState(() => localStorage.getItem('jmp_lang') || 'nl');
  const [session, setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [tasks, setTasks]         = useState([]);
  const [events, setEvents]       = useState([]);
  const [lists, setLists]         = useState(DEFAULT_LISTS);
  const seededLists               = useRef(false); // voorkomt dubbel zaaien van standaardlijsten
  const [trash, setTrash]         = useState([]); // geladen uit Supabase (zacht verwijderde taken)
  const [widths, setWidths]       = useState([320, null, 320, 44]);
  const [visiblePanels, setVisiblePanels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jmp_panels')) || { tasks:true, calendar:true, assistant:true, agents:true }; }
    catch { return { tasks:true, calendar:true, assistant:true, agents:true }; }
  });
  const [apiKey, setApiKey]               = useState(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [outgoingShares, setOutgoingShares] = useState([]);
  const [incomingShares, setIncomingShares] = useState([]);
  const [inviteEmail, setInviteEmail]     = useState("");
  const [invitePermission, setInvitePermission] = useState("view");
  const [sharedLists, setSharedLists]     = useState([]);   // lijsten die anderen met mij delen
  const [sharedTasks, setSharedTasks]     = useState([]);   // taken in die gedeelde lijsten
  const [sharedEvents, setSharedEvents]   = useState([]);   // afspraken die anderen met mij delen
  const [personColors, setPersonColors]   = useState({});   // email -> kleur-key
  const [shareListsMap, setShareListsMap] = useState({});   // mijn shareId -> [listId,...]
  const [sharedWithMe, setSharedWithMe]   = useState([]);   // geaccepteerde shares waarin ik uitgenodigd ben
  const [personModalEmail, setPersonModalEmail] = useState(null);
  const containerRef = useRef(null);
  const totalRef     = useRef(0);

  useEffect(() => {
    // onAuthStateChange only updates session, never sets authLoading
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    // Determine initial auth state sequentially, no race condition
    async function initAuth() {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const access_token  = hashParams.get('access_token');
      const refresh_token = hashParams.get('refresh_token');

      if (access_token && refresh_token) {
        const type = hashParams.get('type');
        // Use refreshSession to bypass clock skew issues with the initial access token
        const { data } = await supabase.auth.refreshSession({ refresh_token });
        setSession(data.session);
        if (type === 'recovery') setResetMode(true);
        window.history.replaceState(null, '', window.location.pathname);
      } else {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      }
      setAuthLoading(false);
    }

    initAuth();
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => { localStorage.setItem('jmp_lang', lang); }, [lang]);

  useEffect(() => {
    if (!session) return;
    supabase.from("api_keys").select("key").eq("user_id", session.user.id).single()
      .then(({ data }) => { if (data) setApiKey(data.key); });
  }, [session]);

  useEffect(() => {
    if (!showSettings || !session) return;
    supabase.from("shares").select("*").eq("owner_id", session.user.id)
      .then(({ data }) => setOutgoingShares(data || []));
    supabase.from("shares").select("*").eq("invited_email", session.user.email).eq("status", "pending")
      .then(({ data }) => setIncomingShares(data || []));
  }, [showSettings, session]);

  const invitePerson = async () => {
    if (!inviteEmail.trim()) return;
    const email = inviteEmail.trim().toLowerCase();
    await supabase.from("shares").insert({
      owner_id: session.user.id, owner_email: session.user.email,
      invited_email: email, permission: invitePermission,
    });
    setInviteEmail("");
    await reloadAll();
  };

  const removeShare = async (id) => {
    await supabase.from("shares").delete().eq("id", id);
    await reloadAll();
  };

  const updateSharePermission = async (id, permission) => {
    await supabase.from("shares").update({ permission }).eq("id", id);
    await reloadAll();
  };

  const acceptInvitation = async (id) => {
    await supabase.from("shares").update({ status: "accepted" }).eq("id", id);
    setIncomingShares(s => s.filter(x => x.id !== id));
    await reloadAll();
  };

  const declineInvitation = async (id) => {
    await supabase.from("shares").update({ status: "declined" }).eq("id", id);
    setIncomingShares(s => s.filter(x => x.id !== id));
    await reloadAll();
  };

  // Per persoon: kleur toewijzen en welke lijsten ze mogen zien
  const ownListsForShare = lists.filter(l => !l.isShared);
  const setPersonColor = async (email, color) => {
    if (color) await setPersonColorDB(session.user.id, email, color);
    else await removePersonColorDB(session.user.id, email);
    await reloadAll();
  };
  const toggleShareList = async (share, listId) => {
    const current = shareListsMap[share.id] || [];
    const nextIds = current.includes(listId) ? current.filter(x => x !== listId) : [...current, listId];
    const objs = ownListsForShare.filter(l => nextIds.includes(l.id)).map(l => ({ id: l.id, label: l.label, color: l.color }));
    await setShareLists(share.id, objs);
    await reloadAll();
  };
  const peopleEmails = Array.from(new Set([
    ...outgoingShares.map(s => s.invited_email),
    ...sharedWithMe.map(s => s.owner_email),
  ]));
  const pmOut       = personModalEmail ? outgoingShares.find(s => s.invited_email === personModalEmail) : null;
  const pmSharedIds = pmOut ? (shareListsMap[pmOut.id] || []) : [];
  const pmColor     = personModalEmail ? personColors[personModalEmail] : null;

  const generateApiKey = async () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const key = "jmp_" + Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    await supabase.from("api_keys").upsert({ user_id: session.user.id, key });
    setApiKey(key);
  };

  const reloadAll = useCallback(async () => {
    if (!session) return;
    const uid = session.user.id;
    const email = session.user.email;
    {
      const [t, ev, ls, tr, pcs, incRes, outRes] = await Promise.all([
        loadTasks(uid), loadEvents(uid), loadLists(uid), loadTrash(uid),
        loadPersonColors(uid),
        supabase.from("shares").select("*").eq("invited_email", email).eq("status", "accepted"),
        supabase.from("shares").select("*").eq("owner_id", uid),
      ]);
      setTasks(t);
      setEvents(ev);
      setTrash(tr);
      if (ls) {
        setLists(ls);
      } else if (!seededLists.current) {
        seededLists.current = true;
        seedDefaultListsDB(uid, DEFAULT_LISTS).then(seeded => setLists(seeded));
      }

      const colorMap = {};
      pcs.forEach(({ email: e, color }) => { colorMap[e] = color; });
      setPersonColors(colorMap);

      // Gedeeld MET mij: per eigenaar de gedeelde lijsten + taken + afspraken
      const accepted = incRes.data || [];
      setSharedWithMe(accepted);
      const shared = await Promise.all(accepted.map(async (share) => {
        const [sl, sTasks, sEvents] = await Promise.all([
          loadShareLists(share.id), loadTasks(share.owner_id), loadEvents(share.owner_id),
        ]);
        return { share, sl, sTasks, sEvents };
      }));
      setSharedLists(shared.flatMap(({ share, sl }) => sl.map(l => ({
        id: prefixSharedId(share.owner_id, l.listId), label: l.label || "Gedeeld", color: l.color || "#9ca3af",
        isShared: true, ownerId: share.owner_id, ownerEmail: share.owner_email, permission: share.permission,
      }))));
      setSharedTasks(shared.flatMap(({ share, sTasks }) => sTasks.map(task => ({
        ...task, list: prefixSharedId(share.owner_id, task.list || "mine"),
        isShared: true, ownerId: share.owner_id, ownerEmail: share.owner_email, permission: share.permission,
      }))));
      setSharedEvents(shared.flatMap(({ share, sEvents }) => sEvents.map(e => ({
        ...e, isShared: true, ownerId: share.owner_id, ownerEmail: share.owner_email,
      }))));

      // Gedeeld DOOR mij: huidige lijst-selectie per uitgaande share
      const outgoing = outRes.data || [];
      setOutgoingShares(outgoing);
      const slMap = {};
      await Promise.all(outgoing.map(async (share) => {
        const sl = await loadShareLists(share.id);
        slMap[share.id] = sl.map(x => x.listId);
      }));
      setShareListsMap(slMap);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;
    reloadAll();

    // Realtime sync: eigen + gedeelde wijzigingen verschijnen direct
    const channel = supabase
      .channel(`user-data-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks'  }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists'  }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'share_lists' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shares' }, reloadAll)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session, reloadAll]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        totalRef.current = containerRef.current.offsetWidth;
        setWidths(prev => {
          const agentW = prev[3] ?? 44;
          const mid = totalRef.current - 320 - 320 - agentW - 18;
          return [320, Math.max(200, mid), 320, agentW];
        });
      }
    };
    if (session) {
      setTimeout(update, 0);
    }
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [session]);

  // Snap on release only
  const snapOnRelease = (raw, total) => {
    const min   = Math.max(40, Math.round(total * 0.05));
    const pts   = [min, Math.round(total * 0.50), total - min];
    const close = pts.find(p => Math.abs(raw - p) < total * 0.05);
    return close !== undefined ? close : raw;
  };

  const startDrag = (e, side) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!containerRef.current) return;

    let isDown = true;

    const applyDrag = (ev, snap) => {
      const rect   = containerRef.current.getBoundingClientRect();
      const total  = totalRef.current;
      const min    = Math.max(40, Math.round(total * 0.05));
      const cursor = ev.clientX - rect.left;

      setWidths(prev => {
        if (side === "left") {
          // Tasks ↔ Calendar; AI and Agents fixed — available = total minus fixed panels+splitters
          const avail = total - prev[2] - prev[3] - 18;
          const raw = Math.max(min, Math.min(cursor, avail - min));
          let w = snap ? snapOnRelease(raw, total) : raw;
          w = Math.max(min, Math.min(w, avail - min));
          return [w, avail - w, prev[2], prev[3]];
        } else if (side === "mid") {
          // Calendar ↔ AI; Tasks and Agents fixed
          const avail = total - prev[0] - prev[3] - 18;
          const raw = Math.max(min, Math.min(cursor - prev[0] - 6, avail - min));
          let cal = snap ? snapOnRelease(raw, total) : raw;
          cal = Math.max(min, Math.min(cal, avail - min));
          return [prev[0], cal, avail - cal, prev[3]];
        } else {
          // AI ↔ Agents with cascade push: agents growing pushes assistant → calendar → tasks
          const agentRaw = total - cursor - 3;
          let agent = snap ? snapOnRelease(Math.max(min, agentRaw), total) : agentRaw;
          agent = Math.max(min, Math.min(agent, total - 3 * min));

          const leftBudget = total - agent - 18;
          let t = prev[0], c = prev[1], a;

          if (leftBudget - t - c >= min) {
            // assistant absorbs it all
            a = leftBudget - t - c;
          } else if (leftBudget - t >= 2 * min) {
            // cascade into calendar
            a = min;
            c = leftBudget - t - min;
          } else if (leftBudget >= 3 * min) {
            // cascade into tasks
            a = min;
            c = min;
            t = leftBudget - 2 * min;
          } else {
            a = min;
            c = min;
            t = min;
          }

          return [t, c, a, agent];
        }
      });
    };

    const onMove = (ev) => {
      if (!isDown || ev.buttons !== 1) return;
      applyDrag(ev, false);
    };

    const onUp = (ev) => {
      isDown = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      applyDrag(ev, true);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startLeft  = (e) => startDrag(e, "left");
  const startMid   = (e) => startDrag(e, "mid");
  const startAgent = (e) => startDrag(e, "agent");

  const togglePanel = (key) => {
    setVisiblePanels(prev => {
      const nowVisible = !prev[key];
      const next = { ...prev, [key]: nowVisible };
      localStorage.setItem('jmp_panels', JSON.stringify(next));
      const idxMap = { tasks: 0, calendar: 1, assistant: 2, agents: 3 };
      const idx = idxMap[key];
      setWidths(w => {
        const nw = [...w];
        if (!nowVisible) {
          nw[1] = (nw[1] || 200) + nw[idx] + 6;
          nw[idx] = 0;
        } else {
          const grant = Math.min(280, Math.max(0, (nw[1] || 200) - 100));
          nw[1] = Math.max(100, (nw[1] || 200) - grant - 6);
          nw[idx] = grant || 280;
        }
        return nw;
      });
      return next;
    });
  };

  const total = totalRef.current;
  const min   = Math.max(40, Math.round(total * 0.05));
  const isCollapsedLeft  = widths[0] <= min + 10;
  const isCollapsedMid   = widths[1] !== null && widths[1] <= min + 10;
  const isCollapsedRight = widths[2] <= min + 10;
  const isCollapsedAgent = widths[3] <= min + 10;

  const CollapsedLabel = ({ label }) => (
    <div style={{ width:"100%", height:"100%", background:"#ffffff", display:"flex", alignItems:"center", justifyContent:"center", borderRight:"1px solid #e5e7eb" }}>
      <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:13, color:"#9ca3af", letterSpacing:2, writingMode:"vertical-rl", textOrientation:"mixed", transform:"rotate(180deg)", userSelect:"none" }}>{label}</span>
    </div>
  );

  if (authLoading) return (
    <div style={{ minHeight:"100vh", background:"#111827", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <span style={{ color:"#9ca3af", fontSize:14 }}>Laden...</span>
    </div>
  );

  if (!session) return <LoginPage />;
  if (resetMode) return <ResetPasswordPage onDone={() => setResetMode(false)} />;

  return (
    <LangContext.Provider value={lang}>
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width:4px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:#d1d5db; border-radius:2px; }
        @keyframes bounce { 0%,80%,100% { transform:scale(0.6); opacity:0.4 } 40% { transform:scale(1); opacity:1 } }
      `}</style>
      <div style={{ height:44, background:"#111827", display:"flex", alignItems:"center", padding:"0 20px", gap:16, flexShrink:0 }}>
        <span style={{ fontFamily:"'DM Sans', sans-serif", fontSize:16, fontWeight:700, color:"#f9fafb", letterSpacing:0.5 }}>justmyplan</span>
        <div style={{ width:8, height:8, borderRadius:"50%", background:"#DC2626" }} />
        <div style={{ width:8, height:8, borderRadius:"50%", background:"#E6B400" }} />
        <div style={{ width:8, height:8, borderRadius:"50%", background:"#2563EB" }} />
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:12, color:"#9ca3af" }}>{today.getDate()} {(MONTHS_BY_LANG[lang] || MONTHS_NL)[today.getMonth()]} {today.getFullYear()}</span>
          <button onClick={() => setShowSettings(true)}
            title="Instellingen"
            style={{ background:"none", border:"none", cursor:"pointer", color:"#9ca3af", fontSize:18, padding:"4px 6px", display:"flex", alignItems:"center", borderRadius:6, transition:"color 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.color="#f9fafb"}
            onMouseLeave={e => e.currentTarget.style.color="#9ca3af"}>
            ⚙
          </button>
        </div>
      </div>
      <div ref={containerRef} style={{ display:"flex", height:"calc(100vh - 44px)", overflow:"hidden" }}>
        {visiblePanels.tasks && <div style={{ width: widths[0] ?? 320, flexShrink:0, overflow:"hidden", transition:"width 0.12s ease" }}>
          {isCollapsedLeft ? <CollapsedLabel label={t(lang, 'tasks')} /> : <TaskPanel tasks={tasks} setTasks={setTasks} trash={trash} setTrash={setTrash} lists={lists} setLists={setLists} sharedLists={sharedLists} sharedTasks={sharedTasks} personColors={personColors} userId={session.user.id} panelWidth={widths[0]??320} />}
        </div>}
        {visiblePanels.tasks && (visiblePanels.calendar || visiblePanels.assistant || visiblePanels.agents) && <Splitter onMouseDown={startLeft} />}
        {visiblePanels.calendar && <div style={{ width: widths[1] ?? 200, flexShrink:0, overflow:"hidden", position:"relative", transition:"width 0.12s ease" }}>
          {isCollapsedMid ? <CollapsedLabel label={t(lang, 'calendar')} /> : <CalendarPanel events={events} setEvents={setEvents} tasks={tasks} sharedEvents={sharedEvents} personColors={personColors} invitees={outgoingShares.filter(s => s.status==="accepted").map(s => s.invited_email)} userId={session.user.id} panelWidth={widths[1]??200} />}
        </div>}
        {visiblePanels.calendar && (visiblePanels.assistant || visiblePanels.agents) && <Splitter onMouseDown={startMid} />}
        {visiblePanels.assistant && <div style={{ width: widths[2] ?? 320, flexShrink:0, overflow:"hidden", transition:"width 0.12s ease" }}>
          {isCollapsedRight ? <CollapsedLabel label={t(lang, 'assistant')} /> : <AIPanel tasks={tasks} events={events} setTasks={setTasks} setEvents={setEvents} userId={session.user.id} />}
        </div>}
        {visiblePanels.assistant && visiblePanels.agents && <Splitter onMouseDown={startAgent} />}
        {visiblePanels.agents && <div style={{ width: widths[3] ?? 44, flexShrink:0, overflow:"hidden", transition:"width 0.12s ease" }}>
          {isCollapsedAgent ? <CollapsedLabel label="Agents" /> : <AgentsPanel session={session} />}
        </div>}
      </div>

      {/* ── Instellingen modal ── */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#18181b", borderRadius:16, width:400, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ padding:"28px 28px 0", flexShrink:0 }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
              <span style={{ color:"#f9fafb", fontSize:17, fontWeight:700 }}>{t(lang, 'settings')}</span>
              <button onClick={() => setShowSettings(false)} style={{ background:"none", border:"none", color:"#9ca3af", fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
          </div>
          <div style={{ overflowY:"auto", padding:"0 28px 28px", flex:1 }}>

            {/* Account sectie */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>{t(lang, 'accountSection')}</div>
              <div style={{ fontSize:13, color:"#9ca3af", marginBottom:12 }}>{session.user.email}</div>
              <button onClick={() => { supabase.auth.signOut(); setShowSettings(false); }}
                style={{ width:"100%", padding:"9px 0", borderRadius:8, border:"1px solid #3f3f46", background:"none", color:"#f87171", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                {t(lang, 'logout')}
              </button>
            </div>

            <div style={{ height:1, background:"#27272a", marginBottom:20 }} />

            {/* Taal sectie */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>{t(lang, 'langSection')}</div>
              <select value={lang} onChange={e => { setLang(e.target.value); localStorage.setItem('jmp_lang', e.target.value); }}
                style={{ width:"100%", padding:"9px 10px", borderRadius:8, border:"1px solid #3f3f46", background:"#111827", color:"#f9fafb", fontSize:13, cursor:"pointer", outline:"none" }}>
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            <div style={{ height:1, background:"#27272a", marginBottom:20 }} />

            {/* API sectie */}
            <div>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>{t(lang, 'apiSection')}</div>
              <div style={{ fontSize:12, color:"#6b7280", marginBottom:12, lineHeight:1.5 }}>
                {t(lang, 'apiDesc')}
              </div>

              {/* API Key */}
              <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>{t(lang, 'apiKeyLabel')}</div>
              {apiKey ? (
                <>
                  <div style={{ background:"#111827", borderRadius:6, padding:"8px 10px", fontSize:11, color:"#60a5fa", fontFamily:"monospace", marginBottom:8, wordBreak:"break-all" }}>
                    {apiKey}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => navigator.clipboard.writeText(apiKey)}
                      style={{ flex:1, padding:"8px 0", borderRadius:6, border:"1px solid #3f3f46", background:"none", color:"#f9fafb", fontSize:12, cursor:"pointer" }}>
                      {t(lang, 'copy')}
                    </button>
                    <button onClick={generateApiKey}
                      style={{ flex:1, padding:"8px 0", borderRadius:6, border:"none", background:"#27272a", color:"#9ca3af", fontSize:12, cursor:"pointer" }}>
                      {t(lang, 'renew')}
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={generateApiKey}
                  style={{ width:"100%", padding:"9px 0", borderRadius:8, border:"none", background:"#2563EB", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  {t(lang, 'generate')}
                </button>
              )}

              {apiKey && (
                <div style={{ fontSize:11, color:"#6b7280", marginTop:12, lineHeight:1.5 }}>
                  {t(lang, 'apiUsage')} <code style={{ color:"#9ca3af" }}>Authorization: Bearer {apiKey.slice(0,12)}...</code>
                </div>
              )}
            </div>

            <div style={{ height:1, background:"#27272a", margin:"20px 0" }} />

            {/* Panelen sectie */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:14 }}>Panelen</div>
              {[
                { key:"tasks",     label:"Taken",           emoji:"✅" },
                { key:"calendar",  label:"Agenda",          emoji:"📅" },
                { key:"assistant", label:"Assistent",       emoji:"🤖" },
                { key:"agents",    label:"Agent Management",emoji:"⚡" },
              ].map(({ key, label, emoji }) => (
                <div key={key} onClick={() => togglePanel(key)}
                  style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", cursor:"pointer", borderBottom:"1px solid #27272a" }}>
                  <div style={{ width:20, height:20, borderRadius:4, border:`2px solid ${visiblePanels[key] ? "#2563EB" : "#3f3f46"}`, background: visiblePanels[key] ? "#2563EB" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                    {visiblePanels[key] && <span style={{ color:"#fff", fontSize:12, lineHeight:1 }}>✓</span>}
                  </div>
                  <span style={{ fontSize:14 }}>{emoji}</span>
                  <span style={{ fontSize:13, color: visiblePanels[key] ? "#f9fafb" : "#6b7280", flex:1 }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Delen */}
            <div style={{ borderTop:"1px solid #27272a", paddingTop:20, marginTop:20 }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:12 }}>Delen</div>

              {/* Uitnodigen */}
              <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                <input
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && invitePerson()}
                  placeholder="e-mailadres..."
                  style={{ flex:1, background:"#111827", border:"1px solid #3f3f46", borderRadius:6, color:"#f9fafb", fontSize:12, padding:"7px 10px", outline:"none" }}
                />
                <button onClick={invitePerson}
                  style={{ background:"#2563EB", border:"none", borderRadius:6, color:"#fff", fontSize:12, fontWeight:600, padding:"0 14px", cursor:"pointer" }}>
                  Uitnodigen
                </button>
              </div>

              {/* Personen: klik om kleur + welke lijsten ze zien in te stellen */}
              {peopleEmails.length > 0 && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:"#52525b", marginBottom:6 }}>Personen</div>
                  {peopleEmails.map(email => {
                    const out = outgoingShares.find(s => s.invited_email === email);
                    const myColor = personColors[email];
                    const dot = myColor ? PERSON_COLORS[myColor].dot : "#3f3f46";
                    return (
                      <div key={email} onClick={() => setPersonModalEmail(email)}
                        style={{ display:"flex", alignItems:"center", gap:8, background:"#111827", borderRadius:6, padding:"8px 10px", marginBottom:4, cursor:"pointer" }}>
                        <div style={{ width:11, height:11, borderRadius:"50%", background:dot, border: myColor ? "none" : "1px solid #3f3f46", flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:"#f9fafb", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{email}</div>
                          <div style={{ fontSize:9, color:"#52525b" }}>{out ? (out.status === "accepted" ? "tik om in te stellen" : "wacht op acceptatie") : "deelt met jou"}</div>
                        </div>
                        <span style={{ color:"#52525b", fontSize:14 }}>›</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inkomende uitnodigingen */}
              {incomingShares.length > 0 && (
                <div>
                  <div style={{ fontSize:11, color:"#52525b", marginBottom:6 }}>Uitnodigingen</div>
                  {incomingShares.map(s => (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, background:"#111827", borderRadius:6, padding:"7px 10px", marginBottom:4 }}>
                      <span style={{ flex:1, fontSize:11, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.owner_email}</span>
                      <button onClick={() => acceptInvitation(s.id)} style={{ background:"#166534", border:"none", borderRadius:4, color:"#4ade80", fontSize:11, padding:"3px 8px", cursor:"pointer" }}>✓</button>
                      <button onClick={() => declineInvitation(s.id)} style={{ background:"none", border:"none", color:"#6b7280", cursor:"pointer", fontSize:13, padding:"0 2px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* App Store */}
            <div style={{ borderTop:"1px solid #27272a", paddingTop:16, marginTop:20, display:"flex", justifyContent:"center" }}>
              <a href="https://apps.apple.com/app/justmyplan/id6761423591" target="_blank" rel="noopener noreferrer"
                style={{ display:"flex", alignItems:"center", gap:7, background:"#111827", border:"1px solid #3f3f46", borderRadius:8, padding:"7px 14px", textDecoration:"none" }}>
                <svg width="16" height="16" viewBox="0 0 814 1000" fill="#f9fafb" xmlns="http://www.w3.org/2000/svg">
                  <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-107.1C27.1 742 0 624.5 0 510.5c0-212.5 138.4-324.7 274.4-324.7 73.4 0 134.4 48.4 179.4 48.4 43.2 0 111.4-51.5 193.4-51.5 31.2 0 108.2 2.6 168.7 75.7zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
                </svg>
                <div>
                  <div style={{ fontSize:9, color:"#6b7280", lineHeight:1.2 }}>Download in de</div>
                  <div style={{ fontSize:12, color:"#f9fafb", fontWeight:600, lineHeight:1.2 }}>App Store</div>
                </div>
              </a>
            </div>

            {/* Support + Privacy */}
            <div style={{ paddingTop:14, display:"flex", justifyContent:"center", gap:20 }}>
              <a href="https://rjnieboer.com/support/justmyplan" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"#52525b", textDecoration:"none" }}>
                Support
              </a>
              <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:"#52525b", textDecoration:"none" }}>
                Privacy Policy
              </a>
            </div>

          </div>
          </div>
        </div>
      )}

      {/* ── Persoon-instellingen (popup over de instellingen) ── */}
      {personModalEmail && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", zIndex:80, display:"flex", alignItems:"center", justifyContent:"center" }}
          onClick={() => setPersonModalEmail(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#18181b", borderRadius:14, width:340, maxHeight:"85vh", overflowY:"auto", padding:22 }}>
            <div style={{ display:"flex", alignItems:"center", marginBottom:16 }}>
              <div style={{ flex:1, color:"#f9fafb", fontSize:14, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{personModalEmail}</div>
              <button onClick={() => setPersonModalEmail(null)} style={{ background:"none", border:"none", color:"#9ca3af", fontSize:18, cursor:"pointer" }}>✕</button>
            </div>

            <div style={{ fontSize:10, color:"#6b7280", fontWeight:700, letterSpacing:1, marginBottom:8 }}>KLEUR</div>
            <div style={{ display:"flex", gap:10, marginBottom:18 }}>
              {PERSON_COLOR_KEYS.map(key => (
                <div key={key} onClick={() => setPersonColor(personModalEmail, pmColor===key ? null : key)}
                  style={{ width:28, height:28, borderRadius:"50%", background: PERSON_COLORS[key].dot, cursor:"pointer", border: pmColor===key ? "3px solid #f9fafb" : "3px solid transparent", boxSizing:"border-box" }} />
              ))}
            </div>

            {pmOut ? (
              <>
                <div style={{ fontSize:10, color:"#6b7280", fontWeight:700, letterSpacing:1, marginBottom:8 }}>
                  WAT KAN {(personModalEmail||"").split("@")[0].toUpperCase()} ZIEN
                </div>
                {ownListsForShare.map(l => {
                  const on = pmSharedIds.includes(l.id);
                  return (
                    <div key={l.id} onClick={() => toggleShareList(pmOut, l.id)}
                      style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 2px", borderBottom:"1px solid #27272a", cursor:"pointer" }}>
                      <div style={{ width:9, height:9, borderRadius:"50%", background:l.color }} />
                      <div style={{ flex:1, color:"#f9fafb", fontSize:13 }}>{l.label}</div>
                      <div style={{ width:22, height:22, borderRadius:5, border:"2px solid "+(on?"#2563EB":"#3f3f46"), background:on?"#2563EB":"transparent", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:13 }}>{on?"✓":""}</div>
                    </div>
                  );
                })}
                <div style={{ fontSize:11, color:"#6b7280", marginTop:10, lineHeight:1.5 }}>Afspraken deel je per stuk in de agenda.</div>

                <div style={{ fontSize:10, color:"#6b7280", fontWeight:700, letterSpacing:1, margin:"18px 0 8px" }}>RECHTEN</div>
                <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                  {[["view","👁 Bekijken"],["edit","✏️ Bewerken"]].map(([p,labelTxt]) => (
                    <button key={p} onClick={() => updateSharePermission(pmOut.id, p)}
                      style={{ flex:1, border:"1px solid "+(pmOut.permission===p?"#2563EB":"#3f3f46"), background: pmOut.permission===p?"#1e3a8a":"transparent", color: pmOut.permission===p?"#fff":"#9ca3af", borderRadius:7, padding:"8px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}>{labelTxt}</button>
                  ))}
                </div>
                <button onClick={() => { removeShare(pmOut.id); setPersonModalEmail(null); }}
                  style={{ width:"100%", border:"1px solid #7f1d1d", background:"transparent", color:"#f87171", borderRadius:7, padding:"9px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}>Stop met delen</button>
              </>
            ) : (
              <div style={{ fontSize:12, color:"#9ca3af", lineHeight:1.6 }}>Deze persoon deelt met jou. Geef een kleur zodat je z'n gedeelde lijsten en afspraken herkent. Wil je zelf iets delen? Nodig 'm uit via z'n e-mailadres.</div>
            )}
          </div>
        </div>
      )}
    </>
    </LangContext.Provider>
  );
}