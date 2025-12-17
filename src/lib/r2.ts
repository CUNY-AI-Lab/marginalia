/**
 * Cloudflare R2 Storage for Workspace Sharing
 * Simplified client for storing and retrieving shared workspace bundles
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { StructuredParagraph, IdentityLayer } from './types';

// Bundle format for shared workspaces
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

// R2 configuration from environment
function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME || 'marginalia-shares';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

// Lazy-initialized S3 client
let s3Client: S3Client | null = null;

function getClient(): S3Client {
  if (!s3Client) {
    const config = getR2Config();
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return s3Client;
}

/**
 * Upload a workspace bundle to R2
 */
export async function uploadShare(shareId: string, bundle: WorkspaceBundle): Promise<void> {
  const config = getR2Config();
  const client = getClient();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: `${shareId}.json`,
      Body: JSON.stringify(bundle),
      ContentType: 'application/json',
      CacheControl: 'public, max-age=31536000', // 1 year - shares are immutable
    })
  );
}

/**
 * Retrieve a workspace bundle from R2
 */
export async function getShare(shareId: string): Promise<WorkspaceBundle | null> {
  const config = getR2Config();
  const client = getClient();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.bucketName,
        Key: `${shareId}.json`,
      })
    );

    if (!response.Body) {
      return null;
    }

    // Convert stream to string
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks).toString('utf-8');

    return JSON.parse(content) as WorkspaceBundle;
  } catch (error: unknown) {
    // Handle not found
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

/**
 * Check if R2 is configured
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}
