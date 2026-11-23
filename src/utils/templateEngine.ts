import { CopyFormat, ParsedVariable } from '../types/workspace';

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_.\- ]+?)(?:\|([^}]*))?\s*\}\}/g;

/**
 * Extracts unique {{variable}} or {{variable|default}} tokens in order of first appearance.
 */
export function extractVariables(content: string): ParsedVariable[] {
  const seen = new Set<string>();
  const result: ParsedVariable[] = [];
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    const defaultValue = match[2] !== undefined ? match[2].trim() : '';
    if (!seen.has(name)) {
      seen.add(name);
      result.push({
        raw: match[0],
        name,
        defaultValue,
      });
    }
  }

  return result;
}

/**
 * Substitutes {{variable}} tokens with provided values (or default if value is empty/missing).
 */
export function substituteVariables(
  content: string,
  values: Record<string, string>,
  fallbackToDefault = true
): string {
  return content.replace(VARIABLE_REGEX, (full, rawName: string, rawDefault?: string) => {
    const name = rawName.trim();
    const provided = values[name];
    if (provided !== undefined && provided.length > 0) {
      return provided;
    }
    if (fallbackToDefault && rawDefault !== undefined && rawDefault.trim().length > 0) {
      return rawDefault.trim();
    }
    return full;
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url: string): string {
  const trimmed = url.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:')
  ) {
    return escapeHtml(trimmed);
  }
  return '#';
}

function formatInlineMarkdown(text: string, highlightVariables: boolean): string {
  // Extract inline code segments first so markdown inside backticks is preserved literally
  const codeSegments: string[] = [];
  let working = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    const idx = codeSegments.length;
    codeSegments.push(`<code>${escapeHtml(code)}</code>`);
    return `\uE000CODE${idx}\uE001`;
  });

  // Extract variable tokens if highlighting for preview
  const varSegments: string[] = [];
  if (highlightVariables) {
    working = working.replace(VARIABLE_REGEX, (full) => {
      const idx = varSegments.length;
      varSegments.push(`<span class="var-token">${escapeHtml(full)}</span>`);
      return `\uE000VAR${idx}\uE001`;
    });
  }

  // Extract markdown links [label](url)
  const linkSegments: string[] = [];
  working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) => {
    const idx = linkSegments.length;
    const safeUrl = sanitizeUrl(url);
    linkSegments.push(`<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`);
    return `\uE000LINK${idx}\uE001`;
  });

  // Escape remaining text
  working = escapeHtml(working);

  // Bold + Italic (***text***)
  working = working.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold (**text** or __text__)
  working = working.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  working = working.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // Italic (*text* or _text_)
  working = working.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  working = working.replace(/(^|\s)_([^_\n]+)_(\s|$|[.,!?;:])/g, '$1<em>$2</em>$3');
  // Strikethrough (~~text~~)
  working = working.replace(/~~([^~]+)~~/g, '<s>$1</s>');

  // Restore placeholders
  working = working.replace(/\uE000LINK(\d+)\uE001/g, (_m, idx: string) => linkSegments[Number(idx)]);
  working = working.replace(/\uE000VAR(\d+)\uE001/g, (_m, idx: string) => varSegments[Number(idx)]);
  working = working.replace(/\uE000CODE(\d+)\uE001/g, (_m, idx: string) => codeSegments[Number(idx)]);

  return working;
}

/**
 * Compiles Markdown to clean semantic HTML suitable for previewing and pasting into
 * Outlook, Gmail, Microsoft Teams, Slack, Zendesk, and documentation editors.
 */
export function markdownToHtml(markdown: string, options?: { highlightVariables?: boolean }): string {
  const highlightVariables = options?.highlightVariables ?? false;
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const htmlBlocks: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++;
      }
      htmlBlocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      htmlBlocks.push('<hr />');
      i++;
      continue;
    }

    // Headings (#, ##, ###)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = formatInlineMarkdown(headingMatch[2].trim(), highlightVariables);
      htmlBlocks.push(`<h${level}>${content}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const quoteHtml = quoteLines
        .map((q) => formatInlineMarkdown(q, highlightVariables))
        .join('<br />');
      htmlBlocks.push(`<blockquote><p>${quoteHtml}</p></blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*+]\s+/, '');
        items.push(`<li>${formatInlineMarkdown(itemText, highlightVariables)}</li>`);
        i++;
      }
      htmlBlocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push(`<li>${formatInlineMarkdown(itemText, highlightVariables)}</li>`);
        i++;
      }
      htmlBlocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Paragraph (preserve intentional single line breaks for email greetings/signatures)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !/^\s*([-*_])\1{2,}\s*$/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('>') &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const paraHtml = paraLines
      .map((p) => formatInlineMarkdown(p, highlightVariables))
      .join('<br />');
    htmlBlocks.push(`<p>${paraHtml}</p>`);
  }

  return htmlBlocks.join('\n');
}

