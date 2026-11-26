import { SnippetTemplate, TemplateCategory } from '../types/workspace';

export interface SuggestedCategory {
  kind: 'existing' | 'new';
  id?: string;
  name: string;
  score: number;
}

export interface SuggestedTag {
  kind: 'existing' | 'new';
  tag: string;
  score: number;
}

export interface TemplateSuggestionInput {
  template: Pick<SnippetTemplate, 'id' | 'title' | 'content' | 'categoryId' | 'tags'>;
  categories: TemplateCategory[];
  templatesInTab: SnippetTemplate[];
  availableTags: string[];
}

export interface TemplateSuggestionResult {
  status: 'needs-more-content' | 'ready';
  titles: string[];
  categories: SuggestedCategory[];
  tags: SuggestedTag[];
}

interface DomainRule {
  categoryName: string;
  defaultTitle: string;
  defaultTags: string[];
  keywords: Record<string, number>;
  variableHints: string[];
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'across', 'after', 'again', 'against', 'all', 'almost',
  'alone', 'along', 'already', 'also', 'although', 'always', 'am', 'among', 'an',
  'and', 'another', 'any', 'anybody', 'anyone', 'anything', 'anyway', 'are', 'aren',
  'around', 'as', 'at', 'attached', 'available', 'back', 'be', 'became', 'because',
  'become', 'becomes', 'been', 'before', 'behind', 'being', 'below', 'beside',
  'best', 'between', 'beyond', 'both', 'but', 'by', 'can', 'cannot', 'cheers',
  'could', 'currently', 'dear', 'did', 'didn', 'directly', 'do', 'does', 'doesn',
  'doing', 'don', 'done', 'down', 'during', 'each', 'earlier', 'either', 'else',
  'enough', 'etc', 'even', 'ever', 'every', 'everyone', 'everything', 'example',
  'feel', 'few', 'find', 'first', 'for', 'forward', 'found', 'free', 'from',
  'further', 'get', 'gets', 'getting', 'give', 'given', 'go', 'going', 'good',
  'got', 'great', 'had', 'has', 'hasn', 'have', 'haven', 'having', 'he', 'hello',
  'help', 'her', 'here', 'hers', 'herself', 'hey', 'hi', 'him', 'himself', 'his',
  'hope', 'how', 'however', 'i', 'if', 'in', 'including', 'into', 'is', 'isn',
  'it', 'its', 'itself', 'just', 'keep', 'kind', 'kindly', 'know', 'last', 'later',
  'least', 'let', 'like', 'likely', 'll', 'look', 'looking', 'make', 'makes',
  'making', 'many', 'may', 'maybe', 'me', 'might', 'more', 'most', 'much', 'must',
  'my', 'myself', 'need', 'needed', 'needs', 'neither', 'never', 'new', 'next',
  'no', 'none', 'nor', 'not', 'nothing', 'now', 'of', 'off', 'often', 'ok', 'okay',
  'on', 'once', 'one', 'only', 'onto', 'or', 'other', 'others', 'otherwise', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'patience', 'per', 'please', 'put',
  'quick', 'quickly', 'quite', 'rather', 're', 'reach', 'reached', 'reaching',
  'really', 'regarding', 'regards', 'reply', 'right', 'said', 'same', 'say', 'see',
  'seem', 'seems', 'send', 'sending', 'sent', 'several', 'shall', 'she', 'should',
  'shouldn', 'show', 'since', 'sincerely', 'so', 'some', 'somebody', 'someone',
  'something', 'sometimes', 'soon', 'speaking', 'still', 'such', 'sure', 'take',
  'taken', 'taking', 'team', 'tell', 'than', 'thank', 'thanks', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'therefore', 'these',
  'they', 'thing', 'things', 'think', 'this', 'those', 'though', 'through', 'time',
  'to', 'today', 'together', 'tomorrow', 'too', 'touch', 'toward', 'towards', 'try',
  'under', 'until', 'up', 'upon', 'us', 'use', 'used', 'using', 'usually', 've',
  'very', 'via', 'want', 'wanted', 'warm', 'was', 'wasn', 'way', 'we', 'well',
  'were', 'weren', 'what', 'whatever', 'when', 'whenever', 'where', 'wherever',
  'whether', 'which', 'while', 'who', 'whoever', 'whom', 'whose', 'why', 'will',
  'with', 'within', 'without', 'won', 'would', 'wouldn', 'writing', 'written',
  'yet', 'you', 'your', 'yours', 'yourself', 'yourselves',
]);

const GENERIC_VAR_PARTS = new Set([
  'name', 'first', 'last', 'full', 'text', 'value', 'val', 'id', 'num', 'number',
  'date', 'time', 'link', 'url', 'email', 'user', 'person', 'item', 'field',
  'var', 'variable', 'default', 'custom', 'info', 'details', 'detail', 'note',
  'notes', 'list', 'body', 'msg', 'message', 'day', 'month', 'year', 'hour',
  'customer', 'client', 'agent', 'company', 'amount', 'summary', 'owner', 'lead',
  'target', 'metric', 'window', 'key', 'tag',
]);

const GENERIC_TAG_WORDS = new Set([
  'update', 'updates', 'note', 'notes', 'template', 'templates', 'email', 'message',
  'step', 'steps', 'item', 'items', 'issue', 'question', 'questions', 'detail',
  'details', 'information', 'status', 'current', 'expected', 'original', 'work',
  'working', 'check', 'confirm', 'confirmed', 'confirmation', 'process', 'processed',
  'share', 'shared', 'review', 'start', 'started', 'ready', 'open', 'close', 'closed',
  'contact', 'call', 'chat', 'week', 'weeks', 'days', 'business', 'hours', 'minutes',
  'based', 'depending', 'possible', 'able', 'ensure', 'provide', 'provided', 'follow',
  'following', 'below', 'above', 'include', 'included', 'additional', 'further',
  'happy', 'glad', 'sorry', 'apologize', 'apologies', 'appreciate', 'understand',
  'received', 'receive', 'complete', 'completed', 'finish', 'finished', 'end',
  'customer', 'client', 'agent', 'company', 'amount', 'summary', 'number', 'due',
]);

