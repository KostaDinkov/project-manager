import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Project, Issue } from '../types';
import IssueList from './IssueList';
import IssueModal from './IssueModal';
import { toastService } from '../services/toastService';

interface ProjectSpecificationProps {
  project: Project;
  onProjectUpdate: (project: Project) => void;
}

export default function ProjectSpecification({ project, onProjectUpdate }: ProjectSpecificationProps) {
  const { githubService } = useAuth();
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createIssueParent, setCreateIssueParent] = useState<Issue | null>(null);
  const [loading, setLoading] = useState(false);

  const handleIssueUpdate = async (updatedIssue: Issue) => {
    if (!githubService) return;

    try {
      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      // Validate state change - only allow for leaf issues
      if (!githubService.canChangeIssueState(updatedIssue)) {
        toastService.warning('Cannot manually change state of non-leaf issue');
        return;
      }

      // Store original issue for rollback
      const originalIssue = project.issues.flatMap(function findIssue(issue: Issue): Issue[] {
        if (issue.id === updatedIssue.id) return [issue];
        return issue.subIssues.flatMap(findIssue);
      })[0];

      if (!originalIssue) {
        toastService.error('Original issue not found for rollback');
        return;
      }

      // Step 1: Update issue on GitHub first
      const state = updatedIssue.state === 'Done' ? 'closed' : 'open';
      const labels = [updatedIssue.type];
      if (updatedIssue.state === 'In Progress') {
        labels.push('in-progress');
      }

      try {
        await githubService.updateIssue(owner, repo, parseInt(updatedIssue.id), {
          title: updatedIssue.title,
          body: updatedIssue.description,
          state,
          labels
        });
      } catch (error: any) {
        toastService.error(`Failed to update issue on GitHub: ${error.message}`);
        return;
      }

      // Step 2: Handle branch operations for leaf issues (with rollback on failure)
      if (updatedIssue.subIssues.length === 0) {
        const branchName = `issue-${updatedIssue.id}`;
        
        if (updatedIssue.state === 'In Progress') {
          // Create branch for this issue
          try {
            await githubService.createBranch(owner, repo, branchName);
            toastService.success(`Created branch '${branchName}' for issue #${updatedIssue.id}`);
          } catch (error: any) {
            // Rollback GitHub issue state
            try {
              const originalState = originalIssue.state === 'Done' ? 'closed' : 'open';
              const originalLabels = [originalIssue.type];
              if (originalIssue.state === 'In Progress') {
                originalLabels.push('in-progress');
              }
              
              await githubService.updateIssue(owner, repo, parseInt(updatedIssue.id), {
                title: originalIssue.title,
                body: originalIssue.description,
                state: originalState,
                labels: originalLabels
              });
              
              toastService.error(`Failed to create branch: ${error.message}. Issue state reverted.`);
            } catch (rollbackError: any) {
              toastService.error(`Failed to create branch AND failed to rollback issue state: ${error.message}`);
            }
            return;
          }
        } else if (updatedIssue.state === 'Done') {
          // Merge and delete branch when issue is done
          try {
            // First try to merge the branch
            await githubService.mergeBranch(owner, repo, branchName);
            toastService.success(`Successfully merged branch '${branchName}'`);
            
            // Then delete the branch
            try {
              await githubService.deleteBranch(owner, repo, branchName);
              toastService.success(`Successfully deleted branch '${branchName}'`);
            } catch (deleteError: any) {
              // Merge succeeded but delete failed - this is not critical
              toastService.warning(`Branch merged but failed to delete: ${deleteError.message}`);
            }
          } catch (mergeError: any) {
            // Merge failed - check if it's because branch is empty
            if (mergeError.message.includes('no commits to merge') || mergeError.message.includes('empty branch')) {
              // For empty branches, just delete them without merging
              try {
                await githubService.deleteBranch(owner, repo, branchName);
                toastService.info(`Deleted empty branch '${branchName}' (no commits to merge)`);
              } catch (deleteError: any) {
                // Even deletion failed - rollback issue state
                try {
                  const originalState = originalIssue.state === 'Done' ? 'closed' : 'open';
                  const originalLabels = [originalIssue.type];
                  if (originalIssue.state === 'In Progress') {
                    originalLabels.push('in-progress');
                  }
                  
                  await githubService.updateIssue(owner, repo, parseInt(updatedIssue.id), {
                    title: originalIssue.title,
                    body: originalIssue.description,
                    state: originalState,
                    labels: originalLabels
                  });
                  
                  toastService.error(`Failed to delete empty branch: ${deleteError.message}. Issue state reverted.`);
                } catch (rollbackError: any) {
                  toastService.error(`Failed to handle branch AND failed to rollback issue state: ${mergeError.message}`);
                }
                return;
              }
            } else {
              // Other merge errors - rollback issue state
              try {
                const originalState = originalIssue.state === 'Done' ? 'closed' : 'open';
                const originalLabels = [originalIssue.type];
                if (originalIssue.state === 'In Progress') {
                  originalLabels.push('in-progress');
                }
                
                await githubService.updateIssue(owner, repo, parseInt(updatedIssue.id), {
                  title: originalIssue.title,
                  body: originalIssue.description,
                  state: originalState,
                  labels: originalLabels
                });
                
                toastService.error(`Failed to merge branch: ${mergeError.message}. Issue state reverted.`);
              } catch (rollbackError: any) {
                toastService.error(`Failed to merge branch AND failed to rollback issue state: ${mergeError.message}`);
              }
              return;
            }
          }
        }
      }

      // Step 3: Update local UI state only if all GitHub operations succeeded
      const updateIssueInTree = (issues: Issue[]): Issue[] => {
        return issues.map(issue => {
          if (issue.id === updatedIssue.id) {
            return updatedIssue;
          }
          if (issue.subIssues.length > 0) {
            return {
              ...issue,
              subIssues: updateIssueInTree(issue.subIssues)
            };
          }
          return issue;
        });
      };

      const updatedIssues = updateIssueInTree(project.issues);
      
      // Recalculate automatic states for parent issues
      const issuesWithRecalculatedStates = githubService.updateIssueStatesRecursively(updatedIssues);

      const updatedProject = {
        ...project,
        issues: issuesWithRecalculatedStates
      };

      onProjectUpdate(updatedProject);
      setSelectedIssue(null);
      toastService.success(`Issue #${updatedIssue.id} updated successfully`);
    } catch (error: any) {
      console.error('Error updating issue:', error);
      toastService.error(`Failed to update issue: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCreate = async (newIssue: Omit<Issue, 'id' | 'subIssues'>) => {
    if (!githubService) return;

    try {
      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      let githubIssue;

      if (createIssueParent) {
        // Create as sub-issue with proper parent reference and linkage
        githubIssue = await githubService.createSubIssue(
          owner,
          repo,
          parseInt(createIssueParent.id),
          newIssue.title,
          newIssue.description,
          [newIssue.type]
        );
      } else {
        // Create as top-level issue
        githubIssue = await githubService.createIssue(
          owner,
          repo,
          newIssue.title,
          newIssue.description,
          [newIssue.type]
        );
      }

      const issue: Issue = {
        ...newIssue,
        id: githubIssue.number.toString(),
        subIssues: []
      };

      if (createIssueParent) {
        // Add as sub-issue
        const updateIssueInTree = (issues: Issue[]): Issue[] => {
          return issues.map(parentIssue => {
            if (parentIssue.id === createIssueParent.id) {
              return {
                ...parentIssue,
                subIssues: [...parentIssue.subIssues, issue]
              };
            }
            if (parentIssue.subIssues.length > 0) {
              return {
                ...parentIssue,
                subIssues: updateIssueInTree(parentIssue.subIssues)
              };
            }
            return parentIssue;
          });
        };

        const updatedIssues = updateIssueInTree(project.issues);
        
        // Recalculate automatic states since we added a new sub-issue
        const issuesWithRecalculatedStates = githubService.updateIssueStatesRecursively(updatedIssues);

        const updatedProject = {
          ...project,
          issues: issuesWithRecalculatedStates
        };

        onProjectUpdate(updatedProject);
      } else {
        // Add as top-level issue - no need to recalculate states as it's a new root issue
        const updatedProject = {
          ...project,
          issues: [...project.issues, issue]
        };
        onProjectUpdate(updatedProject);
      }

      setIsCreateModalOpen(false);
      setCreateIssueParent(null);
      toastService.success(`Issue #${issue.id} created successfully`);
    } catch (error: any) {
      console.error('Error creating issue:', error);
      toastService.error(`Failed to create issue: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleIssueDelete = async (issueToDelete: Issue) => {
    if (!githubService) return;

    try {
      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      // Delete issue on GitHub (close and mark as deleted)
      await githubService.deleteIssue(owner, repo, parseInt(issueToDelete.id));

      // Remove from local state
      const removeIssueFromTree = (issues: Issue[]): Issue[] => {
        return issues.filter(issue => {
          if (issue.id === issueToDelete.id) {
            return false; // Remove this issue
          }
          if (issue.subIssues.length > 0) {
            issue.subIssues = removeIssueFromTree(issue.subIssues);
          }
          return true;
        });
      };

      const updatedIssues = removeIssueFromTree(project.issues);
      
      // Recalculate automatic states since we removed an issue
      const issuesWithRecalculatedStates = githubService.updateIssueStatesRecursively(updatedIssues);

      const updatedProject = {
        ...project,
        issues: issuesWithRecalculatedStates
      };

      onProjectUpdate(updatedProject);
      setSelectedIssue(null);
      toastService.success(`Issue #${issueToDelete.id} deleted successfully`);
    } catch (error: any) {
      console.error('Error deleting issue:', error);
      toastService.error(`Failed to delete issue: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateIssue = (parent?: Issue) => {
    setCreateIssueParent(parent || null);
    setIsCreateModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{project.name}</h2>
            <p className="text-gray-600 mt-1">{project.description}</p>
            <p className="text-sm text-gray-500 mt-1">Repository: {project.repository}</p>
          </div>
          <button
            onClick={() => handleCreateIssue()}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Add Issue'}
          </button>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Project Specification</h3>
          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <span className="ml-2 text-gray-600">Updating...</span>
            </div>
          )}
          <IssueList
            issues={project.issues}
            level={0}
            onIssueClick={setSelectedIssue}
            onCreateIssue={handleCreateIssue}
          />
        </div>
      </div>

      {selectedIssue && (
        <IssueModal
          issue={selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onUpdate={handleIssueUpdate}
          onDelete={handleIssueDelete}
          canChangeState={githubService?.canChangeIssueState(selectedIssue) ?? true}
        />
      )}

      {isCreateModalOpen && (
        <IssueModal
          issue={null}
          parentIssue={createIssueParent}
          onClose={() => {
            setIsCreateModalOpen(false);
            setCreateIssueParent(null);
          }}
          onCreate={handleIssueCreate}
          defaultRepository={project.repository}
        />
      )}
    </div>
  );
}
