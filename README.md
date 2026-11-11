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

Copyright © 2025–2026 CUNY AI Lab, The Graduate Center, City University of New York.

This software is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later). You may use, study, change, and share it, including for commercial purposes. If you distribute a modified version, or run one as a network service that other people use, you must make its complete source code available to them under the same license.

This license applies to every version of this repository, including earlier commits. Copies obtained before November 10, 2026 under the MIT License may still be used under that license, because earlier license grants cannot be withdrawn.

Questions about licensing: [ailab@gc.cuny.edu](mailto:ailab@gc.cuny.edu). See CAIL's [licensing page](https://ailab.gc.cuny.edu/license/).