const GENERIC_HEADINGS = new Set([
  'next steps', 'next steps to get started', 'action items', 'highlights',
  'summary', 'overview', 'details', 'notes', 'key objectives', 'objectives',
  'deployment notes', 'additional notes', 'background', 'context', 'agenda',
  'steps', 'instructions', 'updates', 'status', 'references', 'links',
]);

const MINOR_TITLE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'nor', 'of',
  'on', 'or', 'per', 'the', 'to', 'via', 'with', '&',
]);

const DANGLING_TITLE_END_WORDS = new Set([
  ...MINOR_TITLE_WORDS,
  'after', 'before', 'about', 'under', 'over', 'between', 'through', 'during',
  'been', 'being', 'has', 'have', 'had', 'is', 'are', 'was', 'were', 'be',
  'will', 'would', 'could', 'should', 'can', 'may', 'might', 'that', 'which',
  'your', 'our', 'their', 'this', 'these', 'those', 'my',
]);

const PRESERVE_ACRONYMS = new Set([
  'ai', 'api', 'aws', 'b2b', 'b2c', 'ci', 'cd', 'cli', 'crm', 'csv', 'db', 'dns',
  'eta', 'faq', 'gdpr', 'hr', 'html', 'http', 'https', 'id', 'ip', 'it', 'json',
  'kpi', 'mfa', 'nda', 'okr', 'pdf', 'pm', 'po', 'pr', 'qa', 'q1', 'q2', 'q3',
  'q4', 'roi', 'saas', 'sdk', 'seo', 'sla', 'sms', 'soc2', 'sql', 'sso', 'tls',
  'ui', 'url', 'ux', 'vip', 'vpn', 'xml', 'yaml',
]);

const KNOWN_COMPOUND_TAGS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /\bfollow[\s-]?ups?\b/i, tag: 'follow-up' },
  { pattern: /\bon[\s-]?call\b/i, tag: 'on-call' },
  { pattern: /\bcheck[\s-]?ins?\b/i, tag: 'check-in' },
  { pattern: /\bpost[\s-]?mortems?\b/i, tag: 'post-mortem' },
  { pattern: /\bpull[\s-]?requests?\b/i, tag: 'pull-request' },
  { pattern: /\bcode[\s-]?reviews?\b/i, tag: 'code-review' },
  { pattern: /\bbug[\s-]?reports?\b/i, tag: 'bug-report' },
  { pattern: /\broot[\s-]?cause\b/i, tag: 'root-cause' },
  { pattern: /\brelease[\s-]?notes?\b/i, tag: 'release-notes' },
  { pattern: /\bkick[\s-]?offs?\b/i, tag: 'kickoff' },
  { pattern: /\bsign[\s-]?offs?\b/i, tag: 'sign-off' },
  { pattern: /\baction[\s-]?items?\b/i, tag: 'action-items' },
  { pattern: /\bmeeting[\s-]?(?:recap|notes|summary)\b/i, tag: 'meeting-recap' },
  { pattern: /\bpassword[\s-]?reset\b/i, tag: 'password-reset' },
  { pattern: /\btwo[\s-]?factor|2fa|mfa\b/i, tag: 'mfa' },
  { pattern: /\bsingle[\s-]?sign[\s-]?on|sso\b/i, tag: 'sso' },
  { pattern: /\bcharge[\s-]?back\b/i, tag: 'chargeback' },
  { pattern: /\bcredit[\s-]?memo\b/i, tag: 'credit-memo' },
  { pattern: /\bstatus[\s-]?update\b/i, tag: 'status-update' },
  { pattern: /\bfeature[\s-]?request\b/i, tag: 'feature-request' },
  { pattern: /\bcustomer[\s-]?success\b/i, tag: 'customer-success' },
  { pattern: /\btime[\s-]?off|pto\b/i, tag: 'time-off' },
  { pattern: /\bout[\s-]?of[\s-]?office|ooo\b/i, tag: 'out-of-office' },
];

