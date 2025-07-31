import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProjectSpecification from '../components/ProjectSpecification';
import ProjectSelector from '../components/ProjectSelector';
import Header from '../components/Header';
import { Project, Issue } from '../types';

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

export default function Dashboard() {
  const { githubService } = useAuth();
  const [selectedRepository, setSelectedRepository] = useState<Repository | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedRepository) {
      loadProjectFromRepository();
    }
  }, [selectedRepository]);

  const loadProjectFromRepository = async () => {
    if (!githubService || !selectedRepository) return;

    try {
      setLoading(true);
      const [owner, repo] = selectedRepository.full_name.split('/');
      
      // Get issues from the repository
      const githubIssues = await githubService.getRepositoryIssues(owner, repo);
      
      // Build hierarchical structure using GitHub's native sub-issue API
      const issues = await githubService.buildIssueHierarchy(githubIssues, owner, repo);
      
      // Create project object
      const project: Project = {
        id: selectedRepository.id.toString(),
        name: selectedRepository.name,
        description: selectedRepository.description || 'No description available',
        repository: selectedRepository.full_name,
        issues
      };

      setCurrentProject(project);
    } catch (error) {
      console.error('Error loading project from repository:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectUpdate = async (updatedProject: Project) => {
    setCurrentProject(updatedProject);
    // Here you could sync changes back to GitHub if needed
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
              <p className="mt-4 text-gray-600">Loading project data...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="space-y-6">
          <ProjectSelector 
            onProjectSelect={setSelectedRepository}
            selectedProject={selectedRepository}
          />
          
          {currentProject ? (
            <ProjectSpecification 
              project={currentProject}
              onProjectUpdate={handleProjectUpdate}
            />
          ) : selectedRepository ? (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-gray-900">Loading project specification...</h3>
                <p className="mt-2 text-gray-600">Fetching issues from {selectedRepository.full_name}</p>
              </div>
            </div>
          ) : (
            <div className="bg-white shadow rounded-lg p-6">
              <div className="text-center py-8">
                <h3 className="text-lg font-medium text-gray-900">Select a repository</h3>
                <p className="mt-2 text-gray-600">Choose a repository above to view its project specification.</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
