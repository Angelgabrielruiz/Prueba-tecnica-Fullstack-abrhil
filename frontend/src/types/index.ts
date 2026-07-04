export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
}

export type ProjectStatus = "active" | "archived";

export interface ProjectMember {
  id: number;
  user: User;
  role: "admin" | "member";
  joined_at: string;
}

export interface Project {
  id: number;
  title: string;
  description: string;
  status: ProjectStatus;
  created_by: User;
  members: ProjectMember[];
  created_at: string;
  updated_at: string;
}

export interface ProjectWrite {
  title: string;
  description?: string;
  status?: ProjectStatus;
}

export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: number;
  project: number;
  assignee: User | null;
  created_by: User;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  is_archived: boolean;
}

export interface TaskWrite {
  project: number;
  assignee?: number | null;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
}

export interface Comment {
  id: number;
  task: number;
  user: User | null;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CommentWrite {
  task: number;
  content: string;
}

export type ActivityAction =
  | "task_created"
  | "task_status_changed"
  | "task_assigned"
  | "comment_added";

export interface Activity {
  id: number;
  project: number;
  task: number | null;
  task_title: string | null;
  user: User | null;
  action: ActivityAction;
  action_display: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface TopCompleter {
  project_id: number;
  user_id: number;
  username: string;
  completed_count: number;
}

export interface AvgCompletionTime {
  project_id: number;
  completed_tasks: number;
  avg_seconds: number;
}

export interface DashboardResponse {
  top_completers_by_project: TopCompleter[];
  avg_completion_time_by_project: AvgCompletionTime[];
}

export interface AuthResponse {
  user: User;
  access: string;
  refresh: string;
}