const DOMAIN_RULES: DomainRule[] = [
  {
    categoryName: 'Billing & Refunds',
    defaultTitle: 'Billing & Refund Update',
    defaultTags: ['billing', 'refund', 'invoice'],
    keywords: {
      refund: 3.4, invoice: 3.0, billing: 3.0, charge: 2.2, payment: 2.5,
      receipt: 2.4, subscription: 2.4, renewal: 2.2, credit: 1.8, settlement: 2.0,
      overcharge: 2.8, chargeback: 2.8, payout: 2.2, bank: 1.4, accounting: 1.8,
      card: 1.4, plan: 1.2, upgrade: 1.4, downgrade: 1.8, cancel: 1.8, cancellation: 2.2,
    },
    variableHints: ['refund', 'invoice', 'charge', 'payment', 'amount', 'billing', 'receipt'],
  },
  {
    categoryName: 'Onboarding',
    defaultTitle: 'Account Onboarding Welcome',
    defaultTags: ['onboarding', 'welcome', 'setup'],
    keywords: {
      welcome: 3.0, onboarding: 3.5, provisioned: 2.8, checklist: 2.0,
      portal: 1.8, invite: 1.8, setup: 2.4, workspace: 1.6, kickoff: 2.0,
      getting: 1.0, activate: 2.2, activation: 2.4, walkthrough: 2.0, training: 1.8,
      account: 1.2, credentials: 1.8, sandbox: 1.6,
    },
    variableHints: ['workspace', 'onboarding', 'portal', 'setup', 'account'],
  },
  {
    categoryName: 'Troubleshooting',
    defaultTitle: 'Issue Troubleshooting Update',
    defaultTags: ['troubleshooting', 'escalation', 'bug'],
    keywords: {
      escalated: 3.0, escalation: 3.2, reproduction: 2.6, repro: 2.4, logs: 2.2,
      bug: 2.8, workaround: 2.8, engineering: 1.8, investigation: 2.4,
      investigating: 2.4, root: 1.4, cause: 1.4, error: 2.4, crash: 2.6,
      troubleshoot: 3.0, troubleshooting: 3.2, cache: 1.8, ticket: 1.6,
      jira: 2.4, sla: 2.2, fix: 1.6, broken: 2.2, failing: 2.2,
    },
    variableHints: ['issue', 'bug', 'jira', 'ticket', 'error', 'workaround', 'eta'],
  },
  {
    categoryName: 'Incident & On-Call',
    defaultTitle: 'Incident Status Handoff',
    defaultTags: ['incident', 'on-call', 'handoff'],
    keywords: {
      incident: 3.5, outage: 3.4, severity: 3.0, sev: 2.8, mitigation: 3.0,
      handoff: 2.8, shift: 2.2, latency: 2.6, oncall: 3.2, replicas: 2.2,
      rollback: 2.6, degraded: 2.8, alert: 2.2, monitor: 1.8, monitoring: 2.0,
      postmortem: 3.2, gateway: 1.8, nodes: 1.8, pager: 2.4, uptime: 2.2,
    },
    variableHints: ['incident', 'severity', 'oncall', 'service', 'mitigation'],
  },
  {
    categoryName: 'Release Notes',
    defaultTitle: 'Release Changelog Notes',
    defaultTags: ['release', 'changelog', 'deployment'],
    keywords: {
      release: 3.2, changelog: 3.5, deployment: 2.8, deploy: 2.6, deployed: 2.4,
      version: 2.4, improved: 2.0, fixed: 1.8, deprecated: 2.6, breaking: 2.2,
      migration: 2.2, rollout: 2.6, feature: 1.6, hotfix: 2.8, build: 1.6,
      shipped: 2.2, npm: 1.8,
    },
    variableHints: ['version', 'release', 'deploy', 'build', 'changelog'],
  },
  {
    categoryName: 'Follow-Ups',
    defaultTitle: 'Meeting Recap & Follow-Up',
    defaultTags: ['follow-up', 'recap', 'check-in'],
    keywords: {
      recap: 3.0, discovery: 2.4, aligned: 2.0, objectives: 2.0,
      checkin: 2.6, followup: 3.2, reminder: 2.4, bump: 2.0,
      touching: 1.8, base: 1.2, conversation: 1.8, discussed: 2.0,
      meeting: 2.0, call: 1.4, stakeholders: 1.6, action: 1.4,
    },
    variableHints: ['next_call', 'due_date', 'client', 'meeting', 'followup'],
  },
  {
    categoryName: 'Proposals & Sales',
    defaultTitle: 'Project Proposal & Scope',
    defaultTags: ['proposal', 'scope', 'pricing'],
    keywords: {
      proposal: 3.5, scope: 3.0, pricing: 3.0, quote: 2.6, milestone: 2.4,
      milestones: 2.4, timeline: 2.2, deliverables: 2.6, contract: 2.6,
      sow: 3.0, budget: 2.4, estimate: 2.4, kickoff: 1.8, phase: 2.0,
      retainer: 2.6, discount: 2.2, demo: 2.2, trial: 2.0, roi: 2.4,
    },
    variableHints: ['project', 'proposal', 'timeline', 'budget', 'quote', 'price'],
  },
  {
    categoryName: 'Meeting Notes',
    defaultTitle: 'Meeting Notes & Actions',
    defaultTags: ['meeting', 'agenda', 'action-items'],
    keywords: {
      agenda: 3.2, attendees: 3.0, minutes: 2.6, decisions: 2.4, standup: 3.0,
      retrospective: 3.2, retro: 2.8, sprint: 2.4, sync: 2.0, blockers: 2.6,
      takeaways: 2.6, recording: 2.2, transcript: 2.4, owners: 1.8,
    },
    variableHints: ['meeting', 'agenda', 'attendees', 'sprint', 'recording'],
  },
  {
    categoryName: 'Code Reviews',
    defaultTitle: 'Pull Request Review Notes',
    defaultTags: ['code-review', 'pull-request', 'engineering'],
    keywords: {
      pr: 2.8, commit: 2.6, branch: 2.4, merge: 2.6, refactor: 2.6,
      lint: 2.4, tests: 2.0, coverage: 2.2, diff: 2.4, reviewer: 2.8,
      github: 2.2, gitlab: 2.2, repo: 2.4, repository: 2.4, regression: 2.4,
      ci: 2.0, pipeline: 2.0, approved: 1.4,
    },
    variableHints: ['pr', 'branch', 'commit', 'repo', 'reviewer'],
  },
  {
    categoryName: 'Account & Access',
    defaultTitle: 'Account Access & Security',
    defaultTags: ['security', 'access', 'permissions'],
    keywords: {
      password: 3.2, login: 2.8, signin: 2.8, mfa: 3.0, sso: 3.0,
      permissions: 2.8, role: 2.2, admin: 2.0, token: 2.4, oauth: 2.8,
      locked: 2.6, unlock: 2.6, verify: 2.2, verification: 2.4,
      security: 2.8, breach: 3.0, audit: 2.2, revoke: 2.6,
    },
    variableHints: ['password', 'sso', 'mfa', 'role', 'permission', 'token'],
  },
  {
    categoryName: 'Shipping & Orders',
    defaultTitle: 'Order & Delivery Update',
    defaultTags: ['shipping', 'order', 'delivery'],
    keywords: {
      shipping: 3.4, shipment: 3.4, tracking: 3.2, delivery: 3.0, courier: 3.0,
      carrier: 2.8, package: 2.8, parcel: 2.8, warehouse: 2.6, dispatched: 3.0,
      transit: 2.6, customs: 2.6, order: 2.4, replacement: 2.4, damaged: 2.4,
      return: 2.2, address: 1.8, delayed: 2.2,
    },
    variableHints: ['order', 'tracking', 'carrier', 'shipment', 'delivery'],
  },
  {
    categoryName: 'Scheduling & Calls',
    defaultTitle: 'Call Scheduling Request',
    defaultTags: ['scheduling', 'calendar', 'availability'],
    keywords: {
      schedule: 2.8, reschedule: 3.2, availability: 3.0, calendar: 3.0,
      slot: 2.6, slots: 2.6, timezone: 2.8, zoom: 2.6, invite: 2.2,
      appointment: 3.0, booking: 2.8, confirm: 1.4, postpone: 2.6,
    },
    variableHints: ['calendar', 'zoom', 'meeting', 'timezone', 'slot'],
  },
  {
    categoryName: 'Hiring & Interviews',
    defaultTitle: 'Candidate Interview Update',
    defaultTags: ['hiring', 'interview', 'recruiting'],
    keywords: {
      candidate: 3.4, interview: 3.4, resume: 3.0, application: 2.6,
      position: 2.6, hiring: 3.2, recruiter: 3.2, offer: 2.6,
      compensation: 2.6, portfolio: 2.4, panel: 2.4, assessment: 2.6,
      applicant: 3.2, role: 1.8,
    },
    variableHints: ['candidate', 'position', 'role', 'interview', 'recruiter'],
  },
  {
    categoryName: 'Feedback & Surveys',
    defaultTitle: 'Customer Feedback Request',
    defaultTags: ['feedback', 'survey', 'review'],
    keywords: {
      feedback: 3.2, survey: 3.4, nps: 3.4, testimonial: 3.2, rating: 2.8,
      review: 2.0, experience: 1.8, thoughts: 1.8, questionnaire: 3.2,
      improve: 1.6, suggestions: 2.0,
    },
    variableHints: ['survey', 'feedback', 'rating', 'nps'],
  },
];

