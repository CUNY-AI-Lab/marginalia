#!/usr/bin/env npx tsx

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse, VerbosityLevel } from 'pdf-parse';
import {
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  IDENTITY_EXTRACTION_PROMPT,
  PREFILTER_PROMPT,
  parseIdentityLayerResponse,
  PromptMode,
} from '../src/lib/prompts';
import { Source, IdentityLayer } from '../src/lib/types';

// Load environment
import { config } from 'dotenv';
config({ path: '.env.local' });

// Output directory
const OUTPUT_DIR = join(process.cwd(), 'test', 'output');
if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

interface TestPassage {
  id: string;
  name: string;
  text: string;
}

interface TestResult {
  sourceTitle: string;
  sourceId: string;
  response: string;
  wordCount: number;
  responseTimeMs: number;
  isPass: boolean;
}

// Parse command line args
const args = process.argv.slice(2);
const briefMode = args.includes('--brief');
const prefilterMode = args.includes('--prefilter');
const compareMode = args.includes('--compare');
const passageArg = args.find(a => a.startsWith('--passage='));
const customPassage = passageArg?.split('=').slice(1).join('=');
const limitArg = args.find(a => a.startsWith('--limit='));
const sourceLimit = limitArg ? parseInt(limitArg.split('=')[1]) : undefined;

async function loadPDF(filePath: string): Promise<{ text: string; title: string }> {
  const buffer = readFileSync(filePath);
  const parser = new PDFParse({
    data: buffer,
    verbosity: VerbosityLevel.ERRORS,
  });

  const textResult = await parser.getText();
  const infoResult = await parser.getInfo();
  await parser.destroy();

  // Extract title from filename
  const fileName = filePath.split('/').pop() || '';
  let title = fileName.replace(/\.pdf$/i, '');

  // Try to get title from metadata
  const metadata = infoResult.metadata as unknown as Record<string, unknown> | null;
  if (metadata?.Title && typeof metadata.Title === 'string') {
    title = metadata.Title;
  }

  return { text: textResult.text, title };
}

async function extractIdentity(text: string, title: string, sourceId: string): Promise<IdentityLayer | null> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const result = await model.generateContent([
    IDENTITY_EXTRACTION_PROMPT,
    `TEXT TO ANALYZE:\nTitle: ${title}\n\n${text.slice(0, 50000)}`,
  ]);

  const response = result.response.text();
  const identity = parseIdentityLayerResponse(response);

  // Save identity to file
  const safeTitle = title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);
  const identityFile = join(OUTPUT_DIR, `identity_${safeTitle}.txt`);
  writeFileSync(identityFile, `IDENTITY LAYER FOR: ${title}\n${'='.repeat(60)}\n\nRAW LLM RESPONSE:\n${response}\n\n${'='.repeat(60)}\nPARSED IDENTITY:\n${identity?.raw || 'PARSE FAILED'}`);

  return identity;
}

async function getAgentResponse(
  source: Source,
  passage: string,
  mode: PromptMode
): Promise<{ response: string; timeMs: number }> {
  const systemPrompt = buildAgentSystemPrompt(source, mode);
  const userPrompt = buildAgentUserPrompt(passage, undefined, source.fullText.slice(0, 100000));

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt,
  });

  const startTime = Date.now();
  const result = await model.generateContent(userPrompt);
  const timeMs = Date.now() - startTime;

  return { response: result.response.text(), timeMs };
}

async function prefilterSources(
  sources: Source[],
  passage: string
): Promise<string[]> {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const sourceSummaries = sources.map(s => ({
    id: s.id,
    title: s.title,
    author: s.author,
    coreCommitments: s.identityLayer?.coreCommitments?.slice(0, 500) || 'Unknown',
  }));

  const prompt = `${PREFILTER_PROMPT}

PASSAGE:
"${passage}"

SOURCES:
${JSON.stringify(sourceSummaries, null, 2)}

Return only the JSON array of source IDs that should respond:`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      return JSON.parse(match[0]);
    }
  } catch {
    console.error('Failed to parse prefilter response:', text);
  }

  return sources.map(s => s.id); // Fallback to all
}

