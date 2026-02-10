# NHS Login + OpenClaw AI Health Monitoring: Feasibility Analysis

## Concept

Use NHS Login (OIDC) for authentication combined with OpenClaw (open-source AI agent) to create a persistent AI that monitors and provides insights on a user's NHS health data.

## Architecture Overview

```
User
  │
  ├── NHS Login (OIDC, P9 verification)
  │     └── Access: GP records, prescriptions, appointments, SCR
  │
  └── OpenClaw (local AI agent)
        ├── Persistent memory across sessions
        ├── Wearable data (WHOOP, Apple Watch)
        ├── NHS clinical data (via NHS APIs)
        └── Personalised health insights
```

## What Works in Theory

- NHS Login is standard OIDC — any app can integrate it
- P9 verification grants access to medical records, prescriptions, appointments
- OpenClaw runs locally, so data could stay on-device
- OpenClaw already pulls wearable health data (WHOOP, Apple Watch)
- Combining clinical + wearable data is a genuinely useful proposition

## What Doesn't Work

### 1. NHS Onboarding Blocks Unapproved Apps

NHS Login requires formal application approval before going live. OpenClaw is a general-purpose agent framework, not an approved NHS partner service. NHS would need to approve the specific integration, which is unlikely given OpenClaw's security profile.

### 2. Token Lifecycle vs. Autonomous Agent Model

NHS Login issues short-lived OIDC tokens with session-based access. OpenClaw runs autonomously 24/7. Clinical APIs require re-authentication, not persistent autonomous polling. An always-on agent holding refresh tokens to medical records contradicts NHS's security model.

### 3. OpenClaw Security Is Incompatible with Health Data

Documented security issues (Cisco, CrowdStrike, Trend Micro, Bitsight):

- Credentials stored in plaintext by default
- No authentication enforced on the agent by default
- 26% of ClawHub skills contain vulnerabilities (Cisco)
- 341 malicious skills identified on ClawHub (Koi Security)
- Prompt injection can redirect agent actions silently
- Agent-to-agent communication creates unaddressed attack surfaces

### 4. UK GDPR Special Category Data Compliance

NHS health data is special category data under UK GDPR Article 9. Problems:

- Persistent local memory storage of health data
- Cloud LLM calls (Claude API, OpenAI) for inference = data leaving device
- Unvetted plugin/skills ecosystem with access to health context
- No data processing agreements or consent frameworks in place

### 5. Autonomous Initiative vs. Clinical Safety

OpenClaw optimises for initiative (taking action). Healthcare requires constraint, verification, and escalation. An agent that autonomously acts on health data:

- Could be clinically wrong (correlation ≠ causation)
- Creates liability ambiguity
- May cause harm through misinterpretation
- Lacks audit trail required for clinical decisions

### 6. NHS API Ecosystem Requirements

NHS APIs (GP Connect, IM1) are built for approved clinical systems, not arbitrary agents:

- Requires IM1 PFS API connection (NHS approval needed)
- GP surgery linkage keys required
- Must comply with DCB0129 clinical safety standards
- Must pass Information Governance assessment

## Viable Alternative Architecture

A realistic version would require:

- Purpose-built, NHS-approved application (not a general agent)
- Structured, bounded AI for insights (not autonomous)
- On-device or NHS-approved infrastructure for data processing
- Mandatory human-in-the-loop for actions and recommendations
- DCB0129/DCB0160 clinical safety certification
- Formal Information Governance approval
- Explicit data processing agreements for any cloud AI inference

## References

- [NHS Login Developer Docs](https://nhsconnect.github.io/nhslogin/)
- [NHS Login Scopes and Claims](https://nhsconnect.github.io/nhslogin/scopes-and-claims/)
- [NHS Developer & Integration Hub](https://digital.nhs.uk/developer)
- [OpenClaw](https://open-claw.org/)
- [Cisco: Personal AI Agents Like OpenClaw Are a Security Nightmare](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare)
- [Trend Micro: What OpenClaw Reveals About Agentic Assistants](https://www.trendmicro.com/en_us/research/26/b/what-openclaw-reveals-about-agentic-assistants.html)
- [CrowdStrike: What Security Teams Need to Know About OpenClaw](https://www.crowdstrike.com/en-us/blog/what-security-teams-need-to-know-about-openclaw-ai-super-agent/)
- [Bitsight: OpenClaw Security Risks](https://www.bitsight.com/blog/openclaw-ai-security-risks-exposed-instances)