export function normalizeComparisonKey(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9]+/g, '');
  return stemWord(cleaned);
}

function stemWord(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) {
    return `${word.slice(0, -3)}y`;
  }
  if (
    word.endsWith('ches') ||
    word.endsWith('shes') ||
    word.endsWith('xes') ||
    word.endsWith('zes') ||
    word.endsWith('sses')
  ) {
    return word.slice(0, -2);
  }
  if (
    word.endsWith('s') &&
    !word.endsWith('ss') &&
    !word.endsWith('us') &&
    !word.endsWith('is') &&
    !word.endsWith('os')
  ) {
    return word.slice(0, -1);
  }
  return word;
}

function extractVariableNames(content: string): string[] {
  const names: string[] = [];
  const regex = /\{\{([^{}|]+?)(?:\|[^{}]*)?\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const rawName = match[1].trim();
    if (rawName) names.push(rawName);
  }
  return names;
}

function extractVariableTokens(content: string): string[] {
  const tokens: string[] = [];
  for (const name of extractVariableNames(content)) {
    const parts = name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 2 && !STOP_WORDS.has(p) && !GENERIC_VAR_PARTS.has(p));
    tokens.push(...parts);
  }
  return tokens;
}

function stripMarkdownToPlain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, ' $1 ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, ' $1 ')
    .replace(/\{\{([^{}|]+?)(?:\|([^{}]*))?\}\}/g, (_m, _name, defVal) =>
      defVal ? ` ${String(defVal).trim()} ` : ' '
    )
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*>\s*/gm, '')
    .replace(/[*_~]+/g, '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPlaceholdersForTitle(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\{\{[^{}]+\}\}/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeText(text: string): string[] {
  const plain = stripMarkdownToPlain(text).toLowerCase();
  const matches = plain.match(/[a-z][a-z0-9'-]{1,}/g) || [];
  const result: string[] = [];
  for (const raw of matches) {
    const cleaned = raw.replace(/^['-]+|['-]+$/g, '');
    if (cleaned.length < 2) continue;
    if (/^\d+$/.test(cleaned)) continue;
    if (STOP_WORDS.has(cleaned)) continue;
    result.push(cleaned);
  }
  return result;
}

function extractDocumentTokens(title: string, content: string): string[] {
  const isDefaultTitle = isUntitled(title);
  const titleTokens = isDefaultTitle ? [] : tokenizeText(title);
  const contentTokens = tokenizeText(content);
  const varTokens = extractVariableTokens(content);
  return [...titleTokens, ...contentTokens, ...varTokens];
}

export function isUntitled(title: string): boolean {
  const trimmed = title.trim().toLowerCase();
  return (
    trimmed.length === 0 ||
    trimmed === 'untitled' ||
    trimmed === 'untitled template' ||
    trimmed === 'new template'
  );
}

function toSmartTitleCase(phrase: string): string {
  const words = phrase
    .replace(/[—–]+/g, ' - ')
    .replace(/[^\w\s&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (words.length === 0) return '';

  return words
    .map((word, index) => {
      if (word === '&' || word === '-' || word === '/') return word;
      const lower = word.toLowerCase();
      if (PRESERVE_ACRONYMS.has(lower)) return lower.toUpperCase();
      if (index > 0 && index < words.length - 1 && MINOR_TITLE_WORDS.has(lower)) {
        return lower;
      }
      if (word.includes('-')) {
        return word
          .split('-')
          .map((part) => {
            const pLower = part.toLowerCase();
            if (PRESERVE_ACRONYMS.has(pLower)) return pLower.toUpperCase();
            return pLower ? pLower[0].toUpperCase() + pLower.slice(1) : '';
          })
          .join('-');
      }
      return lower[0].toUpperCase() + lower.slice(1);
    })
    .join(' ')
    .replace(/\s+-\s*$/, '')
    .replace(/^\s*-\s+/, '')
    .trim();
}

function condenseToShortTitle(raw: string, maxWords = 6, maxChars = 48): string {
  const cleaned = raw
    .replace(/^[-–—:•|/]+\s*/, '')
    .replace(/\s*[-–—:•|/]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned.split(' ').filter(Boolean);
  const selected: string[] = [];
  for (const w of words) {
    if (selected.length >= maxWords) break;
    const candidate = [...selected, w].join(' ');
    if (candidate.length > maxChars && selected.length >= 2) break;
    selected.push(w);
  }

  // Trim trailing dangling minor words or auxiliaries (e.g., "for", "after", "has", "been")
  while (
    selected.length > 2 &&
    DANGLING_TITLE_END_WORDS.has(selected[selected.length - 1].toLowerCase())
  ) {
    selected.pop();
  }

  const formatted = toSmartTitleCase(selected.join(' '));
  const wordCount = formatted.split(/\s+/).filter(Boolean).length;
  if (wordCount < 2 || formatted.length < 5) return '';
  return formatted;
}

function buildTfIdfVector(
  tokens: string[],
  docFreq: Map<string, number>,
  totalDocs: number
): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) {
    const key = stemWord(token.replace(/-/g, ''));
    if (!key) continue;
    tf.set(key, (tf.get(key) || 0) + 1);
  }

  const vec = new Map<string, number>();
  const denom = Math.max(tokens.length, 1);
  for (const [term, count] of tf.entries()) {
    const df = docFreq.get(term) || 0;
    const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
    vec.set(term, (count / denom) * idf);
  }
  return vec;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, val] of a.entries()) {
    normA += val * val;
    const other = b.get(key);
    if (other !== undefined) {
      dot += val * other;
    }
  }
  for (const val of b.values()) {
    normB += val * val;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function scoreDomainRules(
  tokens: string[],
  varTokens: string[],
  rawLower: string
): Array<{ rule: DomainRule; score: number; distinctHits: number }> {
  const tokenFreq = new Map<string, number>();
  for (const t of tokens) {
    const plain = t.replace(/-/g, '');
    tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
    tokenFreq.set(plain, (tokenFreq.get(plain) || 0) + 1);
    const stemmed = stemWord(plain);
    tokenFreq.set(stemmed, (tokenFreq.get(stemmed) || 0) + 1);
  }

  const varSet = new Set(varTokens.map((v) => stemWord(v)));

  const scored = DOMAIN_RULES.map((rule) => {
    let score = 0;
    let distinctHits = 0;

    for (const [kw, weight] of Object.entries(rule.keywords)) {
      const count = tokenFreq.get(kw) || tokenFreq.get(stemWord(kw)) || 0;
      if (count > 0) {
        distinctHits += 1;
        // Diminishing returns for repeated occurrences of the same keyword
        score += weight * (1 + Math.min(count - 1, 3) * 0.25);
      }
    }

    for (const hint of rule.variableHints) {
      if (varSet.has(stemWord(hint)) || rawLower.includes(`{{${hint}`)) {
        score += 1.6;
        distinctHits += 1;
      }
    }

    // Bonus for hitting multiple independent signals in the same domain
    if (distinctHits >= 2) {
      score += distinctHits * 0.45;
    }

    return { rule, score, distinctHits };
  });

  return scored.filter((item) => item.score >= 2.2).sort((a, b) => b.score - a.score);
}

function extractTopPhrases(
  content: string,
  tfidfVec: Map<string, number>
): { unigrams: Array<{ word: string; score: number }>; bigrams: Array<{ phrase: string; score: number }> } {
  const cleanedSegments = content
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/`([^`]+)`/g, ' $1 ')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, ' $1 ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, ' $1 ')
    .replace(/\{\{([^{}|]+?)(?:\|([^{}]*))?\}\}/g, (_m, _name, defVal) =>
      defVal ? ` ${String(defVal).trim()} ` : ' '
    )
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_~#>]+/g, ' ')
    .split(/[\r\n.!?;:]+/);

  const unigramScores = new Map<string, number>();
  const displayForm = new Map<string, string>();
  const bigramCounts = new Map<string, number>();

  for (const segment of cleanedSegments) {
    const rawTokens = segment.toLowerCase().match(/[a-z][a-z0-9'-]{1,}/g) || [];
    for (let i = 0; i < rawTokens.length; i++) {
      const w1 = rawTokens[i].replace(/^['-]+|['-]+$/g, '');
      if (w1.length < 3 || STOP_WORDS.has(w1) || GENERIC_TAG_WORDS.has(w1) || /^\d+$/.test(w1)) {
        continue;
      }

      const stem1 = stemWord(w1.replace(/-/g, ''));
      const tfidf1 = tfidfVec.get(stem1) || 0.2;
      unigramScores.set(stem1, (unigramScores.get(stem1) || 0) + tfidf1);
      if (!displayForm.has(stem1) || w1.length < displayForm.get(stem1)!.length) {
        displayForm.set(stem1, w1);
      }

      if (i + 1 < rawTokens.length) {
        const w2 = rawTokens[i + 1].replace(/^['-]+|['-]+$/g, '');
        if (
          w2.length >= 3 &&
          !STOP_WORDS.has(w2) &&
          !GENERIC_TAG_WORDS.has(w2) &&
          !/^\d+$/.test(w2) &&
          w1 !== w2
        ) {
          const pair = `${w1} ${w2}`;
          bigramCounts.set(pair, (bigramCounts.get(pair) || 0) + 1);
        }
      }
    }
  }

  // Also boost clean variable name tokens
  for (const vt of extractVariableTokens(content)) {
    if (vt.length < 3 || GENERIC_TAG_WORDS.has(vt) || STOP_WORDS.has(vt)) continue;
    const stem = stemWord(vt);
    unigramScores.set(stem, (unigramScores.get(stem) || 0) + 0.55);
    if (!displayForm.has(stem)) {
      displayForm.set(stem, vt);
    }
  }

  const unigrams = Array.from(unigramScores.entries())
    .map(([stem, score]) => ({ word: displayForm.get(stem) || stem, score }))
    .sort((a, b) => b.score - a.score);

  const bigrams = Array.from(bigramCounts.entries())
    .map(([phrase, count]) => {
      const [a, b] = phrase.split(' ');
      const score =
        count * 0.9 +
        (unigramScores.get(stemWord(a.replace(/-/g, ''))) || 0) * 0.4 +
        (unigramScores.get(stemWord(b.replace(/-/g, ''))) || 0) * 0.4;
      return { phrase, score };
    })
    .sort((a, b) => b.score - a.score);

  return { unigrams, bigrams };
}

function generateTitleCandidates(
  content: string,
  currentTitle: string,
  domainMatches: Array<{ rule: DomainRule; score: number; distinctHits: number }>,
  topPhrases: { unigrams: Array<{ word: string; score: number }>; bigrams: Array<{ phrase: string; score: number }> }
): string[] {
  const candidates: string[] = [];
  const seenKeys = new Set<string>();

  const pushCandidate = (raw: string) => {
    const formatted = condenseToShortTitle(raw, 6, 46);
    if (!formatted) return;
    const key = formatted.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seenKeys.has(key)) return;
    seenKeys.add(key);
    candidates.push(formatted);
  };

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // 1. Explicit Subject: line
  for (const line of lines.slice(0, 6)) {
    const subjectMatch = line.match(/^subject\s*:\s*(.+)$/i);
    if (subjectMatch) {
      pushCandidate(stripPlaceholdersForTitle(subjectMatch[1]));
      break;
    }
  }

  // 2. Leading Markdown heading (# / ## / ###) if it is specific (not generic like "Next Steps")
  for (const line of lines.slice(0, 8)) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      const cleanedHeading = stripPlaceholdersForTitle(headingMatch[1])
        .replace(/\s*[—–-]\s*$/, '')
        .trim();
      if (cleanedHeading && !GENERIC_HEADINGS.has(cleanedHeading.toLowerCase())) {
        pushCandidate(cleanedHeading);
        break;
      }
    }
  }

  // 3. Strong curated domain-rule short title (crisp, natural 3–4 words)
  if (domainMatches.length > 0 && domainMatches[0].distinctHits >= 2) {
    pushCandidate(domainMatches[0].rule.defaultTitle);
  }

  // 4. First meaningful action sentence/clause (skipping greetings & conversational prefixes)
  const greetingPattern = /^(hi|hello|hey|dear|good\s+(?:morning|afternoon|evening))\b/i;
  const signoffPattern = /^(best|warm|kind|thanks|thank\s+you|sincerely|cheers|regards)\b/i;
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('```') || line.startsWith('>') || /^subject\s*:/i.test(line)) {
      continue;
    }
    const stripped = stripPlaceholdersForTitle(line)
      .replace(/^[-*+]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .trim();
    if (!stripped || stripped.length < 12) continue;
    if (greetingPattern.test(stripped) && stripped.length < 40) continue;
    if (signoffPattern.test(stripped) && stripped.length < 35) continue;

    const firstSentence = stripped.split(/(?<=[.!?])\s+/)[0] || stripped;
    const cleanedClause = firstSentence
      .replace(
        /^(?:(?:thank\s+you|thanks)\s+for\s+(?:reaching\s+out|sending\s+over|contacting\s+us|your\s+patience|sharing)?\s*(?:about|regarding|for|the)?\s*|just\s+(?:sending|following\s+up|checking\s+in|wanted\s+to|reaching\s+out)\s*(?:a\s+quick\s+|on\s+|about\s+|with\s+)?|i\s+(?:have|am|just)\s+(?:processed|issued|escalated|sent|attached|created|updated|reviewed|scheduled)\s+(?:a|an|the|this|your)?\s*|we\s+(?:have|are)\s+(?:processed|issued|escalated|updated|sending)\s+(?:a|an|the|this|your)?\s*|your\s+(?:package|order|account|request)\s+(?:for\s+order\s+)?(?:has\s+been\s+|is\s+now\s+)?|attached\s+is\s+(?:the|a|an|our)?\s*|here\s+is\s+(?:a|an|the|your)?\s*(?:quick\s+)?|great\s+speaking\s+with\s+you[^.,]*[.,]?\s*|welcome\s+to\s+)/i,
        ''
      )
      .replace(/\s+\b(?:of|back|for|to|with|on|in|at|by|from|and|or)\b(?:\s+\b(?:back|for|to|with|on|in|at|by|from|and|or)\b)*\s*$/i, '')
      .replace(/[.!?]+$/, '')
      .trim();

    const meaningfulClauseWords = cleanedClause
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w.toLowerCase()));

    if (meaningfulClauseWords.length >= 2) {
      pushCandidate(cleanedClause);
      break;
    }
  }

  // 5. Fallback domain title if single-hit domain matched
  if (domainMatches.length > 0) {
    pushCandidate(domainMatches[0].rule.defaultTitle);
  }

  // 6. Top bigram + context fallback
  if (topPhrases.bigrams.length > 0) {
    const topBigram = topPhrases.bigrams[0].phrase;
    pushCandidate(`${topBigram} Update`);
    pushCandidate(topBigram);
  } else if (topPhrases.unigrams.length >= 2) {
    pushCandidate(`${topPhrases.unigrams[0].word} ${topPhrases.unigrams[1].word} Note`);
  }

  // Filter out candidates that are effectively identical to the user's existing custom title
  if (!isUntitled(currentTitle)) {
    const currentNorm = currentTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const filtered = candidates.filter(
      (c) => c.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() !== currentNorm
    );
    // If the #1 best title already matches the user's title, don't nag them to rename it
    if (
      candidates.length > 0 &&
      candidates[0].toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === currentNorm
    ) {
      return [];
    }
    return filtered.slice(0, 3);
  }

  return candidates.slice(0, 3);
}

