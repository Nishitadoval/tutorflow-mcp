export interface StudentRow {
  id: number;
  name: string;
  grade: string | null;
  subject_focus: string | null;
  parent_email: string | null;
  created_at: string;
}

export interface SessionRow {
  id: number;
  student_id: number;
  session_date: string;
  note: string;
  created_at: string;
}

export interface HomeworkRow {
  id: number;
  student_id: number;
  description: string;
  due_date: string | null;
  completed: number;
  created_at: string;
}
