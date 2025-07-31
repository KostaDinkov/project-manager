import { useState } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { Issue } from '../types';

interface IssueModalProps {
  issue: Issue | null;
  parentIssue?: Issue | null;
  onClose: () => void;
  onUpdate?: (issue: Issue) => void;
  onCreate?: (issue: Omit<Issue, 'id' | 'subIssues'>) => void;
  onDelete?: (issue: Issue) => void;
}

export default function IssueModal({ issue, parentIssue, onClose, onUpdate, onCreate, onDelete }: IssueModalProps) {
  const [title, setTitle] = useState(issue?.title || '');
  const [description, setDescription] = useState(issue?.description || '');
  const [state, setState] = useState<Issue['state']>(issue?.state || 'To Do');
  const [type, setType] = useState(issue?.type || 'Task');
  const [repository, setRepository] = useState(issue?.repository || 'owner/repo');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (issue && onUpdate) {
      // Update existing issue
      onUpdate({
        ...issue,
        title,
        description,
        state,
        type,
        repository
      });
    } else if (onCreate) {
      // Create new issue
      onCreate({
        title,
        description,
        state,
        type,
        repository,
        level: parentIssue ? parentIssue.level + 1 : 0,
        parentId: parentIssue?.id || null
      });
    }
  };

  const handleDelete = () => {
    if (issue && onDelete) {
      onDelete(issue);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {issue ? `Edit Issue #${issue.id}` : 'Create New Issue'}
            {parentIssue && (
              <span className="text-sm text-gray-500 block">
                Sub-issue of #{parentIssue.id}
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description
            </label>
            <textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="state" className="block text-sm font-medium text-gray-700">
              State
            </label>
            <select
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value as Issue['state'])}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Type
            </label>
            <input
              type="text"
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., Feature, Bug, Task"
            />
          </div>

          <div>
            <label htmlFor="repository" className="block text-sm font-medium text-gray-700">
              Repository
            </label>
            <input
              type="text"
              id="repository"
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="owner/repository"
            />
          </div>

          <div className="flex justify-between space-x-3 pt-4">
            {issue && (
              <button
                type="button"
                onClick={handleDelete}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </button>
            )}
            
            <div className="flex space-x-3 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Save className="h-4 w-4 mr-2" />
                {issue ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