/**
 * Strips Markdown formatting into clean, readable plain text for text/plain clipboard fallback.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_m, code: string) => code.trimEnd())
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, '---')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, url: string) =>
      label.trim() === url.trim() ? url.trim() : `${label} (${url})`
    )
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_(\s|$|[.,!?;:])/g, '$1$2$3')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .trim();
}

/**
 * Fallback rich copy using a temporary off-screen element + Selection/execCommand.
 */
function legacyRichCopy(html: string, plainText: string): boolean {
  const container = document.createElement('div');
  container.setAttribute('contenteditable', 'true');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.opacity = '0';
  container.innerHTML = html;

  const handleCopy = (e: ClipboardEvent) => {
    if (e.clipboardData) {
      e.preventDefault();
      e.clipboardData.setData('text/html', html);
      e.clipboardData.setData('text/plain', plainText);
    }
  };

  document.body.appendChild(container);
  document.addEventListener('copy', handleCopy);

  let copied = false;
  try {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    copied = document.execCommand('copy');
    selection?.removeAllRanges();
  } catch {
    copied = false;
  } finally {
    document.removeEventListener('copy', handleCopy);
    document.body.removeChild(container);
  }

  return copied;
}

function legacyPlainCopy(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
  }
  return copied;
}

/**
 * Copies template content in the requested format:
 * - 'rich': Writes both text/html and text/plain via ClipboardItem (with legacy fallback)
 * - 'plain': Strips Markdown syntax and copies clean plain text
 * - 'markdown': Copies exact raw Markdown source
 */
export async function copyTemplateToClipboard(
  content: string,
  format: CopyFormat = 'rich'
): Promise<{ success: boolean; actualFormat: CopyFormat }> {
  const plainText = format === 'markdown' ? content : markdownToPlainText(content);
  const wrappedHtml =
    format === 'rich'
      ? `<div>${markdownToHtml(content, { highlightVariables: false })}</div>`
      : undefined;

  // Native Windows desktop clipboard (zero browser permission prompts, full HTML + text fidelity)
  if (window.fluentDesktop?.isElectron) {
    const ok = await window.fluentDesktop.writeClipboard({
      format,
      html: wrappedHtml,
      text: plainText,
    });
    if (ok) {
      return { success: true, actualFormat: format };
    }
  }

  if (format === 'markdown') {
    try {
      await navigator.clipboard.writeText(content);
      return { success: true, actualFormat: 'markdown' };
    } catch {
      const ok = legacyPlainCopy(content);
      return { success: ok, actualFormat: 'markdown' };
    }
  }

  if (format === 'plain') {
    try {
      await navigator.clipboard.writeText(plainText);
      return { success: true, actualFormat: 'plain' };
    } catch {
      const ok = legacyPlainCopy(plainText);
      return { success: ok, actualFormat: 'plain' };
    }
  }

  // Format-preserving rich copy (text/html + text/plain)
  if (wrappedHtml && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([wrappedHtml], { type: 'text/html' }),
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      });
      await navigator.clipboard.write([item]);
      return { success: true, actualFormat: 'rich' };
    } catch {
      // Fall through to legacy rich copy
    }
  }

  if (wrappedHtml && legacyRichCopy(wrappedHtml, plainText)) {
    return { success: true, actualFormat: 'rich' };
  }

  // Final fallback to plain text
  try {
    await navigator.clipboard.writeText(plainText);
    return { success: true, actualFormat: 'plain' };
  } catch {
    const ok = legacyPlainCopy(plainText);
    return { success: ok, actualFormat: 'plain' };
  }
}

/**
 * Generates a single-line clean preview string for list rows.
 */
export function getSnippetPreview(markdown: string, maxLength = 120): string {
  const plain = markdownToPlainText(markdown).replace(/\s+/g, ' ').trim();
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength - 1).trimEnd()}…`;
}
