// Aiventure - Cloudflare Worker with Notion Integration
// Fetches tools & blog posts directly from your Notion databases

// ============================================
// CONFIGURATION - Set these as Environment Variables in Cloudflare
// ============================================
// NOTION_API_KEY - Get from https://www.notion.so/my-integrations
// TOOLS_DATABASE_ID - Your AI Travel Tools Directory: cead259089f84056a8b17cf0bbb6bb76
// BLOG_DATABASE_ID - (Optional) Create a blog database in Notion

const CACHE_TTL = 300; // 5 minutes

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

    // ========== API: SUBMIT TOOL ==========
    if (path === '/api/submit-tool' && request.method === 'POST') {
      try {
        const body = await request.json();
        if (!body.toolName || !body.toolUrl || !body.contactEmail) {
          return new Response(JSON.stringify({ success: false, error: 'Required fields missing' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        // TODO: Create in Notion submissions database
        return new Response(JSON.stringify({ success: true, message: 'Tool submitted for review!' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
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
        return new Response(JSON.stringify({ success: true, message: 'Inquiry received!' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders }
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
