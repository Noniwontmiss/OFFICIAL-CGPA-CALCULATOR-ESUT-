export type Grade = "A" | "B" | "C" | "D" | "E" | "F";
export type SemesterName = "First Semester" | "Second Semester";

export type Course = { id: string; code: string; title: string; creditUnit: number; grade: Grade };
export type Semester = { id: string; level: string; semester: SemesterName; courses: Course[] };

export const GRADE_POINTS: Record<Grade, number> = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };
export const LEVELS = ["100L", "200L", "300L", "400L", "500L"] as const;
export const SEMESTERS: SemesterName[] = ["First Semester", "Second Semester"];

export function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeCourse(): Course { return { id: makeId(), code: "", title: "", creditUnit: 3, grade: "A" }; }
export function makeSemester(level = "100L", semester: SemesterName = "First Semester"): Semester { return { id: makeId(), level, semester, courses: [] }; }
export function courseQualityPoint(course: Course) { return (Number(course.creditUnit) || 0) * GRADE_POINTS[course.grade]; }
export function getStats(courses: Course[]) {
  const totalCU = courses.reduce((sum, course) => sum + (Number(course.creditUnit) || 0), 0);
  const totalQP = courses.reduce((sum, course) => sum + courseQualityPoint(course), 0);
  return { totalCU, totalQP, gp: totalCU ? totalQP / totalCU : 0 };
}
export function getCumulativeStats(records: Semester[]) { return getStats(records.flatMap((record) => record.courses)); }
export function classification(cgpa: number) {
  if (cgpa >= 4.5) return "First Class";
  if (cgpa >= 3.5) return "Second Class Upper";
  if (cgpa >= 2.4) return "Second Class Lower";
  if (cgpa >= 1.5) return "Third Class";
  if (cgpa > 0) return "Pass";
  return "—";
}
export function semesterKey(record: Pick<Semester, "level" | "semester">) { return `${record.level}-${record.semester}`; }
export function sortRecords(records: Semester[]) {
  return [...records].sort((a, b) => {
    const level = LEVELS.indexOf(a.level as (typeof LEVELS)[number]) - LEVELS.indexOf(b.level as (typeof LEVELS)[number]);
    if (level !== 0) return level;
    return SEMESTERS.indexOf(a.semester) - SEMESTERS.indexOf(b.semester);
  });
}
export function validateRecords(records: Semester[]) {
  const errors: string[] = [];
  const seen = new Set<string>();
  records.forEach((record) => {
    const key = semesterKey(record);
    if (seen.has(key)) errors.push(`Duplicate semester: ${record.level} ${record.semester}`);
    seen.add(key);
    if (!LEVELS.includes(record.level as (typeof LEVELS)[number])) errors.push(`${record.level}: invalid level`);
    record.courses.forEach((course, index) => {
      if (!course.code.trim()) errors.push(`${record.level} ${record.semester}, course ${index + 1}: course code is required`);
      if (!Number.isFinite(Number(course.creditUnit)) || Number(course.creditUnit) <= 0) errors.push(`${record.level} ${record.semester}, course ${index + 1}: enter a valid credit unit`);
    });
  });
  return errors;
}
