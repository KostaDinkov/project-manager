// GitHub API types and interfaces

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null | undefined;
  state: string;
  labels: Array<{ name: string } | string>;
  repository?: {
    owner: { login: string };
    name: string;
  };
}

export interface GitHubCreateIssueData {
  title: string;
  body?: string;
  labels?: string[];
}

export interface GitHubUpdateIssueData {
  title?: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
}

export interface CacheConsistencyResult {
  consistent: boolean;
  inconsistencies: Array<{
    issueNumber: string;
    inCache: boolean;
    hasDeletedLabel: boolean;
    issue?: GitHubIssue;
  }>;
}
