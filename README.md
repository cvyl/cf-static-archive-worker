# Website Archiver

A serverless website archiving solution built with Cloudflare Workers. This tool crawls and archives static websites, storing all assets (HTML, CSS, JS, images, etc.) in Cloudflare R2 storage.

## Features

- Archives entire websites including assets and internal pages
- Follows internal links and iframes
- Preserves directory structure
- Handles relative and absolute paths
- Configurable crawl depth
- Simple web interface for archiving and browsing snapshots
- REST API for programmatic access

## Usage

### Web Interface

Visit the root URL to access the web interface where you can:

- Submit websites for archiving
- Browse archived websites by domain
- View snapshots by date

### API

Archive a website:

```bash
curl -X POST https://your-worker.workers.dev/archive \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "archiveKey": "your-key-here"
  }'
```

### Access Archives

- List snapshots: `https://your-worker.workers.dev/example.com`
- View specific snapshot: `https://your-worker.workers.dev/example.com/YYYY-MM-DD/index.html`

## Limitations

- Only works with static websites (HTML, CSS, JS)
- Cannot archive dynamic content (PHP, server-side rendering)
- Does not bypass security measures like:
  - Cloudflare bot protection
  - CAPTCHA
  - IP-based blocking
- Limited by Cloudflare Workers execution time and memory limits
- External resources (CDN, APIs) remain linked to original sources

## Configuration

Key settings:

- `maxDepth`: Maximum crawl depth for internal links (default: 5)
- `ARCHIVER_KEY`: Authentication key for the API
- `STATIC_URL`: Base URL for archived content
- Worker and R2 bucket configuration in `wrangler.toml`

## Setup

1. Clone the repository
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Configure your `wrangler.toml`:

   ```toml
   name = "website-archiver"
   workers_dev = true

   [vars]
   ARCHIVER_KEY = "your-secret-key"
   STATIC_URL = "https://your-domain.com"

   [[r2_buckets]]
   binding = "ARCHIVE_BUCKET"
   bucket_name = "your-bucket-name"
   preview_bucket_name = "your-bucket-name-preview"
   ```

4. Deploy:

   ```bash
   pnpm run deploy
   ```

## License

MIT
