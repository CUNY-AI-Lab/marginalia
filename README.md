# Marginalia

A reading assistant that turns documents into conversational agents. Upload PDFs or texts, and each source becomes an AI agent that responds from its own perspective when you select passages.

## How It Works

1. **Upload documents** - Add PDFs or paste text as sources
2. **Identity extraction** - The system extracts each source's core commitments, vocabulary, and argumentative style
3. **Read and select** - Browse your documents and select passages of interest
4. **Agent responses** - Relevant sources respond from their own perspectives, not as neutral summaries

The interface implements a "moderated seminar" where your sources can participate in discussion while you read or write.

## Requirements

- Node.js 18+
- Google Gemini API key

## Setup

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Add your Gemini API key to .env.local
# GEMINI_API_KEY=your_key_here

# Run development server
npm run dev
```

Open http://localhost:3000

## Project Structure

```
src/
├── app/                    # Next.js pages and API routes
│   ├── page.tsx           # Main reading interface
│   ├── library/           # Document library
│   ├── sources/           # Source management
│   ├── workspaces/        # Workspace switcher
│   └── api/               # Backend endpoints
│       ├── chat/          # Agent chat
│       ├── parse-pdf/     # PDF text extraction
│       ├── extract-identity/  # Source identity extraction
│       └── prefilter/     # Relevance filtering
├── components/            # React components
├── hooks/                 # Custom React hooks
└── lib/                   # Utilities and business logic
    ├── gemini.ts          # Gemini API client
    ├── types.ts           # TypeScript interfaces
    └── prompts.ts         # LLM prompt templates
```

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Google Gemini AI
- pdfjs-dist for PDF parsing
- Tailwind CSS
- LocalStorage for data persistence

## License

MIT
