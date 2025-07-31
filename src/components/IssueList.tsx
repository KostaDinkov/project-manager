import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Issue } from '../types';

interface IssueListProps {
  issues: Issue[];
  level: number;
  onIssueClick: (issue: Issue) => void;
  onCreateIssue: (parent?: Issue) => void;
}

function getStateColor(state: Issue['state']) {
  switch (state) {
    case 'Done':
      return 'bg-green-100 text-green-800';
    case 'In Progress':
      return 'bg-yellow-100 text-yellow-800';
    case 'To Do':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function calculateCompleteness(issue: Issue): { completed: number; total: number } {
  if (issue.subIssues.length === 0) {
    return { completed: issue.state === 'Done' ? 1 : 0, total: 1 };
  }

  let completed = 0;
  let total = 0;

  issue.subIssues.forEach(subIssue => {
    const subCompleteness = calculateCompleteness(subIssue);
    completed += subCompleteness.completed;
    total += subCompleteness.total;
  });

  return { completed, total };
}

function CompletenessBar({ issue }: { issue: Issue }) {
  const { completed, total } = calculateCompleteness(issue);
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="flex items-center space-x-2">
      <div className="w-32 bg-gray-200 rounded-full h-2">
        <div
          className="bg-green-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-600">
        {completed}/{total}
      </span>
    </div>
  );
}

export default function IssueList({ issues, level, onIssueClick, onCreateIssue }: IssueListProps) {
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const toggleExpanded = (issueId: string) => {
    const newExpanded = new Set(expandedIssues);
    if (newExpanded.has(issueId)) {
      newExpanded.delete(issueId);
    } else {
      newExpanded.add(issueId);
    }
    setExpandedIssues(newExpanded);
  };

  const paddingLeft = level * 24;

  return (
    <div className="space-y-2">
      {issues.map((issue) => (
        <div key={issue.id} className="border border-gray-200 rounded-lg">
          <div
            className="p-3 hover:bg-gray-50 cursor-pointer"
            style={{ paddingLeft: paddingLeft + 12 }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <div className="flex items-center space-x-1">
                  {issue.subIssues.length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(issue.id);
                      }}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      {expandedIssues.has(issue.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  <span className="text-xs text-gray-500 font-mono">#{issue.id}</span>
                </div>
                
                <div
                  className="flex-1 min-w-0"
                  onClick={() => onIssueClick(issue)}
                >
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {issue.title}
                  </h4>
                </div>
                
                <div className="flex items-center space-x-3">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStateColor(
                      issue.state
                    )}`}
                  >
                    {issue.state}
                  </span>
                  
                  {issue.subIssues.length > 0 && <CompletenessBar issue={issue} />}
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateIssue(issue);
                    }}
                    className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600"
                    title="Add sub-issue"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {expandedIssues.has(issue.id) && issue.subIssues.length > 0 && (
            <div className="border-t border-gray-100">
              <IssueList
                issues={issue.subIssues}
                level={level + 1}
                onIssueClick={onIssueClick}
                onCreateIssue={onCreateIssue}
              />
            </div>
          )}
        </div>
      ))}
      
      <div style={{ paddingLeft: paddingLeft + 12 }}>
        <button
          onClick={() => onCreateIssue()}
          className="flex items-center space-x-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-gray-400 hover:text-gray-600 w-full"
        >
          <Plus className="h-4 w-4" />
          <span className="text-sm">Add issue</span>
        </button>
      </div>
    </div>
  );
}
