// Aiventure - Cloudflare Worker with Notion Integration & PayPal Verification
// Fetches tools & blog posts directly from your Notion databases

// ============================================
// CONFIGURATION - Set these as Environment Variables in Cloudflare
// ============================================
// NOTION_API_KEY - Get from https://www.notion.so/my-integrations
// TOOLS_DATABASE_ID - Your AI Travel Tools Directory
// SUBMISSIONS_DATABASE_ID - Database for paid tool submissions
// ADVERTISING_DATABASE_ID - Database for advertising inquiries
// BLOG_DATABASE_ID - Database for blog posts
// PAYPAL_CLIENT_ID - Your PayPal Client ID
// PAYPAL_CLIENT_SECRET - Your PayPal Client Secret
// PAYPAL_MODE - 'sandbox' or 'live'

const CACHE_TTL = 300; // 5 minutes
const SUBMISSION_FEE = '49.00';
const SUBMISSION_CURRENCY = 'USD';

// ============================================
// PAYPAL API HELPER
// ============================================
async function getPayPalAccessToken(env) {
  const mode = env.PAYPAL_MODE || 'sandbox';
  const baseUrl = mode === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';
  
  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`);
  
  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  
  const data = await response.json();
  
  if (!response.ok || !data.access_token) {
    throw new Error('Failed to get PayPal access token');
  }
  
  return data.access_token;
}

async function verifyPayPalOrder(orderID, env) {
  const mode = env.PAYPAL_MODE || 'sandbox';
  const baseUrl = mode === 'live' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';
  
  const accessToken = await getPayPalAccessToken(env);
  
  const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderID}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch PayPal order details');
  }
  
  const order = await response.json();
  
  // Verify order status
  if (order.status !== 'COMPLETED') {
    return { valid: false, error: `Order status is ${order.status}, expected COMPLETED` };
  }
  
  // Verify payment details
  const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
  if (!capture) {
    return { valid: false, error: 'No payment capture found' };
  }
  
  const amount = capture.amount;
  
  // Verify currency
  if (amount.currency_code !== SUBMISSION_CURRENCY) {
    return { valid: false, error: `Invalid currency: ${amount.currency_code}, expected ${SUBMISSION_CURRENCY}` };
  }
  
  // Verify amount (exact match)
  if (amount.value !== SUBMISSION_FEE) {
    return { valid: false, error: `Invalid amount: ${amount.value}, expected ${SUBMISSION_FEE}` };
  }
  
  return { 
    valid: true, 
    order,
    payerEmail: order.payer?.email_address,
    captureId: capture.id,
  };
}

// ============================================
// NOTION API HELPER
// ============================================
async function notionRequest(endpoint, apiKey, method = 'POST', body = null) {
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  };
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`https://api.notion.com/v1${endpoint}`, options);
  return response.json();
}

// ============================================
// CREATE SUBMISSION IN NOTION
// ============================================
async function createSubmissionInNotion(formData, paymentInfo, env) {
  const apiKey = env.NOTION_API_KEY;
  const dbId = env.SUBMISSIONS_DATABASE_ID;
  
  if (!apiKey || !dbId) {
    console.log('Notion not configured for submissions, skipping...');
    return { success: true, notionConfigured: false };
  }
  
  const properties = {
    'Name': {
      title: [{ text: { content: formData.toolName } }]
    },
    'Website URL': {
      url: formData.toolUrl
    },
    'Category': {
      select: { name: formData.category }
    },
    'Description': {
      rich_text: [{ text: { content: formData.description || '' } }]
    },
    'Pricing': {
      select: { name: formData.pricing }
    },
    'Price Text': {
      rich_text: [{ text: { content: formData.priceText || '' } }]
    },
    'Contact Email': {
      email: formData.contactEmail
    },
    'PayPal Order ID': {
      rich_text: [{ text: { content: paymentInfo.orderID } }]
    },
    'PayPal Capture ID': {
      rich_text: [{ text: { content: paymentInfo.captureId || '' } }]
    },
    'Payment Amount': {
      number: parseFloat(SUBMISSION_FEE)
    },
    'Status': {
      select: { name: 'Pending Review' }
    },
  };
  
  // Add features if provided
  if (formData.features) {
    const featureList = formData.features.split(',').map(f => f.trim()).filter(Boolean);
    if (featureList.length > 0) {
      properties['Features'] = {
        multi_select: featureList.map(name => ({ name }))
      };
    }
  }
  
  const result = await notionRequest('/pages', apiKey, 'POST', {
    parent: { database_id: dbId },
    properties
  });
  
  if (result.object === 'error') {
    throw new Error(result.message || 'Failed to create Notion page');
  }
  
  return { success: true, notionPageId: result.id };
}

