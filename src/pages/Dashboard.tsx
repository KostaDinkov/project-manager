import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Octokit } from '@octokit/rest';
import ProjectSpecification from '../components/ProjectSpecification';
import Header from '../components/Header';
import { Project } from '../types';

export default function Dashboard() {
  const { user, token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadProjects();
    }
  }, [token]);

  const loadProjects = async () => {
    try {
      // For now, we'll create a mock project structure
      // In a real app, this would come from GitHub Projects API
      const mockProject: Project = {
        id: '1',
        name: 'Sample Project',
        description: 'A sample project to demonstrate the specification structure',
        repository: 'owner/repo',
        issues: [
          {
            id: '1',
            title: 'User Authentication',
            description: 'Implement user authentication system',
            state: 'In Progress',
            type: 'Feature',
            repository: 'owner/repo',
            level: 0,
            parentId: null,
            subIssues: [
              {
                id: '2',
                title: 'Login Page',
                description: 'Create login page with GitHub OAuth',
                state: 'Done',
                type: 'Task',
                repository: 'owner/repo',
                level: 1,
                parentId: '1',
                subIssues: []
              },
              {
                id: '3',
                title: 'Authentication Context',
                description: 'Create authentication context for state management',
                state: 'In Progress',
                type: 'Task',
                repository: 'owner/repo',
                level: 1,
                parentId: '1',
                subIssues: []
              }
            ]
          },
          {
            id: '4',
            title: 'Project Management',
            description: 'Core project management functionality',
            state: 'To Do',
            type: 'Feature',
            repository: 'owner/repo',
            level: 0,
            parentId: null,
            subIssues: [
              {
                id: '5',
                title: 'Project Dashboard',
                description: 'Create project dashboard interface',
                state: 'To Do',
                type: 'Task',
                repository: 'owner/repo',
                level: 1,
                parentId: '4',
                subIssues: []
              }
            ]
          }
        ]
      };

      setProjects([mockProject]);
      setSelectedProject(mockProject);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {selectedProject ? (
          <ProjectSpecification 
            project={selectedProject}
            onProjectUpdate={setSelectedProject}
          />
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900">No project selected</h3>
            <p className="mt-2 text-gray-600">Select a project to view its specification.</p>
          </div>
        )}
      </main>
    </div>
  );
}
