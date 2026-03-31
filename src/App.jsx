import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "./supabase.js";
import { loadTasks, loadEvents, loadLists, addTaskDB, updateTaskDB, deleteTaskDB, addEventDB, updateEventDB, deleteEventDB, addListDB, updateListDB, deleteListDB } from "./db.js";

const today = new Date();
const getTodayKey = () => {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
};
const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
const DAYS = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
const MONTHS = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
const MONTHS_SHORT = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);

function getWeekDates(base) {
  const d = new Date(base);
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - day + 1);
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate()+i); return x; });
}

function formatDeadline(dk) {
  if (!dk) return "—";
  const tk = getTodayKey();
  if (dk === tk) return "Vandaag";
  const tom = new Date(); tom.setDate(tom.getDate()+1);
  const tomKey = dateKey(tom);
  const yes = new Date(); yes.setDate(yes.getDate()-1);
  const yesKey = dateKey(yes);
  if (dk === tomKey) return "Morgen";
  if (dk === yesKey) return "Gisteren";
  const d = new Date(dk + "T12:00:00");
  return d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
}

const PRIO_COLOR = { "": "#9ca3af", hoog: "#DC2626", midden: "#E6B400", laag: "#2563EB" };
const PRIO_BG    = { "": "#f3f4f6", hoog: "#FEE2E2", midden: "#FFF176", laag: "#DBEAFE" };
const STATUS_COLOR = { "": "#9ca3af", open: "#2563EB", bezig: "#E6B400", klaar: "#2563EB" };
const STATUS_BG    = { "": "#f3f4f6", open: "#DBEAFE", bezig: "#FFF176", klaar: "#DBEAFE" };
const EVENT_BG     = { blue: "#DBEAFE", red: "#FEE2E2", yellow: "#FFF176" };
const EVENT_BORDER = { blue: "#2563EB", red: "#DC2626", yellow: "#E6B400" };

const pastDate    = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()-2));
const futureDate  = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate()+5));

const DEFAULT_LISTS = [
  { id: "mine",       label: "Mijn taken",  color: "#2563EB" },
  { id: "school",     label: "School",      color: "#E6B400" },
  { id: "huishouden", label: "Huishouden",  color: "#DC2626" },
  { id: "werk",       label: "Werk",        color: "#DC2626" },
];