// ============================================
// CREATE ADVERTISING INQUIRY IN NOTION
// ============================================
async function createAdvertisingInquiryInNotion(formData, env) {
  const apiKey = env.NOTION_API_KEY;
  const dbId = env.ADVERTISING_DATABASE_ID;
  
  if (!apiKey || !dbId) {
    console.log('Notion not configured for advertising inquiries, skipping...');
    return { success: true, notionConfigured: false };
  }
  
  const properties = {
    'Name': {
      title: [{ text: { content: formData.companyName } }]
    },
    'Contact Email': {
      email: formData.contactEmail
    },
    'Website URL': {
      url: formData.websiteUrl || null
    },
    'Package': {
      select: { name: formData.package || 'Not specified' }
    },
    'Budget': {
      rich_text: [{ text: { content: formData.budget || '' } }]
    },
    'Message': {
      rich_text: [{ text: { content: formData.message || '' } }]
    },
    'Status': {
      select: { name: 'New' }
    },
  };
  
  const result = await notionRequest('/pages', apiKey, 'POST', {
    parent: { database_id: dbId },
    properties
  });
  
  if (result.object === 'error') {
    throw new Error(result.message || 'Failed to create Notion page');
  }
  
  return { success: true, notionPageId: result.id };
}

// ============================================
// TRANSFORM NOTION PAGE TO BLOG POST
// ============================================
function transformNotionBlogPost(page) {
  const props = page.properties;
  const title = props.Title?.title?.[0]?.plain_text || props.Name?.title?.[0]?.plain_text || 'Untitled';
  const slug = props.Slug?.rich_text?.[0]?.plain_text || 
               title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  
  // Get cover image URL
  let coverImage = null;
  if (page.cover) {
    if (page.cover.type === 'external') {
      coverImage = page.cover.external.url;
    } else if (page.cover.type === 'file') {
      coverImage = page.cover.file.url;
    }
  }
  
  return {
    id: page.id,
    title,
    slug,
    excerpt: props.Excerpt?.rich_text?.[0]?.plain_text || '',
    category: props.Category?.select?.name || 'General',
    tags: props.Tags?.multi_select?.map(t => t.name) || [],
    author: props.Author?.rich_text?.[0]?.plain_text || 'Aiventure Team',
    publishedAt: props['Published Date']?.date?.start || page.created_time,
    readTime: props['Read Time']?.number || 5,
    featured: props.Featured?.checkbox || false,
    coverImage: coverImage,
    url: `/blog/${slug}`,
  };
}

// ============================================
// FETCH BLOG POSTS FROM NOTION
// ============================================
async function fetchBlogPosts(env, filters = {}) {
  const apiKey = env.NOTION_API_KEY;
  const dbId = env.BLOG_DATABASE_ID;
  
  if (!apiKey || !dbId) {
    throw new Error('Blog database not configured');
  }
  
  const limit = filters.limit ? parseInt(filters.limit, 10) : 50;
  const queryBody = { page_size: Math.min(limit, 100) };
  
  // Only show published posts
  const conditions = [
    { property: 'Published', checkbox: { equals: true } }
  ];
  
  if (filters.featured === 'true') {
    conditions.push({ property: 'Featured', checkbox: { equals: true } });
  }
  
  if (filters.category) {
    conditions.push({ property: 'Category', select: { equals: filters.category } });
  }
  
  queryBody.filter = conditions.length === 1 ? conditions[0] : { and: conditions };
  
  // Sort by published date descending
  queryBody.sorts = [{ property: 'Published Date', direction: 'descending' }];
  
  const data = await notionRequest(`/databases/${dbId}/query`, apiKey, 'POST', queryBody);
  
  if (data.object === 'error') {
    throw new Error(data.message || 'Failed to fetch blog posts');
  }
  
  return data.results.map(transformNotionBlogPost);
}

