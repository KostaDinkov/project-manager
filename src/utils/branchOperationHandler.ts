import { Issue } from '../types';
import { GitHubService } from '../services/githubService';
import { toastService } from '../services/toastService';

export interface BranchOperationResult {
  success: boolean;
  error?: string;
  shouldRollback?: boolean;
}

export class BranchOperationHandler {
  constructor(private githubService: GitHubService) {}

  async handleStateTransition(
    owner: string,
    repo: string,
    issue: Issue,
    newState: 'To Do' | 'In Progress' | 'Done'
  ): Promise<BranchOperationResult> {
    // Only handle branch operations for leaf issues
    if (issue.subIssues.length > 0) {
      return { success: true };
    }

    const branchName = `issue-${issue.id}`;
    
    try {
      if (newState === 'In Progress') {
        // Create branch for this issue
        await this.githubService.createBranch(owner, repo, branchName);
        toastService.success(`Created branch '${branchName}' for issue #${issue.id}`);
        return { success: true };
      } else if (newState === 'Done') {
        // Merge and delete branch when issue is done
        return await this.handleBranchCompletion(owner, repo, branchName);
      }
      
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        shouldRollback: true
      };
    }
  }

  private async handleBranchCompletion(
    owner: string,
    repo: string,
    branchName: string
  ): Promise<BranchOperationResult> {
    try {
      // First try to merge the branch
      await this.githubService.mergeBranch(owner, repo, branchName);
      toastService.success(`Successfully merged branch '${branchName}'`);
      
      // Then delete the branch
      try {
        await this.githubService.deleteBranch(owner, repo, branchName);
        toastService.success(`Successfully deleted branch '${branchName}'`);
      } catch (deleteError: any) {
        // Merge succeeded but delete failed - this is not critical
        toastService.warning(`Branch merged but failed to delete: ${deleteError.message}`);
      }
      
      return { success: true };
    } catch (mergeError: any) {
      // Handle empty branch case
      if (mergeError.message.includes('no commits to merge') || mergeError.message.includes('empty branch')) {
        return await this.handleEmptyBranch(owner, repo, branchName);
      } else {
        return {
          success: false,
          error: mergeError.message,
          shouldRollback: true
        };
      }
    }
  }

  private async handleEmptyBranch(
    owner: string,
    repo: string,
    branchName: string
  ): Promise<BranchOperationResult> {
    try {
      await this.githubService.deleteBranch(owner, repo, branchName);
      toastService.info(`Deleted empty branch '${branchName}' (no commits to merge)`);
      return { success: true };
    } catch (deleteError: any) {
      return {
        success: false,
        error: `Failed to delete empty branch: ${deleteError.message}`,
        shouldRollback: true
      };
    }
  }
}