function isPassResponse(response: string): boolean {
  const trimmed = response.trim();
  return (
    trimmed === '—' ||
    trimmed === '-' ||
    trimmed === '--' ||
    trimmed.toLowerCase().includes('nothing to add') ||
    trimmed.toLowerCase().includes("doesn't touch") ||
    trimmed.toLowerCase().includes('not central to') ||
    trimmed.length < 20
  );
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

async function runTest(
  sources: Source[],
  passage: TestPassage,
  mode: PromptMode,
  usePrefilter: boolean
): Promise<TestResult[]> {
  let sourcesToQuery = sources;

  if (usePrefilter) {
    const filteredIds = await prefilterSources(sources, passage.text);
    sourcesToQuery = sources.filter(s => filteredIds.includes(s.id));
    console.log(`  Prefilter selected ${sourcesToQuery.length}/${sources.length} sources`);
  }

  const results: TestResult[] = [];

  for (const source of sourcesToQuery) {
    try {
      const { response, timeMs } = await getAgentResponse(source, passage.text, mode);
      const wordCount = response.split(/\s+/).length;
      const isPass = isPassResponse(response);

      results.push({
        sourceTitle: source.title,
        sourceId: source.id,
        response,
        wordCount,
        responseTimeMs: timeMs,
        isPass,
      });
    } catch (error) {
      console.error(`  Error from ${source.title}:`, error);
      results.push({
        sourceTitle: source.title,
        sourceId: source.id,
        response: 'ERROR',
        wordCount: 0,
        responseTimeMs: 0,
        isPass: false,
      });
    }
  }

  return results;
}

function printResults(passageName: string, results: TestResult[]) {
  console.log(`\n  ${passageName}:`);
  for (const r of results) {
    if (r.isPass) {
      console.log(`    - ${truncate(r.sourceTitle, 30)}: PASS`);
    } else {
      const preview = truncate(r.response.replace(/\n/g, ' '), 60);
      console.log(`    - ${truncate(r.sourceTitle, 30)}: ${r.wordCount} words, ${(r.responseTimeMs / 1000).toFixed(1)}s`);
      console.log(`      "${preview}"`);
    }
  }
}

function printSummary(allResults: TestResult[][], passages: TestPassage[], mode: PromptMode) {
  const flat = allResults.flat();
  const totalResponses = flat.length;
  const passes = flat.filter(r => r.isPass).length;
  const avgWordCount = flat.filter(r => !r.isPass).reduce((sum, r) => sum + r.wordCount, 0) / (totalResponses - passes || 1);
  const avgTime = flat.reduce((sum, r) => sum + r.responseTimeMs, 0) / totalResponses;

  const summaryText = `
${'='.repeat(60)}
SUMMARY
${'='.repeat(60)}
Mode: ${mode}
Total responses: ${totalResponses}
Pass rate: ${((passes / totalResponses) * 100).toFixed(1)}% (${passes}/${totalResponses})
Avg response length: ${avgWordCount.toFixed(0)} words (excluding passes)
Avg response time: ${(avgTime / 1000).toFixed(2)}s
`;

  console.log(summaryText);

  // Write detailed results to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = join(OUTPUT_DIR, `results_${mode}_${timestamp}.txt`);

  let fileContent = `MARGINALIA TEST RESULTS\n`;
  fileContent += `Generated: ${new Date().toISOString()}\n`;
  fileContent += `Mode: ${mode}\n`;
  fileContent += `${'='.repeat(60)}\n\n`;

  passages.forEach((passage, i) => {
    fileContent += `\n${'='.repeat(60)}\n`;
    fileContent += `PASSAGE ${i + 1}: ${passage.name}\n`;
    fileContent += `${'='.repeat(60)}\n`;
    fileContent += `"${passage.text}"\n\n`;

    const passageResults = allResults[i] || [];
    passageResults.forEach(r => {
      fileContent += `\n--- ${r.sourceTitle} ---\n`;
      if (r.isPass) {
        fileContent += `[PASS - nothing to add]\n`;
      } else {
        fileContent += `Words: ${r.wordCount} | Time: ${(r.responseTimeMs / 1000).toFixed(2)}s\n\n`;
        fileContent += `${r.response}\n`;
      }
    });
  });

  fileContent += `\n\n${summaryText}`;

  writeFileSync(resultsFile, fileContent);
  console.log(`\nResults saved to: ${resultsFile}`);
}

async function main() {
  console.log('='.repeat(50));
  console.log('MARGINALIA TEST RUN');
  console.log('='.repeat(50));
  console.log(`Mode: ${briefMode ? 'brief' : 'normal'}`);
  console.log(`Prefilter: ${prefilterMode ? 'enabled' : 'disabled'}`);
  if (compareMode) console.log('Compare mode: will run both normal and brief');
  console.log('');

  // Load test PDFs
  const testDir = join(process.cwd(), 'test');
  const pdfFiles = readdirSync(testDir).filter(f => f.endsWith('.pdf'));

  if (pdfFiles.length === 0) {
    console.error('No PDF files found in test/ directory');
    process.exit(1);
  }

  console.log(`Found ${pdfFiles.length} PDF files`);
  const filesToLoad = sourceLimit ? pdfFiles.slice(0, sourceLimit) : pdfFiles;
  console.log(`Loading ${filesToLoad.length} sources...`);

  // Load and extract identity for each PDF
  const sources: Source[] = [];
  for (const file of filesToLoad) {
    const filePath = join(testDir, file);
    console.log(`  Loading: ${file}`);

    try {
      const { text, title } = await loadPDF(filePath);
      const sourceId = `source-${sources.length + 1}`;
      console.log(`    Extracting identity...`);
      const identityLayer = await extractIdentity(text, title, sourceId);

      sources.push({
        id: `source-${sources.length + 1}`,
        title,
        author: 'Unknown',
        type: 'article',
        fullText: text,
        identityLayer,
        color: '#666',
        createdAt: Date.now(),
      });
      console.log(`    Done: "${title}" (${Math.round(text.length / 1000)}k chars)`);
    } catch (error) {
      console.error(`    Failed to load ${file}:`, error);
    }
  }

  console.log(`\nLoaded ${sources.length} sources\n`);

  // Load test passages
  let passages: TestPassage[];
  if (customPassage) {
    passages = [{ id: 'custom', name: 'Custom passage', text: customPassage }];
  } else {
    const passagesFile = join(testDir, 'passages.json');
    const passagesData = JSON.parse(readFileSync(passagesFile, 'utf-8'));
    passages = passagesData.passages;
  }

  // Run tests
  if (compareMode) {
    console.log('Running comparison (normal vs brief)...');

    for (const passage of passages) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`PASSAGE: ${passage.name}`);
      console.log(`"${truncate(passage.text, 100)}"`);

      console.log('\n--- NORMAL MODE ---');
      const normalResults = await runTest(sources, passage, 'normal', prefilterMode);
      printResults(passage.name, normalResults);

      console.log('\n--- BRIEF MODE ---');
      const briefResults = await runTest(sources, passage, 'brief', prefilterMode);
      printResults(passage.name, briefResults);

      // Quick comparison
      const normalAvgWords = normalResults.filter(r => !r.isPass).reduce((s, r) => s + r.wordCount, 0) / normalResults.filter(r => !r.isPass).length || 0;
      const briefAvgWords = briefResults.filter(r => !r.isPass).reduce((s, r) => s + r.wordCount, 0) / briefResults.filter(r => !r.isPass).length || 0;
      console.log(`\n  Comparison: Normal avg ${normalAvgWords.toFixed(0)} words, Brief avg ${briefAvgWords.toFixed(0)} words`);
    }
  } else {
    const mode: PromptMode = briefMode ? 'brief' : 'normal';
    const allResults: TestResult[][] = [];

    for (const passage of passages) {
      console.log(`\nTesting: ${passage.name}`);
      console.log(`"${truncate(passage.text, 80)}"`);

      const results = await runTest(sources, passage, mode, prefilterMode);
      printResults(passage.name, results);
      allResults.push(results);
    }

    printSummary(allResults, passages, mode);
  }
}

main().catch(console.error);