// ============================================
// FETCH SINGLE BLOG POST BY SLUG
// ============================================
async function fetchBlogPostBySlug(slug, env) {
  const apiKey = env.NOTION_API_KEY;
  const dbId = env.BLOG_DATABASE_ID;
  
  if (!apiKey || !dbId) {
    throw new Error('Blog database not configured');
  }
  
  const queryBody = {
    filter: {
      and: [
        { property: 'Slug', rich_text: { equals: slug } },
        { property: 'Published', checkbox: { equals: true } }
      ]
    },
    page_size: 1
  };
  
  const data = await notionRequest(`/databases/${dbId}/query`, apiKey, 'POST', queryBody);
  
  if (data.object === 'error') {
    throw new Error(data.message || 'Failed to fetch blog post');
  }
  
  if (data.results.length === 0) {
    return null;
  }
  
  return transformNotionBlogPost(data.results[0]);
}

// ============================================
// FETCH BLOG POST CONTENT (BLOCKS)
// ============================================
async function fetchBlogPostContent(pageId, env) {
  const apiKey = env.NOTION_API_KEY;
  
  const data = await notionRequest(`/blocks/${pageId}/children?page_size=100`, apiKey, 'GET');
  
  if (data.object === 'error') {
    throw new Error(data.message || 'Failed to fetch blog content');
  }
  
  return blocksToHtml(data.results);
}

