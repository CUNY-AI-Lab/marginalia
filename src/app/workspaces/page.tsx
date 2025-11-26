'use client';

import { useState } from 'react';
import { useWorkspaces, usePapers } from '@/hooks/useStorage';
import MigrationBanner from '@/components/MigrationBanner';
import Link from 'next/link';
import { WorkspaceDeleteBehavior } from '@/lib/types';

export default function WorkspacesPage() {
  const {
    workspaces,
    activeWorkspaceId,
    loading,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    switchWorkspace,
    removePaperFromWorkspace,
    setActivePaper,
  } = useWorkspaces();
  const { papers } = usePapers();

  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newWorkspaceName.trim()) {
      const ws = createWorkspace(newWorkspaceName.trim());
      switchWorkspace(ws.id);
      setNewWorkspaceName('');
    }
  };

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleSaveEdit = () => {
    if (editingId && editName.trim()) {
      updateWorkspace(editingId, { name: editName.trim() });
      setEditingId(null);
      setEditName('');
    }
  };

  const handleDelete = (id: string, behavior: WorkspaceDeleteBehavior) => {
    deleteWorkspace(id, behavior);
    setDeleteConfirm(null);
  };

  const getPaperById = (id: string) => papers.find(p => p.id === id);

  return (
    <div className="min-h-screen bg-gray-50">
      <MigrationBanner />

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Workspaces</h1>
            <p className="text-sm text-gray-500 mt-1">
              Organize your papers into workspaces for different projects or topics
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            Back to Reading
          </Link>
        </div>

        {/* Create new workspace */}
        <div className="mb-8">
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              type="text"
              value={newWorkspaceName}
              onChange={e => setNewWorkspaceName(e.target.value)}
              placeholder="New workspace name..."
              className="flex-1 px-3 py-2 border rounded-md text-sm"
            />
            <button
              type="submit"
              disabled={!newWorkspaceName.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Create Workspace
            </button>
          </form>
        </div>

        {/* Workspace list */}
        {loading ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : workspaces.length === 0 ? (
          <div className="border rounded-lg p-8 bg-white text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
              />
            </svg>
            <p className="text-gray-500">
              No workspaces yet. Create one to organize your papers.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {workspaces.map(workspace => {
              const isActive = workspace.id === activeWorkspaceId;
              const workspacePapers = workspace.paperIds
                .map(id => getPaperById(id))
                .filter(p => p !== undefined);
              const activePaperInWorkspace = workspace.activePaperId
                ? getPaperById(workspace.activePaperId)
                : null;

              return (
                <div
                  key={workspace.id}
                  className={`border rounded-lg bg-white overflow-hidden ${
                    isActive ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {editingId === workspace.id ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') {
                                  setEditingId(null);
                                  setEditName('');
                                }
                              }}
                              className="flex-1 px-2 py-1 border rounded text-sm"
                              autoFocus
                            />
                            <button
                              onClick={handleSaveEdit}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditName('');
                              }}
                              className="text-sm text-gray-500 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{workspace.name}</h3>
                            {isActive && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                Active
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-sm text-gray-500 mt-1">
                          {workspace.paperIds.length} paper
                          {workspace.paperIds.length !== 1 ? 's' : ''}
                          {activePaperInWorkspace && (
                            <span className="ml-2">
                              · Reading: <em>{activePaperInWorkspace.title}</em>
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <button
                            onClick={() => switchWorkspace(workspace.id)}
                            className="text-sm px-3 py-1 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            Switch to
                          </button>
                        )}
                        <button
                          onClick={() => handleStartEdit(workspace.id, workspace.name)}
                          className="text-sm px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(workspace.id)}
                          className="text-sm px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {/* Papers in workspace */}
                    {workspacePapers.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 mb-2">Papers:</p>
                        <div className="space-y-2">
                          {workspacePapers.map(paper => {
                            if (!paper) return null;
                            const isReading = workspace.activePaperId === paper.id;
                            return (
                              <div
                                key={paper.id}
                                className={`flex items-center gap-2 p-2 rounded ${
                                  isReading ? 'bg-blue-50' : 'bg-gray-50'
                                }`}
                              >
                                <div
                                  className="w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: paper.color }}
                                />
                                <span className="text-sm flex-1 truncate">{paper.title}</span>
                                {isReading ? (
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                    Reading
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setActivePaper(workspace.id, paper.id)}
                                    className="text-xs px-2 py-0.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                                  >
                                    Set as reading
                                  </button>
                                )}
                                <button
                                  onClick={() => removePaperFromWorkspace(workspace.id, paper.id)}
                                  className="text-xs text-gray-400 hover:text-red-500"
                                  title="Remove from workspace"
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {deleteConfirm === workspace.id && (
                      <div className="mt-4 p-4 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-sm text-red-700 mb-3">
                          Delete workspace &quot;{workspace.name}&quot;?
                        </p>
                        {workspace.paperIds.length > 0 && (
                          <p className="text-xs text-red-600 mb-3">
                            This workspace has {workspace.paperIds.length} paper
                            {workspace.paperIds.length !== 1 ? 's' : ''}. What should happen to them?
                          </p>
                        )}
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleDelete(workspace.id, 'orphan')}
                            className="text-sm px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                          >
                            Keep papers in library
                          </button>
                          {workspace.paperIds.length > 0 && (
                            <button
                              onClick={() => handleDelete(workspace.id, 'delete')}
                              className="text-sm px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                            >
                              Delete papers too
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="text-sm px-3 py-1 text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick link to library */}
        <div className="mt-8 text-center">
          <Link href="/library" className="text-sm text-blue-600 hover:text-blue-800">
            Go to Paper Library →
          </Link>
        </div>
      </div>
    </div>
  );
}
