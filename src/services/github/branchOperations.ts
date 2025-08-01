import { Octokit } from '@octokit/rest';

export class GitHubBranchOperations {
  constructor(private octokit: Octokit) {}

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
}