// ============================================
// CONVERT NOTION BLOCKS TO HTML
// ============================================
function blocksToHtml(blocks) {
  return blocks.map(block => {
    const type = block.type;
    const content = block[type];
    
    switch (type) {
      case 'paragraph':
        const pText = richTextToHtml(content.rich_text);
        return pText ? `<p>${pText}</p>` : '';
        
      case 'heading_1':
        return `<h1>${richTextToHtml(content.rich_text)}</h1>`;
        
      case 'heading_2':
        return `<h2>${richTextToHtml(content.rich_text)}</h2>`;
        
      case 'heading_3':
        return `<h3>${richTextToHtml(content.rich_text)}</h3>`;
        
      case 'bulleted_list_item':
        return `<li>${richTextToHtml(content.rich_text)}</li>`;
        
      case 'numbered_list_item':
        return `<li>${richTextToHtml(content.rich_text)}</li>`;
        
      case 'quote':
        return `<blockquote>${richTextToHtml(content.rich_text)}</blockquote>`;
        
      case 'code':
        return `<pre><code class="language-${content.language || 'text'}">${escapeHtml(content.rich_text.map(t => t.plain_text).join(''))}</code></pre>`;
        
      case 'divider':
        return '<hr>';
        
      case 'image':
        const imgUrl = content.type === 'external' ? content.external.url : content.file.url;
        const caption = content.caption?.length > 0 ? richTextToHtml(content.caption) : '';
        return `<figure><img src="${imgUrl}" alt="${caption}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
        
      case 'callout':
        const icon = content.icon?.emoji || '💡';
        return `<div class="callout"><span class="callout-icon">${icon}</span><div>${richTextToHtml(content.rich_text)}</div></div>`;
        
      default:
        return '';
    }
  }).join('\n');
}

function richTextToHtml(richText) {
  if (!richText || richText.length === 0) return '';
  
  return richText.map(t => {
    let text = escapeHtml(t.plain_text);
    
    if (t.annotations.bold) text = `<strong>${text}</strong>`;
    if (t.annotations.italic) text = `<em>${text}</em>`;
    if (t.annotations.strikethrough) text = `<del>${text}</del>`;
    if (t.annotations.underline) text = `<u>${text}</u>`;
    if (t.annotations.code) text = `<code>${text}</code>`;
    
    if (t.href) text = `<a href="${t.href}" target="_blank" rel="noopener">${text}</a>`;
    
    return text;
  }).join('');
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// GENERATE BLOG POST HTML PAGE
// ============================================
function generateBlogPostPage(post, content) {
  const headerStyle = post.coverImage 
    ? `background: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.6)), url('${post.coverImage}'); background-size: cover; background-position: center;`
    : `background: linear-gradient(135deg, var(--slate), var(--ink));`;
    
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(post.title)} — Aiventure Blog</title>
    <meta name="description" content="${escapeHtml(post.excerpt)}">
    <meta property="og:image" content="${post.coverImage || ''}">
    <link rel="canonical" href="https://aiventure.pages.dev/blog/${post.slug}">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,400&family=DM+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/assets/styles.css">
    <style>
        .blog-post-content { max-width: 720px; margin: 0 auto; }
        .blog-post-content h1, .blog-post-content h2, .blog-post-content h3 { font-family: 'Fraunces', serif; margin-top: 2em; margin-bottom: 0.5em; }
        .blog-post-content h1 { font-size: 2rem; }
        .blog-post-content h2 { font-size: 1.5rem; }
        .blog-post-content h3 { font-size: 1.25rem; }
        .blog-post-content p { line-height: 1.8; margin-bottom: 1.5em; color: var(--ink-light); }
        .blog-post-content ul, .blog-post-content ol { margin-bottom: 1.5em; padding-left: 1.5em; }
        .blog-post-content li { line-height: 1.8; margin-bottom: 0.5em; color: var(--ink-light); }
        .blog-post-content blockquote { border-left: 4px solid var(--arctic); padding-left: 1.5em; margin: 1.5em 0; font-style: italic; color: var(--ink-light); }
        .blog-post-content pre { background: var(--ice); padding: 1.5em; border-radius: 12px; overflow-x: auto; margin-bottom: 1.5em; }
        .blog-post-content code { font-family: 'Monaco', 'Consolas', monospace; font-size: 0.9em; }
        .blog-post-content figure { margin: 2em 0; }
        .blog-post-content img { max-width: 100%; border-radius: 12px; }
        .blog-post-content figcaption { text-align: center; color: var(--mist); font-size: 0.9em; margin-top: 0.5em; }
        .blog-post-content .callout { background: var(--ice); padding: 1.5em; border-radius: 12px; display: flex; gap: 1em; margin-bottom: 1.5em; }
        .blog-post-content .callout-icon { font-size: 1.5em; }
        .blog-post-content a { color: var(--arctic); text-decoration: underline; }
        .blog-post-content hr { border: none; border-top: 1px solid var(--ice); margin: 2em 0; }
        .blog-header { text-align: center; padding: 80px 20px; border-radius: 30px; color: white; margin-bottom: 40px; min-height: 300px; display: flex; flex-direction: column; justify-content: center; }
        .blog-header h1 { font-family: 'Fraunces', serif; font-size: 2.5rem; margin-bottom: 20px; color: white; text-shadow: 0 2px 10px rgba(0,0,0,0.3); }
        .blog-meta { display: flex; justify-content: center; gap: 20px; opacity: 0.9; flex-wrap: wrap; text-shadow: 0 1px 5px rgba(0,0,0,0.3); }
    </style>
</head>
<body>
    <div class="bg-decoration"><div class="bg-circle bg-circle-1"></div><div class="bg-circle bg-circle-2"></div><div class="bg-grid"></div></div>

    <nav>
        <a href="/" class="logo"><div class="logo-icon">✈</div>Aiventure</a>
        <ul class="nav-links"><li><a href="/#featured">Featured</a></li><li><a href="/pages/categories.html">Categories</a></li><li><a href="/pages/blog.html">Blog</a></li><li><a href="/pages/about.html">About</a></li></ul>
        <a href="/pages/submit.html" class="submit-btn">Submit Tool</a>
    </nav>

    <main>
        <div class="page-header" style="padding-bottom: 0;">
            <div class="breadcrumb"><a href="/">Home</a><span>→</span><a href="/pages/blog.html">Blog</a><span>→</span><span class="current">${escapeHtml(post.title)}</span></div>
        </div>

        <section class="section" style="padding-top: 20px;">
            <div class="blog-header" style="${headerStyle}">
                <h1>${escapeHtml(post.title)}</h1>
                <div class="blog-meta">
                    <span>${post.author}</span>
                    <span>•</span>
                    <span>${new Date(post.publishedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                    <span>•</span>
                    <span>${post.readTime} min read</span>
                </div>
            </div>
            
            <article class="blog-post-content">
                ${content}
            </article>
            
            <div style="max-width: 720px; margin: 60px auto 0; padding-top: 40px; border-top: 1px solid var(--ice); text-align: center;">
                <a href="/pages/blog.html" class="btn btn-secondary">← Back to Blog</a>
            </div>
        </section>
    </main>

    <footer>
        <div class="footer-content">
            <div class="footer-brand"><div class="footer-logo">Aiventure</div><p class="footer-desc">The most comprehensive directory of AI-powered travel tools.</p></div>
            <div class="footer-links">
                <div class="footer-column"><h4>Directory</h4><ul><li><a href="/pages/all-tools.html">All Tools</a></li><li><a href="/pages/categories.html">Categories</a></li></ul></div>
                <div class="footer-column"><h4>Company</h4><ul><li><a href="/pages/about.html">About</a></li><li><a href="/pages/contact.html">Contact</a></li></ul></div>
            </div>
        </div>
        <div class="footer-bottom"><p>© 2026 Aiventure. All rights reserved.</p></div>
    </footer>
</body>
</html>`;
}

// ============================================
// TRANSFORM NOTION PAGE TO TOOL OBJECT
// ============================================
function transformNotionTool(page, index) {
  const props = page.properties;
  return {
    id: index + 1,
    notionId: page.id,
    name: props.Name?.title?.[0]?.plain_text || 'Unnamed',
    category: props.Category?.select?.name || 'Uncategorized',
    categorySlug: (props.Category?.select?.name || 'other').toLowerCase().replace(/\s+/g, '-'),
    description: props.Description?.rich_text?.[0]?.plain_text || '',
    features: props.Features?.multi_select?.map(f => f.name) || [],
    rating: props.Rating?.number || 0,
    reviews: props.Reviews?.number || 0,
    pricing: (props.Pricing?.select?.name || 'free').toLowerCase(),
    priceLabel: props['Price Text']?.rich_text?.[0]?.plain_text || 'Free',
    icon: props.Icon?.rich_text?.[0]?.plain_text || '🔧',
    travelStyle: props['Travel Style']?.multi_select?.map(s => s.name) || [],
    url: props['Website URL']?.url || '#',
    featured: props.Featured?.checkbox || false,
    createdAt: page.created_time,
  };
}

// ============================================
// FETCH TOOLS FROM NOTION
// ============================================
async function fetchTools(env, filters = {}) {
  const apiKey = env.NOTION_API_KEY;
  const dbId = env.TOOLS_DATABASE_ID || 'cead259089f84056a8b17cf0bbb6bb76';
  
  if (!apiKey) {
    throw new Error('NOTION_API_KEY not configured');
  }
  
  const queryBody = { page_size: 100 };
  
  // Filters
  const conditions = [];
  if (filters.category) {
    conditions.push({ property: 'Category', select: { equals: filters.category } });
  }
  if (filters.pricing) {
    const pricingMap = { free: 'Free', freemium: 'Freemium', paid: 'Paid' };
    conditions.push({ property: 'Pricing', select: { equals: pricingMap[filters.pricing] || filters.pricing } });
  }
  if (filters.featured === 'true') {
    conditions.push({ property: 'Featured', checkbox: { equals: true } });
  }
  
  if (conditions.length === 1) queryBody.filter = conditions[0];
  else if (conditions.length > 1) queryBody.filter = { and: conditions };
  
  // Sorting
  const sortMap = {
    rating: [{ property: 'Rating', direction: 'descending' }],
    reviews: [{ property: 'Reviews', direction: 'descending' }],
    name: [{ property: 'Name', direction: 'ascending' }],
    newest: [{ timestamp: 'created_time', direction: 'descending' }],
  };
  queryBody.sorts = sortMap[filters.sort] || sortMap.reviews;
  
  const data = await notionRequest(`/databases/${dbId}/query`, apiKey, 'POST', queryBody);
  
  if (data.object === 'error') {
    throw new Error(data.message || 'Notion API error');
  }
  
  let tools = data.results.map(transformNotionTool);
  
  // Client-side search
  if (filters.search) {
    const q = filters.search.toLowerCase();
    tools = tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.features.some(f => f.toLowerCase().includes(q))
    );
  }
  
  // Limit
  return tools.slice(0, parseInt(filters.limit) || 50);
}

