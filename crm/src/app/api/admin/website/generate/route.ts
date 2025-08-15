import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/guard';
import { jsonOk, jsonError, methodNotAllowed } from '@/lib/http';
import { getDb } from '@/lib/db';
import { chatWithFailover, type AiProviderConfig } from '@/lib/ai';

export async function POST(req: NextRequest) {
  try {
    // Verify admin access
    await requireAdmin(req);
  } catch {
    return jsonError('FORBIDDEN', { status: 403 });
  }

  try {
    const body = await req.json();
    const { systemMessage, userPrompt } = body;

    if (!userPrompt || typeof userPrompt !== 'string' || !userPrompt.trim()) {
      return jsonError('VALIDATION', { status: 400, message: 'User prompt is required' });
    }

    console.log('[WebsiteGenerator] Starting website generation...');
    console.log('[WebsiteGenerator] User prompt length:', userPrompt.trim().length);

    // Get database connection
    const db = getDb();

    // Load enabled AI providers from DB for failover
    const rows = db.prepare(`
      SELECT id, provider, api_key, base_url, model, enabled, timeout_ms, priority, max_tokens 
      FROM ai_providers 
      WHERE enabled = 1 
      ORDER BY priority ASC
    `).all() as Array<any>;

    if (rows.length === 0) {
      return jsonError('NO_PROVIDERS', { status: 503, message: 'No AI providers are configured and enabled' });
    }

    const providers: AiProviderConfig[] = rows.map((r) => ({
      id: r.id,
      provider: (r.provider || 'openai') as any,
      apiKey: r.api_key || undefined,
      baseUrl: r.base_url || undefined,
      model: r.model || undefined,
      timeoutMs: r.timeout_ms || undefined,
      maxTokens: r.max_tokens || undefined,
    }));

    console.log('[WebsiteGenerator] Using', providers.length, 'AI providers');

    // Enhanced system message with embedded guardrails
    const enhancedSystemMessage = `${systemMessage || 'You are a professional web developer.'} 

CRITICAL REQUIREMENTS:
1. Output ONLY a single, complete HTML document
2. Include ALL CSS styles in a <style> tag within the <head>
3. Include ALL JavaScript in <script> tags within the document
4. Use modern, responsive design with mobile-first approach
5. Include proper semantic HTML5 elements
6. Use a professional color scheme and typography
7. Ensure all interactive elements work without external dependencies
8. Do NOT use any external CDN links or resources
9. Do NOT include markdown code blocks (no \`\`\` backticks)
10. Do NOT include any explanatory text before or after the HTML

The output should be production-ready HTML that can be saved as an .html file and opened directly in a browser.`;

    const messages = [
      { role: 'system' as const, content: enhancedSystemMessage },
      { role: 'user' as const, content: userPrompt.trim() }
    ];

    console.log('[WebsiteGenerator] Sending request to AI providers...');

    // Generate website using AI
    const aiResult = await chatWithFailover(providers, messages);

    if (!aiResult.ok || !aiResult.content) {
      console.error('[WebsiteGenerator] AI generation failed:', aiResult);
      return jsonError('AI_GENERATION_FAILED', { 
        status: 500, 
        message: 'Failed to generate website with AI',
        details: aiResult
      });
    }

    console.log('[WebsiteGenerator] AI generation successful, response length:', aiResult.content.length);
    console.log('[WebsiteGenerator] Used provider:', aiResult.provider, 'model:', aiResult.model);

    // Clean the AI response - remove markdown code blocks and extra whitespace
    let cleanHtml = aiResult.content.trim();
    
    // Remove markdown code blocks (```html ... ``` or ``` ... ```)
    cleanHtml = cleanHtml.replace(/^```(?:html)?\s*\n?/gm, '');
    cleanHtml = cleanHtml.replace(/\n?\s*```\s*$/gm, '');
    
    // Clean up any remaining backticks at start/end
    cleanHtml = cleanHtml.replace(/^`+|`+$/g, '');
    
    // Trim again after cleaning
    cleanHtml = cleanHtml.trim();

    console.log('[WebsiteGenerator] Cleaned HTML, final length:', cleanHtml.length);

    // Basic validation that we have HTML
    if (!cleanHtml.includes('<html') && !cleanHtml.includes('<!DOCTYPE')) {
      console.warn('[WebsiteGenerator] Generated content may not be valid HTML');
    }

    return jsonOk({
      html: cleanHtml,
      provider: aiResult.provider,
      model: aiResult.model,
      originalLength: aiResult.content.length,
      cleanedLength: cleanHtml.length
    });

  } catch (error: any) {
    console.error('[WebsiteGenerator] Error generating website:', error);
    return jsonError('INTERNAL_ERROR', { 
      status: 500, 
      message: error?.message || 'Internal server error' 
    });
  }
}

export function GET() { 
  return methodNotAllowed(['POST']); 
}

export function PUT() { 
  return methodNotAllowed(['POST']); 
}

export function DELETE() { 
  return methodNotAllowed(['POST']); 
}
