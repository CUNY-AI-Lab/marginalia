import { NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { uploadShare, getShare, isR2Configured, WorkspaceBundle } from '@/lib/r2';

/**
 * POST /api/share - Create a new share
 * Body: { workspace: { name, description? }, papers: [...] }
 * Returns: { shareId, url }
 */
export async function POST(request: NextRequest) {
  // Check R2 configuration
  if (!isR2Configured()) {
    return new Response(
      JSON.stringify({ error: 'Sharing is not configured. R2 credentials required.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await request.json();
    const { workspace, papers } = body as {
      workspace: { name: string; description?: string };
      papers: WorkspaceBundle['papers'];
    };

    // Validate input
    if (!workspace?.name) {
      return new Response(
        JSON.stringify({ error: 'Workspace name is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!papers || !Array.isArray(papers) || papers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one paper is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate paper fields
    const validTypes = ['article', 'book', 'chapter', 'other'];
    for (const paper of papers) {
      if (!paper.title || !paper.author || !paper.fullText) {
        return new Response(
          JSON.stringify({ error: 'Invalid paper data: missing required fields' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!validTypes.includes(paper.type)) {
        return new Response(
          JSON.stringify({ error: 'Invalid paper type' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!Array.isArray(paper.paragraphs)) {
        return new Response(
          JSON.stringify({ error: 'Invalid paper paragraphs' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Generate unique share ID
    const shareId = nanoid(12); // 12 chars is plenty unique and short

    // Create bundle
    const bundle: WorkspaceBundle = {
      version: 1,
      sharedAt: Date.now(),
      workspace: {
        name: workspace.name,
        description: workspace.description,
      },
      papers: papers.map(paper => ({
        title: paper.title,
        author: paper.author,
        type: paper.type,
        fullText: paper.fullText,
        paragraphs: paper.paragraphs,
        identityLayer: paper.identityLayer,
      })),
    };

    // Upload to R2
    await uploadShare(shareId, bundle);

    // Build share URL
    const origin = request.headers.get('origin') || request.nextUrl.origin;
    const url = `${origin}/share/${shareId}`;

    return new Response(
      JSON.stringify({ shareId, url }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating share:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create share' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * GET /api/share?id={shareId} - Fetch a share
 * Returns: WorkspaceBundle
 */
export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get('id');

  if (!shareId) {
    return new Response(
      JSON.stringify({ error: 'Share ID is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate share ID format (alphanumeric, reasonable length)
  if (!/^[a-zA-Z0-9_-]{6,32}$/.test(shareId)) {
    return new Response(
      JSON.stringify({ error: 'Invalid share ID format' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check R2 configuration
  if (!isR2Configured()) {
    return new Response(
      JSON.stringify({ error: 'Sharing is not configured' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const bundle = await getShare(shareId);

    if (!bundle) {
      return new Response(
        JSON.stringify({ error: 'Share not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(bundle),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
        }
      }
    );
  } catch (error) {
    console.error('Error fetching share:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch share' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