function suggestCategories(
  template: Pick<SnippetTemplate, 'id' | 'categoryId'>,
  categories: TemplateCategory[],
  peerSimilarities: Array<{ peer: SnippetTemplate; similarity: number }>,
  docTokens: string[],
  varTokens: string[],
  domainMatches: Array<{ rule: DomainRule; score: number; distinctHits: number }>,
  topPhrases: { unigrams: Array<{ word: string; score: number }>; bigrams: Array<{ phrase: string; score: number }> }
): SuggestedCategory[] {
  const tokenStemSet = new Set(docTokens.map((t) => stemWord(t.replace(/-/g, ''))));
  const varStemSet = new Set(varTokens.map((t) => stemWord(t.replace(/-/g, ''))));
  const rawTokenJoin = docTokens.join(' ');

  // 1. Score every existing category in the active tab
  const existingScored: SuggestedCategory[] = [];
  for (const cat of categories) {
    if (cat.id === template.categoryId) continue;

    let score = 0;
    const catKey = normalizeComparisonKey(cat.name);
    const catWords = cat.name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

    // Direct match on whole compound category name (e.g. "Follow-Ups" <-> "followup")
    if (catKey.length >= 4 && (tokenStemSet.has(catKey) || varStemSet.has(catKey))) {
      score += 3.6;
    }

    // Direct match between template tokens and individual category name words
    for (const cw of catWords) {
      const stem = stemWord(cw);
      if (tokenStemSet.has(stem)) score += 2.4;
      if (varStemSet.has(stem)) score += 1.4;
      if (rawTokenJoin.includes(cw)) score += 0.6;
    }

    // Domain rule bridge: if category name matches a top domain rule
    for (const dm of domainMatches.slice(0, 2)) {
      const ruleKey = normalizeComparisonKey(dm.rule.categoryName);
      const ruleTokens = dm.rule.categoryName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3);
      const overlapsRule =
        catKey === ruleKey ||
        ruleTokens.some((rt) =>
          catWords.some((cw) => stemWord(cw) === stemWord(rt))
        );
      if (overlapsRule) {
        score += Math.min(dm.score * 0.85, 5.2);
      }
    }

    // Peer-template similarity in this category (top 2 peers)
    const peersInCat = peerSimilarities
      .filter((p) => p.peer.categoryId === cat.id && p.similarity > 0.05)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 2);

    for (const p of peersInCat) {
      score += p.similarity * 5.0;
    }

    if (score >= 0.9) {
      existingScored.push({
        kind: 'existing',
        id: cat.id,
        name: cat.name,
        score,
      });
    }
  }

  existingScored.sort((a, b) => b.score - a.score);

  // Helper to check if a proposed new category name overlaps with any existing tab category
  const overlapsExistingCategory = (candidateName: string): boolean => {
    const candKey = normalizeComparisonKey(candidateName);
    const candStems = new Set(
      candidateName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
        .map((w) => stemWord(w))
    );

    return categories.some((cat) => {
      if (normalizeComparisonKey(cat.name) === candKey) return true;
      const catStems = cat.name
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
        .map((w) => stemWord(w));
      return catStems.some((s) => candStems.has(s));
    });
  };

  // 2. Determine optional clean "+ New" category candidate
  const topExistingScore = existingScored[0]?.score ?? 0;
  let newCategoryCandidate: SuggestedCategory | null = null;
  for (const dm of domainMatches) {
    if (dm.distinctHits < 2) continue;
    if (!overlapsExistingCategory(dm.rule.categoryName)) {
      newCategoryCandidate = {
        kind: 'new',
        name: dm.rule.categoryName,
        score: dm.score,
      };
      break;
    }
  }

  // Fallback topic-derived new category when no existing category or domain rule matched strongly
  if (!newCategoryCandidate && topExistingScore < 2.2) {
    const topicSeed = topPhrases.bigrams[0]?.phrase || topPhrases.unigrams[0]?.word;
    if (topicSeed) {
      const candidateName = toSmartTitleCase(topicSeed);
      if (
        candidateName.length >= 4 &&
        candidateName.length <= 28 &&
        !overlapsExistingCategory(candidateName)
      ) {
        newCategoryCandidate = {
          kind: 'new',
          name: candidateName,
          score: 1.5,
        };
      }
    }
  }

  const results: SuggestedCategory[] = [];
  // Prioritize up to 2 existing categories first
  results.push(...existingScored.slice(0, 2));

  // Include 1 distinct new category when no strong existing match exists OR when the new domain
  // is a genuinely strong multi-signal match comparable to the top existing category
  if (newCategoryCandidate) {
    if (
      topExistingScore < 3.5 ||
      newCategoryCandidate.score >= Math.max(4.5, topExistingScore * 0.75)
    ) {
      results.push(newCategoryCandidate);
    }
  }

  return results.slice(0, 3);
}

function formatTagSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function suggestTags(
  template: Pick<SnippetTemplate, 'tags' | 'content' | 'title'>,
  availableTags: string[],
  peerSimilarities: Array<{ peer: SnippetTemplate; similarity: number }>,
  docTokens: string[],
  varTokens: string[],
  domainMatches: Array<{ rule: DomainRule; score: number }>,
  topPhrases: { unigrams: Array<{ word: string; score: number }>; bigrams: Array<{ phrase: string; score: number }> }
): SuggestedTag[] {
  const alreadyOnTemplateKeys = new Set(
    template.tags.map((t) => normalizeComparisonKey(t))
  );

  // Map normalized keys to canonical existing tab tags (preserving tab's exact spelling)
  const existingTagByKey = new Map<string, string>();
  const existingTagRank = new Map<string, number>();
  availableTags.forEach((rawTag, idx) => {
    const clean = rawTag.trim().toLowerCase().replace(/^#+/, '');
    if (!clean) return;
    const key = normalizeComparisonKey(clean);
    if (!existingTagByKey.has(key)) {
      existingTagByKey.set(key, clean);
      existingTagRank.set(clean, idx);
    }
  });

  const docStemSet = new Set(docTokens.map((t) => stemWord(t.replace(/-/g, ''))));
  const varStemSet = new Set(varTokens.map((t) => stemWord(t.replace(/-/g, ''))));
  const lowerContent = `${template.title}\n${template.content}`.toLowerCase();

  // 1. Score existing tab tags
  const existingTagScores = new Map<string, number>();

  for (const existingTag of existingTagByKey.values()) {
    const key = normalizeComparisonKey(existingTag);
    if (alreadyOnTemplateKeys.has(key)) continue;

    let score = 0;
    const tagParts = existingTag.split(/[^a-z0-9]+/).filter((p) => p.length >= 2);
    if (tagParts.length === 0) continue;

    // Exact or stem match in content / variable names
    const allPartsMatched = tagParts.every((p) => {
      const stem = stemWord(p);
      return docStemSet.has(stem) || varStemSet.has(stem) || lowerContent.includes(p);
    });
    if (allPartsMatched) {
      score += 3.2;
    } else if (tagParts.some((p) => p.length >= 4 && docStemSet.has(stemWord(p)))) {
      score += 1.2;
    }

    // Domain rule boost if this existing tag is one of the matched domain's canonical tags
    for (const dm of domainMatches.slice(0, 2)) {
      if (dm.rule.defaultTags.some((dt) => normalizeComparisonKey(dt) === key)) {
        score += 1.6;
      }
    }

    if (score > 0) {
      existingTagScores.set(existingTag, score);
    }
  }

  // Co-occurrence from similar peer templates in active tab
  for (const { peer, similarity } of peerSimilarities) {
    if (similarity < 0.08) continue;
    for (const rawPeerTag of peer.tags) {
      const tag = rawPeerTag.trim().toLowerCase().replace(/^#+/, '');
      if (!tag) continue;
      const key = normalizeComparisonKey(tag);
      if (alreadyOnTemplateKeys.has(key)) continue;
      const canonical = existingTagByKey.get(key) || tag;
      const prev = existingTagScores.get(canonical) || 0;
      existingTagScores.set(canonical, prev + similarity * 4.2);
    }
  }

  const rankedExisting: SuggestedTag[] = Array.from(existingTagScores.entries())
    .filter(([, score]) => score >= 0.48)
    .sort((a, b) => {
      if (Math.abs(b[1] - a[1]) > 0.05) return b[1] - a[1];
      return (existingTagRank.get(a[0]) ?? 999) - (existingTagRank.get(b[0]) ?? 999);
    })
    .map(([tag, score]) => ({ kind: 'existing', tag, score }));

  // 2. Score new (non-existing) tag candidates
  const newTagScores = new Map<string, number>();

  const addNewCandidate = (rawTag: string, score: number) => {
    const slug = formatTagSlug(rawTag);
    if (!slug || slug.length < 3 || slug.length > 24) return;
    if (STOP_WORDS.has(slug) || GENERIC_TAG_WORDS.has(slug)) return;
    const key = normalizeComparisonKey(slug);
    if (!key || alreadyOnTemplateKeys.has(key)) return;

    // Never propose a "new" tag if a normalized equivalent already exists in the active tab —
    // promote the existing tab tag instead!
    const existingMatch = existingTagByKey.get(key);
    if (existingMatch) {
      const alreadyRanked = rankedExisting.find((item) => item.tag === existingMatch);
      if (!alreadyRanked) {
        rankedExisting.push({ kind: 'existing', tag: existingMatch, score });
      }
      return;
    }

    newTagScores.set(slug, Math.max(newTagScores.get(slug) || 0, score));
  };

  // Compound phrase triggers (e.g. "follow-up", "bug-report", "code-review")
  for (const { pattern, tag } of KNOWN_COMPOUND_TAGS) {
    if (pattern.test(lowerContent)) {
      addNewCandidate(tag, 3.0);
    }
  }

  // Domain-rule tags whose signal appeared in the draft
  for (const dm of domainMatches.slice(0, 2)) {
    for (const tag of dm.rule.defaultTags) {
      addNewCandidate(tag, 2.2 + Math.min(dm.score * 0.15, 1.0));
    }
  }

  // Distinctive TF-IDF unigrams
  for (const item of topPhrases.unigrams.slice(0, 10)) {
    addNewCandidate(item.word, 1.0 + Math.min(item.score * 2.5, 2.0));
  }

  // Distinctive bigrams (if clean 2-word concept)
  for (const item of topPhrases.bigrams.slice(0, 4)) {
    const slug = formatTagSlug(item.phrase);
    if (slug.length <= 20) {
      addNewCandidate(slug, 1.2 + Math.min(item.score * 0.8, 1.5));
    }
  }

  // Re-sort rankedExisting in case any existing tags were promoted above
  rankedExisting.sort((a, b) => b.score - a.score);

  const rankedNew: SuggestedTag[] = Array.from(newTagScores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tag, score]) => ({ kind: 'new', tag, score }));

  // Combine up to 6 tags: prioritize existing tab tags first (up to 4), then top up with new tags
  // Guarantee deduplication across normalized keys
  const finalTags: SuggestedTag[] = [];
  const usedKeys = new Set<string>(alreadyOnTemplateKeys);

  const pushUnique = (item: SuggestedTag) => {
    const key = normalizeComparisonKey(item.tag);
    if (usedKeys.has(key)) return;
    usedKeys.add(key);
    finalTags.push(item);
  };

  const maxExisting = rankedNew.length > 0 ? 4 : 6;
  for (const item of rankedExisting) {
    if (finalTags.length >= maxExisting) break;
    pushUnique(item);
  }

  for (const item of rankedNew) {
    if (finalTags.length >= 6) break;
    pushUnique(item);
  }

  // If fewer than 6 and more existing tags are available, fill remaining slots
  for (const item of rankedExisting) {
    if (finalTags.length >= 6) break;
    pushUnique(item);
  }

  return finalTags;
}

