"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw, Save, GraduationCap, ChevronDown } from "lucide-react";

type Grade = "A" | "B" | "C" | "D" | "E" | "F";
type SemesterName = "First Semester" | "Second Semester";

type Course = {
  id: string;
  code: string;
  title: string;
  creditUnit: number;
  grade: Grade;
};

type Semester = {
  id: string;
  level: string;
  semester: SemesterName;
  courses: Course[];
};

const gradePoints: Record<Grade, number> = {
  A: 5, B: 4, C: 3, D: 2, E: 1, F: 0
};

const levels = ["100L", "200L", "300L", "400L", "500L"];
const semesters: SemesterName[] = ["First Semester", "Second Semester"];

function makeCourse(): Course {
  return {
    id: crypto.randomUUID(),
    code: "",
    title: "",
    creditUnit: 3,
    grade: "A"
  };
}

function makeSemester(level = "100L", semester: SemesterName = "First Semester"): Semester {
  return {
    id: crypto.randomUUID(),
    level,
    semester,
    courses: [makeCourse()]
  };
}

function getStats(courses: Course[]) {
  const totalCU = courses.reduce((sum, c) => sum + (Number(c.creditUnit) || 0), 0);
  const totalQP = courses.reduce(
    (sum, c) => sum + (Number(c.creditUnit) || 0) * gradePoints[c.grade],
    0
  );
  return { totalCU, totalQP, gp: totalCU ? totalQP / totalCU : 0 };
}

function classification(cgpa: number) {
  if (cgpa >= 4.5) return "First Class";
  if (cgpa >= 3.5) return "Second Class Upper";
  if (cgpa >= 2.4) return "Second Class Lower";
  if (cgpa >= 1.5) return "Third Class";
  if (cgpa > 0) return "Pass";
  return "—";
}

