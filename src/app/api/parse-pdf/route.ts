import { NextRequest, NextResponse } from 'next/server';
import { PDFParse, VerbosityLevel } from 'pdf-parse';

export async function POST(request: NextRequest) {
  let parser: InstanceType<typeof PDFParse> | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create parser with buffer data
    parser = new PDFParse({
      data: buffer,
      verbosity: VerbosityLevel.ERRORS
    });

    // Get text content
    const textResult = await parser.getText();

    // Get metadata
    const infoResult = await parser.getInfo();

    // Try to extract title from PDF metadata or use filename
    let title = file.name.replace(/\.pdf$/i, '');
    const metadata = infoResult.metadata as unknown as Record<string, unknown> | null;
    if (metadata?.Title && typeof metadata.Title === 'string') {
      title = metadata.Title;
    }

    return NextResponse.json({
      text: textResult.text,
      title,
      pages: textResult.total,
    });
  } catch (error) {
    console.error('PDF parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to parse PDF' },
      { status: 500 }
    );
  } finally {
    // Clean up parser
    if (parser) {
      await parser.destroy();
    }
  }
}
