// Workspace bundles: the format of shared workspaces and of the built-in demo sets.
import { getPapers, savePapers, getWorkspaces, saveWorkspaces, setActiveWorkspaceId, generateId } from './storage';
import { IdentityLayer, Paper, PAPER_COLORS, StructuredParagraph, Workspace } from './types';

export interface WorkspaceBundle {
  version: 1;
  sharedAt: number;
  workspace: {
    name: string;
    description?: string;
  };
  papers: Array<{
    title: string;
    author: string;
    type: 'article' | 'book' | 'chapter' | 'other';
    fullText: string;
    paragraphs: StructuredParagraph[];
    identityLayer?: IdentityLayer;
  }>;
}

export interface DemoSetSummary {
  slug: string;
  name: string;
  description: string;
  papers: Array<{ title: string; author: string; year?: number | string }>;
  words?: number;
}

// Adds the bundle's papers to the library as a new workspace and makes it active. The first paper
// becomes the one being read; the others comment on it.
export function importBundle(bundle: WorkspaceBundle): Workspace {
  const existingPapers = getPapers();
  let colorIndex = existingPapers.length % PAPER_COLORS.length;
  const now = Date.now();
  const newPapers: Paper[] = bundle.papers.map(bundlePaper => ({
    id: generateId(),
    title: bundlePaper.title,
    author: bundlePaper.author,
    type: bundlePaper.type,
    fullText: bundlePaper.fullText,
    paragraphs: bundlePaper.paragraphs,
    identityLayer: bundlePaper.identityLayer || null,
    color: PAPER_COLORS[colorIndex++ % PAPER_COLORS.length],
    createdAt: now,
    updatedAt: now,
    status: 'ready',
  }));
  const workspace: Workspace = {
    id: generateId(),
    name: bundle.workspace.name,
    description: bundle.workspace.description,
    paperIds: newPapers.map(p => p.id),
    activePaperId: newPapers[0]?.id ?? null,
    createdAt: now,
    updatedAt: now,
  };
  savePapers([...existingPapers, ...newPapers]);
  saveWorkspaces([...getWorkspaces(), workspace]);
  setActiveWorkspaceId(workspace.id);
  return workspace;
}
