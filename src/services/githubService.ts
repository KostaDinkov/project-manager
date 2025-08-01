import { Octokit } from '@octokit/rest';
import { Issue } from '../types';
import { GitHubIssueOperations } from './github/issueOperations';
import { GitHubBranchOperations } from './github/branchOperations';
import { GitHubSubIssueOperations } from './github/subIssueOperations';
import { GitHubCacheManager } from './github/cacheManager';
import { IssueStateManager } from './github/issueStateManager';
import { IssueHierarchyBuilder } from './github/issueHierarchyBuilder';
import { GitHubUpdateIssueData, CacheConsistencyResult } from './github/types';

export class GitHubService {
  private octokit: Octokit;
  private deletedIssuesCache: Set<string> = new Set(); // Cache of deleted issue IDs
  
  // Operation modules
  private issueOperations: GitHubIssueOperations;
  private branchOperations: GitHubBranchOperations;
  private subIssueOperations: GitHubSubIssueOperations;
  private cacheManager: GitHubCacheManager;
  private issueStateManager: IssueStateManager;
  private hierarchyBuilder: IssueHierarchyBuilder;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
    
    // Initialize operation modules
    this.issueOperations = new GitHubIssueOperations(this.octokit, this.deletedIssuesCache);
    this.branchOperations = new GitHubBranchOperations(this.octokit);
    this.subIssueOperations = new GitHubSubIssueOperations(this.octokit, this.deletedIssuesCache);
    this.cacheManager = new GitHubCacheManager(this.octokit, this.deletedIssuesCache);
    this.issueStateManager = new IssueStateManager();
    this.hierarchyBuilder = new IssueHierarchyBuilder(this.octokit, this.deletedIssuesCache);
  }

  // Repository operations
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

  // Issue operations - delegate to IssueOperations module
  async getRepositoryIssues(owner: string, repo: string) {
    return this.issueOperations.getRepositoryIssues(owner, repo);
  }

  async createIssue(owner: string, repo: string, title: string, body?: string, labels?: string[]) {
    return this.issueOperations.createIssue(owner, repo, { title, body, labels });
  }

  async updateIssue(owner: string, repo: string, issueNumber: number, updates: GitHubUpdateIssueData) {
    return this.issueOperations.updateIssue(owner, repo, issueNumber, updates);
  }

  async deleteIssue(owner: string, repo: string, issueNumber: number) {
    return this.issueOperations.deleteIssue(owner, repo, issueNumber);
  }

  async rollbackIssueState(owner: string, repo: string, issueNumber: number, originalIssue: {
    title: string;
    description: string;
    state: 'To Do' | 'In Progress' | 'Done';
    type: string;
  }) {
    return this.issueOperations.rollbackIssueState(owner, repo, issueNumber, originalIssue);
  }

  // Branch operations - delegate to BranchOperations module
  async createBranch(owner: string, repo: string, branchName: string, baseBranch?: string) {
    return this.branchOperations.createBranch(owner, repo, branchName, baseBranch);
  }

  async deleteBranch(owner: string, repo: string, branchName: string) {
    return this.branchOperations.deleteBranch(owner, repo, branchName);
  }

  async mergeBranch(owner: string, repo: string, headBranch: string, baseBranch?: string) {
    return this.branchOperations.mergeBranch(owner, repo, headBranch, baseBranch);
  }

  // Sub-issue operations - delegate to SubIssueOperations module
  async listSubIssues(owner: string, repo: string, issueNumber: number): Promise<Issue[]> {
    return this.subIssueOperations.listSubIssues(owner, repo, issueNumber);
  }

  async createSubIssue(owner: string, repo: string, parentNumber: number, title: string, body?: string, labels?: string[]) {
    return this.subIssueOperations.createSubIssue(owner, repo, parentNumber, title, body, labels);
  }

  async removeSubIssue(owner: string, repo: string, parentNumber: number, subIssueId: number): Promise<void> {
    return this.subIssueOperations.removeSubIssue(owner, repo, parentNumber, subIssueId);
  }

  // Issue state management - delegate to IssueStateManager module
  canChangeIssueState(issue: Issue): boolean {
    return this.issueStateManager.canChangeIssueState(issue);
  }

  updateIssueStatesRecursively(issues: Issue[]): Issue[] {
    return this.issueStateManager.updateIssueStatesRecursively(issues);
  }

  // Hierarchy building - delegate to IssueHierarchyBuilder module
  async buildIssueHierarchy(githubIssues: any[], owner: string, repo: string): Promise<Issue[]> {
    return this.hierarchyBuilder.buildIssueHierarchy(githubIssues, owner, repo);
  }

  // Cache management - delegate to CacheManager module
  clearDeletedCache(): void {
    this.cacheManager.clearDeletedCache();
  }

  getDeletedCacheSize(): number {
    return this.cacheManager.getDeletedCacheSize();
  }

  async verifyDeletedCacheConsistency(owner: string, repo: string): Promise<CacheConsistencyResult> {
    return this.cacheManager.verifyDeletedCacheConsistency(owner, repo);
  }

  async syncDeletedCacheWithGitHub(owner: string, repo: string): Promise<void> {
    return this.cacheManager.syncDeletedCacheWithGitHub(owner, repo);
  }
}
