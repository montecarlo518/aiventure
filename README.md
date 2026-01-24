# Aiventure - Cloudflare Pages Deployment Guide

## 📁 Project Structure

```
aiventure-site/
├── index.html              # Homepage
├── _headers                # Cloudflare caching & security headers
├── _redirects              # URL redirects
├── robots.txt              # SEO robots file
├── sitemap.xml             # SEO sitemap
├── wrangler.toml           # Cloudflare Worker configuration
├── assets/
│   ├── styles.css          # Shared CSS styles
│   ├── tools-data.js       # Tools database (JavaScript)
│   └── favicon.svg         # Site favicon
├── pages/
│   ├── all-tools.html      # All tools directory
│   ├── categories.html     # Browse by category
│   ├── new-additions.html  # Newly added tools
│   ├── top-rated.html      # Highest rated tools
│   ├── blog.html           # Blog listing
│   ├── guides.html         # Guides listing
│   ├── about.html          # About page
│   ├── contact.html        # Contact form
│   ├── submit.html         # Submit tool form
│   ├── advertise.html      # Advertising info
│   ├── newsletter.html     # Newsletter signup
│   └── api.html            # API documentation
├── guides/                 # Guide articles (add as needed)
└── functions/
    └── _worker.js          # Cloudflare Worker (API endpoints)
```

## 🚀 Deployment Steps

### Option A: Cloudflare Pages (Recommended - Static Site)

1. **Create Cloudflare Account**
   - Go to https://dash.cloudflare.com
   - Sign up or log in

2. **Connect to Git**
   - Push this folder to GitHub/GitLab
   - In Cloudflare Dashboard → Pages → Create a project
   - Connect your Git repository

3. **Configure Build**
   - Build command: (leave empty - static site)
   - Build output directory: `/`
   - Root directory: `/aiventure-site`

4. **Deploy**
   - Click "Save and Deploy"
   - Your site will be live at `your-project.pages.dev`

5. **Add Custom Domain**
   - Go to your project → Custom domains
   - Add `www.aiventure.me` and `aiventure.me`
   - Update nameservers at your registrar

### Option B: Cloudflare Pages with Functions (API Support)

1. Follow steps 1-3 above

2. **Enable Functions**
   - The `/functions/_worker.js` file will automatically become your API
   - API endpoints will be available at `/api/*`

3. **Add KV Storage (Optional)**
   ```bash
   # Install Wrangler CLI
   npm install -g wrangler
   
   # Login to Cloudflare
   wrangler login
   
   # Create KV namespaces
   wrangler kv:namespace create "NEWSLETTER_KV"
   wrangler kv:namespace create "CACHE_KV"
   ```

4. **Update wrangler.toml** with your namespace IDs

### Option C: Manual Upload

1. Go to Cloudflare Dashboard → Pages
2. Create a project → Upload assets
3. Drag and drop the entire `aiventure-site` folder
4. Deploy

## ⚙️ Configuration

### Environment Variables

Set these in Cloudflare Dashboard → Pages → Settings → Environment variables:

| Variable | Description |
|----------|-------------|
| `SITE_URL` | https://www.aiventure.me |
| `ENVIRONMENT` | production |

### DNS Settings

Add these records in Cloudflare DNS:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | www | your-project.pages.dev | ✅ |
| CNAME | @ | your-project.pages.dev | ✅ |

### SSL/TLS

- Go to SSL/TLS → Overview
- Set encryption mode to "Full (strict)"

## 📊 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tools` | GET | List all tools (with filters) |
| `/api/tools/:id` | GET | Get single tool |
| `/api/categories` | GET | List categories |
| `/api/stats` | GET | Get directory stats |
| `/api/newsletter` | POST | Subscribe to newsletter |
| `/api/contact` | POST | Submit contact form |
| `/api/submit-tool` | POST | Submit new tool |
| `/api/advertise` | POST | Advertising inquiry |

### Query Parameters for `/api/tools`

- `category` - Filter by category
- `pricing` - Filter by pricing (free, freemium, paid)
- `featured` - Only featured tools (true/false)
- `new` - Only new tools (true/false)
- `search` - Search query
- `sort` - Sort by (rating, reviews, name, newest, popular)
- `limit` - Limit results (default: 50)

## 🔧 Local Development

```bash
# Install Wrangler
npm install -g wrangler

# Run local dev server
wrangler pages dev . --port 8787

# Or use any static server
npx serve .
```

## 📝 Adding New Tools

Edit `/assets/tools-data.js` and add a new object to the `tools` array:

```javascript
{
    id: 18,
    name: "New Tool Name",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "Description here...",
    features: ["Feature 1", "Feature 2", "Feature 3"],
    rating: 4.5,
    reviews: 100,
    pricing: "freemium",
    priceLabel: "Free / $10/mo",
    icon: "🆕",
    color: "arctic",  // arctic, teal, or frost
    travelStyle: ["Budget", "Solo"],
    url: "https://newtool.com",
    featured: false,
    new: true
}
```

## 🔐 Security Headers

The `_headers` file configures:

- Content Security Policy
- X-Frame-Options (clickjacking protection)
- X-Content-Type-Options
- Referrer-Policy
- Permissions-Policy

## 📈 Analytics

To add analytics:

1. **Cloudflare Web Analytics** (Privacy-friendly)
   - Dashboard → Analytics → Web Analytics
   - Add your site
   - Copy the script to your HTML

2. **Google Analytics** (Optional)
   - Add GA4 script to all HTML files

## 🐛 Troubleshooting

### Site not updating?
- Clear Cloudflare cache: Dashboard → Caching → Purge Everything
- Check deployment logs in Pages

### API not working?
- Ensure `/functions/_worker.js` exists
- Check Functions logs in Pages dashboard

### Custom domain not working?
- Verify DNS propagation: https://dnschecker.org
- Ensure SSL certificate is active

## 📞 Support

- Cloudflare Community: https://community.cloudflare.com
- Pages Docs: https://developers.cloudflare.com/pages
- Workers Docs: https://developers.cloudflare.com/workers

---

Built with ❤️ for travelers who love AI
