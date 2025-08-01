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
  const [forceRefresh, setForceRefresh] = useState(0); // Force component refresh

  const handleIssueUpdate = async (updatedIssue: Issue) => {
    if (!githubService) return;

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

    let optimisticProject: Project | null = null;

    try {
      // Update UI immediately for responsive experience
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

      optimisticProject = {
        ...project,
        issues: issuesWithRecalculatedStates
      };

      // Update UI immediately with optimistic state
      onProjectUpdate(optimisticProject);
      
      // Close modal immediately for responsive feel
      setSelectedIssue(null);

      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      // Background GitHub operations

      // Step 1: Update issue on GitHub
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
        // Rollback UI changes and show error
        onProjectUpdate(project);
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
            // Rollback GitHub issue state and UI
            try {
              await githubService.rollbackIssueState(owner, repo, parseInt(updatedIssue.id), {
                title: originalIssue.title,
                description: originalIssue.description,
                state: originalIssue.state,
                type: originalIssue.type
              });
              
              // Rollback UI to original state
              onProjectUpdate(project);
              toastService.error(`Failed to create branch: ${error.message}. Issue state reverted.`);
            } catch (rollbackError: any) {
              // Rollback UI even if GitHub rollback failed
              onProjectUpdate(project);
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
                // Even deletion failed - rollback issue state and UI
                try {
                  await githubService.rollbackIssueState(owner, repo, parseInt(updatedIssue.id), {
                    title: originalIssue.title,
                    description: originalIssue.description,
                    state: originalIssue.state,
                    type: originalIssue.type
                  });
                  
                  // Rollback UI to original state
                  onProjectUpdate(project);
                  toastService.error(`Failed to delete empty branch: ${deleteError.message}. Issue state reverted.`);
                } catch (rollbackError: any) {
                  // Rollback UI even if GitHub rollback failed
                  onProjectUpdate(project);
                  toastService.error(`Failed to handle branch AND failed to rollback issue state: ${mergeError.message}`);
                }
                return;
              }
            } else {
              // Other merge errors - rollback issue state and UI
              try {
                await githubService.rollbackIssueState(owner, repo, parseInt(updatedIssue.id), {
                  title: originalIssue.title,
                  description: originalIssue.description,
                  state: originalIssue.state,
                  type: originalIssue.type
                });
                
                // Rollback UI to original state
                onProjectUpdate(project);
                toastService.error(`Failed to merge branch: ${mergeError.message}. Issue state reverted.`);
              } catch (rollbackError: any) {
                // Rollback UI even if GitHub rollback failed
                onProjectUpdate(project);
                toastService.error(`Failed to merge branch AND failed to rollback issue state: ${mergeError.message}`);
              }
              return;
            }
          }
        }
      }

      toastService.success(`Issue #${updatedIssue.id} updated successfully`);
      
    } catch (error: any) {
      // ROLLBACK: Restore original project state
      if (optimisticProject) {
        onProjectUpdate(project);
      }
      
      console.error('Error updating issue:', error);
      toastService.error(`Failed to update issue: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleIssueCreate = async (newIssue: Omit<Issue, 'id' | 'subIssues'>) => {
    if (!githubService) return;

    // Generate optimistic temporary ID for immediate UI update
    const tempId = 'temp-' + Date.now();
    const optimisticIssue: Issue = {
      ...newIssue,
      id: tempId,
      subIssues: []
    };

    let optimisticProject: Project | null = null;

    try {
      // Add to UI immediately for responsive experience
      if (createIssueParent) {
        // Add as sub-issue optimistically
        const updateIssueInTree = (issues: Issue[]): Issue[] => {
          return issues.map(parentIssue => {
            if (parentIssue.id === createIssueParent.id) {
              return {
                ...parentIssue,
                subIssues: [...parentIssue.subIssues, optimisticIssue]
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

        optimisticProject = {
          ...project,
          issues: issuesWithRecalculatedStates
        };
      } else {
        // Add as top-level issue optimistically
        optimisticProject = {
          ...project,
          issues: [...project.issues, optimisticIssue]
        };
      }

      // Update UI immediately with optimistic state
      onProjectUpdate(optimisticProject);

      // Close modal immediately for responsive feel
      setIsCreateModalOpen(false);
      setCreateIssueParent(null);

      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      // Background GitHub operations
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

      // Replace optimistic issue with real GitHub issue
      const realIssue: Issue = {
        ...newIssue,
        id: githubIssue.number.toString(),
        subIssues: []
      };

      // Update with real issue data
      const replaceOptimisticIssue = (issues: Issue[]): Issue[] => {
        return issues.map(issue => {
          if (issue.id === tempId) {
            return realIssue;
          }
          if (issue.subIssues.length > 0) {
            return {
              ...issue,
              subIssues: replaceOptimisticIssue(issue.subIssues)
            };
          }
          return issue;
        });
      };

      const finalIssues = replaceOptimisticIssue(optimisticProject.issues);
      const finalProject = {
        ...optimisticProject,
        issues: finalIssues
      };

      onProjectUpdate(finalProject);

      toastService.success(`Issue #${realIssue.id} created successfully`);
      
    } catch (error: any) {
      // ROLLBACK: Remove optimistic issue and restore original state
      if (optimisticProject) {
        onProjectUpdate(project);
      }
      
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

      // Close modal and show success immediately
      const subIssueCount = countSubIssues(issueToDelete);
      const message = subIssueCount > 0 
        ? `Issue #${issueToDelete.id} and ${subIssueCount} sub-issues deleted successfully`
        : `Issue #${issueToDelete.id} deleted successfully`;
      
      // Close modal immediately - don't wait for GitHub!
      setSelectedIssue(null);
      toastService.success(message);
      setLoading(false);

      // Clear timing data
      delete (window as any).deleteStartTime;
      delete (window as any).deletingIssueId;

      // Background GitHub operations without blocking UI
      
      // Recursively delete all sub-issues first, then the parent
      const deleteIssueRecursively = async (issue: Issue): Promise<void> => {
        // Delete all sub-issues first
        for (const subIssue of issue.subIssues) {
          await deleteIssueRecursively(subIssue);
        }
        
        // Then delete the current issue
        await githubService.deleteIssue(owner, repo, parseInt(issue.id));
      };

      // Delete the issue and all its sub-issues on GitHub (in background)
      deleteIssueRecursively(issueToDelete).then(() => {
        // Background sync after GitHub operations complete
        return Promise.all([
          githubService.getRepositoryIssues(owner, repo),
        ]).then(([githubIssues]) => {
          return githubService.buildIssueHierarchy(githubIssues, owner, repo);
        });
      }).then((issues) => {
        if (issues) {
          // Create a completely new project object to ensure React detects the change
          const timestamp = Date.now();
          const issuesWithTimestamp = issues.map(issue => ({
            ...issue,
            _timestamp: timestamp
          }));
          
          const updatedProject: Project = {
            id: `${project.id}_updated_${timestamp}`,
            name: project.name,
            description: project.description,
            repository: project.repository,
            issues: issuesWithTimestamp
          };
          
          // Force a complete component refresh by updating state
          setForceRefresh(prev => prev + 1);
          onProjectUpdate(updatedProject);
        }
      }).catch((syncError) => {
        console.warn('Background operations failed, but UI deletion was successful:', syncError);
        // Don't show error to user since the UI deletion itself succeeded
      });

    } catch (error: any) {
      console.error('Error in delete handler:', error);
      toastService.error(`Failed to delete issue: ${error.message || 'Unknown error'}`);
      setLoading(false);
    }
  };

  // Helper function to count total sub-issues
  const countSubIssues = (issue: Issue): number => {
    let count = issue.subIssues.length;
    issue.subIssues.forEach(subIssue => {
      count += countSubIssues(subIssue);
    });
    return count;
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
          
          {/* Debug information */}
          <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
            <strong>Debug Info:</strong><br/>
            Project ID: {project.id}<br/>
            Issues Count: {project.issues.length}<br/>
            Issues: {project.issues.map(i => `#${i.id}`).join(', ') || 'None'}<br/>
            Force Refresh: {forceRefresh}
          </div>
          
          {loading && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
              <span className="ml-2 text-gray-600">Updating...</span>
            </div>
          )}
          <IssueList
            key={`${project.id}-${forceRefresh}-${project.issues.length}-${JSON.stringify(project.issues.map(i => i.id))}`} // Force re-render when project or issues change
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