// ============================================
// MAIN WORKER HANDLER
// ============================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ========== BLOG POST PAGES (Dynamic Routes) ==========
    if (path.startsWith('/blog/') && path !== '/blog/') {
      const slug = path.replace('/blog/', '').replace(/\/$/, '');
      
      try {
        const post = await fetchBlogPostBySlug(slug, env);
        
        if (!post) {
          // Return 404 page
          return new Response('<!DOCTYPE html><html><head><title>Post Not Found</title><meta http-equiv="refresh" content="3;url=/pages/blog.html"></head><body><h1>Post not found</h1><p>Redirecting to blog...</p></body></html>', {
            status: 404,
            headers: { 'Content-Type': 'text/html' }
          });
        }
        
        const content = await fetchBlogPostContent(post.id, env);
        const html = generateBlogPostPage(post, content);
        
        return new Response(html, {
          headers: { 
            'Content-Type': 'text/html',
            'Cache-Control': 'public, max-age=300'
          }
        });
      } catch (error) {
        console.error('Blog post error:', error);
        return new Response('Error loading blog post', { status: 500 });
      }
    }

    // ========== API: GET BLOG POSTS ==========
    if (path === '/api/blog' && request.method === 'GET') {
      try {
        const filters = Object.fromEntries(url.searchParams);
        const posts = await fetchBlogPosts(env, filters);
        
        return new Response(JSON.stringify({
          success: true,
          count: posts.length,
          data: posts
        }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}`, ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message || 'Failed to fetch blog posts'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: GET SINGLE BLOG POST ==========
    if (path.startsWith('/api/blog/') && request.method === 'GET') {
      const slug = path.replace('/api/blog/', '');
      
      try {
        const post = await fetchBlogPostBySlug(slug, env);
        
        if (!post) {
          return new Response(JSON.stringify({ success: false, error: 'Post not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const content = await fetchBlogPostContent(post.id, env);
        
        return new Response(JSON.stringify({
          success: true,
          data: { ...post, content }
        }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}`, ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message || 'Failed to fetch blog post'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: GET TOOLS ==========
    if (path === '/api/tools' && request.method === 'GET') {
      try {
        const filters = Object.fromEntries(url.searchParams);
        const tools = await fetchTools(env, filters);
        
        return new Response(JSON.stringify({
          success: true,
          count: tools.length,
          source: 'notion',
          data: tools
        }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}`, ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message || 'Failed to fetch tools'
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: GET CATEGORIES ==========
    if (path === '/api/categories' && request.method === 'GET') {
      try {
        const tools = await fetchTools(env, { limit: 100 });
        const counts = {};
        tools.forEach(t => { counts[t.category] = (counts[t.category] || 0) + 1; });
        
        const icons = {
          'Trip Planning': '🗺️', 'Local Guides': '📍', 'Flights & Hotels': '✈️',
          'Road Trip Planning': '🚗', 'Luxury Travel': '💎', 'Group Travel': '👥',
          'Adventure Travel': '🏕️', 'Points & Rewards': '🎁',
        };
        
        const categories = Object.entries(counts).map(([name, count]) => ({
          id: name.toLowerCase().replace(/\s+/g, '-'),
          name, icon: icons[name] || '📦', count
        }));
        
        return new Response(JSON.stringify({ success: true, data: categories }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}`, ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: GET STATS ==========
    if (path === '/api/stats' && request.method === 'GET') {
      try {
        const tools = await fetchTools(env, { limit: 100 });
        const totalReviews = tools.reduce((sum, t) => sum + (t.reviews || 0), 0);
        const avgRating = tools.length > 0 
          ? (tools.reduce((sum, t) => sum + (t.rating || 0), 0) / tools.length).toFixed(1) : 0;
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            totalTools: tools.length,
            totalReviews,
            categories: new Set(tools.map(t => t.category)).size,
            avgRating,
            lastUpdated: new Date().toISOString()
          }
        }), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}`, ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: NEWSLETTER ==========
    if (path === '/api/newsletter' && request.method === 'POST') {
      try {
        const { email } = await request.json();
        if (!email?.includes('@')) {
          return new Response(JSON.stringify({ success: false, error: 'Valid email required' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        // TODO: Store in KV or send to email service
        return new Response(JSON.stringify({ success: true, message: 'Subscribed!' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: CONTACT ==========
    if (path === '/api/contact' && request.method === 'POST') {
      try {
        const { name, email, message } = await request.json();
        if (!name || !email || !message) {
          return new Response(JSON.stringify({ success: false, error: 'All fields required' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        // TODO: Send email or store
        return new Response(JSON.stringify({ success: true, message: 'Message sent!' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: PAYPAL VERIFY AND SUBMIT (SECURE) ==========
    if (path === '/api/paypal/verify-and-submit' && request.method === 'POST') {
      try {
        const { orderID, formData } = await request.json();
        
        // Validate required fields
        if (!orderID) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'PayPal order ID is required' 
          }), {
            status: 400, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        if (!formData?.toolName || !formData?.toolUrl || !formData?.contactEmail) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Required form fields missing' 
          }), {
            status: 400, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // Check PayPal credentials are configured
        if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) {
          console.error('PayPal credentials not configured');
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Payment verification not configured. Please contact support.' 
          }), {
            status: 500, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // Verify payment with PayPal
        const verification = await verifyPayPalOrder(orderID, env);
        
        if (!verification.valid) {
          console.error('PayPal verification failed:', verification.error);
          return new Response(JSON.stringify({ 
            success: false, 
            error: `Payment verification failed: ${verification.error}` 
          }), {
            status: 400, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // Payment verified! Now store the submission
        const submissionResult = await createSubmissionInNotion(formData, {
          orderID,
          captureId: verification.captureId,
          payerEmail: verification.payerEmail,
        }, env);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Payment verified and submission received!',
          data: {
            toolName: formData.toolName,
            email: formData.contactEmail,
            notionPageId: submissionResult.notionPageId,
          }
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        console.error('Verify and submit error:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message || 'Verification failed. Please contact support with your PayPal receipt.' 
        }), {
          status: 500, 
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== API: SUBMIT TOOL (Legacy - redirects to payment) ==========
    if (path === '/api/submit-tool' && request.method === 'POST') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Please use the payment form at /pages/submit.html to submit your tool.' 
      }), {
        status: 400, 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // ========== API: ADVERTISE ==========
    if (path === '/api/advertise' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.companyName || !body.contactEmail) {
          return new Response(JSON.stringify({ success: false, error: 'Required fields missing' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        // Save to Notion
        const notionResult = await createAdvertisingInquiryInNotion(body, env);
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Inquiry received! We\'ll get back to you within 24-48 hours.',
          notionPageId: notionResult.notionPageId
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        console.error('Advertise error:', e);
        return new Response(JSON.stringify({ success: false, error: 'Failed to submit inquiry. Please try again.' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ========== STATIC FILES ==========
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    // ========== 404 ==========
    return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
      status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
};
