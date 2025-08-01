import { Issue, Project } from '../types';
import { updateIssueInTree, addIssueToParent, replaceIssueInTree } from './issueUtils';
import { GitHubService } from '../services/githubService';

export class OptimisticUpdateManager {
  constructor(private githubService: GitHubService) {}

  // Create optimistic update for issue modification
  createOptimisticUpdate(project: Project, updatedIssue: Issue): Project {
    const updatedIssues = updateIssueInTree(project.issues, updatedIssue);
    const issuesWithRecalculatedStates = this.githubService.updateIssueStatesRecursively(updatedIssues);

    return {
      ...project,
      issues: issuesWithRecalculatedStates
    };
  }

  // Create optimistic update for new issue creation
  createOptimisticCreation(project: Project, newIssue: Issue, parentId?: string): Project {
    let updatedIssues: Issue[];

    if (parentId) {
      // Add as sub-issue
      updatedIssues = addIssueToParent(project.issues, newIssue, parentId);
    } else {
      // Add as root issue
      updatedIssues = [...project.issues, newIssue];
    }

    // Recalculate automatic states
    const issuesWithRecalculatedStates = this.githubService.updateIssueStatesRecursively(updatedIssues);

    return {
      ...project,
      issues: issuesWithRecalculatedStates
    };
  }

  // Replace optimistic issue with real GitHub issue data
  replaceOptimisticIssue(project: Project, tempId: string, realIssue: Issue): Project {
    const finalIssues = replaceIssueInTree(project.issues, tempId, realIssue);
    
    return {
      ...project,
      issues: finalIssues
    };
  }

  // Create background project sync after GitHub operations
  createBackgroundSync(project: Project, timestamp: number): Project {
    const issuesWithTimestamp = project.issues.map(issue => ({
      ...issue,
      _timestamp: timestamp
    }));

    return {
      id: `${project.id}_updated_${timestamp}`,
      name: project.name,
      description: project.description,
      repository: project.repository,
      issues: issuesWithTimestamp
    };
  }
}
