import { Issue } from '../../types';

export class IssueStateManager {
  // Validate if a state change is allowed (only leaf issues can have their state manually changed)
  canChangeIssueState(issue: Issue): boolean {
    return this.isLeafIssue(issue);
  }

  // Check if an issue is a leaf issue (has no sub-issues)
  isLeafIssue(issue: Issue): boolean {
    return issue.subIssues.length === 0;
  }

  // Calculate automatic state for non-leaf issues based on sub-issues
  calculateAutomaticState(issue: Issue): 'To Do' | 'In Progress' | 'Done' {
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
}
