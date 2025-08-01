// Re-export the main GitHubService for backward compatibility
export { GitHubService } from '../githubService';

// Export utility types
export type { GitHubCreateIssueData, GitHubUpdateIssueData, CacheConsistencyResult } from './types';

// Export individual operation modules for advanced usage
export { GitHubIssueOperations } from './issueOperations';
export { GitHubBranchOperations } from './branchOperations';
export { GitHubSubIssueOperations } from './subIssueOperations';
export { GitHubCacheManager } from './cacheManager';
export { IssueStateManager } from './issueStateManager';
export { IssueHierarchyBuilder } from './issueHierarchyBuilder';
