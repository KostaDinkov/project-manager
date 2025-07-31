import { Octokit } from '@octokit/rest';
import { Issue } from '../types';

export class GitHubService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  // Get all repositories for the authenticated user
  async getRepositories() {
    try {
      const { data } = await this.octokit.rest.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100
      });
      return data;
    } catch (error) {
      console.error('Error fetching repositories:', error);
      throw error;
    }
  }

  // Get all issues for a repository
  async getRepositoryIssues(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        per_page: 100
      });
      return data;
    } catch (error) {
      console.error('Error fetching repository issues:', error);
      throw error;
    }
  }

  // Create a new issue
  async createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]) {
    try {
      const { data } = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels
      });
      return data;
    } catch (error) {
      console.error('Error creating issue:', error);
      throw error;
    }
  }

  // Update an existing issue
  async updateIssue(owner: string, repo: string, issueNumber: number, updates: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
  }) {
    try {
      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        ...updates
      });
      return data;
    } catch (error) {
      console.error('Error updating issue:', error);
      throw error;
    }
  }

  // Delete an issue (by closing it and adding deleted label)
  async deleteIssue(owner: string, repo: string, issueNumber: number) {
    try {
      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
        labels: ['deleted']
      });
      return data;
    } catch (error) {
      console.error('Error deleting issue:', error);
      throw error;
    }
  }

  // Create a branch for an issue
  async createBranch(owner: string, repo: string, branchName: string, baseBranch = 'main') {
    try {
      // Get the SHA of the base branch
      const { data: baseRef } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranch}`
      });

      // Create new branch
      const { data } = await this.octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha
      });

      return data;
    } catch (error) {
      console.error('Error creating branch:', error);
      throw error;
    }
  }

  // Delete a branch
  async deleteBranch(owner: string, repo: string, branchName: string) {
    try {
      await this.octokit.rest.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`
      });
    } catch (error) {
      console.error('Error deleting branch:', error);
      throw error;
    }
  }

  // Get projects for a repository
  async getRepositoryProjects(owner: string, repo: string) {
    try {
      const { data } = await this.octokit.rest.projects.listForRepo({
        owner,
        repo
      });
      return data;
    } catch (error) {
      console.error('Error fetching repository projects:', error);
      throw error;
    }
  }

  // Create a project
  async createProject(owner: string, repo: string, name: string, body?: string) {
    try {
      const { data } = await this.octokit.rest.projects.createForRepo({
        owner,
        repo,
        name,
        body
      });
      return data;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  // Convert GitHub issue to our Issue type with proper native sub-issue handling
  private convertGitHubIssue(githubIssue: any): Issue {
    const labels = githubIssue.labels?.map((label: any) => label.name) || [];
    const typeLabel = labels.find((label: string) => 
      ['Feature', 'Bug', 'Task', 'Enhancement'].includes(label)
    ) || 'Task';

    const state = githubIssue.state === 'closed' ? 'Done' : 
                 labels.includes('in-progress') ? 'In Progress' : 'To Do';

    return {
      id: githubIssue.number.toString(),
      title: githubIssue.title,
      description: githubIssue.body || '',
      state,
      type: typeLabel,
      repository: `${githubIssue.repository?.owner?.login}/${githubIssue.repository?.name}` || '',
      level: 0,
      parentId: null,
      subIssues: []
    };
  }

  // List sub-issues using GitHub's native API
  async listSubIssues(owner: string, repo: string, issueNumber: number): Promise<Issue[]> {
    try {
      const response = await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
        owner,
        repo,
        issue_number: issueNumber,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      return response.data.map((issue: any) => this.convertGitHubIssue(issue));
    } catch (error) {
      console.error('Error listing sub-issues:', error);
      // Return empty array if sub-issues are not supported or not found
      return [];
    }
  }

  // Build hierarchical structure using GitHub's native sub-issue API
  async buildIssueHierarchy(githubIssues: any[], owner: string, repo: string): Promise<Issue[]> {
    const issueMap = new Map<string, Issue>();
    const topLevelIssues: Issue[] = [];

    // First pass: create all issues and filter out deleted ones
    const activeIssues = githubIssues.filter(githubIssue => 
      !githubIssue.labels?.some((label: any) => label.name === 'deleted')
    );

    // Initialize all issues
    activeIssues.forEach(githubIssue => {
      const issue = this.convertGitHubIssue(githubIssue);
      issueMap.set(issue.id, issue);
    });

    // For each issue, fetch its sub-issues using GitHub's native API
    const allSubIssueIds = new Set<string>();
    
    for (const githubIssue of activeIssues) {
      try {
        const subIssues = await this.listSubIssues(owner, repo, githubIssue.number);
        const issueInMap = issueMap.get(githubIssue.number.toString());
        
        if (issueInMap && subIssues.length > 0) {
          issueInMap.subIssues = subIssues.map(subIssue => {
            // Track all sub-issue IDs
            allSubIssueIds.add(subIssue.id);
            
            // Set parent relationship
            subIssue.parentId = githubIssue.number.toString();
            subIssue.level = issueInMap.level + 1;
            
            // Update the issue map with sub-issues if they exist there
            const existingSubIssue = issueMap.get(subIssue.id);
            if (existingSubIssue) {
              existingSubIssue.parentId = githubIssue.number.toString();
              existingSubIssue.level = issueInMap.level + 1;
              return existingSubIssue;
            }
            return subIssue;
          });
        }
      } catch (error) {
        // If sub-issues API fails, just continue with empty sub-issues
        console.warn(`Could not fetch sub-issues for issue #${githubIssue.number}:`, error);
      }
    }

    // Top-level issues are those not marked as sub-issues
    activeIssues.forEach(githubIssue => {
      const issueId = githubIssue.number.toString();
      if (!allSubIssueIds.has(issueId)) {
        const issue = issueMap.get(issueId);
        if (issue) {
          topLevelIssues.push(issue);
        }
      }
    });

    return topLevelIssues;
  }

  // Create a sub-issue using GitHub's native sub-issue API
  async createSubIssue(owner: string, repo: string, parentNumber: number, title: string, body?: string, labels?: string[]) {
    try {
      // First create a regular issue
      const issueResponse = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body: body || '',
        labels: labels || []
      });

      const createdIssue = issueResponse.data;

      // Then add it as a sub-issue to the parent using GitHub's native API
      await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
        owner,
        repo,
        issue_number: parentNumber,
        sub_issue_id: createdIssue.id,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });

      return createdIssue;
    } catch (error) {
      console.error('Error creating sub-issue:', error);
      throw error;
    }
  }

  // Remove sub-issue using GitHub's native API
  async removeSubIssue(owner: string, repo: string, parentNumber: number, subIssueId: number): Promise<void> {
    try {
      await this.octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/sub_issue', {
        owner,
        repo,
        issue_number: parentNumber,
        sub_issue_id: subIssueId,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    } catch (error) {
      console.error('Error removing sub-issue:', error);
      throw error;
    }
  }
}
