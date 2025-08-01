import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Project, Issue } from '../types';
import IssueList from './IssueList';
import IssueModal from './IssueModal';
import { toastService } from '../services/toastService';
import { findIssueInTree, countSubIssues } from '../utils/issueUtils';
import { BranchOperationHandler } from '../utils/branchOperationHandler';
import { OptimisticUpdateManager } from '../utils/optimisticUpdateManager';

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
  const [forceRefresh, setForceRefresh] = useState(0);

  // Initialize utility managers
  const branchHandler = githubService ? new BranchOperationHandler(githubService) : null;
  const optimisticManager = githubService ? new OptimisticUpdateManager(githubService) : null;

  const handleIssueUpdate = async (updatedIssue: Issue) => {
    if (!githubService || !branchHandler || !optimisticManager) return;

    // Validate state change - only allow for leaf issues
    if (!githubService.canChangeIssueState(updatedIssue)) {
      toastService.warning('Cannot manually change state of non-leaf issue');
      return;
    }

    // Store original issue for rollback
    const originalIssue = findIssueInTree(project.issues, updatedIssue.id);
    if (!originalIssue) {
      toastService.error('Original issue not found for rollback');
      return;
    }

    let optimisticProject: Project | null = null;

    try {
      // Create optimistic update
      optimisticProject = optimisticManager.createOptimisticUpdate(project, updatedIssue);
      onProjectUpdate(optimisticProject);
      setSelectedIssue(null);

      setLoading(true);
      const [owner, repo] = project.repository.split('/');

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
        onProjectUpdate(project);
        toastService.error(`Failed to update issue on GitHub: ${error.message}`);
        return;
      }

      // Step 2: Handle branch operations
      const branchResult = await branchHandler.handleStateTransition(
        owner,
        repo,
        updatedIssue,
        updatedIssue.state
      );

      if (!branchResult.success && branchResult.shouldRollback) {
        // Rollback GitHub issue state and UI
        try {
          await githubService.rollbackIssueState(owner, repo, parseInt(updatedIssue.id), {
            title: originalIssue.title,
            description: originalIssue.description,
            state: originalIssue.state,
            type: originalIssue.type
          });
          
          onProjectUpdate(project);
          toastService.error(`${branchResult.error}. Issue state reverted.`);
        } catch (rollbackError: any) {
          onProjectUpdate(project);
          toastService.error(`${branchResult.error} AND failed to rollback issue state.`);
        }
        return;
      }

      toastService.success(`Issue #${updatedIssue.id} updated successfully`);
      
    } catch (error: any) {
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
    if (!githubService || !optimisticManager) return;

    const tempId = 'temp-' + Date.now();
    const optimisticIssue: Issue = {
      ...newIssue,
      id: tempId,
      subIssues: []
    };

    let optimisticProject: Project | null = null;

    try {
      // Create optimistic update
      optimisticProject = optimisticManager.createOptimisticCreation(
        project,
        optimisticIssue,
        createIssueParent?.id
      );

      onProjectUpdate(optimisticProject);
      setIsCreateModalOpen(false);
      setCreateIssueParent(null);

      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      let githubIssue;

      if (createIssueParent) {
        githubIssue = await githubService.createSubIssue(
          owner,
          repo,
          parseInt(createIssueParent.id),
          newIssue.title,
          newIssue.description,
          [newIssue.type]
        );
      } else {
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

      const finalProject = optimisticManager.replaceOptimisticIssue(optimisticProject, tempId, realIssue);
      onProjectUpdate(finalProject);

      toastService.success(`Issue #${realIssue.id} created successfully`);
      
    } catch (error: any) {
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
    if (!githubService || !optimisticManager) return;

    try {
      setLoading(true);
      const [owner, repo] = project.repository.split('/');

      const subIssueCount = countSubIssues(issueToDelete);
      const message = subIssueCount > 0 
        ? `Issue #${issueToDelete.id} and ${subIssueCount} sub-issues deleted successfully`
        : `Issue #${issueToDelete.id} deleted successfully`;
      
      setSelectedIssue(null);
      toastService.success(message);
      setLoading(false);

      // Clear timing data
      delete (window as any).deleteStartTime;
      delete (window as any).deletingIssueId;

      // Background GitHub operations
      const deleteIssueRecursively = async (issue: Issue): Promise<void> => {
        for (const subIssue of issue.subIssues) {
          await deleteIssueRecursively(subIssue);
        }
        await githubService.deleteIssue(owner, repo, parseInt(issue.id));
      };

      // Background operations
      deleteIssueRecursively(issueToDelete).then(() => {
        return Promise.all([
          githubService.getRepositoryIssues(owner, repo),
        ]).then(([githubIssues]) => {
          return githubService.buildIssueHierarchy(githubIssues, owner, repo);
        });
      }).then((issues) => {
        if (issues) {
          const timestamp = Date.now();
          const updatedProject = optimisticManager.createBackgroundSync(project, timestamp);
          updatedProject.issues = issues;
          
          setForceRefresh(prev => prev + 1);
          onProjectUpdate(updatedProject);
        }
      }).catch((syncError) => {
        console.warn('Background operations failed, but UI deletion was successful:', syncError);
      });

    } catch (error: any) {
      console.error('Error in delete handler:', error);
      toastService.error(`Failed to delete issue: ${error.message || 'Unknown error'}`);
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
            key={`${project.id}-${forceRefresh}-${project.issues.length}-${JSON.stringify(project.issues.map(i => i.id))}`}
            issues={project.issues}
            level={0}
            onIssueClick={setSelectedIssue}
            onCreateIssue={handleCreateIssue}
          />
        </div>
      </div>

      {/* Issue Modal */}
      {(selectedIssue || isCreateModalOpen) && (
        <IssueModal
          issue={selectedIssue}
          parentIssue={createIssueParent}
          onUpdate={selectedIssue ? handleIssueUpdate : undefined}
          onCreate={!selectedIssue ? handleIssueCreate : undefined}
          onDelete={selectedIssue ? handleIssueDelete : undefined}
          onClose={() => {
            setSelectedIssue(null);
            setIsCreateModalOpen(false);
            setCreateIssueParent(null);
          }}
        />
      )}
    </div>
  );
}
