"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, RotateCcw, Save, Download, GraduationCap, Calculator,
  BookOpen, Sparkles, CircleHelp, Check, AlertCircle, FileText,
} from "lucide-react";
import {
  Course, Grade, Semester, SemesterName, GRADE_POINTS, LEVELS, SEMESTERS,
  makeCourse, makeSemester, getStats, getCumulativeStats, classification,
  sortRecords, validateRecords, courseQualityPoint,
} from "../lib/calculator";

const STORAGE_KEY = "esut-cgpa-records-v3";

export default function Home() {
  const [records, setRecords] = useState<Semester[]>(() => {
    if (typeof window === "undefined") return [makeSemester()];
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("esut-cgpa-records");
      return saved ? JSON.parse(saved) : [makeSemester()];
    } catch {
      return [makeSemester()];
    }
  });
  const [activeId, setActiveId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!activeId && records[0]) setActiveId(records[0].id);
  }, [activeId, records]);

  const ordered = useMemo(() => sortRecords(records), [records]);
  const totals = useMemo(() => getCumulativeStats(records), [records]);
  const active = records.find((r) => r.id === activeId) ?? records[0];
  const activeStats = getStats(active?.courses ?? []);
  const percentage = Math.min(100, Math.max(0, (totals.gp / 5) * 100));

  function flash(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3000);
  }

  function updateRecord(id: string, patch: Partial<Semester>) {
    setRecords((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }

  function addSemester() {
    const used = new Set(records.map((r) => `${r.level}-${r.semester}`));
    let chosen: { level: string; semester: SemesterName } | null = null;
    for (const level of LEVELS) {
      for (const semester of SEMESTERS) {
        if (!used.has(`${level}-${semester}`)) {
          chosen = { level, semester };
          break;
        }
      }
      if (chosen) break;
    }
    if (!chosen) {
      flash("error", "All ten semesters have already been added.");
      return;
    }
    const fresh = makeSemester(chosen.level, chosen.semester);
    setRecords((prev) => [...prev, fresh]);
    setActiveId(fresh.id);
  }

  function removeSemester(id: string) {
    if (records.length === 1) {
      flash("error", "At least one semester must remain.");
      return;
    }
    const remaining = records.filter((r) => r.id !== id);
    setRecords(remaining);
    if (id === activeId) setActiveId(remaining[0].id);
  }

  function updateCourse(courseId: string, patch: Partial<Course>) {
    if (!active) return;
    updateRecord(active.id, {
      courses: active.courses.map((c) => c.id === courseId ? { ...c, ...patch } : c),
    });
  }

  function addCourse() {
    if (!active) return;
    updateRecord(active.id, { courses: [...active.courses, makeCourse()] });
  }

  function removeCourse(id: string) {
    if (!active || active.courses.length === 1) return;
    updateRecord(active.id, { courses: active.courses.filter((c) => c.id !== id) });
  }

  function saveOnly() {
    const errors = validateRecords(records);
    if (errors.length) {
      flash("error", errors[0]);
      return false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    flash("success", "Academic record saved on this device.");
    return true;
  }

  async function exportPDF() {
    const errors = validateRecords(records);
    if (errors.length) {
      flash("error", errors[0]);
      return;
    }

    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      const margin = 16;
      let y = 18;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("ESUT CGPA CALCULATOR", margin, y);
      y += 7;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text("Academic performance report", margin, y);
      y += 8;

      doc.setDrawColor(220, 226, 235);
      doc.line(margin, y, 194, y);
      y += 9;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Cumulative Summary", margin, y);
      y += 7;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`CGPA: ${totals.gp.toFixed(2)} / 5.00`, margin, y);
      doc.text(`Classification: ${classification(totals.gp)}`, 105, y);
      y += 6;
      doc.text(`Total Credit Units: ${totals.totalCU.toFixed(0)}`, margin, y);
      doc.text(`Total Quality Points: ${totals.totalQP.toFixed(0)}`, 105, y);
      y += 10;

      for (const record of ordered) {
        const stats = getStats(record.courses);
        if (y > 265) { doc.addPage(); y = 18; }

        doc.setFillColor(241, 246, 255);
        doc.roundedRect(margin, y - 5, 178, 9, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(`${record.level} — ${record.semester}`, margin + 4, y + 1);
        doc.text(`GP ${stats.gp.toFixed(2)}  |  ${stats.totalCU} CU`, 135, y + 1);
        y += 9;

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.text("COURSE", margin, y);
        doc.text("TITLE", 57, y);
        doc.text("CU", 139, y);
        doc.text("GRADE", 153, y);
        doc.text("QP", 176, y);
        y += 5;
        doc.setFont("helvetica", "normal");

        for (const course of record.courses) {
          if (y > 278) { doc.addPage(); y = 18; }
          doc.text(course.code.slice(0, 15), margin, y);
          doc.text((course.title || "—").slice(0, 38), 57, y);
          doc.text(String(course.creditUnit), 140, y);
          doc.text(course.grade, 155, y);
          doc.text(String(courseQualityPoint(course)), 176, y);
          y += 5;
        }
        y += 5;
      }

      if (y > 270) { doc.addPage(); y = 18; }
      doc.setDrawColor(220, 226, 235);
      doc.line(margin, y, 194, y);
      y += 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Final CGPA: ${totals.gp.toFixed(2)} — ${classification(totals.gp)}`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Formula: CGPA = Total Quality Points ÷ Total Credit Units", margin, y + 6);
      doc.text(`Generated ${new Date().toLocaleString()}`, margin, y + 11);

      doc.save("ESUT-CGPA-Academic-Report.pdf");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      flash("success", "PDF exported and record saved.");
    } catch {
      flash("error", "PDF export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  function saveAndExport() {
    if (saveOnly()) exportPDF();
  }

  function reset() {
    if (!window.confirm("Clear the entire academic record? This cannot be undone.")) return;
    const fresh = makeSemester();
    setRecords([fresh]);
    setActiveId(fresh.id);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("esut-cgpa-records");
    flash("success", "Academic record cleared.");
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc]">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
              <GraduationCap size={22} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-950 sm:text-base">ESUT CGPA</h1>
              <p className="hidden text-[11px] font-medium text-slate-500 sm:block">Cumulative quality-point calculator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={saveAndExport} disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
              <Download size={16} />
              <span className="hidden sm:inline">{exporting ? "Creating PDF..." : "Save & PDF"}</span>
            </button>
            <button onClick={reset} aria-label="Reset"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50">
              <RotateCcw size={17} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
                <Sparkles size={13} /> Accurate cumulative calculation
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Know your real CGPA.</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-blue-100/80 sm:text-base">
                Enter every course from your first semester to your current semester.
                Total quality points are divided by total credit units — never average semester GPs.
              </p>
            </div>
            <div className="min-w-[190px] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100/70">Current CGPA</p>
              <p className="mt-1 text-4xl font-black">{totals.gp.toFixed(2)}</p>
              <p className="mt-1 text-xs font-semibold text-blue-100/70">{classification(totals.gp)}</p>
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between px-1 pb-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Academic record</p>
              <p className="text-sm font-extrabold text-slate-900">{records.length} semester{records.length === 1 ? "" : "s"} added</p>
            </div>
            <button onClick={addSemester}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700">
              <Plus size={15} /> Add semester
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {ordered.map((r) => {
              const s = getStats(r.courses);
              const selected = r.id === activeId;
              return (
                <button key={r.id} onClick={() => setActiveId(r.id)}
                  className={`min-w-[165px] rounded-xl border p-3 text-left transition ${selected ? "border-blue-200 bg-blue-50 shadow-sm" : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm font-extrabold ${selected ? "text-blue-700" : "text-slate-900"}`}>{r.level}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700 shadow-sm">{s.gp.toFixed(2)}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{r.semester} · {s.totalCU} CU</p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-blue-600">
                    <Calculator size={17} />
                    <span className="text-xs font-extrabold uppercase tracking-wider">Current semester</span>
                  </div>
                  <h3 className="text-2xl font-black tracking-tight text-slate-950">Enter your courses</h3>
                  <p className="mt-1 text-sm text-slate-500">Add every course, credit unit and grade.</p>
                </div>
                {active && records.length > 1 && (
                  <button onClick={() => removeSemester(active.id)}
                    className="inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50">
                    <Trash2 size={14} /> Remove semester
                  </button>
                )}
              </div>

              {active && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Level
                    <select value={active.level} onChange={(e) => updateRecord(active.id, { level: e.target.value })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10">
                      {LEVELS.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-bold text-slate-600">Semester
                    <select value={active.semester} onChange={(e) => updateRecord(active.id, { semester: e.target.value as SemesterName })}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10">
                      {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </div>

            {active && (
              <div className="p-4 sm:p-6">
                <div className="mb-2 hidden grid-cols-[1fr_1.35fr_90px_100px_42px] gap-2 px-1 text-[10px] font-black uppercase tracking-wider text-slate-400 sm:grid">
                  <span>Course code</span><span>Course title</span><span>Credit</span><span>Grade</span><span />
                </div>
                <div className="space-y-3">
                  {active.courses.map((c, index) => {
                    const qp = courseQualityPoint(c);
                    return (
                      <div key={c.id} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3 transition hover:border-slate-300 hover:bg-white sm:grid sm:grid-cols-[1fr_1.35fr_90px_100px_42px] sm:items-center sm:gap-2 sm:border-transparent sm:bg-transparent sm:p-1">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Course code</label>
                          <input value={c.code} onChange={(e) => updateCourse(c.id, { code: e.target.value.toUpperCase() })}
                            placeholder="CPE 501" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0" />
                        </div>
                        <div className="mt-2 sm:mt-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Course title</label>
                          <input value={c.title} onChange={(e) => updateCourse(c.id, { title: e.target.value })}
                            placeholder="Course title" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0" />
                        </div>
                        <div className="mt-2 sm:mt-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Credit unit</label>
                          <input type="number" min="1" max="10" step="1" value={c.creditUnit}
                            onChange={(e) => updateCourse(c.id, { creditUnit: Math.max(0, Number(e.target.value)) })}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0" />
                        </div>
                        <div className="mt-2 sm:mt-0">
                          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Grade</label>
                          <select value={c.grade} onChange={(e) => updateCourse(c.id, { grade: e.target.value as Grade })}
                            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0">
                            {(Object.keys(GRADE_POINTS) as Grade[]).map((g) => <option key={g}>{g}</option>)}
                          </select>
                        </div>
                        <button onClick={() => removeCourse(c.id)} disabled={active.courses.length === 1} aria-label={`Remove course ${index + 1}`}
                          className="mt-2 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 sm:mt-0">
                          <Trash2 size={16} />
                        </button>
                        <div className="mt-2 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-xs sm:col-span-5 sm:mt-0 sm:justify-end sm:bg-transparent sm:px-1">
                          <span className="font-medium text-slate-400 sm:hidden">Quality point</span>
                          <span className="font-extrabold text-slate-700">{qp} QP</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button onClick={addCourse}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50/50 px-4 py-3 text-sm font-extrabold text-blue-700 hover:border-blue-300 hover:bg-blue-50 sm:w-auto">
                  <Plus size={17} /> Add course
                </button>

                <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">
                  <CircleHelp size={15} className="mt-0.5 shrink-0 text-slate-400" />
                  <span>Quality point = <b>grade point × credit unit</b>. CGPA = <b>all QP ÷ all CU</b>.</span>
                </div>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-blue-100">Cumulative CGPA</p>
                  <BookOpen size={19} className="text-blue-100" />
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-black">{totals.gp.toFixed(2)}</span><span className="pb-1 text-sm font-bold text-blue-100">/ 5.00</span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                  <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${percentage}%` }} />
                </div>
                <p className="mt-3 text-sm font-bold">{classification(totals.gp)}</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-slate-100">
                <Stat label="Total CU" value={totals.totalCU.toFixed(0)} />
                <Stat label="Total QP" value={totals.totalQP.toFixed(0)} />
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600"><Calculator size={16} /></div>
                <h4 className="font-extrabold text-slate-900">This semester</h4>
              </div>
              <div className="mt-4 space-y-3">
                <SummaryRow label="Credit units" value={activeStats.totalCU.toFixed(0)} />
                <SummaryRow label="Quality points" value={activeStats.totalQP.toFixed(0)} />
                <SummaryRow label="Semester GP" value={activeStats.gp.toFixed(2)} highlight />
              </div>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex items-center gap-2 text-blue-700"><Sparkles size={16} /><h4 className="text-sm font-extrabold">The formula</h4></div>
              <p className="mt-3 text-sm leading-6 text-blue-900/70">Your result uses the actual total credit units and quality points from every entered semester.</p>
              <div className="mt-3 rounded-xl bg-white/80 p-3 text-center text-sm font-black text-blue-800">CGPA = Total QP ÷ Total CU</div>
            </div>

            <button onClick={exportPDF} disabled={exporting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60">
              <FileText size={17} /> {exporting ? "Creating report..." : "Export academic report"}
            </button>
          </aside>
        </div>
      </div>

      {notice && (
        <div className={`fixed bottom-5 left-1/2 z-50 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-white shadow-2xl ${notice.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>
          {notice.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />} {notice.text}
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>;
}

function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`text-sm font-black ${highlight ? "text-blue-600" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}
