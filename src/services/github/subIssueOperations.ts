import { Octokit } from '@octokit/rest';
import { Issue } from '../../types';
import { GitHubIssue } from './types';

export class GitHubSubIssueOperations {
  constructor(private octokit: Octokit, private deletedIssuesCache: Set<string>) {}

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

      // Filter out deleted sub-issues before converting
      const activeSubIssues = response.data.filter((issue: any) => {
        const isDeleted = issue.labels?.some((label: any) => label.name === 'deleted');
        return !isDeleted;
      });

      return activeSubIssues.map((issue: any) => this.convertGitHubIssue(issue));
    } catch (error) {
      console.error('Error listing sub-issues:', error);
      // Return empty array if sub-issues are not supported or not found
      return [];
    }
  }

  // Create a sub-issue using GitHub's native sub-issue API with optimistic updates and rollback
  async createSubIssue(owner: string, repo: string, parentNumber: number, title: string, body?: string, labels?: string[]) {
    let createdIssue: any = null;
    
    try {
      // Step 0: Validate parent issue first
      await this.validateParentIssue(owner, repo, parentNumber);

      // Step 1: Create a regular issue first
      const issueResponse = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body: body || '',
        labels: labels || []
      });
      
      createdIssue = issueResponse.data;

      // Step 2: Link it as a sub-issue to the parent using GitHub's native API
      await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
        owner,
        repo,
        issue_number: parentNumber,
        sub_issue_id: createdIssue.id,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      
      // Step 3: Verify the sub-issue relationship was established
      try {
        const subIssuesResponse = await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
          owner,
          repo,
          issue_number: parentNumber,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        
        const isLinked = subIssuesResponse.data.some((subIssue: any) => subIssue.id === createdIssue.id);
        
        if (!isLinked) {
          throw new Error(`Sub-issue relationship verification failed: Issue #${createdIssue.number} not found in parent #${parentNumber} sub-issues`);
        }
        
      } catch (verifyError) {
        console.warn(`⚠️ SUB-ISSUE VERIFICATION FAILED: Could not verify sub-issue relationship, but continuing as link operation succeeded`);
        // Don't fail the entire operation if verification fails, as the link operation already succeeded
      }

      return createdIssue;
      
    } catch (error: any) {
      // AUTOMATIC ROLLBACK: If we created an issue but failed to link it as sub-issue, delete the orphaned issue
      if (createdIssue) {
        try {
          // Mark as deleted using soft delete
          await this.softDeleteIssue(owner, repo, createdIssue.number);
          
        } catch (rollbackError: any) {
          console.error(`❌ ROLLBACK FAILED: Could not delete orphaned issue #${createdIssue.number}:`, rollbackError);
          // Still throw the original error, but warn about the orphaned issue
          throw new Error(
            `Sub-issue creation failed and rollback failed. ` +
            `Orphaned issue #${createdIssue.number} "${title}" was created but not linked as sub-issue. ` +
            `Please manually delete it. Original error: ${error.message || 'Unknown error'}`
          );
        }
      }
      
      // Enhanced error handling with specific GitHub API error codes
      if (error.status === 404) {
        throw new Error(`Parent issue #${parentNumber} not found or repository not accessible.`);
      } else if (error.status === 403) {
        throw new Error(`Insufficient permissions to create sub-issues in this repository.`);
      } else if (error.status === 422) {
        throw new Error(`Invalid sub-issue creation request. The parent issue may not support sub-issues.`);
      } else if (error.status === 400) {
        throw new Error(`Bad request: Check if the GitHub repository supports sub-issues feature.`);
      } else if (error.message) {
        throw new Error(`Failed to create sub-issue: ${error.message}`);
      } else {
        throw new Error(`Failed to create sub-issue for parent #${parentNumber}.`);
      }
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

  // Validate parent issue before creating sub-issue
  private async validateParentIssue(owner: string, repo: string, parentNumber: number): Promise<void> {
    try {
      // Check if parent issue exists and is accessible
      const { data: parentIssue } = await this.octokit.rest.issues.get({
        owner,
        repo,
        issue_number: parentNumber
      });

      // Check if parent is in our deleted cache
      if (this.deletedIssuesCache.has(parentNumber.toString())) {
        throw new Error(`Cannot create sub-issue: Parent issue #${parentNumber} is marked as deleted`);
      }

      // Check if parent has 'deleted' label
      const hasDeletedLabel = parentIssue.labels?.some((label: any) => 
        (typeof label === 'string' ? label : label.name) === 'deleted'
      );

      if (hasDeletedLabel) {
        throw new Error(`Cannot create sub-issue: Parent issue #${parentNumber} is deleted`);
      }

      // Check if parent issue is closed (optional - you might want to allow sub-issues for closed parents)
      if (parentIssue.state === 'closed') {
        console.warn(`⚠️ Creating sub-issue for closed parent issue #${parentNumber}`);
      }

    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`Parent issue #${parentNumber} not found or repository not accessible`);
      } else if (error.status === 403) {
        throw new Error(`Insufficient permissions to access parent issue #${parentNumber}`);
      } else if (error.message && error.message.includes('Cannot create sub-issue')) {
        // Re-throw our custom validation errors
        throw error;
      } else {
        throw new Error(`Failed to validate parent issue #${parentNumber}: ${error.message || 'Unknown error'}`);
      }
    }
  }

  // Convert GitHub issue to our Issue type with proper native sub-issue handling
  private convertGitHubIssue(githubIssue: GitHubIssue): Issue {
    const labels = githubIssue.labels?.map((label: any) => 
      typeof label === 'string' ? label : label.name
    ) || [];
    const typeLabel = labels.find((label: string) => 
      ['Feature', 'Bug', 'Task', 'Enhancement'].includes(label)
    ) || 'Task';

    const state = githubIssue.state === 'closed' ? 'Done' : 
                 labels.includes('in-progress') ? 'In Progress' : 'To Do';

    return {
      id: githubIssue.number.toString(),
      title: githubIssue.title,
      description: githubIssue.body || '',
      state: state as 'To Do' | 'In Progress' | 'Done',
      type: typeLabel as 'Feature' | 'Bug' | 'Improvement',
      repository: `${githubIssue.repository?.owner?.login}/${githubIssue.repository?.name}` || '',
      level: 0,
      parentId: null,
      subIssues: []
    };
  }

  // Soft delete helper method
  private async softDeleteIssue(owner: string, repo: string, issueNumber: number) {
    const issueIdString = issueNumber.toString();
    this.deletedIssuesCache.add(issueIdString);
    
    try {
      await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        state: 'closed',
        labels: ['deleted']
      });
    } catch (error) {
      this.deletedIssuesCache.delete(issueIdString);
      throw error;
    }
  }
}
