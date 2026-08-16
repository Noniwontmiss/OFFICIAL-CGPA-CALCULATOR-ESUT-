"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  Calculator,
  Check,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  Course,
  Grade,
  LEVELS,
  GRADE_POINTS,
  Semester,
  SemesterName,
  SEMESTERS,
  classification,
  courseQualityPoint,
  getCumulativeStats,
  getStats,
  makeCourse,
  makeSemester,
  semesterKey,
  sortRecords,
  validateRecords,
} from "../lib/calculator";

const STORAGE_KEY = "esut-cgpa-records-v4";

export default function Home() {
  const [records, setRecords] = useState<Semester[]>(() => loadRecords());
  const [activeId, setActiveId] = useState("");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSemesterModal, setShowSemesterModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!activeId && records[0]) setActiveId(records[0].id);
    if (activeId && !records.some((record) => record.id === activeId)) {
      setActiveId(records[0]?.id ?? "");
    }
  }, [activeId, records]);

  const ordered = useMemo(() => sortRecords(records), [records]);
  const active = records.find((record) => record.id === activeId) ?? ordered[0];
  const totals = useMemo(() => getCumulativeStats(records), [records]);
  const activeStats = getStats(active?.courses ?? []);
  const availableSemesters = LEVELS.flatMap((level) =>
    SEMESTERS.map((semester) => ({ level, semester }))
  ).filter(({ level, semester }) => !records.some((record) => semesterKey(record) === `${level}-${semester}`));
  const percentage = Math.min(100, Math.max(0, (totals.gp / 5) * 100));

  function flash(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3200);
  }

  function updateRecord(id: string, patch: Partial<Semester>) {
    setRecords((prev) => prev.map((record) => (record.id === id ? { ...record, ...patch } : record)));
  }

  function addSemester(level: string, semester: SemesterName) {
    if (records.some((record) => semesterKey(record) === `${level}-${semester}`)) {
      flash("error", `${level} ${semester} is already in your academic record.`);
      return;
    }
    const fresh = makeSemester(level, semester);
    setRecords((prev) => [...prev, fresh]);
    setActiveId(fresh.id);
    setShowSemesterModal(false);
    setShowCourseModal(false);
  }

  function removeSemester(id: string) {
    if (records.length === 1) {
      flash("error", "At least one semester must remain.");
      return;
    }
    const remaining = records.filter((record) => record.id !== id);
    setRecords(remaining);
    if (id === activeId) setActiveId(sortRecords(remaining)[0]?.id ?? "");
  }

  function updateCourse(courseId: string, patch: Partial<Course>) {
    if (!active) return;
    updateRecord(active.id, {
      courses: active.courses.map((course) => (course.id === courseId ? { ...course, ...patch } : course)),
    });
  }

  function addCourse(course: Course) {
    if (!active) return;
    updateRecord(active.id, { courses: [...active.courses, course] });
    setShowCourseModal(false);
  }

  function removeCourse(id: string) {
    if (!active || active.courses.length === 1) {
      flash("error", "Keep at least one course in the semester.");
      return;
    }
    updateRecord(active.id, { courses: active.courses.filter((course) => course.id !== id) });
  }

  function saveRecord() {
    const errors = validateRecords(records);
    if (errors.length) {
      flash("error", errors[0]);
      return false;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    localStorage.setItem("esut-cgpa-records", JSON.stringify(records));
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
      const margin = 14;
      const pageWidth = 210;
      const contentWidth = pageWidth - margin * 2;
      let y = 18;

      const addPageIfNeeded = (height = 10) => {
        if (y + height > 278) {
          doc.addPage();
          y = 18;
        }
      };

      doc.setFillColor(37, 87, 226);
      doc.roundedRect(margin, y - 6, contentWidth, 30, 4, 4, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.text("ESUT CGPA CALCULATOR", margin + 7, y + 3);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text("Academic performance report", margin + 7, y + 10);
      doc.text(`Generated ${new Date().toLocaleDateString()}`, margin + 7, y + 16);
      y += 34;

      doc.setTextColor(20, 29, 48);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Cumulative summary", margin, y);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`CGPA: ${totals.gp.toFixed(2)} / 5.00`, margin, y);
      doc.text(`Class: ${classification(totals.gp)}`, 85, y);
      doc.text(`Total CU: ${totals.totalCU}`, 145, y);
      y += 6;
      doc.text(`Total Quality Points: ${totals.totalQP}`, margin, y);
      y += 10;

      for (const record of ordered) {
        const stats = getStats(record.courses);
        addPageIfNeeded(35);
        doc.setFillColor(241, 246, 255);
        doc.roundedRect(margin, y - 5, contentWidth, 9, 2, 2, "F");
        doc.setTextColor(37, 87, 180);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10.5);
        doc.text(`${record.level} — ${record.semester}`, margin + 4, y + 1);
        doc.text(`GP ${stats.gp.toFixed(2)} | ${stats.totalCU} CU`, 151, y + 1);
        y += 10;

        doc.setTextColor(90, 103, 122);
        doc.setFontSize(8);
        doc.text("COURSE", margin, y);
        doc.text("TITLE", 55, y);
        doc.text("CU", 140, y);
        doc.text("GRADE", 153, y);
        doc.text("QP", 178, y);
        y += 5;
        doc.setTextColor(25, 35, 52);
        doc.setFont("helvetica", "normal");

        for (const course of record.courses) {
          addPageIfNeeded(8);
          doc.text(course.code.slice(0, 16), margin, y);
          doc.text((course.title || "—").slice(0, 37), 55, y);
          doc.text(String(course.creditUnit), 141, y);
          doc.text(course.grade, 155, y);
          doc.text(String(courseQualityPoint(course)), 178, y);
          y += 5.5;
        }
        y += 6;
      }

      addPageIfNeeded(20);
      doc.setDrawColor(220, 226, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 7;
      doc.setTextColor(20, 29, 48);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Final CGPA: ${totals.gp.toFixed(2)} — ${classification(totals.gp)}`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Formula: CGPA = Total Quality Points / Total Credit Units", margin, y + 6);

      // Using a Blob URL is more reliable on mobile browsers than relying on jsPDF's save helper.
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "ESUT-CGPA-Academic-Report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);

      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      localStorage.setItem("esut-cgpa-records", JSON.stringify(records));
      flash("success", "PDF exported successfully.");
    } catch (error) {
      console.error("PDF export failed", error);
      flash("error", "PDF export failed. Please refresh and try again.");
    } finally {
      setExporting(false);
    }
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
    <main className="min-h-screen bg-[#f6f8fc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20"><GraduationCap size={22} /></div>
            <div><h1 className="text-sm font-extrabold sm:text-base">ESUT CGPA</h1><p className="hidden text-[11px] font-medium text-slate-500 sm:block">Accurate cumulative calculator</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportPDF} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60">
              <Download size={16} /><span className="hidden sm:inline">{exporting ? "Creating PDF..." : "Save & PDF"}</span>
            </button>
            <button onClick={reset} aria-label="Reset" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"><RotateCcw size={17} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100"><Sparkles size={13} /> Accurate cumulative calculation</div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">Know your real CGPA.</h2>
              <p className="mt-2 text-sm leading-6 text-blue-100/80 sm:text-base">Add your courses semester by semester. Every credit unit and quality point counts toward one true cumulative result.</p>
            </div>
            <div className="min-w-[205px] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100/70">Current CGPA</p>
              <p className="mt-1 text-4xl font-black">{totals.gp.toFixed(2)} <span className="text-sm font-bold text-blue-100/70">/ 5.00</span></p>
              <p className="mt-1 text-xs font-semibold text-blue-100/70">{classification(totals.gp)}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-4">
            <HeroStat label="Total CU" value={totals.totalCU.toFixed(0)} />
            <HeroStat label="Total QP" value={totals.totalQP.toFixed(0)} />
            <HeroStat label="Semesters" value={String(records.length)} />
            <HeroStat label="Progress" value={`${percentage.toFixed(0)}%`} />
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="flex items-center justify-between px-1 pb-3">
            <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Academic record</p><p className="text-sm font-extrabold text-slate-900">{records.length} semester{records.length === 1 ? "" : "s"} added</p></div>
            <button onClick={() => setShowSemesterModal(true)} disabled={!availableSemesters.length} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"><Plus size={15} /> Add semester</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {ordered.map((record) => {
              const stats = getStats(record.courses);
              const selected = record.id === active?.id;
              return <button key={record.id} onClick={() => setActiveId(record.id)} className={`min-w-[175px] rounded-xl border p-3 text-left transition ${selected ? "border-blue-200 bg-blue-50 shadow-sm" : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"}`}>
                <div className="flex items-center justify-between gap-2"><span className={`text-sm font-extrabold ${selected ? "text-blue-700" : "text-slate-900"}`}>{record.level}</span><span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700 shadow-sm">{stats.gp.toFixed(2)}</span></div>
                <p className="mt-1 text-[11px] font-medium text-slate-500">{record.semester} · {stats.totalCU} CU</p>
              </button>;
            })}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-blue-600"><Calculator size={17} /><span className="text-xs font-extrabold uppercase tracking-wider">Current semester</span></div>
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-black tracking-tight">{active?.level}</h3><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">{active?.semester}</span></div>
                  <p className="mt-1 text-sm text-slate-500">Add the courses offered in this semester. Your list stays compact.</p>
                </div>
                {active && records.length > 1 && <button onClick={() => removeSemester(active.id)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"><Trash2 size={14} /> <span className="hidden sm:inline">Remove</span></button>}
              </div>
            </div>

            {active && <div className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-extrabold text-slate-900">Courses</p><p className="text-xs text-slate-400">{active.courses.length} course{active.courses.length === 1 ? "" : "s"} · {activeStats.totalCU} CU</p></div><button onClick={() => setShowCourseModal(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100"><Plus size={15} /> Add course</button></div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_70px_80px_70px_44px] bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white sm:grid">
                  <span>Course</span><span>Title</span><span>Unit</span><span>Grade</span><span>QP</span><span />
                </div>
                <div className="divide-y divide-slate-100">
                  {active.courses.map((course) => <CourseRow key={course.id} course={course} onUpdate={updateCourse} onRemove={() => removeCourse(course.id)} />)}
                </div>
              </div>

              <button onClick={() => setShowCourseModal(true)} className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 transition hover:scale-105 hover:bg-blue-700 sm:bottom-7 sm:right-7" aria-label="Add course"><Plus size={26} /></button>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500"><b className="text-slate-700">Quality point</b> = grade point × credit unit. <b className="text-slate-700">CGPA</b> = total QP ÷ total CU across every entered semester.</div>
            </div>}
          </section>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white"><div className="flex items-center justify-between"><p className="text-xs font-extrabold uppercase tracking-wider text-blue-100">Cumulative CGPA</p><BookOpen size={19} className="text-blue-100" /></div><div className="mt-3 flex items-end gap-2"><span className="text-5xl font-black">{totals.gp.toFixed(2)}</span><span className="pb-1 text-sm font-bold text-blue-100">/ 5.00</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${percentage}%` }} /></div><p className="mt-3 text-sm font-bold">{classification(totals.gp)}</p></div>
              <div className="grid grid-cols-2 divide-x divide-slate-100"><Stat label="Total CU" value={totals.totalCU.toFixed(0)} /><Stat label="Total QP" value={totals.totalQP.toFixed(0)} /></div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600"><Calculator size={16} /></div><h4 className="font-extrabold">This semester</h4></div><div className="mt-4 space-y-3"><SummaryRow label="Credit units" value={activeStats.totalCU.toFixed(0)} /><SummaryRow label="Quality points" value={activeStats.totalQP.toFixed(0)} /><SummaryRow label="Semester GP" value={activeStats.gp.toFixed(2)} highlight /></div></div>
            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5"><div className="flex items-center gap-2 text-blue-700"><Sparkles size={16} /><h4 className="text-sm font-extrabold">The formula</h4></div><p className="mt-3 text-sm leading-6 text-blue-900/70">No averaging semester GPs. The calculator uses the actual credit-weighted quality points from every semester.</p><div className="mt-3 rounded-xl bg-white/80 p-3 text-center text-sm font-black text-blue-800">CGPA = Total QP ÷ Total CU</div></div>
            <button onClick={exportPDF} disabled={exporting} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"><FileText size={17} /> {exporting ? "Creating report..." : "Export academic report"}</button>
          </aside>
        </div>
      </div>

      {showSemesterModal && <SemesterModal available={availableSemesters} onClose={() => setShowSemesterModal(false)} onAdd={addSemester} />}
      {showCourseModal && active && <CourseModal onClose={() => setShowCourseModal(false)} onAdd={addCourse} />}

      {notice && <div className={`fixed bottom-5 left-1/2 z-[70] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold text-white shadow-2xl ${notice.type === "success" ? "bg-emerald-600" : "bg-red-600"}`}>{notice.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}{notice.text}</div>}
    </main>
  );
}