// ── DATE PICKER ──────────────────────────────────────────────────────────────
function DatePicker({ value, onChange, onClose }) {
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
          {MONTHS[viewMonth]} {viewYear}
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
        {["Ma","Di","Wo","Do","Vr","Za","Zo"].map(d => (
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
        <button onClick={clearDate} style={{ fontSize:11, color:"#9ca3af", background:"none", border:"none", cursor:"pointer" }}>Datum wissen</button>
      </div>
    </div>
  );
}

// ── TASK PANEL ────────────────────────────────────────────────────────────────
function TaskPanel({ tasks, setTasks, trash, setTrash, lists, setLists, userId, panelWidth }) {
  const showSidebar = panelWidth > 400;
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [activeList, setActiveList] = useState("mine");
  const [fadingOut, setFadingOut] = useState({}); // id -> true when animating out
  const [datePickerOpen, setDatePickerOpen] = useState(null); // task id
  const [openNoteId, setOpenNoteId] = useState(null);
  const [sharedLists, setSharedLists] = useState([
    { id: "lisa", label: "Lisa", color: "#E6B400" },
  ]);
  const [addingShared, setAddingShared] = useState(false);
  const [newSharedName, setNewSharedName] = useState("");

  const addShared = () => {
    if (!newSharedName.trim()) return;
    const colors = ["#E6B400","#DC2626","#2563EB"];
    const color = colors[sharedLists.length % 3];
    const id = "shared_" + Date.now();
    setSharedLists(l => [...l, { id, label: newSharedName.trim(), color }]);
    setNewSharedName(""); setAddingShared(false); setActiveList(id);
  };
  const removeShared = (id) => {
    setSharedLists(l => l.filter(x => x.id !== id));
    if (activeList === id) setActiveList("mine");
  };
  const sharedDemoTasks = [
    { id: 9001, title: "Samen boodschappen", priority: "midden", status: "open", deadline: getTodayKey(), list: "lisa" },
    { id: 9002, title: "Verjaardag cadeau",  priority: "hoog",   status: "open", deadline: null, list: "lisa" },
  ];
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

  const allTasks = [...tasks.map(t => ({ ...t, list: t.list || "mine" })), ...sharedDemoTasks];
  const visibleTasks = allTasks.filter(t => t.list === activeList);
  const sorted = [...visibleTasks].sort((a, b) => {
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  });

  const completeDone = (id) => {
    setFadingOut(f => ({ ...f, [id]: true }));
    setTimeout(() => {
      const task = tasks.find(t => t.id === id);
      if (task) {
        deleteTaskDB(id);
        setTrash(tr => [...tr, { ...task, completedAt: new Date().toISOString() }]);
        setTasks(t => t.filter(x => x.id !== id));
      }
      setFadingOut(f => { const n = { ...f }; delete n[id]; return n; });
    }, 2000);
  };

  const restoreTask = (id) => {
    const task = visibleTrash.find(t => t.id === id);
    if (task) {
      const { completedAt, ...restored } = task;
      const newTask = { ...restored, status: "open" };
      addTaskDB(userId, newTask).then(saved => {
        setTasks(t => [...t, saved]);
      });
      setTrash(tr => tr.filter(t => t.id !== id));
    }
  };

  const deleteForever = (id) => setTrash(tr => tr.filter(t => t.id !== id));

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
      return updated;
    }));
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
  const activeLabel = isTrash ? "Prullebak" : ([...lists, ...sharedLists].find(l => l.id===activeList)?.label || "Taken");

  const COL = { name: 200, date: 100, prio: 88, status: 80, del: 28 };
  const TABLE_MIN = COL.name + COL.date + COL.prio + COL.status + COL.del + 41;
  const cb = { borderRight: "1px solid #e5e7eb" };
  const prioLabel   = (p) => p==="hoog" ? "Hoog" : p==="midden" ? "Gemiddeld" : p==="laag" ? "Laag" : "—";
  const statusLabel = (s) => s==="open" ? "Open" : s==="bezig" ? "Bezig" : s==="klaar" ? "Klaar" : "—";

  return (
    <div style={{ display:"flex", height:"100%", background:"#ffffff" }}>
      <style>{`
        @keyframes fadeStrike { 0% { opacity:1; } 100% { opacity:0; } }
        .fading-task { animation: fadeStrike 2s ease forwards; text-decoration: line-through; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: showSidebar ? 160 : 0, flexShrink:0, background:"#18181b", display:"flex", flexDirection:"column", borderRight: showSidebar ? "1px solid #27272a" : "none", overflow:"hidden", transition:"width 1.5s ease" }}>
        <div style={{ padding:"16px 12px 8px", fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2 }}>MIJN LIJSTEN</div>
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
              placeholder="Naam lijst..." autoFocus
              style={{ width:"100%", background:"#27272a", border:"none", borderBottom:"2px solid #2563EB", color:"#f4f4f5", fontSize:12, padding:"4px", outline:"none", boxSizing:"border-box" }} />
          </div>
        ) : (
          <div onClick={() => setAddingList(true)} style={{ padding:"6px 12px", fontSize:11, color:"#52525b", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:14 }}>+</span> Nieuwe lijst
          </div>
        )}

        <div style={{ padding:"14px 12px 8px", fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2, marginTop:8, borderTop:"1px solid #27272a", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span>GEDEELD</span>
          <span onClick={() => setAddingShared(true)} style={{ fontSize:16, color:"#52525b", cursor:"pointer", lineHeight:1 }}
            onMouseEnter={e => e.currentTarget.style.color="#a1a1aa"}
            onMouseLeave={e => e.currentTarget.style.color="#52525b"}>+</span>
        </div>
        {sharedLists.map(l => (
          <div key={l.id} onClick={() => setActiveList(l.id)} style={{
            display:"flex", alignItems:"center", gap:8, padding:"7px 12px", cursor:"pointer", overflow:"hidden",
            background: activeList===l.id ? "#27272a" : "transparent",
            borderLeft: activeList===l.id ? "3px solid "+l.color : "3px solid transparent"
          }}
            onMouseEnter={e => e.currentTarget.querySelector(".rm-shared").style.opacity="1"}
            onMouseLeave={e => e.currentTarget.querySelector(".rm-shared").style.opacity="0"}>
            <div style={{ width:8, height:8, borderRadius:"50%", background:l.color, flexShrink:0 }} />
            <div style={{ minWidth:0, flex:1 }}>
              <div style={{ fontSize:12, color: activeList===l.id ? "#f4f4f5" : "#a1a1aa", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{l.label}</div>
              <div style={{ fontSize:10, color:"#52525b" }}>gedeeld</div>
            </div>
            <button className="rm-shared" onClick={e => { e.stopPropagation(); removeShared(l.id); }}
              style={{ opacity:0, background:"none", border:"none", color:"#52525b", cursor:"pointer", fontSize:12, padding:"0 2px", flexShrink:0, transition:"opacity 0.15s" }}>✕</button>
          </div>
        ))}
        {addingShared ? (
          <div style={{ padding:"6px 12px" }}>
            <input value={newSharedName} onChange={e => setNewSharedName(e.target.value)} autoFocus
              onKeyDown={e => { if(e.key==="Enter") addShared(); if(e.key==="Escape"){ setAddingShared(false); setNewSharedName(""); } }}
              placeholder="Naam persoon..."
              style={{ width:"100%", background:"#27272a", border:"none", borderBottom:"2px solid #E6B400", color:"#f4f4f5", fontSize:12, padding:"4px", outline:"none", boxSizing:"border-box" }} />
          </div>
        ) : null}

        {/* Trash — pinned to bottom */}
        <div style={{ flex:1 }} />
        <div onClick={() => setActiveList("trash")} style={{
          display:"flex", alignItems:"center", gap:8, padding:"10px 12px", cursor:"pointer", borderTop:"1px solid #27272a",
          background: activeList==="trash" ? "#27272a" : "transparent",
          borderLeft: activeList==="trash" ? "3px solid #6b7280" : "3px solid transparent"
        }}>
          <span style={{ fontSize:14 }}>🗑</span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:12, color: activeList==="trash" ? "#f4f4f5" : "#71717a" }}>Prullebak</div>
            {visibleTrash.length > 0 && <div style={{ fontSize:10, color:"#52525b" }}>{visibleTrash.length} voltooid</div>}
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
          {isShared && <span style={{ fontSize:10, background:"#f3f4f6", color:"#6b7280", borderRadius:4, padding:"2px 6px", fontWeight:700 }}>GEDEELD</span>}
          {isTrash && <span style={{ fontSize:11, color:"#9ca3af", marginLeft:4 }}>Taken worden automatisch verwijderd na 1 maand</span>}
          {!isTrash && !isShared && lists.length > 1 && (
            <button onClick={deleteList} title="Lijst verwijderen"
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
              <div style={{ padding:"40px 24px", textAlign:"center", color:"#9ca3af", fontSize:13 }}>Prullebak is leeg</div>
            ) : (
              <div style={{ minWidth:TABLE_MIN }}>
                <div style={{ display:"flex", alignItems:"stretch", borderBottom:"2px solid #e5e7eb", background:"#f9fafb", position:"sticky", top:0, zIndex:5 }}>
                  <div style={{ width:COL.name+41, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>NAAM</div>
                  <div style={{ width:COL.date, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>VOLTOOID OP</div>
                  <div style={{ width:COL.prio, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", textAlign:"center", ...cb, background:"#f9fafb" }}>PRIORITEIT</div>
                  <div style={{ flex:1, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", background:"#f9fafb" }}>ACTIES</div>
                </div>
                {[...visibleTrash].sort((a,b) => b.completedAt > a.completedAt ? 1 : -1).map(task => {
                  const d = new Date(task.completedAt);
                  const completedStr = d.getDate() + " " + MONTHS_SHORT[d.getMonth()];
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
                        <button onClick={() => restoreTask(task.id)} style={{ fontSize:11, background:"#2563EB", color:"#fff", border:"none", borderRadius:3, padding:"3px 10px", cursor:"pointer", fontWeight:700 }}>Terugzetten</button>
                        <button onClick={() => deleteForever(task.id)} style={{ fontSize:11, background:"none", color:"#DC2626", border:"1px solid #DC2626", borderRadius:3, padding:"3px 10px", cursor:"pointer" }}>Verwijder</button>
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
                <div style={{ width:COL.name+41, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>NAAM</div>
                <div style={{ width:COL.date, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", ...cb, background:"#f9fafb" }}>VERVALDATUM</div>
                <div style={{ width:COL.prio, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", textAlign:"center", ...cb, background:"#f9fafb" }}>PRIORITEIT</div>
                <div style={{ width:COL.status, flexShrink:0, fontSize:11, fontWeight:700, color:"#6b7280", letterSpacing:0.8, padding:"6px 10px", textAlign:"center", ...cb, background:"#f9fafb" }}>STATUS</div>
                <div style={{ width:COL.del, flexShrink:0, background:"#f9fafb" }} />
              </div>
              {sorted.map(task => {
                const tk = getTodayKey();
                const dlColor = !task.deadline ? "#9ca3af" : task.deadline < tk ? "#DC2626" : task.deadline===tk ? "#2563EB" : "#111827";
                const dlWeight = task.deadline && task.deadline <= tk ? 700 : 400;
                const isFading = fadingOut[task.id];
                return (
                  <div key={task.id} className={isFading ? "fading-task" : ""}
                    style={{ borderBottom:"1px solid #f3f4f6", background:"#fff" }}
                    onMouseEnter={e => { if(!isFading) e.currentTarget.firstChild.style.background="#f9fafb"; }}
                    onMouseLeave={e => { if(e.currentTarget.firstChild) e.currentTarget.firstChild.style.background="#fff"; }}>
                    <div style={{ display:"flex", alignItems:"center", background:"inherit" }}>
                    <div style={{ width:41, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", ...cb, alignSelf:"stretch" }}>
                      <button onClick={() => !isShared && completeDone(task.id)} style={{ width:15, height:15, borderRadius:"50%", cursor: isShared ? "default" : "pointer", border:"2px solid #d1d5db", background:"transparent", flexShrink:0 }} />
                    </div>
                    <div onClick={() => !isShared && setOpenNoteId(openNoteId===task.id ? null : task.id)}
                      style={{ width:COL.name, flexShrink:0, fontSize:13, color:"#111827", padding:"8px 10px", textDecoration: isFading ? "line-through" : "none", opacity: isFading ? 0.4 : 1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", cursor: isShared ? "default" : "pointer", ...cb, display:"flex", alignItems:"center", gap:5 }}>
                      <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{task.title}</span>
                      {task.note && <span title="Notitie aanwezig" style={{ flexShrink:0, fontSize:10, color:"#9ca3af" }}>📝</span>}
                    </div>
                    <div style={{ width:COL.date, flexShrink:0, fontSize:12, padding:"8px 10px", color:dlColor, fontWeight:dlWeight, ...cb, cursor:"pointer", position:"relative" }}
                      onClick={e => { e.stopPropagation(); if(!isShared && !isFading) setDatePickerOpen(datePickerOpen===task.id ? null : task.id); }}>
                      {formatDeadline(task.deadline)}
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
                    <div style={{ width:COL.status, flexShrink:0, display:"flex", justifyContent:"center", padding:"8px 6px", ...cb }}>
                      <span onClick={() => !isShared && cycleStatus(task.id)} style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:4, cursor: isShared ? "default" : "pointer", background:STATUS_BG[task.status], color:STATUS_COLOR[task.status], userSelect:"none", whiteSpace:"nowrap" }}>{statusLabel(task.status)}</span>
                    </div>
                    <div style={{ width:COL.del, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                      {!isShared && <button onClick={() => remove(task.id)} style={{ background:"none", border:"none", color:"#d1d5db", cursor:"pointer", fontSize:16, lineHeight:1 }}>x</button>}
                    </div>
                    </div>
                    {openNoteId === task.id && !isShared && (
                      <div style={{ padding:"6px 12px 10px 52px", borderTop:"1px solid #f3f4f6", background:"#fafafa" }}>
                        <textarea
                          autoFocus
                          value={task.note || ""}
                          onChange={e => { const note = e.target.value; setTasks(t => t.map(x => { if (x.id!==task.id) return x; const u={...x,note}; updateTaskDB(u); return u; })); }}
                          placeholder="Notitie toevoegen..."
                          rows={2}
                          style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"6px 8px", fontSize:12, outline:"none", resize:"none", color:"#374151", background:"#fff", fontFamily:"'DM Sans', sans-serif", boxSizing:"border-box", display:"block" }}
                        />
                        <button onClick={() => setOpenNoteId(null)}
                          style={{ marginTop:5, background:"#2563EB", color:"#fff", border:"none", borderRadius:3, padding:"3px 10px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                          Opslaan
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
                      placeholder="Taaknaam..." autoFocus
                      style={{ width:"100%", border:"none", borderBottom:"2px solid "+activeColor, fontSize:13, outline:"none", padding:"2px 0", color:"#111827" }} />
                  </div>
                  <div style={{ flex:1, padding:"6px 10px", display:"flex", gap:8, alignItems:"center" }}>
                    <button onClick={addTask} style={{ fontSize:11, background:activeColor, color:"#fff", border:"none", borderRadius:3, padding:"3px 8px", cursor:"pointer" }}>+ Voeg toe</button>
                    <button onClick={() => { setAdding(false); setNewTitle(""); }} style={{ fontSize:11, background:"none", color:"#9ca3af", border:"none", cursor:"pointer" }}>Annuleer</button>
                  </div>
                </div>
              ) : (
                <div onClick={() => setAdding(true)} style={{ padding:"7px 12px 8px 52px", fontSize:12, color:"#9ca3af", cursor:"pointer", borderBottom:"1px solid #f3f4f6" }}
                  onMouseEnter={e => { e.currentTarget.style.color=activeColor; e.currentTarget.style.background="#f9fafb"; }}
                  onMouseLeave={e => { e.currentTarget.style.color="#9ca3af"; e.currentTarget.style.background="transparent"; }}>
                  + Taak toevoegen
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
function CalendarPanel({ events, setEvents, userId, panelWidth }) {
  const showSidebar = panelWidth > 400;
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
  const [otherAgendas, setOtherAgendas] = useState([
    { id: "lisa", label: "Lisa", color: "#DC2626", on: true },
  ]);
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
  };

  const addEvent = () => {
    if (!newTitle.trim() || !adding) return;
    const eventData = { title: newTitle.trim(), note: modalNote.trim(), date: adding.date, startH: modalStartH, startM: modalStartM, endH: modalEndH, endM: modalEndM, color: modalColor };
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

  return (
    <div style={{ display:"flex", height:"100%", background:"#ffffff" }}>

      {/* Sidebar */}
      <div style={{ width: showSidebar ? 160 : 0, flexShrink:0, background:"#18181b", display:"flex", flexDirection:"column", borderRight: showSidebar ? "1px solid #27272a" : "none", overflow:"hidden", transition:"width 1.5s ease" }}>

        {/* Maken knop */}
        <div style={{ padding:"14px 12px 10px" }}>
          <button onClick={() => openAdding(getTodayKey(), 9)} style={{ width:"100%", background:"#27272a", border:"none", borderRadius:5, color:"#f4f4f5", fontSize:12, fontWeight:700, padding:"8px 0", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
            onMouseEnter={e => e.currentTarget.style.background="#3f3f46"}
            onMouseLeave={e => e.currentTarget.style.background="#27272a"}>
            <span style={{ fontSize:16, lineHeight:1 }}>+</span> Maken
          </button>
        </div>

        {/* Mijn agenda's */}
        <div style={{ borderTop:"1px solid #27272a" }}>
          <div onClick={() => setMyOpen(o => !o)} style={{ padding:"10px 12px 6px", display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }}>
            <span style={{ fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2 }}>MIJN AGENDA&apos;S</span>
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
            <span style={{ fontSize:11, fontWeight:700, color:"#52525b", letterSpacing:1.2 }}>ANDERE AGENDA&apos;S</span>
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
          {addingAgenda ? (
            <div style={{ padding:"6px 12px" }}>
              <input value={newAgendaName} onChange={e => setNewAgendaName(e.target.value)} autoFocus
                onKeyDown={e => { if(e.key==="Enter") addAgenda(); if(e.key==="Escape"){ setAddingAgenda(false); setNewAgendaName(""); } }}
                placeholder="Naam..." 
                style={{ width:"100%", background:"#27272a", border:"none", borderBottom:"2px solid #2563EB", color:"#f4f4f5", fontSize:12, padding:"4px", outline:"none", boxSizing:"border-box" }} />
            </div>
          ) : (
            <div onClick={() => setAddingAgenda(true)} style={{ padding:"5px 12px 10px", fontSize:11, color:"#52525b", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
              onMouseEnter={e => e.currentTarget.style.color="#a1a1aa"}
              onMouseLeave={e => e.currentTarget.style.color="#52525b"}>
              <span>+</span> Agenda toevoegen
            </div>
          )}
        </div>
      </div>

      {/* Main calendar area */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"14px 16px 10px", borderBottom:"1px solid #e5e7eb", position:"relative" }} onClick={() => { setMonthPickerOpen(false); setYearPickerOpen(false); }}>

        {/* Month picker */}
        <div style={{ position:"relative" }}>
          <span onClick={e => { e.stopPropagation(); setMonthPickerOpen(o => !o); setYearPickerOpen(false); }}
            style={{ fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#111827", cursor:"pointer", borderBottom: monthPickerOpen ? "2px solid #2563EB" : "2px solid transparent", paddingBottom:1 }}>
            {MONTHS[currentMonth]}
          </span>
          {monthPickerOpen && (
            <div onClick={e => e.stopPropagation()} style={{ position:"absolute", top:"110%", left:0, zIndex:50, background:"#fff", border:"1px solid #e5e7eb", borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", width:140, maxHeight:260, overflowY:"auto", padding:"4px 0" }}>
              {MONTHS.map((m, i) => (
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
          <button onClick={() => setWeekBase(new Date(today))} style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:3, padding:"0 8px", height:28, cursor:"pointer", color:"#374151", fontSize:11, fontWeight:700 }}>NU</button>
          <button onClick={nextWeek} style={{ background:"none", border:"1px solid #e5e7eb", borderRadius:3, width:28, height:28, cursor:"pointer", color:"#374151", fontSize:14 }}>›</button>
        </div>
      </div>
      <div style={{ display:"flex", borderBottom:"1px solid #e5e7eb" }}>
        <div style={{ width:44, flexShrink:0 }} />
        {weekDates.map((d, i) => {
          const isToday = dateKey(d) === getTodayKey();
          return (
            <div key={i} style={{ flex:1, textAlign:"center", padding:"6px 0" }}>
              <div style={{ fontSize:10, color:"#9ca3af", fontWeight:700, letterSpacing:1 }}>{DAYS[i]}</div>
              <div style={{ fontSize:16, fontWeight:700, width:28, height:28, lineHeight:"28px", borderRadius:"50%", margin:"2px auto 0", background: isToday ? "#2563EB" : "transparent", color: isToday ? "#fff" : "#111827" }}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
      <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
        <div style={{ display:"flex", minHeight: HOURS.length * HOUR_H }}>
          <div style={{ width:44, flexShrink:0 }}>
            {HOURS.map(h => (
              <div key={h} style={{ height:HOUR_H, borderBottom:"1px solid #f3f4f6", paddingRight:6, display:"flex", alignItems:"flex-start", justifyContent:"flex-end" }}>
                <span style={{ fontSize:10, color:"#9ca3af", paddingTop:4 }}>{pad(h)}:00</span>
              </div>
            ))}
          </div>
          {weekDates.map((d, di) => {
            const dk = dateKey(d);
            const dayEvents = events.filter(e => e.date===dk);
            return (
              <div key={di} style={{ flex:1, position:"relative", borderLeft:"1px solid #f3f4f6" }}>
                {HOURS.map(h => (
                  <div key={h} onClick={() => openAdding(dk, h)}
                    style={{ height:HOUR_H, borderBottom:"1px solid #f3f4f6", cursor:"pointer" }}
                    onMouseEnter={e => e.currentTarget.style.background="#f9fafb"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"} />
                ))}
                {dayEvents.map(ev => {
                  const top = (ev.startH - HOURS[0] + ev.startM/60) * HOUR_H;
                  const height = ((ev.endH - ev.startH) + (ev.endM - ev.startM)/60) * HOUR_H - 2;
                  return (
                    <div key={ev.id} onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setEditNote(ev.note||""); setEditMode(false); setEditTitle(ev.title); setEditStartH(ev.startH); setEditStartM(ev.startM); setEditEndH(ev.endH); setEditEndM(ev.endM); setEditColor(ev.color||'blue'); }}
                      style={{ position:"absolute", top, left:2, right:2, height, background: EVENT_BG[ev.color]||"#DBEAFE", borderLeft:"3px solid "+(EVENT_BORDER[ev.color]||"#2563EB"), borderRadius:3, padding:"3px 5px", overflow:"hidden", zIndex:2, cursor:"pointer" }}>
                      <div style={{ fontSize:11, fontWeight:700, color: EVENT_BORDER[ev.color]||"#2563EB", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ev.title}</div>
                      <div style={{ fontSize:10, color:"#6b7280" }}>{pad(ev.startH)}:{pad(ev.startM)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
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
                {editMode ? "✕ Annuleer" : "✎ Bewerk"}
              </button>
            </div>

            {/* Time — view or edit */}
            {editMode ? (
              <div style={{ display:"flex", flexDirection:"column", gap:6, margin:"10px 0 14px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#6b7280", width:36 }}>Van</span>
                  <TimeSelect h={editStartH} m={editStartM} onChangeH={setEditStartH} onChangeM={setEditStartM} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:12, color:"#6b7280", width:36 }}>Tot</span>
                  <TimeSelect h={editEndH} m={editEndM} onChangeH={setEditEndH} onChangeM={setEditEndM} />
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:4 }}>
                  <span style={{ fontSize:12, color:"#6b7280", width:36 }}>Kleur</span>
                  {[["blue","#2563EB"],["red","#DC2626"],["yellow","#E6B400"]].map(([key, hex]) => (
                    <div key={key} onClick={() => setEditColor(key)} style={{ width:20, height:20, borderRadius:"50%", background:hex, cursor:"pointer", border: editColor===key ? "3px solid #111827" : "3px solid transparent", boxSizing:"border-box" }} />
                  ))}
                </div>
                <button onClick={() => {
                  const updated = { ...selectedEvent, title: editTitle, startH: editStartH, startM: editStartM, endH: editEndH, endM: editEndM, color: editColor };
                  updateEventDB(updated);
                  setEvents(evs => evs.map(x => x.id===selectedEvent.id ? updated : x));
                  setSelectedEvent(updated);
                  setEditMode(false);
                }} style={{ marginTop:4, background:"#2563EB", color:"#fff", border:"none", borderRadius:4, padding:"7px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  Wijzigingen opslaan
                </button>
              </div>
            ) : (
              <div style={{ fontSize:12, color:"#6b7280", marginBottom:14 }}>
                {selectedEvent.date} &nbsp;·&nbsp; {pad(selectedEvent.startH)}:{pad(selectedEvent.startM)} – {pad(selectedEvent.endH)}:{pad(selectedEvent.endM)}
              </div>
            )}

            {/* Note */}
            <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:6 }}>Notitie</div>
            <div style={{ marginBottom:12 }}>
              <textarea value={editNote} onChange={e => setEditNote(e.target.value)}
                placeholder="Voeg een notitie toe..."
                rows={3}
                style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 10px", fontSize:12, outline:"none", boxSizing:"border-box", resize:"none", color:"#374151", fontFamily:"'DM Sans', sans-serif", display:"block" }} />
              <button onClick={() => { const updated = {...selectedEvent, note: editNote}; updateEventDB(updated); setEvents(evs => evs.map(x => x.id===selectedEvent.id ? updated : x)); setSelectedEvent(null); }}
                style={{ marginTop:6, background:"#2563EB", color:"#fff", border:"none", borderRadius:3, padding:"4px 12px", fontSize:11, fontWeight:700, cursor:"pointer" }}>
                Opslaan
              </button>
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { deleteEventDB(selectedEvent.id); setEvents(evs => evs.filter(x => x.id!==selectedEvent.id)); setSelectedEvent(null); }}
                style={{ flex:1, background:"#FEE2E2", color:"#DC2626", border:"none", borderRadius:4, padding:"8px 12px", cursor:"pointer", fontSize:13, fontWeight:700 }}>Verwijder</button>
              <button onClick={() => setSelectedEvent(null)}
                style={{ background:"#f3f4f6", color:"#374151", border:"none", borderRadius:4, padding:"8px 12px", cursor:"pointer", fontSize:13 }}>Sluit</button>
            </div>
          </div>
        </div>
      )}
      {adding && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:50, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:8, padding:20, width:300, boxShadow:"0 20px 40px rgba(0,0,0,0.15)" }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14, color:"#111827" }}>Afspraak toevoegen</div>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key==="Enter" && addEvent()}
              placeholder="Titel..." autoFocus
              style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 10px", fontSize:13, outline:"none", boxSizing:"border-box", marginBottom:14 }} />
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:16 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:"#6b7280", width:36 }}>Van</span>
                <TimeSelect h={modalStartH} m={modalStartM} onChangeH={setModalStartH} onChangeM={setModalStartM} />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:"#6b7280", width:36 }}>Tot</span>
                <TimeSelect h={modalEndH} m={modalEndM} onChangeH={setModalEndH} onChangeM={setModalEndM} />
              </div>
            </div>
            {/* Color picker */}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
              <span style={{ fontSize:12, color:"#6b7280", width:36 }}>Kleur</span>
              {[["blue","#2563EB"],["red","#DC2626"],["yellow","#E6B400"]].map(([key, hex]) => (
                <div key={key} onClick={() => setModalColor(key)} style={{ width:22, height:22, borderRadius:"50%", background:hex, cursor:"pointer", border: modalColor===key ? "3px solid #111827" : "3px solid transparent", boxSizing:"border-box" }} />
              ))}
            </div>
            {/* Note */}
            <div style={{ marginBottom:14 }}>
              <textarea value={modalNote} onChange={e => setModalNote(e.target.value)}
                placeholder="Notitie (optioneel)..."
                rows={3}
                style={{ width:"100%", border:"1px solid #e5e7eb", borderRadius:4, padding:"8px 10px", fontSize:12, outline:"none", boxSizing:"border-box", resize:"none", color:"#374151", fontFamily:"'DM Sans', sans-serif", display:"block" }} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={addEvent} style={{ flex:1, background:"#2563EB", color:"#fff", border:"none", borderRadius:4, padding:"8px", cursor:"pointer", fontSize:13, fontWeight:700 }}>Toevoegen</button>
              <button onClick={() => setAdding(null)} style={{ background:"#f3f4f6", color:"#374151", border:"none", borderRadius:4, padding:"8px 12px", cursor:"pointer", fontSize:13 }}>Annuleer</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ── AI PANEL ──────────────────────────────────────────────────────────────────
function AIPanel({ tasks, events }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Goeiedag! Ik ben je planningsassistent.\n\nIk zie je taken en agenda. Ik kan je helpen:\n- Taken inplannen op vrije momenten\n- Goede voornemens slim verdelen\n- Je week overzichtelijker maken\n\nWat wil je aanpakken?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const buildContext = () => {
    const taskList = tasks.map(t => "- " + t.title + " (" + t.priority + " prioriteit, " + t.status + (t.deadline ? ", deadline: " + t.deadline : "") + ")").join("\n");
    const eventList = events.map(e => "- " + e.title + " op " + e.date + " van " + pad(e.startH) + ":" + pad(e.startM) + " tot " + pad(e.endH) + ":" + pad(e.endM)).join("\n");
    const todayStr = today.getDate() + " " + MONTHS[today.getMonth()] + " " + today.getFullYear();
    return "Je bent een slimme, vriendelijke planningsassistent. Je helpt de gebruiker hun agenda en taken beheren.\n\nVandaag is het: " + todayStr + "\n\nTAKEN VAN DE GEBRUIKER:\n" + (taskList || "Geen taken") + "\n\nAFSPRAKEN VAN DE GEBRUIKER:\n" + (eventList || "Geen afspraken") + "\n\nGeef concrete, praktische adviezen. Hou antwoorden kort en duidelijk. Spreek Nederlands.";
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role:"user", content:userMsg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: buildContext(),
          messages: newMessages.map(m => ({ role:m.role, content:m.content }))
        })
      });
      const data = await response.json();
      const reply = data.content?.[0]?.text || "Sorry, er ging iets mis.";
      setMessages(m => [...m, { role:"assistant", content:reply }]);
    } catch(err) {
      setMessages(m => [...m, { role:"assistant", content:"Er is een verbindingsfout opgetreden." }]);
    }
    setLoading(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#fafafa" }}>
      <div style={{ padding:"18px 16px 12px", borderBottom:"1px solid #e5e7eb" }}>
        <div style={{ fontFamily:"'DM Sans', sans-serif", fontSize:18, color:"#111827" }}>Assistent</div>
        <div style={{ fontSize:11, color:"#9ca3af", marginTop:2 }}>{tasks.length} taken - {events.length} afspraken</div>
      </div>
      <div style={{ flex:1, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display:"flex", justifyContent: m.role==="user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth:"85%", padding:"10px 13px", borderRadius: m.role==="user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role==="user" ? "#2563EB" : "#ffffff", color: m.role==="user" ? "#fff" : "#111827", fontSize:13, lineHeight:1.5, whiteSpace:"pre-wrap", boxShadow:"0 1px 3px rgba(0,0,0,0.08)", border: m.role==="assistant" ? "1px solid #e5e7eb" : "none" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:4, padding:"10px 13px", background:"#fff", borderRadius:"12px 12px 12px 2px", width:"fit-content", border:"1px solid #e5e7eb" }}>
            {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:"#2563EB", animation:"bounce 1.2s infinite", animationDelay:(i*0.2)+"s" }} />)}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding:"6px 14px", display:"flex", gap:6, flexWrap:"wrap", borderTop:"1px solid #e5e7eb" }}>
        {["Plan mijn taken in","Vrije momenten deze week","Goede voornemens inplannen"].map(q => (
          <button key={q} onClick={() => setInput(q)} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:20, padding:"4px 10px", fontSize:11, cursor:"pointer", color:"#374151", whiteSpace:"nowrap" }}>{q}</button>
        ))}
      </div>
      <div style={{ padding:"10px 14px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && !e.shiftKey && send()}
          placeholder="Vraag iets aan je assistent..."
          style={{ flex:1, border:"1px solid #e5e7eb", borderRadius:20, padding:"8px 14px", fontSize:13, outline:"none", background:"#fff" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ width:36, height:36, borderRadius:"50%", background: input.trim() ? "#2563EB" : "#e5e7eb", border:"none", cursor: input.trim() ? "pointer" : "default", color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>&#8593;</button>
      </div>
    </div>
  );
}

// ── SPLITTER ──────────────────────────────────────────────────────────────────
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
  const [session, setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [tasks, setTasks]         = useState([]);
  const [events, setEvents]       = useState([]);
  const [lists, setLists]         = useState(DEFAULT_LISTS);
  const [trash, setTrash]         = useState([]);
  const [widths, setWidths]       = useState([320, null, 320]);
  const [apiKey, setApiKey]               = useState(null);
  const [showSettings, setShowSettings]   = useState(false);
  const [outgoingShares, setOutgoingShares] = useState([]);
  const [incomingShares, setIncomingShares] = useState([]);
  const [inviteEmail, setInviteEmail]     = useState("");
  const [invitePermission, setInvitePermission] = useState("view");
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
    const { data, error } = await supabase.from("shares").insert({
      owner_id: session.user.id,
      owner_email: session.user.email,
      invited_email: email,
      permission: invitePermission,
    }).select().single();
    if (!error && data) {
      setOutgoingShares(s => [...s, data]);
      setInviteEmail("");
    }
  };

  const removeShare = async (id) => {
    await supabase.from("shares").delete().eq("id", id);
    setOutgoingShares(s => s.filter(x => x.id !== id));
  };

  const updateSharePermission = async (id, permission) => {
    await supabase.from("shares").update({ permission }).eq("id", id);
    setOutgoingShares(s => s.map(x => x.id === id ? { ...x, permission } : x));
  };

  const acceptInvitation = async (id) => {
    await supabase.from("shares").update({ status: "accepted" }).eq("id", id);
    setIncomingShares(s => s.filter(x => x.id !== id));
  };

  const declineInvitation = async (id) => {
    await supabase.from("shares").update({ status: "declined" }).eq("id", id);
    setIncomingShares(s => s.filter(x => x.id !== id));
  };

  const generateApiKey = async () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const key = "jmp_" + Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    await supabase.from("api_keys").upsert({ user_id: session.user.id, key });
    setApiKey(key);
  };

  useEffect(() => {
    if (!session) return;
    const uid = session.user.id;

    const reloadAll = () =>
      Promise.all([loadTasks(uid), loadEvents(uid), loadLists(uid)]).then(([t, ev, ls]) => {
        setTasks(t);
        setEvents(ev);
        if (ls) setLists(ls);
      });

    reloadAll();

    // Realtime sync: wijzigingen vanaf telefoon verschijnen direct in de web app
    const channel = supabase
      .channel(`user-data-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks',  filter: `user_id=eq.${uid}` }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${uid}` }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists',  filter: `user_id=eq.${uid}` }, reloadAll)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [session]);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        totalRef.current = containerRef.current.offsetWidth;
        const mid = totalRef.current - 320 - 320 - 12;
        setWidths([320, Math.max(200, mid), 320]);
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
      const rect  = containerRef.current.getBoundingClientRect();
      const total = totalRef.current;
      const min   = Math.max(40, Math.round(total * 0.05));
      const cursorFromLeft = ev.clientX - rect.left;

      setWidths(prev => {
        if (side === "left") {
          // Left splitter: left grows/shrinks, middle absorbs, right fixed
          const rawLeft = Math.max(min, Math.min(cursorFromLeft, total - min - min - 12));
          const w    = snap ? snapOnRelease(rawLeft, total) : rawLeft;
          const mid  = Math.max(min, total - w - prev[2] - 12);
          return [w, mid, prev[2]];
        } else {
          // Right splitter: right grows/shrinks leftward
          // Middle absorbs first; if middle hits min, left absorbs too
          const rawRight = Math.max(min, Math.min(total - cursorFromLeft - 6, total - min - min - 12));
          const w    = snap ? snapOnRelease(rawRight, total) : rawRight;
          const remaining = total - w - 12; // space for left + mid
          // distribute: keep left fixed if possible, shrink mid first
          const mid  = Math.max(min, remaining - prev[0] - 12);
          const left = Math.max(min, remaining - mid - 12);
          return [left, mid, w];
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
  const startRight = (e) => startDrag(e, "right");

  const total = totalRef.current;
  const min   = Math.max(40, Math.round(total * 0.05));
  const isCollapsedLeft  = widths[0] <= min + 10;
  const isCollapsedMid   = widths[1] !== null && widths[1] <= min + 10;
  const isCollapsedRight = widths[2] <= min + 10;

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
          <span style={{ fontSize:12, color:"#9ca3af" }}>{today.getDate()} {MONTHS[today.getMonth()]} {today.getFullYear()}</span>
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
        <div style={{ width: widths[0] ?? 320, flexShrink:0, overflow:"hidden", transition:"width 0.12s ease" }}>
          {isCollapsedLeft ? <CollapsedLabel label="Taken" /> : <TaskPanel tasks={tasks} setTasks={setTasks} trash={trash} setTrash={setTrash} lists={lists} setLists={setLists} userId={session.user.id} panelWidth={widths[0]??320} />}
        </div>
        <Splitter onMouseDown={startLeft} />
        <div style={{ width: widths[1] ?? 200, flexShrink:0, overflow:"hidden", position:"relative", transition:"width 0.12s ease" }}>
          {isCollapsedMid ? <CollapsedLabel label="Agenda" /> : <CalendarPanel events={events} setEvents={setEvents} userId={session.user.id} panelWidth={widths[1]??200} />}
        </div>
        <Splitter onMouseDown={startRight} />
        <div style={{ width: widths[2] ?? 320, flexShrink:0, overflow:"hidden", transition:"width 0.12s ease" }}>
          {isCollapsedRight ? <CollapsedLabel label="Assistent" /> : <AIPanel tasks={tasks} events={events} />}
        </div>
      </div>

      {/* ── Instellingen modal ── */}
      {showSettings && (
        <div onClick={() => setShowSettings(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#18181b", borderRadius:16, width:400, maxHeight:"88vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.5)" }}>
          <div style={{ padding:"28px 28px 0", flexShrink:0 }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:24 }}>
              <span style={{ color:"#f9fafb", fontSize:17, fontWeight:700 }}>⚙ Instellingen</span>
              <button onClick={() => setShowSettings(false)} style={{ background:"none", border:"none", color:"#9ca3af", fontSize:20, cursor:"pointer" }}>✕</button>
            </div>
          </div>
          <div style={{ overflowY:"auto", padding:"0 28px 28px", flex:1 }}>

            {/* Account sectie */}
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>Account</div>
              <div style={{ fontSize:13, color:"#9ca3af", marginBottom:12 }}>{session.user.email}</div>
              <button onClick={() => { supabase.auth.signOut(); setShowSettings(false); }}
                style={{ width:"100%", padding:"9px 0", borderRadius:8, border:"1px solid #3f3f46", background:"none", color:"#f87171", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                Uitloggen
              </button>
            </div>

            <div style={{ height:1, background:"#27272a", marginBottom:20 }} />

            {/* API sectie */}
            <div>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:10 }}>API Toegang</div>
              <div style={{ fontSize:12, color:"#6b7280", marginBottom:12, lineHeight:1.5 }}>
                Gebruik je API key om je taken en agenda op te vragen vanuit andere apps of Claude.
              </div>

              {/* API Key */}
              <div style={{ fontSize:11, color:"#6b7280", marginBottom:4 }}>API Key</div>
              {apiKey ? (
                <>
                  <div style={{ background:"#111827", borderRadius:6, padding:"8px 10px", fontSize:11, color:"#60a5fa", fontFamily:"monospace", marginBottom:8, wordBreak:"break-all" }}>
                    {apiKey}
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <button onClick={() => navigator.clipboard.writeText(apiKey)}
                      style={{ flex:1, padding:"8px 0", borderRadius:6, border:"1px solid #3f3f46", background:"none", color:"#f9fafb", fontSize:12, cursor:"pointer" }}>
                      Kopieer
                    </button>
                    <button onClick={generateApiKey}
                      style={{ flex:1, padding:"8px 0", borderRadius:6, border:"none", background:"#27272a", color:"#9ca3af", fontSize:12, cursor:"pointer" }}>
                      Vernieuwen
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={generateApiKey}
                  style={{ width:"100%", padding:"9px 0", borderRadius:8, border:"none", background:"#2563EB", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  Genereer API key
                </button>
              )}

              {apiKey && (
                <div style={{ fontSize:11, color:"#6b7280", marginTop:12, lineHeight:1.5 }}>
                  Gebruik header: <code style={{ color:"#9ca3af" }}>Authorization: Bearer {apiKey.slice(0,12)}...</code>
                </div>
              )}
            </div>

            <div style={{ height:1, background:"#27272a", margin:"20px 0" }} />

            {/* ── Delen sectie ── */}
            <div>
              <div style={{ fontSize:11, color:"#6b7280", fontWeight:700, letterSpacing:1, textTransform:"uppercase", marginBottom:14 }}>Delen</div>

              {/* Uitgedeeld aan */}
              <div style={{ fontSize:12, color:"#9ca3af", marginBottom:8, fontWeight:600 }}>Gedeeld door mij</div>
              {outgoingShares.length === 0 && (
                <div style={{ fontSize:12, color:"#3f3f46", marginBottom:12 }}>Nog niemand uitgenodigd</div>
              )}
              {outgoingShares.map(s => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, background:"#111827", borderRadius:8, padding:"8px 10px" }}>
                  <span style={{ flex:1, fontSize:12, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.invited_email}</span>
                  <span style={{ fontSize:10, color: s.status === "accepted" ? "#4ade80" : "#6b7280", marginRight:4 }}>
                    {s.status === "accepted" ? "actief" : "wacht..."}
                  </span>
                  {/* Permissie toggle */}
                  <button onClick={() => updateSharePermission(s.id, s.permission === "view" ? "edit" : "view")}
                    title={s.permission === "view" ? "Bekijken — klik voor bewerken" : "Bewerken — klik voor bekijken"}
                    style={{ background:"#27272a", border:"none", borderRadius:6, padding:"3px 8px", cursor:"pointer", fontSize:14 }}>
                    {s.permission === "view" ? "👁" : "✏️"}
                  </button>
                  <button onClick={() => removeShare(s.id)}
                    style={{ background:"none", border:"none", cursor:"pointer", color:"#6b7280", fontSize:14, padding:2 }}>✕</button>
                </div>
              ))}

              {/* Uitnodigen */}
              <div style={{ display:"flex", gap:6, marginTop:10 }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && invitePerson()}
                  placeholder="e-mailadres..."
                  style={{ flex:1, background:"#111827", border:"1px solid #3f3f46", borderRadius:6, padding:"7px 10px", fontSize:12, color:"#f9fafb", outline:"none" }} />
                <button onClick={() => setInvitePermission(p => p === "view" ? "edit" : "view")}
                  title={invitePermission === "view" ? "Bekijken" : "Bewerken"}
                  style={{ background:"#27272a", border:"1px solid #3f3f46", borderRadius:6, padding:"6px 10px", cursor:"pointer", fontSize:14 }}>
                  {invitePermission === "view" ? "👁" : "✏️"}
                </button>
                <button onClick={invitePerson}
                  style={{ background:"#2563EB", border:"none", borderRadius:6, padding:"6px 12px", color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                  Uitnodigen
                </button>
              </div>

              {/* Binnenkomende uitnodigingen */}
              {incomingShares.length > 0 && (
                <>
                  <div style={{ height:1, background:"#27272a", margin:"16px 0 12px" }} />
                  <div style={{ fontSize:12, color:"#9ca3af", marginBottom:8, fontWeight:600 }}>Uitnodigingen</div>
                  {incomingShares.map(s => (
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, background:"#111827", borderRadius:8, padding:"8px 10px" }}>
                      <span style={{ fontSize:14 }}>{s.permission === "view" ? "👁" : "✏️"}</span>
                      <span style={{ flex:1, fontSize:12, color:"#9ca3af", overflow:"hidden", textOverflow:"ellipsis" }}>{s.owner_email}</span>
                      <button onClick={() => acceptInvitation(s.id)}
                        style={{ background:"#166534", border:"none", borderRadius:6, padding:"3px 8px", color:"#4ade80", fontSize:12, cursor:"pointer" }}>✓</button>
                      <button onClick={() => declineInvitation(s.id)}
                        style={{ background:"none", border:"none", cursor:"pointer", color:"#6b7280", fontSize:14 }}>✕</button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
          </div>
        </div>
      )}
    </>
  );
}