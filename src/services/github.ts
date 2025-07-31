import { Octokit } from '@octokit/rest';
import { Issue } from '../types';

export class GitHubService {
  private octokit: Octokit;
  private deletedIssuesCache: Set<string> = new Set(); // Cache of deleted issue IDs

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

  // Get all issues for a repository (excluding deleted ones)
  async getRepositoryIssues(owner: string, repo: string) {
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
      
      return activeIssues;
    } catch (error) {
      console.error('Error fetching repository issues:', error);
      throw error;
    }
  }

  // Create a new issue with enhanced error handling and performance tracking
  async createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]) {
    const startTime = performance.now();
    console.log(`🚀 ISSUE CREATE START: Creating issue "${title}" at ${startTime.toFixed(2)}ms`);
    
    try {
      const { data } = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels
      });
      
      const endTime = performance.now();
      console.log(`✅ ISSUE CREATE COMPLETE: Issue #${data.number} created in ${(endTime - startTime).toFixed(2)}ms`);
      
      return data;
    } catch (error: any) {
      const errorTime = performance.now();
      console.log(`❌ ISSUE CREATE FAILED: Operation failed at ${errorTime.toFixed(2)}ms (${(errorTime - startTime).toFixed(2)}ms total)`);
      
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
        throw new Error(`Failed to create issue "${title}".`);
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
    const rollbackStartTime = performance.now();
    console.log(`🔄 ROLLBACK START: Rolling back issue #${issueNumber} to original state at ${rollbackStartTime.toFixed(2)}ms`);
    
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
      
      const rollbackEndTime = performance.now();
      console.log(`✅ ROLLBACK COMPLETE: Issue #${issueNumber} rolled back in ${(rollbackEndTime - rollbackStartTime).toFixed(2)}ms`);
      
    } catch (error: any) {
      const rollbackErrorTime = performance.now();
      console.log(`❌ ROLLBACK FAILED: Issue #${issueNumber} rollback failed at ${rollbackErrorTime.toFixed(2)}ms`);
      throw new Error(`Failed to rollback issue state: ${error.message}`);
    }
  }

  // Update an existing issue with enhanced error handling and performance tracking
  async updateIssue(owner: string, repo: string, issueNumber: number, updates: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
  }) {
    const startTime = performance.now();
    console.log(`🔄 ISSUE UPDATE START: Updating issue #${issueNumber} at ${startTime.toFixed(2)}ms`);
    
    try {
      // Validate that the issue exists and is not deleted before updating
      const validateStart = performance.now();
      
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
      
      const validateEnd = performance.now();
      console.log(`✅ ISSUE VALIDATED: Issue #${issueNumber} validated in ${(validateEnd - validateStart).toFixed(2)}ms`);
      
      // Perform the update
      const updateStart = performance.now();
      const { data } = await this.octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        ...updates
      });
      
      const updateEnd = performance.now();
      console.log(`✅ ISSUE UPDATE COMPLETE: Issue #${issueNumber} updated in ${(updateEnd - updateStart).toFixed(2)}ms`);
      
      const totalTime = performance.now();
      console.log(`🎉 UPDATE OPERATION COMPLETE: Total time ${(totalTime - startTime).toFixed(2)}ms`);
      
      return data;
    } catch (error: any) {
      const errorTime = performance.now();
      console.log(`❌ ISSUE UPDATE FAILED: Operation failed at ${errorTime.toFixed(2)}ms (${(errorTime - startTime).toFixed(2)}ms total)`);
      
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
      // OPTIMISTIC UPDATE: Add to cache immediately for responsive UI
      this.deletedIssuesCache.add(issueIdString);
      const cacheTime = performance.now();
      console.log(`🕑 CACHE UPDATED: Issue #${issueNumber} added to cache at ${cacheTime.toFixed(2)}ms (relative to page load)`);
      
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
      
      const endTime = performance.now();
      console.log(`🕕 DELETE COMPLETE: Issue #${issueNumber} GitHub operation completed at ${endTime.toFixed(2)}ms (relative to page load)`);
      
      return data;
    } catch (error: any) {
      // ROLLBACK: Remove from cache since GitHub operation failed
      this.deletedIssuesCache.delete(issueIdString);
      
      const errorTime = performance.now();
      console.log(`❌ DELETE FAILED: Issue #${issueNumber} failed at ${errorTime.toFixed(2)}ms (relative to page load)`);
      
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
    } catch (error: any) {
      if (error.status === 422) {
        throw new Error(`Branch '${branchName}' already exists.`);
      } else if (error.status === 404) {
        throw new Error(`Base branch '${baseBranch}' not found or repository not accessible.`);
      } else if (error.message) {
        throw new Error(`Failed to create branch: ${error.message}`);
      } else {
        throw new Error(`Failed to create branch '${branchName}'.`);
      }
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
    } catch (error: any) {
      if (error.status === 404) {
        throw new Error(`Branch '${branchName}' not found or already deleted.`);
      } else if (error.message) {
        throw new Error(`Failed to delete branch: ${error.message}`);
      } else {
        throw new Error(`Failed to delete branch '${branchName}'.`);
      }
    }
  }

  // Merge a branch into the base branch (default: main)
  async mergeBranch(owner: string, repo: string, headBranch: string, baseBranch = 'main') {
    try {
      // First check if the branch has any commits different from base
      const { data: comparison } = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base: baseBranch,
        head: headBranch
      });

      // If no commits ahead, the branch is empty - skip merge
      if (comparison.ahead_by === 0) {
        throw new Error(`Branch '${headBranch}' has no commits to merge. Cannot create pull request for empty branch.`);
      }

      // Create a pull request first
      const { data: pullRequest } = await this.octokit.rest.pulls.create({
        owner,
        repo,
        title: `Merge ${headBranch} into ${baseBranch}`,
        head: headBranch,
        base: baseBranch,
        body: `Auto-merge for completed issue branch: ${headBranch}`
      });

      // Merge the pull request
      const { data: merge } = await this.octokit.rest.pulls.merge({
        owner,
        repo,
        pull_number: pullRequest.number,
        commit_title: `Merge ${headBranch} into ${baseBranch}`,
        merge_method: 'merge'
      });

      return merge;
    } catch (error: any) {
      // Enhanced error handling with specific messages
      if (error.status === 422) {
        throw new Error(`Cannot merge branch '${headBranch}': No commits to merge or merge conflicts detected.`);
      } else if (error.status === 404) {
        throw new Error(`Branch '${headBranch}' not found or repository not accessible.`);
      } else if (error.status === 409) {
        throw new Error(`Merge conflict detected in branch '${headBranch}'. Manual resolution required.`);
      } else if (error.message) {
        throw new Error(`Merge failed: ${error.message}`);
      } else {
        throw new Error(`Failed to merge branch '${headBranch}' into '${baseBranch}'.`);
      }
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

  // Build hierarchical structure avoiding inconsistent sub-issue API
  async buildIssueHierarchy(githubIssues: any[], owner: string, repo: string): Promise<Issue[]> {
    // First, filter out all deleted issues (including cached deletions)
    const activeIssues = githubIssues.filter(githubIssue => {
      const isDeleted = githubIssue.labels?.some((label: any) => label.name === 'deleted');
      const isInDeletedCache = this.deletedIssuesCache.has(githubIssue.number.toString());
      
      return !isDeleted && !isInDeletedCache;
    });

    // Convert all active issues to our format
    const allIssues = activeIssues.map(githubIssue => this.convertGitHubIssue(githubIssue));
    
    // Create a map for quick lookup
    const issueMap = new Map<string, Issue>();
    allIssues.forEach(issue => issueMap.set(issue.id, issue));
    
    // Track which issues are sub-issues
    const subIssueIds = new Set<string>();
    
    // Build parent-child relationships by checking GitHub's sub-issue API
    // But we'll ONLY use issues that are in our filtered activeIssues list
    for (const parentIssue of allIssues) {
      try {
        const response = await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
          owner,
          repo,
          issue_number: parseInt(parentIssue.id),
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        
        // Only include sub-issues that exist in our filtered activeIssues
        const validSubIssues: Issue[] = [];
        
        for (const subIssueData of response.data) {
          const subIssueId = subIssueData.number.toString();
          const subIssueFromFiltered = issueMap.get(subIssueId);
          const isInDeletedCache = this.deletedIssuesCache.has(subIssueId);
          
          if (subIssueFromFiltered && !isInDeletedCache) {
            // This sub-issue exists in our filtered list and is not cached as deleted
            subIssueFromFiltered.parentId = parentIssue.id;
            subIssueFromFiltered.level = parentIssue.level + 1;
            validSubIssues.push(subIssueFromFiltered);
            subIssueIds.add(subIssueId);
          }
        }
        
        parentIssue.subIssues = validSubIssues;
        
      } catch (error) {
        console.warn(`Could not fetch sub-issues for issue #${parentIssue.id}:`, error);
        // Continue with empty sub-issues
      }
    }

    // Return only top-level issues (those that are not sub-issues)
    const topLevelIssues = allIssues.filter(issue => !subIssueIds.has(issue.id));

    // Apply automatic state calculation rules before returning
    const issuesWithCalculatedStates = this.updateIssueStatesRecursively(topLevelIssues);

    return issuesWithCalculatedStates;
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

  // Create a sub-issue using GitHub's native sub-issue API with optimistic updates and rollback
  async createSubIssue(owner: string, repo: string, parentNumber: number, title: string, body?: string, labels?: string[]) {
    const startTime = performance.now();
    console.log(`🚀 SUB-ISSUE CREATE START: Creating sub-issue "${title}" for parent #${parentNumber} at ${startTime.toFixed(2)}ms`);
    
    let createdIssue: any = null;
    
    try {
      // Step 0: Validate parent issue first
      const validateStart = performance.now();
      await this.validateParentIssue(owner, repo, parentNumber);
      const validateEnd = performance.now();
      console.log(`✅ PARENT VALIDATED: Parent issue #${parentNumber} validated in ${(validateEnd - validateStart).toFixed(2)}ms`);

      // Step 1: Create a regular issue first
      const issueCreateStart = performance.now();
      const issueResponse = await this.octokit.rest.issues.create({
        owner,
        repo,
        title,
        body: body || '',
        labels: labels || []
      });
      
      createdIssue = issueResponse.data;
      const issueCreateEnd = performance.now();
      console.log(`✅ ISSUE CREATED: Issue #${createdIssue.number} created in ${(issueCreateEnd - issueCreateStart).toFixed(2)}ms`);

      // Step 2: Link it as a sub-issue to the parent using GitHub's native API
      const linkStart = performance.now();
      await this.octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
        owner,
        repo,
        issue_number: parentNumber,
        sub_issue_id: createdIssue.id,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
      
      const linkEnd = performance.now();
      console.log(`🔗 SUB-ISSUE LINKED: Issue #${createdIssue.number} linked to parent #${parentNumber} in ${(linkEnd - linkStart).toFixed(2)}ms`);
      
      // Step 3: Verify the sub-issue relationship was established
      try {
        const verifyStart = performance.now();
        const subIssuesResponse = await this.octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/sub_issues', {
          owner,
          repo,
          issue_number: parentNumber,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });
        
        const isLinked = subIssuesResponse.data.some((subIssue: any) => subIssue.id === createdIssue.id);
        const verifyEnd = performance.now();
        
        if (!isLinked) {
          throw new Error(`Sub-issue relationship verification failed: Issue #${createdIssue.number} not found in parent #${parentNumber} sub-issues`);
        }
        
        console.log(`✅ SUB-ISSUE VERIFIED: Relationship verified in ${(verifyEnd - verifyStart).toFixed(2)}ms`);
        
      } catch (verifyError) {
        console.warn(`⚠️ SUB-ISSUE VERIFICATION FAILED: Could not verify sub-issue relationship, but continuing as link operation succeeded`);
        // Don't fail the entire operation if verification fails, as the link operation already succeeded
      }

      const totalTime = performance.now();
      console.log(`🎉 SUB-ISSUE CREATE COMPLETE: Total operation completed in ${(totalTime - startTime).toFixed(2)}ms`);
      
      return createdIssue;
      
    } catch (error: any) {
      const errorTime = performance.now();
      console.log(`❌ SUB-ISSUE CREATE FAILED: Operation failed at ${errorTime.toFixed(2)}ms (${(errorTime - startTime).toFixed(2)}ms total)`);
      
      // AUTOMATIC ROLLBACK: If we created an issue but failed to link it as sub-issue, delete the orphaned issue
      if (createdIssue) {
        try {
          console.log(`🔄 ROLLBACK START: Attempting to delete orphaned issue #${createdIssue.number}`);
          const rollbackStart = performance.now();
          
          // Use our delete method to properly mark it as deleted
          await this.deleteIssue(owner, repo, createdIssue.number);
          
          const rollbackEnd = performance.now();
          console.log(`✅ ROLLBACK COMPLETE: Orphaned issue #${createdIssue.number} deleted in ${(rollbackEnd - rollbackStart).toFixed(2)}ms`);
          
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

  // Validate if a state change is allowed (only leaf issues can have their state manually changed)
  canChangeIssueState(issue: Issue): boolean {
    return this.isLeafIssue(issue);
  }

  // Check if an issue is a leaf issue (has no sub-issues)
  private isLeafIssue(issue: Issue): boolean {
    return issue.subIssues.length === 0;
  }

  // Calculate automatic state for non-leaf issues based on sub-issues
  private calculateAutomaticState(issue: Issue): 'To Do' | 'In Progress' | 'Done' {
    if (this.isLeafIssue(issue)) {
      // Leaf issues keep their current state
      return issue.state;
    }

    // For non-leaf issues, calculate state based on sub-issues
    const subIssueStates = issue.subIssues.map(subIssue => this.calculateAutomaticState(subIssue));
    
    // If any sub-issue is "In Progress", parent is "In Progress"
    if (subIssueStates.some(state => state === 'In Progress')) {
      return 'In Progress';
    }
    
    // If all sub-issues are "Done", parent is "Done"
    if (subIssueStates.length > 0 && subIssueStates.every(state => state === 'Done')) {
      return 'Done';
    }
    
    // Otherwise, parent is "To Do"
    return 'To Do';
  }

  // Update issue states recursively, applying automatic state rules
  updateIssueStatesRecursively(issues: Issue[]): Issue[] {
    return issues.map(issue => {
      // First, recursively update sub-issues
      const updatedSubIssues = this.updateIssueStatesRecursively(issue.subIssues);
      
      // Create updated issue with processed sub-issues
      const updatedIssue = {
        ...issue,
        subIssues: updatedSubIssues
      };
      
      // Calculate and apply automatic state
      const calculatedState = this.calculateAutomaticState(updatedIssue);
      
      return {
        ...updatedIssue,
        state: calculatedState
      };
    });
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

  // Clear deleted issues cache (useful when GitHub API has caught up)
  clearDeletedCache(): void {
    this.deletedIssuesCache.clear();
  }

  // Get current deleted cache size (for debugging)
  getDeletedCacheSize(): number {
    return this.deletedIssuesCache.size;
  }

  // Verify cache consistency with GitHub's actual state
  async verifyDeletedCacheConsistency(owner: string, repo: string): Promise<{
    consistent: boolean;
    inconsistencies: Array<{
      issueNumber: string;
      inCache: boolean;
      hasDeletedLabel: boolean;
      issue?: any;
    }>;
  }> {
    try {
      // Get all issues from GitHub (bypassing our filtering)
      const { data: allGitHubIssues } = await this.octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        per_page: 100
      });
      
      const inconsistencies: Array<{
        issueNumber: string;
        inCache: boolean;
        hasDeletedLabel: boolean;
        issue?: any;
      }> = [];
      
      // Check each cached issue against GitHub's actual state
      for (const cachedIssueId of this.deletedIssuesCache) {
        const githubIssue = allGitHubIssues.find(issue => issue.number.toString() === cachedIssueId);
        
        if (githubIssue) {
          const hasDeletedLabel = githubIssue.labels?.some((label: any) => 
            (typeof label === 'string' ? label : label.name) === 'deleted'
          );
          
          if (!hasDeletedLabel) {
            // Issue is in cache but doesn't have deleted label on GitHub
            inconsistencies.push({
              issueNumber: cachedIssueId,
              inCache: true,
              hasDeletedLabel: false,
              issue: githubIssue
            });
          }
        } else {
          // Issue in cache but not found on GitHub (maybe actually deleted?)
          inconsistencies.push({
            issueNumber: cachedIssueId,
            inCache: true,
            hasDeletedLabel: false
          });
        }
      }
      
      // Check for issues with deleted label that aren't in cache
      for (const githubIssue of allGitHubIssues) {
        const hasDeletedLabel = githubIssue.labels?.some((label: any) => 
          (typeof label === 'string' ? label : label.name) === 'deleted'
        );
        
        if (hasDeletedLabel && !this.deletedIssuesCache.has(githubIssue.number.toString())) {
          inconsistencies.push({
            issueNumber: githubIssue.number.toString(),
            inCache: false,
            hasDeletedLabel: true,
            issue: githubIssue
          });
        }
      }
      
      const isConsistent = inconsistencies.length === 0;
      
      return {
        consistent: isConsistent,
        inconsistencies
      };
      
    } catch (error) {
      console.error('Error verifying cache consistency:', error);
      throw error;
    }
  }

  // Sync cache with GitHub's actual state (fix inconsistencies)
  async syncDeletedCacheWithGitHub(owner: string, repo: string): Promise<void> {
    try {
      const verification = await this.verifyDeletedCacheConsistency(owner, repo);
      
      if (verification.consistent) {
        return;
      }
      
      // Fix inconsistencies
      for (const inconsistency of verification.inconsistencies) {
        if (inconsistency.inCache && !inconsistency.hasDeletedLabel) {
          // Remove from cache since GitHub doesn't have it as deleted
          this.deletedIssuesCache.delete(inconsistency.issueNumber);
        } else if (!inconsistency.inCache && inconsistency.hasDeletedLabel) {
          // Add to cache since GitHub has it as deleted
          this.deletedIssuesCache.add(inconsistency.issueNumber);
        }
      }
      
    } catch (error) {
      console.error('Error syncing cache with GitHub:', error);
      throw error;
    }
  }
}
