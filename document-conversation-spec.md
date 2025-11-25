# Document Conversation Tool

## Overview

A tool that turns a collection of texts into conversational agents. Users read or write while their sources respond from their own perspectives.

## Core Architecture

### Key Insight

Each agent is a separate LLM call with its own context. Agents do not share context with each other. The user is the hub - agents speak to the user, and the user mediates between agents.

This means:
- An article-as-agent can have its full text in context every time
- A book-as-agent can have 50-100k tokens of its source material
- Agents respond to what they see (the passage, the question) and optionally what other agents said
- Parallelization is natural - fire all relevant agents simultaneously

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                           │
│  ┌─────────────────────────────┐  ┌──────────────────────────┐ │
│  │      Reading/Writing        │  │    Conversation Panel    │ │
│  │         Panel               │  │                          │ │
│  │                             │  │  [Agent responses appear  │ │
│  │   Document text with        │  │   here as they arrive]   │ │
│  │   relevance indicators      │  │                          │ │
│  │   in the margin             │  │  User can ask follow-up  │ │
│  │                             │  │  questions               │ │
│  └─────────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestrator                               │
│                                                                 │
│  - Receives user selection or question                          │
│  - Determines which agents to activate (relevance filtering)    │
│  - Dispatches parallel calls to agents                          │
│  - Collects and orders responses                                │
│  - Manages conversation history                                 │
└─────────────────────────────────────────────────────────────────┘
                                │
                ┌───────────────┼───────────────┐
                ▼               ▼               ▼
         ┌──────────┐    ┌──────────┐    ┌──────────┐
         │ Agent 1  │    │ Agent 2  │    │ Agent 3  │
         │ (Noble)  │    │(Benjamin)│    │(Eubanks) │
         │          │    │          │    │          │
         │ Own      │    │ Own      │    │ Own      │
         │ context  │    │ context  │    │ context  │
         └──────────┘    └──────────┘    └──────────┘
```

## Agent Model

### Agent Context Structure

Each agent call includes:

```
SYSTEM PROMPT
├── Agent identity (who you are, how you speak)
├── Behavioral instructions (respond to passage, be concise, etc.)
└── Output format

USER MESSAGE
├── Identity layer (~3-5k tokens)
│   ├── Core commitments and arguments
│   ├── What this text argues against
│   ├── Characteristic vocabulary and moves
│   ├── What triggers strong reactions
│   └── Key quotes that capture voice
│
├── Source material (~10-100k tokens depending on source length)
│   ├── For articles: full text
│   └── For books: relevant chapters/sections via retrieval
│
├── Current context
│   ├── The passage being discussed
│   ├── User's question (if any)
│   └── What other agents said (if threading)
│
└── Conversation history (recent exchanges with this agent)
```

### Identity Layer Extraction

When a source is first loaded, run an extraction pass to create the identity layer:

```
Given this text, extract:

1. CORE COMMITMENTS (2-3 paragraphs)
What does this text fundamentally believe? What is it trying to prove or establish?

2. ANTAGONISTS (1-2 paragraphs)
What positions, assumptions, or arguments does this text oppose? What would it push back against?

3. CHARACTERISTIC MOVES (1 paragraph)
How does this text argue? Does it use case studies, theoretical frameworks, historical analysis, empirical data? What's distinctive about its approach?

4. VOCABULARY (list of 10-20 terms)
What words or phrases are central to this text's argument? Include how the text uses them.

5. TRIGGERS (1 paragraph)
What topics or claims would provoke a strong response from this text? What does it care most about?

6. VOICE SAMPLES (3-5 short quotes)
Select quotes that capture how this text sounds - its tone, style, level of formality.
```

Store this as structured data associated with the source.

### Agent System Prompt

```
You are embodying the perspective of a specific text: {source_title} by {source_author}.

You have access to substantial portions of this text. When responding, speak FROM this text's perspective - its commitments, its vocabulary, its way of arguing. You are not summarizing the text; you are speaking as if you were the text participating in a seminar.

Behavioral guidelines:
- Respond to what's being discussed, not to everything you could say
- Be concise (2-4 sentences typical, expand only when asked)
- If the passage doesn't touch on your concerns, say so briefly or stay silent
- If you disagree with another agent's point, engage with it directly
- Use the characteristic vocabulary and framing of your source
- Ground your responses in specific arguments from the text when relevant

Do not:
- Summarize the whole text
- Speak in third person about "the author"
- Give generic academic commentary
- Hedge excessively
```

## Relevance Filtering

Not every agent should respond to every selection. Pre-filter to find 2-5 relevant agents.

### Approach 1: Embedding Similarity

1. Pre-compute embeddings for identity layers
2. Embed the selected passage
3. Rank agents by cosine similarity
4. Take top N above threshold

### Approach 2: Topic Tagging

1. Extract topic tags from each source during ingestion
2. Extract topic tags from selected passage
3. Match by tag overlap

### Approach 3: LLM Pre-filter (more expensive but smarter)

Quick call with all identity layers:
```
Given these source summaries and the following passage, which sources (if any) would have something meaningful to say? Return a ranked list.
```

Recommend starting with embedding similarity for speed, with option to add LLM pre-filter for complex cases.

## Interface Behavior

### Reading Mode

1. **Load state**: User loads a document to read. Sources are visible in sidebar.

2. **Passive indicators**: As user scrolls, margin shows faint dots indicating which agents have potential relevance to each paragraph. This is computed via embedding similarity, not full LLM calls.

3. **Selection triggers conversation**: User clicks/selects a paragraph. Orchestrator:
   - Identifies relevant agents (2-5)
   - Fires parallel calls
   - Responses stream into conversation panel as they arrive

4. **Threading**: User can ask follow-up. Can direct question to specific agent or to all. Can relay: "Benjamin, Noble just said X. What do you think?"

5. **History**: Conversation accumulates during session. Each agent maintains its own conversation history.

### Writing Mode

1. **Draft state**: User writes in editor. Sources visible in sidebar.

2. **On-demand consultation**: User selects a passage they've written and clicks "Ask sources" or presses shortcut. Same flow as reading mode.

3. **Continuous mode** (optional, higher cost): As user types, periodically check for relevance and show subtle indicators. Full responses only on explicit request.

## API Design

### Data Models

```typescript
interface Source {
  id: string;
  title: string;
  author: string;
  type: 'article' | 'book' | 'chapter' | 'other';
  fullText: string;
  identityLayer: IdentityLayer;
  chunks: Chunk[];  // for retrieval on long sources
  embedding: number[];  // of identity layer, for relevance filtering
}