function CourseRow({ course, onUpdate, onRemove }: { course: Course; onUpdate: (id: string, patch: Partial<Course>) => void; onRemove: () => void }) {
  const qp = courseQualityPoint(course);
  return <div className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_70px_80px_70px_44px] sm:items-center sm:px-4">
    <div><label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Course</label><input value={course.code} onChange={(e) => onUpdate(course.id, { code: e.target.value.toUpperCase() })} placeholder="CPE 501" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-extrabold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0" /></div>
    <div><label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Title</label><input value={course.title} onChange={(e) => onUpdate(course.id, { title: e.target.value })} placeholder="Course title" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0" /></div>
    <div><label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Unit</label><input type="number" min="1" max="10" step="1" value={course.creditUnit} onChange={(e) => onUpdate(course.id, { creditUnit: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0" /></div>
    <div><label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:hidden">Grade</label><select value={course.grade} onChange={(e) => onUpdate(course.id, { grade: e.target.value as Grade })} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 sm:mt-0">{(Object.keys(GRADE_POINTS) as Grade[]).map((grade) => <option key={grade}>{grade}</option>)}</select></div>
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 sm:bg-transparent sm:px-0"><span className="text-xs font-bold text-slate-400 sm:hidden">Quality point</span><span className="text-sm font-black text-slate-800">{qp}</span></div>
    <button onClick={onRemove} aria-label="Remove course" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button>
  </div>;
}

function SemesterModal({ available, onClose, onAdd }: { available: { level: string; semester: SemesterName }[]; onClose: () => void; onAdd: (level: string, semester: SemesterName) => void }) {
  return <ModalShell title="Add semester" subtitle="Each level can have one First Semester and one Second Semester." onClose={onClose}>
    {available.length === 0 ? <EmptyState text="All 10 semesters have already been added." /> : <div className="grid gap-2 sm:grid-cols-2">{available.map((item) => <button key={`${item.level}-${item.semester}`} onClick={() => onAdd(item.level, item.semester)} className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"><div><p className="font-black text-slate-900">{item.level}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.semester}</p></div><ChevronRight size={18} className="text-slate-300 group-hover:text-blue-600" /></button>)}</div>}
  </ModalShell>;
}

function CourseModal({ onClose, onAdd }: { onClose: () => void; onAdd: (course: Course) => void }) {
  const [course, setCourse] = useState<Course>(() => makeCourse());
  const [error, setError] = useState("");
  function submit() {
    if (!course.code.trim()) return setError("Course code is required.");
    if (!course.creditUnit || course.creditUnit < 1) return setError("Enter a valid credit unit.");
    onAdd({ ...course, code: course.code.trim().toUpperCase(), title: course.title.trim() });
  }
  return <ModalShell title="Add course" subtitle="Enter one course, then add another with the + button." onClose={onClose}>
    <div className="space-y-4">
      <Field label="Course code"><input autoFocus value={course.code} onChange={(e) => setCourse({ ...course, code: e.target.value.toUpperCase() })} placeholder="e.g. CPE 501" className="modal-input" /></Field>
      <Field label="Course title"><input value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} placeholder="e.g. Computer Architecture" className="modal-input" /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Credit unit"><input type="number" min="1" max="10" value={course.creditUnit} onChange={(e) => setCourse({ ...course, creditUnit: Number(e.target.value) })} className="modal-input" /></Field><Field label="Grade"><select value={course.grade} onChange={(e) => setCourse({ ...course, grade: e.target.value as Grade })} className="modal-input">{(Object.keys(GRADE_POINTS) as Grade[]).map((grade) => <option key={grade}>{grade}</option>)}</select></Field></div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{error}</p>}
      <button onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"><Plus size={17} /> Add course</button>
    </div>
  </ModalShell>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><h3 className="text-xl font-black">{title}</h3><p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p></div><button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"><X size={17} /></button></div>{children}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-extrabold text-slate-600">{label}{children}</label>; }
function EmptyState({ text }: { text: string }) { return <div className="rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">{text}</div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="p-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-2xl font-black text-slate-900">{value}</p></div>; }
function HeroStat({ label, value }: { label: string; value: string }) { return <div className="border-r border-white/10 p-3 last:border-r-0"><p className="text-[9px] font-bold uppercase tracking-wider text-blue-100/60">{label}</p><p className="mt-1 text-lg font-black">{value}</p></div>; }
function SummaryRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) { return <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0"><span className="text-sm font-medium text-slate-500">{label}</span><span className={`text-sm font-black ${highlight ? "text-blue-600" : "text-slate-900"}`}>{value}</span></div>; }

function loadRecords(): Semester[] {
  if (typeof window === "undefined") return [makeSemester()];
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("esut-cgpa-records-v3") || localStorage.getItem("esut-cgpa-records");
    if (!raw) return [makeSemester()];
    const parsed = JSON.parse(raw) as Semester[];
    if (!Array.isArray(parsed) || !parsed.length) return [makeSemester()];
    const seen = new Set<string>();
    const clean: Semester[] = [];
    for (const record of parsed) {
      const key = semesterKey(record);
      if (!seen.has(key)) { seen.add(key); clean.push(record); }
    }
    return clean.length ? clean : [makeSemester()];
  } catch {
    return [makeSemester()];
  }
}
