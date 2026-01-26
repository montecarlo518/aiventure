// Aiventure - Cloudflare Worker with Notion Integration & PayPal Verification
// Fetches tools & blog posts directly from your Notion databases

// ============================================
// CONFIGURATION - Set these as Environment Variables in Cloudflare
// ============================================
// NOTION_API_KEY - Get from https://www.notion.so/my-integrations
// TOOLS_DATABASE_ID - Your AI Travel Tools Directory
// SUBMISSIONS_DATABASE_ID - Database for pending submissions
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
