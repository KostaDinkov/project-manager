import { GitHubIssue, CacheConsistencyResult } from './types';
import { Octokit } from '@octokit/rest';

export class GitHubCacheManager {
  constructor(private octokit: Octokit, private deletedIssuesCache: Set<string>) {}

  // Clear deleted issues cache (useful when GitHub API has caught up)
  clearDeletedCache(): void {
    this.deletedIssuesCache.clear();
  }

  // Get current deleted cache size (for debugging)
  getDeletedCacheSize(): number {
    return this.deletedIssuesCache.size;
  }

  // Verify cache consistency with GitHub's actual state
  async verifyDeletedCacheConsistency(owner: string, repo: string): Promise<CacheConsistencyResult> {
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
        issue?: GitHubIssue;
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
              issue: githubIssue as GitHubIssue
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
            issue: githubIssue as GitHubIssue
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
