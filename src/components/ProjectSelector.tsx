import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Github, FolderPlus, Loader2 } from 'lucide-react';

interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
}

interface ProjectSelectorProps {
  onProjectSelect: (repository: Repository) => void;
  selectedProject: Repository | null;
}

export default function ProjectSelector({ onProjectSelect, selectedProject }: ProjectSelectorProps) {
  const { githubService } = useAuth();
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadRepositories();
  }, [githubService]);

  const loadRepositories = async () => {
    if (!githubService) return;

    try {
      setLoading(true);
      setError('');
      const repos = await githubService.getRepositories();
      setRepositories(repos);
    } catch (err) {
      setError('Failed to load repositories. Please check your token permissions.');
      console.error('Error loading repositories:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading repositories...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center py-8">
          <div className="text-red-600 mb-4">{error}</div>
          <button
            onClick={loadRepositories}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Select Repository</h2>
        <div className="flex space-x-2">
          <button
            onClick={loadRepositories}
            className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Github className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {selectedProject && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center space-x-3">
            <img
              src={selectedProject.owner.avatar_url}
              alt={selectedProject.owner.login}
              className="h-8 w-8 rounded-full"
            />
            <div>
              <h3 className="font-medium text-blue-900">{selectedProject.full_name}</h3>
              <p className="text-sm text-blue-600">{selectedProject.description || 'No description'}</p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 max-h-96 overflow-y-auto">
        {repositories.map((repo) => (
          <div
            key={repo.id}
            className={`p-4 border rounded-lg cursor-pointer transition-colors ${
              selectedProject?.id === repo.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
            onClick={() => onProjectSelect(repo)}
          >
            <div className="flex items-start space-x-3">
              <img
                src={repo.owner.avatar_url}
                alt={repo.owner.login}
                className="h-8 w-8 rounded-full flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-gray-900 truncate">
                  {repo.full_name}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {repo.description || 'No description available'}
                </p>
                <div className="flex items-center mt-2 text-xs text-gray-400">
                  <FolderPlus className="h-3 w-3 mr-1" />
                  <span>{repo.owner.login}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {repositories.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          <FolderPlus className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p>No repositories found.</p>
          <p className="text-sm mt-1">Make sure your GitHub token has access to repositories.</p>
        </div>
      )}
    </div>
  );
}
