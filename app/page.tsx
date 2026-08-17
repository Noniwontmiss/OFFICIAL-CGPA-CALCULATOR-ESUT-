"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import type { ChangeEvent, ReactNode } from "react";
import {
  AlertCircle,
  BookOpen,
  Calculator,
  Check,
  ChevronRight,
  Download,
  FileText,
  GraduationCap,
  LogIn,
  LogOut,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
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

const STORAGE_KEY = "esut-cgpa-records-v5";

export default function Home() {
  const [records, setRecords] = useState<Semester[]>(() => loadRecords());
  // Navigation view (pure selection — does not create records)
  const [viewLevel, setViewLevel] = useState<string>("100L");
  const [viewSemester, setViewSemester] = useState<SemesterName>("First Semester");
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showSemesterModal, setShowSemesterModal] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Supabase authentication/cloud sync
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const hydrationDoneRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Initialize view from the first existing record (if any) so existing data is shown
  useEffect(() => {
    if (records.length === 0) return;
    const orderedInit = sortRecords(records);
    const first = orderedInit[0];
    if (first) {
      setViewLevel(first.level);
      setViewSemester(first.semester);
    }
  }, []); // run once on mount

  // Restore Supabase session, load this user's cloud records, and keep profile data up to date.
  useEffect(() => {
    let mounted = true;
    const supabase = getSupabase();

    async function initialiseAuth() {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!mounted) return;

      setUser(currentUser ?? null);

      if (currentUser) {
        await hydrateFromCloud(currentUser.id, currentUser);
      } else {
        hydrationDoneRef.current = true;
        setCloudReady(false);
      }

      setAuthLoading(false);
    }

    void initialiseAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);

      if (event === "SIGNED_IN" && nextUser) {
        void hydrateFromCloud(nextUser.id, nextUser);
      } else if (event === "SIGNED_OUT") {
        hydrationDoneRef.current = true;
        setCloudReady(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function hydrateFromCloud(userId: string, currentUser: any) {
    const supabase = getSupabase();

    try {
      const { data: cloud, error } = await supabase
        .from("academic_records")
        .select("records")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;

      const localRecords = loadRecords();

      if (cloud?.records && Array.isArray(cloud.records) && cloud.records.length > 0) {
        const cleaned = validateAndCleanRecords(cloud.records);
        setRecords(cleaned);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
        localStorage.setItem("esut-cgpa-records", JSON.stringify(cleaned));
      } else if (localRecords.length > 0) {
        // First cloud login: preserve existing local records instead of overwriting them with empty data.
        const { error: saveError } = await supabase
          .from("academic_records")
          .upsert(
            { user_id: userId, records: localRecords, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        if (saveError) throw saveError;
      } else {
        await supabase
          .from("academic_records")
          .upsert(
            { user_id: userId, records: [], updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
      }

      await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            full_name:
              currentUser.user_metadata?.full_name ||
              currentUser.user_metadata?.name ||
              currentUser.email ||
              null,
            avatar_url: currentUser.user_metadata?.avatar_url || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        );

      setCloudReady(true);
      hydrationDoneRef.current = true;
    } catch (error) {
      console.error("Supabase hydration failed:", error);
      hydrationDoneRef.current = true;
      setCloudReady(false);
      flash("error", "Couldn't sync your records. Your local data is still safe.");
    }
  }

  function validateAndCleanRecords(value: unknown): Semester[] {
    if (!Array.isArray(value)) return [];
    try {
      const candidate = value as Semester[];
      const errors = validateRecords(candidate);
      return errors.length === 0 ? sortRecords(candidate) : [];
    } catch {
      return [];
    }
  }

  // Debounced cloud persistence. Local storage remains the immediate/offline fallback.
  useEffect(() => {
    if (!hydrationDoneRef.current || !user || !cloudReady) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    localStorage.setItem("esut-cgpa-records", JSON.stringify(records));

    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);

    saveTimerRef.current = window.setTimeout(async () => {
      setSyncing(true);
      try {
        const supabase = getSupabase();
        const { error } = await supabase
          .from("academic_records")
          .upsert(
            { user_id: user.id, records, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );

        if (error) throw error;
      } catch (error) {
        console.error("Supabase save failed:", error);
        flash("error", "Couldn't sync your records. Your local data is still safe.");
      } finally {
        setSyncing(false);
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [records, user, cloudReady]);

  async function signInWithGoogle() {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google sign-in failed:", error);
      flash("error", "Google sign-in failed. Please try again.");
    }
  }

  async function signOut() {
    try {
      const supabase = getSupabase();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setUser(null);
      setCloudReady(false);
      hydrationDoneRef.current = true;
      flash("success", "Signed out successfully.");
    } catch (error) {
      console.error("Sign out failed:", error);
      flash("error", "Couldn't sign out. Please try again.");
    }
  }

  const ordered = useMemo(() => sortRecords(records), [records]);
  // Active record only if it already exists for the currently viewed level+semester
  const active = records.find(
    (record) => semesterKey(record) === `${viewLevel}-${viewSemester}`
  ) ?? null;
  const totals = useMemo(() => getCumulativeStats(records), [records]);
  const activeStats = getStats(active?.courses ?? []);
  const selectedCourse = active?.courses.find((course) => course.id === selectedCourseId) ?? null;
  const percentage = Math.min(100, Math.max(0, (totals.gp / 5) * 100));

  function flash(type: "success" | "error", text: string) {
    setNotice({ type, text });
    window.setTimeout(() => setNotice(null), 3200);
  }

  function updateRecord(id: string, patch: Partial<Semester>) {
    setRecords((prev) =>
      prev.map((record) => (record.id === id ? { ...record, ...patch } : record))
    );
  }

  // Academic records are pure navigation:
  // Level -> semester -> show that semester's courses (create record only when a course is added).
  function openLevel(level: string) {
    setSelectedLevel(level);
    setShowSemesterModal(true);
  }

  function selectSemester(level: string, semester: SemesterName) {
    // Navigation only — never create a semester record here
    setViewLevel(level);
    setViewSemester(semester);
    setShowSemesterModal(false);
    setSelectedLevel(null);
    setShowCourseModal(false);
    setSelectedCourseId(null);

    window.setTimeout(() => {
      document.getElementById("current-semester")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
  }

  function removeSemester(id: string) {
    const remaining = records.filter((record) => record.id !== id);
    setRecords(remaining);
    // View stays on the same level/semester (now empty if it was the removed one)
    setSelectedCourseId(null);
  }

  function updateCourse(courseId: string, patch: Partial<Course>) {
    if (!active) return;
    updateRecord(active.id, {
      courses: active.courses.map((course) =>
        course.id === courseId ? { ...course, ...patch } : course
      ),
    });
  }

  function addCourse(course: Course) {
    // If this level+semester has no record yet, create it now (only when a course is added)
    if (!active) {
      const fresh = makeSemester(viewLevel, viewSemester);
      const withCourse = { ...fresh, courses: [course] };
      setRecords((prev) => {
        // Guard against any possible duplicate
        const key = semesterKey(withCourse);
        if (prev.some((r) => semesterKey(r) === key)) {
          return prev.map((r) =>
            semesterKey(r) === key ? { ...r, courses: [...r.courses, course] } : r
          );
        }
        return [...prev, withCourse];
      });
      setShowCourseModal(false);
      setSelectedCourseId(course.id);
      return;
    }

    updateRecord(active.id, { courses: [...active.courses, course] });
    setShowCourseModal(false);
    setSelectedCourseId(course.id);
  }

  function removeCourse(id: string) {
    if (!active) return;

    if (active.courses.length === 1) {
      // Removing the last course also removes the semester record
      setRecords((prev) => prev.filter((record) => record.id !== active.id));
      setSelectedCourseId(null);
      return;
    }

    updateRecord(active.id, {
      courses: active.courses.filter((course) => course.id !== id),
    });
    setSelectedCourseId(null);
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

  function exportData() {
    const payload = {
      app: "ESUT CGPA Calculator",
      version: 1,
      exportedAt: new Date().toISOString(),
      records,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ESUT-CGPA-Backup.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);

    flash("success", "Backup exported successfully.");
  }

  function isValidGrade(value: unknown): value is Grade {
    return typeof value === "string" && value in GRADE_POINTS;
  }

  function isValidLevel(value: unknown): value is string {
    return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
  }

  function isValidSemesterName(value: unknown): value is SemesterName {
    return typeof value === "string" && (SEMESTERS as readonly string[]).includes(value);
  }

  function sanitizeImportedRecords(raw: unknown): Semester[] | null {
    if (!raw || typeof raw !== "object") return null;

    const root = raw as Record<string, unknown>;
    const list = Array.isArray(root.records) ? root.records : Array.isArray(raw) ? raw : null;
    if (!list) return null;

    const seen = new Set<string>();
    const clean: Semester[] = [];

    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;

      if (!isValidLevel(rec.level) || !isValidSemesterName(rec.semester)) continue;

      const coursesRaw = Array.isArray(rec.courses) ? rec.courses : [];
      const courses: Course[] = [];

      for (const c of coursesRaw) {
        if (!c || typeof c !== "object") continue;
        const course = c as Record<string, unknown>;

        const code = typeof course.code === "string" ? course.code.trim().toUpperCase() : "";
        if (!code) continue;

        const creditUnit = Number(course.creditUnit);
        if (!Number.isFinite(creditUnit) || creditUnit < 1 || creditUnit > 10) continue;

        if (!isValidGrade(course.grade)) continue;

        const title = typeof course.title === "string" ? course.title.trim() : "";
        const id =
          typeof course.id === "string" && course.id
            ? course.id
            : `course-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

        courses.push({
          id,
          code,
          title,
          creditUnit,
          grade: course.grade,
        });
      }

      const key = `${rec.level}-${rec.semester}`;
      if (seen.has(key)) {
        // Merge courses into existing semester record (dedupe by id if possible)
        const existing = clean.find((r) => semesterKey(r) === key);
        if (existing) {
          const existingIds = new Set(existing.courses.map((c) => c.id));
          for (const course of courses) {
            if (!existingIds.has(course.id)) {
              existing.courses.push(course);
              existingIds.add(course.id);
            }
          }
        }
        continue;
      }

      seen.add(key);
      const id =
        typeof rec.id === "string" && rec.id
          ? rec.id
          : `sem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      clean.push({
        id,
        level: rec.level,
        semester: rec.semester,
        courses,
      });
    }

    // Only accept if we got a sensible structure (or empty is fine)
    return clean;
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        flash("error", "Invalid backup file. Please select a valid ESUT CGPA Calculator backup.");
        return;
      }

      const cleaned = sanitizeImportedRecords(parsed);
      if (cleaned === null) {
        flash("error", "Invalid backup file. Please select a valid ESUT CGPA Calculator backup.");
        return;
      }

      // Extra validation via existing validator if present
      const errors = validateRecords(cleaned);
      if (errors.length) {
        flash("error", "Invalid backup file. Please select a valid ESUT CGPA Calculator backup.");
        return;
      }

      const confirmed = window.confirm(
        "Importing this backup will replace your current academic records. Continue?"
      );
      if (!confirmed) return;

      setRecords(cleaned);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      localStorage.setItem("esut-cgpa-records", JSON.stringify(cleaned));

      // Reset view to first available record or defaults
      if (cleaned.length > 0) {
        const orderedImport = sortRecords(cleaned);
        const first = orderedImport[0];
        setViewLevel(first.level);
        setViewSemester(first.semester);
      } else {
        setViewLevel("100L");
        setViewSemester("First Semester");
      }
      setSelectedCourseId(null);

      flash("success", "Academic records imported successfully.");
    } catch {
      flash("error", "Invalid backup file. Please select a valid ESUT CGPA Calculator backup.");
    }
  }

  function onImportClick() {
    importInputRef.current?.click();
  }

  function onImportChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so the same file can be selected again later
    e.target.value = "";
    if (!file) return;
    void handleImportFile(file);
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

      addPageIfNeeded(30);
      doc.setDrawColor(220, 226, 235);
      doc.line(margin, y, pageWidth - margin, y);
      y += 7;
      doc.setTextColor(20, 29, 48);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(
        `Final CGPA: ${totals.gp.toFixed(2)} — ${classification(totals.gp)}`,
        margin,
        y
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text("Formula: Total Quality Points / Total Credit Units", margin, y + 6);
      doc.setFontSize(8);
      doc.text(
        "Made with love by NONI — Computer Engineering '26 Set, ESUT",
        margin,
        y + 13
      );

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

    setRecords([]);
    setViewLevel("100L");
    setViewSemester("First Semester");
    setSelectedCourseId(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("esut-cgpa-records");
    flash("success", "Academic record reset.");
  }

  return (
    <main className="min-h-screen bg-[#f6f8fc] text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/20">
              <GraduationCap size={22} />
            </div>
            <div>
              <h1 className="text-sm font-extrabold sm:text-base">ESUT CGPA</h1>
              <p className="hidden text-[11px] font-medium text-slate-500 sm:block">
                Accurate cumulative calculator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportData}
              aria-label="Export Data"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export Data</span>
            </button>
            <button
              onClick={onImportClick}
              aria-label="Import Data"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Upload size={16} />
              <span className="hidden sm:inline">Import Data</span>
            </button>
            <button
              onClick={exportPDF}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">
                {exporting ? "Creating PDF..." : "Save & PDF"}
              </span>
            </button>
            {!authLoading && (
              user ? (
                <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2 sm:flex">
                  {user.user_metadata?.avatar_url ? (
                    <img
                      src={user.user_metadata.avatar_url}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="grid h-7 w-7 place-items-center rounded-full bg-blue-100 text-xs font-black text-blue-700">
                      {(user.user_metadata?.full_name || user.email || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="max-w-[120px] truncate text-xs font-bold text-slate-700">
                    {user.user_metadata?.full_name || user.user_metadata?.name || user.email}
                  </span>
                  <button
                    onClick={signOut}
                    aria-label="Sign out"
                    title="Sign out"
                    className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <LogOut size={15} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={signInWithGoogle}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <LogIn size={16} />
                  <span className="hidden sm:inline">Sign in</span>
                </button>
              )
            )}

            <button
              onClick={reset}
              aria-label="Reset"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
            >
              <RotateCcw size={17} />
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onImportChange}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <section className="mb-5 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-5 text-white shadow-xl sm:p-7">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-blue-100">
                <Sparkles size={13} /> Accurate cumulative calculation
              </div>
              <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
                Know your real CGPA.
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-100/80 sm:text-base">
                Add your courses semester by semester. Every credit unit and quality point counts
                toward one true cumulative result.
              </p>
            </div>

            <div className="min-w-[205px] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-100/70">
                Current CGPA
              </p>
              <p className="mt-1 text-4xl font-black">
                {totals.gp.toFixed(2)}{" "}
                <span className="text-sm font-bold text-blue-100/70">/ 5.00</span>
              </p>
              <p className="mt-1 text-xs font-semibold text-blue-100/70">
                {classification(totals.gp)}
              </p>
              <p className="mt-2 text-[11px] font-bold text-blue-100/60">
                {authLoading
                  ? "Checking account..."
                  : user
                    ? syncing
                      ? "Saving to cloud..."
                      : cloudReady
                        ? "Cloud sync on"
                        : "Local backup"
                    : "Local storage"}
              </p>
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
          <div className="px-1 pb-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Academic records
            </p>
            <p className="text-sm font-extrabold text-slate-900">
              Choose your level, then choose the semester
            </p>
            <p className="mt-1 text-xs font-medium leading-5 text-slate-500">
              Navigation only — each level has exactly one First Semester and one Second Semester.
              Selecting a semester opens its results and courses.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {LEVELS.map((level) => {
              const levelRecords = ordered.filter((record) => record.level === level);
              const levelStats = getStats(levelRecords.flatMap((record) => record.courses));

              return (
                <button
                  key={level}
                  onClick={() => openLevel(level)}
                  className={`rounded-xl border p-3 text-left transition ${
                    viewLevel === level
                      ? "border-blue-200 bg-blue-50 shadow-sm"
                      : "border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-extrabold ${
                        viewLevel === level ? "text-blue-700" : "text-slate-900"
                      }`}
                    >
                      {level}
                    </span>
                    <ChevronRight
                      size={15}
                      className={
                        viewLevel === level ? "text-blue-600" : "text-slate-400"
                      }
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    {levelRecords.length}/2 semesters
                    {levelRecords.length > 0 ? ` · GP ${levelStats.gp.toFixed(2)}` : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_330px]">
          <section
            id="current-semester"
            className="rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="border-b border-slate-100 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-blue-600">
                    <Calculator size={17} />
                    <span className="text-xs font-extrabold uppercase tracking-wider">
                      Current semester
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-2xl font-black tracking-tight">{viewLevel}</h3>
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">
                      {viewSemester}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-slate-500">
                    Your courses stay compact. Tap any course code to view or edit its details.
                  </p>
                </div>

                {active && (
                  <button
                    onClick={() => removeSemester(active.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">Remove</span>
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-extrabold text-slate-900">Courses</p>
                  <p className="text-xs text-slate-400">
                    {active ? (
                      <>
                        {active.courses.length} course{active.courses.length === 1 ? "" : "s"} ·{" "}
                        {activeStats.totalCU} CU
                      </>
                    ) : (
                      "No courses yet"
                    )}
                  </p>
                </div>

                <button
                  onClick={() => setShowCourseModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 transition hover:bg-blue-100"
                >
                  <Plus size={15} /> Add course
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[minmax(0,1fr)_70px_80px] bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-white sm:grid-cols-[minmax(0,1fr)_90px_100px]">
                  <span>Course</span>
                  <span className="text-center">Unit</span>
                  <span className="text-center">Grade</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {active?.courses.map((course) => (
                    <CourseTableRow
                      key={course.id}
                      course={course}
                      onOpen={() => setSelectedCourseId(course.id)}
                    />
                  ))}

                  {(!active || !active.courses.length) && (
                    <EmptyState text="No courses added yet. Tap Add course to begin this semester." />
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowCourseModal(true)}
                className="fixed bottom-5 right-5 z-30 grid h-14 w-14 place-items-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 transition hover:scale-105 hover:bg-blue-700 sm:bottom-7 sm:right-7"
                aria-label="Add course"
              >
                <Plus size={26} />
              </button>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
                <b className="text-slate-700">Tip:</b> Tap a course code to edit its title,
                credit unit or grade.
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-blue-100">
                    Cumulative CGPA
                  </p>
                  <BookOpen size={19} className="text-blue-100" />
                </div>

                <div className="mt-3 flex items-end gap-2">
                  <span className="text-5xl font-black">{totals.gp.toFixed(2)}</span>
                  <span className="pb-1 text-sm font-bold text-blue-100">/ 5.00</span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
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
                <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600">
                  <Calculator size={16} />
                </div>
                <h4 className="font-extrabold">This semester</h4>
              </div>

              <div className="mt-4 space-y-3">
                <SummaryRow label="Credit units" value={activeStats.totalCU.toFixed(0)} />
                <SummaryRow label="Quality points" value={activeStats.totalQP.toFixed(0)} />
                <SummaryRow
                  label="Semester GP"
                  value={activeStats.gp.toFixed(2)}
                  highlight
                />
              </div>
            </div>

            <div className="rounded-3xl border border-blue-100 bg-blue-50 p-5">
              <div className="flex items-center gap-2 text-blue-700">
                <Sparkles size={16} />
                <h4 className="text-sm font-extrabold">The formula</h4>
              </div>
              <p className="mt-3 text-sm leading-6 text-blue-900/70">
                No averaging semester GPs. The calculator uses the actual credit-weighted quality
                points from every semester.
              </p>
              <div className="mt-3 rounded-xl bg-white/80 p-3 text-center text-sm font-black text-blue-800">
                CGPA = Total QP ÷ Total CU
              </div>
            </div>

            <button
              onClick={exportPDF}
              disabled={exporting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
            >
              <FileText size={17} />
              {exporting ? "Creating report..." : "Export academic report"}
            </button>
          </aside>
        </div>
      </div>

      <footer className="mt-10 border-t border-slate-200 bg-white px-4 py-8 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 text-center sm:flex-row sm:text-left">
          <div>
            <p className="text-sm font-extrabold text-slate-800">Made with love ❤️ by NONI</p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Computer Engineering '26 Set, ESUT.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Contact Dev.
            </span>

            <a
              href="https://x.com/0xNoni"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contact Dev on X"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 transition hover:bg-slate-100"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817-5.964 6.817H1.683l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>

            <a
              href="https://wa.me/09075080302?text=Hello%20dev%20I%20got%20redirected%20through%20your%20CGPA%20app"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Contact Dev on WhatsApp"
              className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M20.52 3.48A11.82 11.82 0 0 0 12.06 0C5.53 0 .22 5.31.22 11.84c0 2.09.55 4.13 1.59 5.93L.12 24l6.38-1.67a11.84 11.84 0 0 0 5.56 1.42h.01c6.53 0 11.84-5.31 11.84-11.84 0-3.17-1.23-6.14-3.39-8.43ZM12.07 21.73h-.01a9.83 9.83 0 0 1-5.01-1.37l-.36-.21-3.79.99 1.01-3.69-.23-.38a9.82 9.82 0 0 1-1.5-5.23C2.18 6.42 6.61 2 12.06 2a9.78 9.78 0 0 1 6.98 2.9 9.82 9.82 0 0 1 2.88 6.99c0 5.44-4.43 9.84-9.85 9.84Zm5.4-7.38c-.3-.15-1.77-.87-2.05-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.5-.9-.8-1.5-1.79-1.67-2.09-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.2-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.07 2.89 1.22 3.09.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.63.71.23 1.35.2 1.86.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {showSemesterModal && (
        <SemesterNavigationModal
          records={records}
          selectedLevel={selectedLevel}
          onClose={() => {
            setShowSemesterModal(false);
            setSelectedLevel(null);
          }}
          onSelectLevel={setSelectedLevel}
          onSelectSemester={selectSemester}
        />
      )}

      {showCourseModal && (
        <CourseModal onClose={() => setShowCourseModal(false)} onAdd={addCourse} />
      )}

      {selectedCourse && (
        <CourseDetailsModal
          course={selectedCourse}
          onClose={() => setSelectedCourseId(null)}
          onUpdate={updateCourse}
          onRemove={() => removeCourse(selectedCourse.id)}
        />
      )}

      {notice && (
        <div
          className={`fixed bottom-5 left-1/2 z-[70] flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl px-4 py-3 text-xs font-bold text-white shadow-2xl ${
            notice.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {notice.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {notice.text}
        </div>
      )}
    </main>
  );
}

function CourseTableRow({
  course,
  onOpen,
}: {
  course: Course;
  onOpen: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_70px_80px] items-center px-4 py-3.5 sm:grid-cols-[minmax(0,1fr)_90px_100px]">
      <button
        onClick={onOpen}
        className="group min-w-0 text-left"
        title="View course details"
      >
        <span className="block truncate text-sm font-extrabold text-slate-900 group-hover:text-blue-600">
          {course.code || "Unnamed course"}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-400">
          Tap to view details
        </span>
      </button>
      <span className="text-center text-sm font-bold text-slate-700">{course.creditUnit}</span>
      <span className="mx-auto min-w-[42px] rounded-full bg-blue-50 px-3 py-1 text-center text-xs font-black text-blue-700">
        {course.grade}
      </span>
    </div>
  );
}

function SemesterNavigationModal({
  records,
  selectedLevel,
  onClose,
  onSelectLevel,
  onSelectSemester,
}: {
  records: Semester[];
  selectedLevel: string | null;
  onClose: () => void;
  onSelectLevel: (level: string | null) => void;
  onSelectSemester: (level: string, semester: SemesterName) => void;
}) {
  if (!selectedLevel) {
    return (
      <ModalShell
        title="Choose level"
        subtitle="Academic records are fixed to 100L, 200L, 300L, 400L and 500L."
        onClose={onClose}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LEVELS.map((level) => {
            const levelRecords = records.filter((record) => record.level === level);
            const stats = getStats(levelRecords.flatMap((record) => record.courses));

            return (
              <button
                key={level}
                onClick={() => onSelectLevel(level)}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
              >
                <div>
                  <span className="font-black">{level}</span>
                  <span className="mt-1 block text-[10px] font-bold text-slate-400">
                    {levelRecords.length}/2 semesters
                    {levelRecords.length ? ` · GP ${stats.gp.toFixed(2)}` : ""}
                  </span>
                </div>
                <ChevronRight size={17} />
              </button>
            );
          })}
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title={`${selectedLevel} — Choose semester`}
      subtitle="Tap a semester to navigate to its results and courses. An empty semester is created automatically the first time you open it."
      onClose={onClose}
    >
      <button
        onClick={() => onSelectLevel(null)}
        className="mb-4 text-xs font-extrabold text-blue-600 hover:text-blue-700"
      >
        ← Back to levels
      </button>

      <div className="space-y-2">
        {SEMESTERS.map((semester) => {
          const record = records.find(
            (item) => semesterKey(item) === `${selectedLevel}-${semester}`
          );

          const stats = record ? getStats(record.courses) : null;

          return (
            <button
              key={semester}
              onClick={() => onSelectSemester(selectedLevel, semester)}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
            >
              <div>
                <p className="font-black">{semester}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  {record
                    ? `${record.courses.length} course${
                        record.courses.length === 1 ? "" : "s"
                      } · ${stats?.totalCU ?? 0} CU`
                    : "No results yet · tap to start this semester"}
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                  record
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-blue-50 text-blue-700"
                }`}
              >
                {record ? "View" : "Open"}
              </span>
            </button>
          );
        })}
      </div>
    </ModalShell>
  );
}

function CourseDetailsModal({
  course,
  onClose,
  onUpdate,
  onRemove,
}: {
  course: Course;
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Course>) => void;
  onRemove: () => void;
}) {
  const qp = courseQualityPoint(course);

  return (
    <ModalShell
      title={course.code || "Course details"}
      subtitle="View or edit the complete course information."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Course code">
          <input
            value={course.code}
            onChange={(e) =>
              onUpdate(course.id, { code: e.target.value.toUpperCase() })
            }
            className="modal-input"
          />
        </Field>

        <Field label="Course title">
          <input
            value={course.title}
            onChange={(e) => onUpdate(course.id, { title: e.target.value })}
            className="modal-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Credit unit">
            <input
              type="number"
              min="1"
              max="10"
              value={course.creditUnit}
              onChange={(e) =>
                onUpdate(course.id, { creditUnit: Number(e.target.value) })
              }
              className="modal-input"
            />
          </Field>

          <Field label="Grade">
            <select
              value={course.grade}
              onChange={(e) =>
                onUpdate(course.id, { grade: e.target.value as Grade })
              }
              className="modal-input"
            >
              {(Object.keys(GRADE_POINTS) as Grade[]).map((grade) => (
                <option key={grade}>{grade}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Quality point
          </p>
          <p className="mt-1 text-2xl font-black text-blue-600">{qp}</p>
          <p className="mt-1 text-xs font-medium text-slate-400">
            Grade point × credit unit
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-extrabold text-slate-700 hover:bg-slate-50"
          >
            Done
          </button>
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-extrabold text-red-600 hover:bg-red-100"
          >
            <Trash2 size={16} />
            Remove
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function CourseModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (course: Course) => void;
}) {
  const [course, setCourse] = useState<Course>(() => makeCourse());
  const [error, setError] = useState("");

  function submit() {
    if (!course.code.trim()) {
      setError("Course code is required.");
      return;
    }

    if (!course.creditUnit || course.creditUnit < 1) {
      setError("Enter a valid credit unit.");
      return;
    }

    onAdd({
      ...course,
      code: course.code.trim().toUpperCase(),
      title: course.title.trim(),
    });
  }

  return (
    <ModalShell
      title="Add course"
      subtitle="Only the course code, unit and grade appear in the list."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Course code">
          <input
            autoFocus
            value={course.code}
            onChange={(e) =>
              setCourse({ ...course, code: e.target.value.toUpperCase() })
            }
            placeholder="e.g. CPE 501"
            className="modal-input"
          />
        </Field>

        <Field label="Course title">
          <input
            value={course.title}
            onChange={(e) => setCourse({ ...course, title: e.target.value })}
            placeholder="e.g. Computer Architecture"
            className="modal-input"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Credit unit">
            <input
              type="number"
              min="1"
              max="10"
              value={course.creditUnit}
              onChange={(e) =>
                setCourse({ ...course, creditUnit: Number(e.target.value) })
              }
              className="modal-input"
            />
          </Field>

          <Field label="Grade">
            <select
              value={course.grade}
              onChange={(e) =>
                setCourse({ ...course, grade: e.target.value as Grade })
              }
              className="modal-input"
            >
              {(Object.keys(GRADE_POINTS) as Grade[]).map((grade) => (
                <option key={grade}>{grade}</option>
              ))}
            </select>
          </Field>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-extrabold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
        >
          <Plus size={17} />
          Add course
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black">{title}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
          >
            <X size={17} />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-extrabold text-slate-600">
      {label}
      {children}
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-2xl bg-slate-50 p-5 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-white/10 p-3 last:border-r-0">
      <p className="text-[9px] font-bold uppercase tracking-wider text-blue-100/60">
        {label}
      </p>
      <p className="mt-1 text-lg font-black">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-3 last:border-0 last:pb-0">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span
        className={`text-sm font-black ${
          highlight ? "text-blue-600" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function loadRecords(): Semester[] {
  if (typeof window === "undefined") return [];

  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem("esut-cgpa-records-v3") ||
      localStorage.getItem("esut-cgpa-records");

    if (!raw) return [];

    const parsed = JSON.parse(raw) as Semester[];
    if (!Array.isArray(parsed) || !parsed.length) return [];

    const seen = new Set<string>();
    const clean: Semester[] = [];

    for (const record of parsed) {
      const key = semesterKey(record);
      if (!seen.has(key)) {
        seen.add(key);
        clean.push(record);
      }
    }

    return clean;
  } catch {
    return [];
  }
}