export default function Home() {
  const [records, setRecords] = useState<Semester[]>(() => {
    if (typeof window === "undefined") return [makeSemester()];
    try {
      const saved = localStorage.getItem("esut-cgpa-records");
      return saved ? JSON.parse(saved) : [makeSemester()];
    } catch {
      return [makeSemester()];
    }
  });

  const [activeId, setActiveId] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    if (!activeId && records[0]) setActiveId(records[0].id);
  }, [records, activeId]);

  const totals = useMemo(() => {
    const all = records.flatMap(r => r.courses);
    return getStats(all);
  }, [records]);

  const active = records.find(r => r.id === activeId) ?? records[0];
  const activeStats = getStats(active?.courses ?? []);

  function updateRecord(id: string, patch: Partial<Semester>) {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  function addSemester() {
    const used = new Set(records.map(r => `${r.level}-${r.semester}`));
    const next = levels.flatMap(l => semesters).find(s => !used.has(`${s.split("-")[0]}-${s.split("-")[1]}`));
    const fallback = { level: "500L", semester: "Second Semester" as SemesterName };
    const level = next ? next.split("-")[0] : fallback.level;
    const sem = next ? next.split("-")[1] as SemesterName : fallback.semester;
    const fresh = makeSemester(level, sem);
    setRecords(prev => [...prev, fresh]);
    setActiveId(fresh.id);
  }

  function removeSemester(id: string) {
    if (records.length === 1) return;
    const remaining = records.filter(r => r.id !== id);
    setRecords(remaining);
    if (id === activeId) setActiveId(remaining[0].id);
  }

  function updateCourse(courseId: string, patch: Partial<Course>) {
    if (!active) return;
    updateRecord(active.id, {
      courses: active.courses.map(c => c.id === courseId ? { ...c, ...patch } : c)
    });
  }

  function addCourse() {
    if (!active) return;
    updateRecord(active.id, { courses: [...active.courses, makeCourse()] });
  }

  function removeCourse(id: string) {
    if (!active || active.courses.length === 1) return;
    updateRecord(active.id, { courses: active.courses.filter(c => c.id !== id) });
  }

  function save() {
    localStorage.setItem("esut-cgpa-records", JSON.stringify(records));
    setSavedMessage("Saved to this device");
    setTimeout(() => setSavedMessage(""), 2200);
  }

  function reset() {
    if (!confirm("Clear all entered results?")) return;
    const fresh = makeSemester();
    setRecords([fresh]);
    setActiveId(fresh.id);
    localStorage.removeItem("esut-cgpa-records");
  }

  return (
    <main className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary p-2.5 text-white"><GraduationCap size={22} /></div>
            <div>
              <h1 className="text-lg font-bold">ESUT CGPA Calculator</h1>
              <p className="text-xs text-muted">Cumulative quality-point calculation</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold sm:flex">
              <Save size={16} /> Save
            </button>
            <button onClick={reset} className="rounded-lg border px-3 py-2 text-sm"><RotateCcw size={16} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[250px_1fr_280px]">
        <aside className="rounded-2xl border bg-white p-3">
          <div className="mb-3 flex items-center justify-between px-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Academic record</p>
              <p className="font-bold">Semesters</p>
            </div>
            <button onClick={addSemester} className="rounded-lg bg-primary p-2 text-white"><Plus size={17} /></button>
          </div>
          <div className="space-y-1">
            {records.map(r => {
              const s = getStats(r.courses);
              return (
                <button key={r.id} onClick={() => setActiveId(r.id)}
                  className={`w-full rounded-xl p-3 text-left ${r.id === activeId ? "bg-soft ring-1 ring-primary/20" : "hover:bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{r.level}</span>
                    <span className="text-sm font-bold">{s.gp.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-muted">{r.semester} · {s.totalCU} CU</p>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-2xl border bg-white p-5">
            <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-primary">Current semester</p>
                <h2 className="text-2xl font-bold">Enter your courses</h2>
              </div>
              {active && records.length > 1 && (
                <button onClick={() => removeSemester(active.id)} className="flex items-center gap-1 text-sm text-red-600">
                  <Trash2 size={15} /> Remove semester
                </button>
              )}
            </div>

            {active && (
              <>
                <div className="mb-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Level
                    <select value={active.level} onChange={e => updateRecord(active.id, { level: e.target.value })}
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 outline-none focus:border-primary">
                      {levels.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Semester
                    <select value={active.semester} onChange={e => updateRecord(active.id, { semester: e.target.value as SemesterName })}
                      className="mt-1 w-full rounded-lg border bg-white px-3 py-2.5 outline-none focus:border-primary">
                      {semesters.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                </div>

                <div className="hidden grid-cols-[1fr_1.4fr_90px_100px_42px] gap-2 px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted sm:grid">
                  <span>Course code</span><span>Course title</span><span>Credit</span><span>Grade</span><span />
                </div>

                <div className="space-y-2">
                  {active.courses.map(c => {
                    const qp = (Number(c.creditUnit) || 0) * gradePoints[c.grade];
                    return (
                      <div key={c.id} className="grid gap-2 rounded-xl border p-2 sm:grid-cols-[1fr_1.4fr_90px_100px_42px] sm:border-0 sm:p-0">
                        <input value={c.code} onChange={e => updateCourse(c.id, { code: e.target.value.toUpperCase() })}
                          placeholder="CPE 501" className="rounded-lg border px-3 py-2.5 outline-none focus:border-primary" />
                        <input value={c.title} onChange={e => updateCourse(c.id, { title: e.target.value })}
                          placeholder="Course title" className="rounded-lg border px-3 py-2.5 outline-none focus:border-primary" />
                        <input type="number" min="0" max="10" step="1" value={c.creditUnit}
                          onChange={e => updateCourse(c.id, { creditUnit: Math.max(0, Number(e.target.value)) })}
                          className="rounded-lg border px-3 py-2.5 outline-none focus:border-primary" />
                        <select value={c.grade} onChange={e => updateCourse(c.id, { grade: e.target.value as Grade })}
                          className="rounded-lg border bg-white px-3 py-2.5 font-bold outline-none focus:border-primary">
                          {(Object.keys(gradePoints) as Grade[]).map(g => <option key={g}>{g}</option>)}
                        </select>
                        <button onClick={() => removeCourse(c.id)} disabled={active.courses.length === 1}
                          className="flex items-center justify-center rounded-lg border text-red-500 disabled:cursor-not-allowed disabled:opacity-30">
                          <Trash2 size={17} />
                        </button>
                        <div className="sm:col-span-5 flex justify-end pr-12 text-xs text-muted">Quality point: <b className="ml-1 text-ink">{qp}</b></div>
                      </div>
                    );
                  })}
                </div>

                <button onClick={addCourse} className="mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold hover:bg-slate-50">
                  <Plus size={16} /> Add course
                </button>
              </>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Semester CU" value={activeStats.totalCU.toFixed(0)} />
            <Stat label="Semester QP" value={activeStats.totalQP.toFixed(0)} />
            <Stat label="Semester GP" value={activeStats.gp.toFixed(2)} />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-ink p-5 text-white">
            <p className="text-sm text-slate-300">Cumulative CGPA</p>
            <div className="mt-2 text-5xl font-bold">{totals.gp.toFixed(2)}</div>
            <p className="mt-2 text-sm text-slate-300">out of 5.00</p>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, totals.gp / 5 * 100)}%` }} />
            </div>
            <p className="mt-4 text-sm font-semibold">{classification(totals.gp)}</p>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold">Cumulative totals</h3>
            <div className="mt-4 space-y-3 text-sm">
              <Summary label="Total credit units" value={totals.totalCU.toFixed(0)} />
              <Summary label="Total quality points" value={totals.totalQP.toFixed(0)} />
              <Summary label="Semesters entered" value={records.length.toString()} />
            </div>
          </div>

          <div className="rounded-2xl border bg-white p-5">
            <h3 className="font-bold">Formula</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              Quality Point = Grade Point × Credit Unit
            </p>
            <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm font-semibold">
              CGPA = Total QP ÷ Total CU
            </p>
          </div>
        </aside>
      </div>

      {savedMessage && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {savedMessage}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between border-b pb-3 last:border-0 last:pb-0"><span className="text-muted">{label}</span><b>{value}</b></div>;
}