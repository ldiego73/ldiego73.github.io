# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro (static output) + Three.js for key 3D scenes, Bun as package manager and script runner, deployed to GitHub Pages via GitHub Actions (official `actions/deploy-pages` flow, no separate deploy branch). Replaces the Gatsby 4 site. Default branch will move to `main` (user does this manually). Domain stays `ldiego73.github.io` (no custom domain).

## Users

Two primary audiences, weighted equally:

- **Consulting clients:** CTOs, founders, and tech leaders looking for help with architecture, cloud/platform, DevSecOps, FinOps, API platforms, and AI adoption in the SDLC. They want evidence of judgment at scale and a fast way to start a conversation.
- **Recruiters and hiring companies:** evaluating for Engineering Manager, Tech Manager, Principal Architect, or Infra Lead roles. They want the career arc, scope of leadership, impact, and the resume.

Secondary: the tech community reading the blog.

## Product Purpose

Personal site of Luis Diego (ldiego73) that tells the story of 15+ years in technology as a narrative, from developer and mobile architect to engineering leadership, cloud infrastructure, and AI. Success: a visitor understands the arc and the scale of impact within one scroll, and either contacts for consulting or downloads the resume.

## Positioning

A practitioner who has both led organizations (multiple teams, Tech Leads, Product alignment) and still ships the infrastructure himself (Kubernetes multi-region, Kong, Terraform/Pulumi, GitOps, observability). Combines architecture governance, platform engineering, and an AI/Data Science master's degree.

## Capabilities and Constraints

- Bilingual: Spanish and English (Spanish is the resume's source language).
- Dark mode required (with light mode).
- Responsive on mobile and desktop.
- Three.js used for key scenes (hero and chapter transitions); content stays in accessible HTML for SEO and readability.
- Sections: storytelling career timeline, case studies, GitHub projects, AI experience, blog, mini-games (Snake, Pac-Man-style, etc.), resume download, contact.
- Blog: native Astro MDX posts (bilingual) plus Medium posts pulled via RSS at build time.
- Projects: curated case studies drawn from real experience plus featured public GitHub repos.
- Contact: contact form (incumbent uses Getform + reCAPTCHA), email, Calendly booking (https://calendly.com/ldiego73/60-minute-meeting), and social links: GitHub, LinkedIn, Medium, email. Instagram and Twitter/X are dropped; the user may add others later, so links live in one data file.
- Resume: Spanish PDF exists; English version to be translated from it.

## Evidence on Hand

- `Resume.pdf`: full career history (Globant, TopSort, Xepelin, Auna, Belcorp), education (Master in Big Data, Data Science & AI, Universidad Complutense 2023-2024), AWS certifications (Solutions Architect Professional, Developer Associate).
- Quantified claims from the resume: 30-40% infrastructure cost reduction (TopSort), 50+ cross-domain integrations (Globant INSIS), 99.9% SLA (Auna Kong Gateway).
- `src/images/profile.jpeg`: profile photo.
- `static/locales/{es,en}/*.json`: existing bilingual experience, skills, and education data.
- `docs/*.md`: two short architecture notes (candidate seed blog posts).
- Social: GitHub ldiego73, LinkedIn pe.linkedin.com/in/ldiego73, Medium @ldiego73 (RSS: https://medium.com/feed/@ldiego73), email lfdiego7@gmail.com, Calendly https://calendly.com/ldiego73/60-minute-meeting.
- Absent: client testimonials, logos permission, case study screenshots, English resume. Do not fabricate these.

## Product Principles

1. Story over list: the career is told as chapters with stakes and outcomes, not a skills dump.
2. Prove with numbers and systems, never with adjectives.
3. Every 3D moment must earn its weight; content works without WebGL.
4. Both audiences reach their action (contact or resume) from anywhere in two clicks.
5. Playful where it is optional (games), precise where it is evaluated (experience).

## Accessibility & Inclusion

WCAG 2.2 AA. Respect `prefers-reduced-motion` (3D scenes degrade to static), keyboard-playable games, full content available without JavaScript/WebGL.
