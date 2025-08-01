import { Octokit } from '@octokit/rest';
import { GitHubIssue, GitHubCreateIssueData, GitHubUpdateIssueData } from './types';

export class GitHubIssueOperations {
  constructor(private octokit: Octokit, private deletedIssuesCache: Set<string>) {}

  // Get all issues for a repository (excluding deleted ones)
  async getRepositoryIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    try {
      const { data } = await this.octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        per_page: 100
      });
      
      // Filter out issues with 'deleted' label OR in our deleted cache (for immediate UI response)
      const activeIssues = data.filter(issue => {
        const labels = issue.labels || [];
        const labelNames = labels.map(label => 
          typeof label === 'string' ? label : label.name
        );
        const isDeleted = labelNames.includes('deleted');
        const isInDeletedCache = this.deletedIssuesCache.has(issue.number.toString());
        
        return !isDeleted && !isInDeletedCache;
      });
      
      return activeIssues as GitHubIssue[];
    } catch (error) {
      console.error('Error fetching repository issues:', error);
      throw error;
    }
  }

  // Create a new issue with enhanced error handling
  async createIssue(owner: string, repo: string, data: GitHubCreateIssueData) {
    try {
      const { data: response } = await this.octokit.rest.issues.create({
        owner,
        repo,
        title: data.title,
        body: data.body,
        labels: data.labels
      });
      
      return response;
    } catch (error: any) {
      // Enhanced error handling with specific GitHub API error codes
      if (error.status === 404) {
        throw new Error(`Repository not found or not accessible.`);
      } else if (error.status === 403) {
        throw new Error(`Insufficient permissions to create issues in this repository.`);
      } else if (error.status === 422) {
        throw new Error(`Invalid issue data. Please check the title and description.`);
      } else if (error.status === 401) {
        throw new Error(`GitHub authentication failed. Please check your access token.`);
      } else if (error.message) {
        throw new Error(`Failed to create issue: ${error.message}`);
      } else {
        throw new Error(`Failed to create issue "${data.title}".`);
      }
    }
  }

  // Update an existing issue with enhanced error handling
  async updateIssue(owner: string, repo: string, issueNumber: number, updates: GitHubUpdateIssueData) {
    try {
      // Validate that the issue exists and is not deleted before updating
      
      // Check if issue is in our deleted cache
      if (this.deletedIssuesCache.has(issueNumber.toString())) {
        throw new Error(`Cannot update issue #${issueNumber}: Issue is marked as deleted`);
      }
      
      // Get current issue to validate it exists and preserve data
      const { data: currentIssue } = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber
      });
      
      // Check if issue has 'deleted' label
      const hasDeletedLabel = currentIssue.labels?.some((label: any) => 
        (typeof label === 'string' ? label : label.name) === 'deleted'
      );
      
      if (hasDeletedLabel) {
        throw new Error(`Cannot update issue #${issueNumber}: Issue is deleted`);
      }
      
      // Perform the update
      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        ...updates
      });
      
      return data;
    } catch (error: any) {
      // Enhanced error handling with specific GitHub API error codes
      if (error.status === 404) {
        throw new Error(`Issue #${issueNumber} not found or repository not accessible.`);
      } else if (error.status === 403) {
        throw new Error(`Insufficient permissions to update issue #${issueNumber}.`);
      } else if (error.status === 422) {
        throw new Error(`Invalid issue update data. Please check the provided values.`);
      } else if (error.status === 401) {
        throw new Error(`GitHub authentication failed. Please check your access token.`);
      } else if (error.message && error.message.includes('Cannot update issue')) {
        // Re-throw our custom validation errors
        throw error;
      } else if (error.message) {
        throw new Error(`Failed to update issue: ${error.message}`);
      } else {
        throw new Error(`Failed to update issue #${issueNumber}.`);
      }
    }
  }

  // Mark an issue as deleted (GitHub doesn't allow permanent deletion)
  async deleteIssue(owner: string, repo: string, issueNumber: number) {
    const issueIdString = issueNumber.toString();
    
    try {
      // Add to cache immediately for responsive UI
      this.deletedIssuesCache.add(issueIdString);
      
      // First, ensure the 'deleted' label exists in the repository
      await this.ensureDeletedLabelExists(owner, repo);
      
      // Get the current issue to preserve existing labels
      const { data: currentIssue } = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber
      });
      
      // Extract current labels and add 'deleted' if not already present
      const currentLabels = currentIssue.labels?.map(label => 
        typeof label === 'string' ? label : label.name
      ).filter((name): name is string => Boolean(name)) || [];
      
      if (!currentLabels.includes('deleted')) {
        currentLabels.push('deleted');
      }
      
      // Note: GitHub API doesn't allow permanent deletion of issues for data integrity.
      // Instead, we close the issue and mark it with a 'deleted' label.
      // The getRepositoryIssues method filters out these issues to hide them from the UI.
      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
        labels: currentLabels
      });
      
      // Verify that the 'deleted' label was actually applied
      const hasDeletedLabel = data.labels?.some(label => 
        (typeof label === 'string' ? label : label.name) === 'deleted'
      );
      
      if (!hasDeletedLabel) {
        // GitHub didn't apply the deleted label - this is a failure case
        throw new Error(`GitHub did not apply the 'deleted' label to issue #${issueNumber}`);
      }
      
      return data;
    } catch (error: any) {
      // ROLLBACK: Remove from cache since GitHub operation failed
      this.deletedIssuesCache.delete(issueIdString);
      
      console.error(`Error deleting issue #${issueNumber}:`, error);
      if (error.status === 404) {
        throw new Error(`Issue #${issueNumber} not found or repository not accessible.`);
      } else if (error.status === 403) {
        throw new Error(`Insufficient permissions to delete issue #${issueNumber}.`);
      } else if (error.message) {
        throw new Error(`Failed to delete issue: ${error.message}`);
      } else {
        throw new Error(`Failed to delete issue #${issueNumber}.`);
      }
    }
  }

  // Helper method to update issue state for rollback operations
  async rollbackIssueState(owner: string, repo: string, issueNumber: number, originalIssue: {
    title: string;
    description: string;
    state: 'To Do' | 'In Progress' | 'Done';
    type: string;
  }) {
    try {
      const state = originalIssue.state === 'Done' ? 'closed' : 'open';
      const labels = [originalIssue.type];
      if (originalIssue.state === 'In Progress') {
        labels.push('in-progress');
      }
      
      await this.updateIssue(owner, repo, issueNumber, {
        title: originalIssue.title,
        body: originalIssue.description,
        state,
        labels
      });
      
    } catch (error: any) {
      throw new Error(`Failed to rollback issue state: ${error.message}`);
    }
  }

  // Ensure the 'deleted' label exists in the repository
  private async ensureDeletedLabelExists(owner: string, repo: string) {
    try {
      // Try to get the 'deleted' label
      await this.octokit.rest.issues.getLabel({
        owner,
        repo,
        name: 'deleted'
      });
    } catch (error: any) {
      if (error.status === 404) {
        // Label doesn't exist, create it
        try {
          await this.octokit.rest.issues.createLabel({
            owner,
            repo,
            name: 'deleted',
            color: '808080', // Gray color
            description: 'Issues marked for deletion'
          });
        } catch (createError: any) {
          console.error('Failed to create deleted label:', createError);
          throw new Error(`Cannot create 'deleted' label: ${createError.message}`);
        }
      } else {
        console.error('Error checking deleted label:', error);
        throw error;
      }
    }
  }
}
