import { Octokit } from '@octokit/rest';
import { Issue } from '../../types';
import { IssueStateManager } from './issueStateManager';

export class IssueHierarchyBuilder {
  private issueStateManager: IssueStateManager;

  constructor(private octokit: Octokit, private deletedIssuesCache: Set<string>) {
    this.issueStateManager = new IssueStateManager();
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
    const issuesWithCalculatedStates = this.issueStateManager.updateIssueStatesRecursively(topLevelIssues);

    return issuesWithCalculatedStates;
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
      state: state as 'To Do' | 'In Progress' | 'Done',
      type: typeLabel as 'Feature' | 'Bug' | 'Improvement',
      repository: `${githubIssue.repository?.owner?.login}/${githubIssue.repository?.name}` || '',
      level: 0,
      parentId: null,
      subIssues: []
    };
  }
}
