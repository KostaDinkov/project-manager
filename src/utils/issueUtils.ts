import { Issue } from '../types';

// Utility functions for issue operations

export const findIssueInTree = (issues: Issue[], targetId: string): Issue | null => {
  for (const issue of issues) {
    if (issue.id === targetId) {
      return issue;
    }
    const found = findIssueInTree(issue.subIssues, targetId);
    if (found) {
      return found;
    }
  }
  return null;
};

export const updateIssueInTree = (issues: Issue[], updatedIssue: Issue): Issue[] => {
  return issues.map(issue => {
    if (issue.id === updatedIssue.id) {
      return updatedIssue;
    }
    if (issue.subIssues.length > 0) {
      return {
        ...issue,
        subIssues: updateIssueInTree(issue.subIssues, updatedIssue)
      };
    }
    return issue;
  });
};

export const addIssueToParent = (issues: Issue[], newIssue: Issue, parentId: string): Issue[] => {
  return issues.map(issue => {
    if (issue.id === parentId) {
      return {
        ...issue,
        subIssues: [...issue.subIssues, newIssue]
      };
    }
    if (issue.subIssues.length > 0) {
      return {
        ...issue,
        subIssues: addIssueToParent(issue.subIssues, newIssue, parentId)
      };
    }
    return issue;
  });
};

export const replaceIssueInTree = (issues: Issue[], oldId: string, newIssue: Issue): Issue[] => {
  return issues.map(issue => {
    if (issue.id === oldId) {
      return newIssue;
    }
    if (issue.subIssues.length > 0) {
      return {
        ...issue,
        subIssues: replaceIssueInTree(issue.subIssues, oldId, newIssue)
      };
    }
    return issue;
  });
};

export const countSubIssues = (issue: Issue): number => {
  let count = issue.subIssues.length;
  issue.subIssues.forEach(subIssue => {
    count += countSubIssues(subIssue);
  });
  return count;
};
