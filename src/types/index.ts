export interface Issue {
  id: string;
  title: string;
  description: string;
  state: 'To Do' | 'In Progress' | 'Done';
  type: string;
  repository: string;
  level: number;
  parentId: string | null;
  subIssues: Issue[];
  _timestamp?: number; // Optional timestamp for forcing React re-renders
}

export interface Project {
  id: string;
  name: string;
  description: string;
  repository: string;
  issues: Issue[];
}

export interface User {
  id: string;
  login: string;
  avatar_url: string;
  name: string;
}
