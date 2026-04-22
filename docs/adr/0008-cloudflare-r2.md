# ADR-0008: Cloudflare R2 for object storage

- Status: Accepted
- Date: 2026-04-22
- Tags: storage, cost

## Context

Attachments (Boardly) and document originals (Knowlex) need an S3-compatible store. Egress fees dominate storage TCO for public assets.

## Decision

Use Cloudflare R2. Presigned PUT URLs move the upload off the Node process; presigned GET URLs stream downloads directly to the browser.

## Consequences

Positive:

- Free tier covers 10GB with zero egress cost
- S3-compatible SDK keeps code portable to AWS later
- Presigned flow keeps server bandwidth flat

Negative:

- Fewer advanced features (no Object Lambda)
- Storage-class options are less granular than S3

## Alternatives

- AWS S3: rejected — egress cost at scale
- Supabase Storage: rejected — smaller free tier
- Backblaze B2: rejected — CDN integration friction
