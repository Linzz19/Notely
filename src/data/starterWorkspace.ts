import { WorkspaceData } from '../types/workspace';

export function createStarterWorkspace(): WorkspaceData {
  const now = new Date().toISOString();

  return {
    version: 1,
    activeTabId: 'tab-support',
    activeCategoryId: 'all',
    activeTag: null,
    sortBy: 'updated',
    theme: 'light',
    themePreset: 'default',
    accentColor: 'default',
    tabs: [
      {
        id: 'tab-support',
        name: 'Customer Support',
        order: 0,
        createdAt: now,
      },
      {
        id: 'tab-outreach',
        name: 'Client Outreach',
        order: 1,
        createdAt: now,
      },
      {
        id: 'tab-docs',
        name: 'Engineering Docs',
        order: 2,
        createdAt: now,
      },
    ],
    categories: [
      // Customer Support categories
      { id: 'cat-onboarding', tabId: 'tab-support', name: 'Onboarding', order: 0 },
      { id: 'cat-troubleshooting', tabId: 'tab-support', name: 'Troubleshooting', order: 1 },
      { id: 'cat-billing', tabId: 'tab-support', name: 'Billing & Refunds', order: 2 },
      // Client Outreach categories
      { id: 'cat-followup', tabId: 'tab-outreach', name: 'Follow-Ups', order: 0 },
      { id: 'cat-proposals', tabId: 'tab-outreach', name: 'Proposals & Calls', order: 1 },
      // Engineering Docs categories
      { id: 'cat-releases', tabId: 'tab-docs', name: 'Release Notes', order: 0 },
      { id: 'cat-handoff', tabId: 'tab-docs', name: 'PR & Incident Handoff', order: 1 },
    ],
    templates: [
      {
        id: 'tpl-welcome-email',
        tabId: 'tab-support',
        categoryId: 'cat-onboarding',
        title: 'Enterprise Onboarding Welcome',
        tags: ['welcome', 'onboarding', 'email'],
        usageCount: 14,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: now,
        content: `Hi {{customer_name}},

Welcome to **{{workspace_name|Acme Cloud}}**! Your account is now provisioned and ready for your team.

### Next Steps to Get Started
1. Sign in via your [Admin Portal](https://portal.example.com) using your work email.
2. Invite team members under **Settings > Members**.
3. Review our [5-Minute Setup Checklist](https://docs.example.com/setup).

If you hit any snag during setup, reply directly to this email with your ticket reference **{{ticket_id|SUP-1024}}** and I will prioritize it.

Best regards,
**{{agent_name|Jordan Lee}}**
Customer Success Team`,
      },
      {
        id: 'tpl-bug-escalation',
        tabId: 'tab-support',
        categoryId: 'cat-troubleshooting',
        title: 'Escalation to Engineering Ack',
        tags: ['escalation', 'sla', 'bug'],
        usageCount: 9,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        content: `Hi {{customer_name}},

Thank you for sending over the reproduction steps and logs for **{{issue_summary}}**.

I have escalated this to our core engineering team under internal reference \`{{jira_key|ENG-412}}\`. Here is what to expect next:

- **Current Status:** Under active investigation
- **Next Update:** By **{{eta_time|4:00 PM EST}}** today
- **Workaround:** {{workaround|Temporarily clear local session cache and retry}}

We appreciate your patience while we trace the root cause.`,
      },
      {
        id: 'tpl-refund-approved',
        tabId: 'tab-support',
        categoryId: 'cat-billing',
        title: 'Refund Confirmation Notice',
        tags: ['refund', 'invoice', 'billing'],
        usageCount: 6,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        content: `Hello {{customer_name}},

I have processed a full refund of **{{refund_amount|$49.00}}** for invoice \`{{invoice_number}}\`.

- **Original Charge Date:** {{charge_date}}
- **Destination:** Original payment method
- **Expected Settlement:** 3–5 business days depending on your bank

Please let me know if you need a revised PDF receipt for your accounting records.

Warm regards,
{{agent_name|Jordan Lee}}`,
      },
      {
        id: 'tpl-meeting-recap',
        tabId: 'tab-outreach',
        categoryId: 'cat-followup',
        title: 'Post-Discovery Call Recap',
        tags: ['recap', 'discovery', 'follow-up'],
        usageCount: 11,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        content: `Hi {{client_name}},

Great speaking with you and the **{{company_name}}** team earlier today. Here is a quick summary of what we aligned on:

### Key Objectives
- Consolidate daily support responses into shared team templates
- Reduce average ticket turnaround by **{{target_metric|25%}}** this quarter

### Action Items
1. **Your Team:** Share sample export format by {{due_date|Friday}}
2. **Our Team:** Send sandbox credentials and security overview

Looking forward to our next check-in on **{{next_call_date}}**.`,
      },
      {
        id: 'tpl-proposal-send',
        tabId: 'tab-outreach',
        categoryId: 'cat-proposals',
        title: 'Proposal & Scope Delivery',
        tags: ['proposal', 'pricing', 'scope'],
        usageCount: 4,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        content: `Hi {{client_name}},

Attached is the tailored proposal for **{{project_name}}** covering Phase 1 delivery and milestone scheduling.

- **Estimated Timeline:** {{timeline|4 weeks}}
- **Kickoff Window:** {{kickoff_window|Next Monday}}

Feel free to review with your stakeholders and let me know if any scope adjustments are needed before we finalize.`,
      },
      {
        id: 'tpl-release-changelog',
        tabId: 'tab-docs',
        categoryId: 'cat-releases',
        title: 'Weekly Release Changelog Block',
        tags: ['changelog', 'release', 'docs'],
        usageCount: 8,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        content: `## Release {{version_tag|v2.4.0}} — {{release_date}}

### Highlights
- **Improved:** Clipboard export now preserves nested lists and code formatting across desktop clients.
- **Fixed:** Resolved search focus trap when switching project tabs via keyboard.

### Deployment Notes
\`\`\`bash
npm run build && npm run verify
\`\`\`

Contact **{{release_owner|Platform Ops}}** in \`#deployments\` for rollback procedures.`,
      },
      {
        id: 'tpl-incident-handoff',
        tabId: 'tab-docs',
        categoryId: 'cat-handoff',
        title: 'Shift Incident Handoff Summary',
        tags: ['incident', 'handoff', 'on-call'],
        usageCount: 5,
        createdAt: now,
        updatedAt: now,
        lastCopiedAt: null,
        content: `### Shift Handoff — {{service_name|Auth Gateway}}

> **Severity:** {{severity|SEV-2}} · **Lead:** {{oncall_engineer}}

- **Summary:** {{incident_summary|Elevated 502 latency observed on EU-West edge nodes}}
- **Mitigation Applied:** Scaled worker pool to 12 replicas and flushed stale DNS records
- **Remaining Watch Items:** Monitor p95 latency over the next 2 hours before closing the incident ticket.`,
      },
    ],
  };
}
