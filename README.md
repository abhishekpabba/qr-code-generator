# QR Studio — production launch build

A customer-facing QR code and barcode website with an SEO content layer, elegant generator UI, static/dynamic QR modes, anonymous session isolation, scan analytics, bulk generation and Vercel production support.

## Recommended first deployment: Vercel

This project is an Express app. Current Vercel supports Express directly and automatically assigns a public `*.vercel.app` production URL.

### 1. Push this folder to GitHub

Create a repository and commit the whole `qr-suite` folder.

### 2. Import it into Vercel

In Vercel, create a project from the repository. No custom build command or output directory is needed for the Express app.

### 3. Add production data storage

Dynamic QR codes, analytics, saved codes and contact messages need persistent PostgreSQL storage. In Vercel Marketplace, connect a Postgres provider such as Neon to the project and expose its connection string as:

```text
DATABASE_URL=...
```

The application automatically creates its tables on first use.

### 4. Add a session secret

Required so anonymous customers only see their own saved QR codes:

```text
SESSION_SECRET=<a long random 32+ byte value>
```

Generate one locally with:

```bash
openssl rand -hex 32
```

### 5. Optional file uploads

For PDF/image/audio/video QR destinations, connect a **public Vercel Blob** store to the project. Modern Vercel Blob can authenticate with Vercel OIDC automatically. Legacy stores can expose `BLOB_READ_WRITE_TOKEN`.

### 6. Deploy

Deploy the project. Vercel will assign a URL similar to:

```text
https://your-project.vercel.app
```

Then set this environment variable to that stable production URL and redeploy:

```text
SITE_URL=https://your-project.vercel.app
```

This makes canonical URLs and the sitemap deterministic.

## Search Console / SEO setup

The launch build contains:

- Dedicated homepage targeting free QR generation
- Unique pages for URL, Wi‑Fi, vCard, email, SMS and WhatsApp QR codes
- QR-with-logo landing page
- Business-card QR page
- Restaurant-menu QR page
- Google-review QR page
- Bulk QR page
- Barcode generator page
- Static-vs-dynamic educational guide
- About, Contact, Privacy and Terms pages
- Unique titles and descriptions
- Canonical URLs
- Open Graph / Twitter metadata
- FAQ structured data where appropriate
- WebApplication / Article structured data
- Dynamic `robots.txt`
- Dynamic `sitemap.xml`
- Social preview image
- Semantic headings and internal links
- Lightweight shared CSS for content pages
- Generator workspace set to `noindex,follow` to avoid duplicate/thin indexing

### Google Search Console

Create a **URL-prefix property** for your Vercel production URL. If you choose HTML tag verification, add only the verification to:

```text
GSC_VERIFICATION=...
```

Redeploy, then verify. Submit:

```text
https://your-project.vercel.app/sitemap.xml
```

No site can guarantee first-page Google rankings. Search performance depends on competition, content quality, backlinks, user demand, crawl/indexing and time.

## Google Analytics

Optional. Add:

```text
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

The included consent layer loads optional analytics only after acceptance.

## AdSense readiness

The code includes reserved ad areas but does **not** activate ads before approval. That keeps the launch clean while you test traffic.

After AdSense gives you your identifiers, add:

```text
ADSENSE_CLIENT=ca-pub-0000000000000000
ADSENSE_PUBLISHER_ID=pub-0000000000000000
```

The server will then:

- add the AdSense account verification meta tag to indexable pages
- expose `/ads.txt` using the publisher ID
- allow the consent-aware loader to load AdSense

The privacy page already includes Google advertising-cookie disclosures. Before serving ads to users in regions where Google requires a certified consent-management platform, configure an appropriate Google-certified CMP / Privacy & Messaging solution in your AdSense account. The lightweight built-in preference banner should not be treated as a substitute where certified consent is required.

AdSense approval is controlled by Google and is not guaranteed.

## Important dynamic QR note before buying a domain

A dynamic QR code permanently encodes the redirect host it was created on. If you create customer dynamic codes using:

```text
https://your-project.vercel.app/r/abc123
```

and later move to `yourdomain.com`, those already-printed codes still point at the Vercel URL. Keep the Vercel project/URL alive indefinitely or avoid printing long-term dynamic codes until you have your permanent domain.

Static QR codes do not have this dependency because they encode their final content directly.

## Production safety included

- Security headers and CSP
- HTTPS/HSTS in production
- Request body limits
- Upload type and size checks
- API rate limiting
- Anonymous signed session isolation for saved codes
- IP hashing rather than intentionally storing raw scan IPs
- PostgreSQL persistence for serverless environments
- Vercel Blob support for uploads
- Health endpoint at `/api/health`
- 404 page
- Contact storage in PostgreSQL

## Local development

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

Without `DATABASE_URL`, local development falls back to files under `data/`. Production intentionally does not use local file persistence because serverless filesystems are not durable.

## Useful routes

```text
/                         SEO homepage
/app/                     Full generator workspace
/url-qr-code-generator/
/wifi-qr-code-generator/
/vcard-qr-code-generator/
/qr-code-with-logo/
/bulk-qr-code-generator/
/barcode-generator/
/static-vs-dynamic-qr-code/
/privacy/
/terms/
/contact/
/robots.txt
/sitemap.xml
/ads.txt
/api/health
```
