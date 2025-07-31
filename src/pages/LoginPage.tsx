import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Octokit } from '@octokit/rest';
import { useAuth } from '../contexts/AuthContext';
import { Github, Key, LogIn } from 'lucide-react';

export default function LoginPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError('Please enter a GitHub token');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const octokit = new Octokit({ auth: token });
      const { data: user } = await octokit.rest.users.getAuthenticated();
      
      login(token, {
        id: user.id.toString(),
        login: user.login,
        avatar_url: user.avatar_url,
        name: user.name || user.login
      });
      
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid GitHub token. Please check your token and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
        <div className="text-center">
          <Github className="mx-auto h-12 w-12 text-gray-600" />
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Project Manager
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Sign in with your GitHub token to manage your projects
          </p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div>
            <label htmlFor="token" className="sr-only">
              GitHub Token
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Key className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="token"
                name="token"
                type="password"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Enter your GitHub personal access token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="absolute left-0 inset-y-0 flex items-center pl-3">
              <LogIn className="h-5 w-5 text-indigo-500 group-hover:text-indigo-400" />
            </span>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="text-xs text-gray-500 text-center">
          <p>
            Need a GitHub token?{' '}
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-500"
            >
              Generate one here
            </a>
          </p>
          <p className="mt-1">
            Required scopes: <code className="bg-gray-100 px-1 py-0.5 rounded">repo</code>
          </p>
        </div>
      </div>
    </div>
  );
}