interface IdentityLayer {
  coreCommitments: string;
  antagonists: string;
  characteristicMoves: string;
  vocabulary: string[];
  triggers: string;
  voiceSamples: string[];
  raw: string;  // concatenated for inclusion in prompt
}

interface Chunk {
  id: string;
  text: string;
  embedding: number[];
  startOffset: number;
  endOffset: number;
}

interface Agent {
  sourceId: string;
  conversationHistory: Message[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ConversationTurn {
  passage: string;  // what's being discussed
  userQuery?: string;  // optional explicit question
  agentResponses: AgentResponse[];
}

interface AgentResponse {
  sourceId: string;
  content: string;
  latencyMs: number;
}
```

### Core Functions

```typescript
// Ingest a new source
async function ingestSource(
  text: string, 
  metadata: { title: string; author: string; type: string }
): Promise<Source>

// Extract identity layer from full text
async function extractIdentity(text: string): Promise<IdentityLayer>

// Chunk text for retrieval (only for long sources)
function chunkText(text: string, maxTokens: number): Chunk[]

// Find relevant agents for a passage
async function findRelevantAgents(
  passage: string, 
  sources: Source[], 
  maxAgents: number
): Promise<Source[]>

// Get agent response
async function getAgentResponse(
  agent: Agent,
  source: Source,
  passage: string,
  userQuery?: string,
  otherResponses?: AgentResponse[]
): Promise<string>

// Orchestrate full turn
async function orchestrateTurn(
  passage: string,
  sources: Source[],
  agents: Map<string, Agent>,
  userQuery?: string
): Promise<ConversationTurn>
```

## Implementation Notes

### Parallelization

Fire all agent calls simultaneously using Promise.all or equivalent. Stream responses to UI as they arrive.

```typescript
async function orchestrateTurn(passage, sources, agents, userQuery) {
  const relevantSources = await findRelevantAgents(passage, sources, 5);
  
  const responsePromises = relevantSources.map(source => 
    getAgentResponse(
      agents.get(source.id),
      source,
      passage,
      userQuery
    )
  );
  
  const responses = await Promise.all(responsePromises);
  
  return {
    passage,
    userQuery,
    agentResponses: responses.map((content, i) => ({
      sourceId: relevantSources[i].id,
      content
    }))
  };
}
```

### Context Assembly for Books

For sources too long for full inclusion:

```typescript
async function assembleBookContext(
  source: Source,
  passage: string,
  maxTokens: number
): Promise<string> {
  // Always include identity layer
  let context = source.identityLayer.raw;
  let remainingTokens = maxTokens - countTokens(context);
  
  // Retrieve most relevant chunks
  const relevantChunks = await retrieveChunks(
    passage, 
    source.chunks, 
    remainingTokens
  );
  
  // Sort by document order for coherence
  relevantChunks.sort((a, b) => a.startOffset - b.startOffset);
  
  context += "\n\n---\n\nRelevant excerpts:\n\n";
  context += relevantChunks.map(c => c.text).join("\n\n---\n\n");
  
  return context;
}
```

### Streaming Responses

For better UX, stream agent responses as they generate:

```typescript
async function streamAgentResponses(
  relevantSources: Source[],
  passage: string,
  onAgentStart: (sourceId: string) => void,
  onAgentChunk: (sourceId: string, chunk: string) => void,
  onAgentComplete: (sourceId: string) => void
) {
  await Promise.all(relevantSources.map(async source => {
    onAgentStart(source.id);
    
    const stream = await getAgentResponseStream(source, passage);
    
    for await (const chunk of stream) {
      onAgentChunk(source.id, chunk);
    }
    
    onAgentComplete(source.id);
  }));
}
```

## Tech Stack Recommendations

- **Frontend**: React, simple layout with reading pane + conversation panel
- **Backend**: Node.js or Python, stateless API
- **LLM**: Claude API (Sonnet for agents, Haiku for filtering if needed)
- **Embeddings**: OpenAI text-embedding-3-small or Voyage
- **Vector store**: Simple in-memory for MVP, Pinecone/pgvector for scale
- **Source storage**: SQLite for MVP, Postgres for scale

## MVP Scope

1. Upload PDFs/text files as sources
2. Reading mode only (no writing mode)
3. Click paragraph to get responses
4. 3-5 sources max
5. No Zotero integration (manual upload)
6. Simple relevance filtering via embeddings

## Future Extensions

- Writing mode with agent commentary
- Zotero integration
- Agent-to-agent threading ("Benjamin, what do you think of what Noble said?")
- Source discovery via CrossRef/Unpaywall
- Collaborative sessions
- Export conversation as annotated document
