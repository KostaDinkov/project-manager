import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Project, Issue } from '../types';
import IssueList from './IssueList';
import IssueModal from './IssueModal';

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
      
      // Update issue on GitHub
      const state = updatedIssue.state === 'Done' ? 'closed' : 'open';
      const labels = [updatedIssue.type];
      if (updatedIssue.state === 'In Progress') {
        labels.push('in-progress');
      }

      await githubService.updateIssue(owner, repo, parseInt(updatedIssue.id), {
        title: updatedIssue.title,
        body: updatedIssue.description,
        state,
        labels
      });

      // Handle branch creation/deletion for leaf issues
      if (updatedIssue.subIssues.length === 0) {
        if (updatedIssue.state === 'In Progress') {
          // Create branch for this issue
          try {
            await githubService.createBranch(owner, repo, `issue-${updatedIssue.id}`);
          } catch (error) {
            console.log('Branch might already exist:', error);
          }
        } else if (updatedIssue.state === 'Done') {
          // Delete branch when issue is done (in a real app, you'd merge first)
          try {
            await githubService.deleteBranch(owner, repo, `issue-${updatedIssue.id}`);
          } catch (error) {
            console.log('Branch might not exist or already deleted:', error);
          }
        }
      }

      // Update local state
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

      const updatedProject = {
        ...project,
        issues: updateIssueInTree(project.issues)
      };

      onProjectUpdate(updatedProject);
      setSelectedIssue(null);
    } catch (error) {
      console.error('Error updating issue:', error);
      alert('Failed to update issue. Please try again.');
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

        const updatedProject = {
          ...project,
          issues: updateIssueInTree(project.issues)
        };

        onProjectUpdate(updatedProject);
      } else {
        // Add as top-level issue
        const updatedProject = {
          ...project,
          issues: [...project.issues, issue]
        };
        onProjectUpdate(updatedProject);
      }

      setIsCreateModalOpen(false);
      setCreateIssueParent(null);
    } catch (error) {
      console.error('Error creating issue:', error);
      alert('Failed to create issue. Please try again.');
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

      const updatedProject = {
        ...project,
        issues: removeIssueFromTree(project.issues)
      };

      onProjectUpdate(updatedProject);
      setSelectedIssue(null);
    } catch (error) {
      console.error('Error deleting issue:', error);
      alert('Failed to delete issue. Please try again.');
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
        />
      )}
    </div>
  );
}