export function generateTemplateSuggestions(
  input: TemplateSuggestionInput
): TemplateSuggestionResult {
  const { template, categories, templatesInTab, availableTags } = input;

  const plainBody = stripMarkdownToPlain(template.content);
  const rawBodyWords = plainBody.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  const varTokens = extractVariableTokens(template.content);

  if (plainBody.length < 15 || rawBodyWords.length + varTokens.length < 3) {
    return {
      status: 'needs-more-content',
      titles: [],
      categories: [],
      tags: [],
    };
  }

  const peers = templatesInTab.filter((t) => t.id !== template.id);
  const docTokens = extractDocumentTokens(template.title, template.content);
  const peerTokenLists = peers.map((peer) => ({
    peer,
    tokens: extractDocumentTokens(peer.title, peer.content),
  }));

  // Build document frequency map across active tab + current draft
  const docFreq = new Map<string, number>();
  const allTokenDocs = [docTokens, ...peerTokenLists.map((p) => p.tokens)];
  for (const tokens of allTokenDocs) {
    const uniqueTerms = new Set(tokens.map((t) => stemWord(t.replace(/-/g, ''))));
    for (const term of uniqueTerms) {
      if (!term) continue;
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }
  }

  const totalDocs = allTokenDocs.length;
  const currentVec = buildTfIdfVector(docTokens, docFreq, totalDocs);

  const peerSimilarities = peerTokenLists.map(({ peer, tokens }) => ({
    peer,
    similarity: cosineSimilarity(
      currentVec,
      buildTfIdfVector(tokens, docFreq, totalDocs)
    ),
  }));

  const lowerAll = `${template.title}\n${template.content}`.toLowerCase();
  const domainMatches = scoreDomainRules(docTokens, varTokens, lowerAll);
  const topPhrases = extractTopPhrases(template.content, currentVec);

  const titles = generateTitleCandidates(
    template.content,
    template.title,
    domainMatches,
    topPhrases
  );

  const suggestedCategories = suggestCategories(
    template,
    categories,
    peerSimilarities,
    docTokens,
    varTokens,
    domainMatches,
    topPhrases
  );

  const suggestedTags = suggestTags(
    template,
    availableTags,
    peerSimilarities,
    docTokens,
    varTokens,
    domainMatches,
    topPhrases
  );

  return {
    status: 'ready',
    titles,
    categories: suggestedCategories,
    tags: suggestedTags,
  };
}
