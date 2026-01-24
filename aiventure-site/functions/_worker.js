// Aiventure - Cloudflare Worker
// This worker handles routing, caching, redirects, and API endpoints

// Configuration
const SITE_URL = 'https://www.aiventure.me';
const CACHE_TTL = 60 * 60 * 24; // 24 hours for static assets
const API_CACHE_TTL = 60 * 5; // 5 minutes for API responses

// Tools data (can be replaced with KV storage or D1 database)
const TOOLS_DATA = [
  {
    id: 1,
    name: "Layla",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "AI-powered multi-day itinerary generator for complex trips. Tailors plans to adventure-focused themes with optimal routes and timing.",
    features: ["Itinerary Planning", "Flight Booking", "Hotel Booking"],
    rating: 5.0,
    reviews: 2847,
    pricing: "freemium",
    priceLabel: "Free / $49/yr",
    icon: "🗺️",
    url: "https://layla.ai",
    featured: true,
    new: false
  },
  {
    id: 2,
    name: "Wonderplan",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "AI-generated itineraries tailored to sport and adventure preferences with activity-specific recommendations.",
    features: ["Itinerary Planning", "Offline Mode", "Group Planning"],
    rating: 4.0,
    reviews: 1523,
    pricing: "free",
    priceLabel: "Free",
    icon: "🏄",
    url: "https://wonderplan.ai",
    featured: true,
    new: false
  },
  {
    id: 3,
    name: "Mindtrip",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "AI travel planner with personalized recommendations for destinations, hotels, flights, restaurants and attractions.",
    features: ["Itinerary Planning", "Hotel Booking", "Activity Booking"],
    rating: 4.8,
    reviews: 1876,
    pricing: "freemium",
    priceLabel: "Free / Premium",
    icon: "✨",
    url: "https://mindtrip.ai",
    featured: true,
    new: false
  },
  {
    id: 4,
    name: "Trip Planner AI",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "Complete travel planning with flights, hotels, and activities organized without endless tabs.",
    features: ["Itinerary Planning", "Flight Booking", "Hotel Booking"],
    rating: 4.7,
    reviews: 2134,
    pricing: "freemium",
    priceLabel: "Free / $10/mo",
    icon: "📋",
    url: "https://tripplanner.ai",
    featured: false,
    new: false
  },
  {
    id: 5,
    name: "iPlan.ai",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "Budget-conscious AI itinerary planner optimized for time and cost.",
    features: ["Itinerary Planning", "Price Comparison", "Mobile App"],
    rating: 4.5,
    reviews: 987,
    pricing: "free",
    priceLabel: "Free",
    icon: "💰",
    url: "https://iplan.ai",
    featured: false,
    new: false
  },
  {
    id: 6,
    name: "Roam Around",
    category: "trip-planning",
    categoryLabel: "Trip Planning",
    description: "World's largest AI travel planner using GPT technology.",
    features: ["Itinerary Planning", "AI Chat", "Real-time Prices"],
    rating: 4.6,
    reviews: 1234,
    pricing: "free",
    priceLabel: "Free",
    icon: "🌍",
    url: "https://roamaround.io",
    featured: false,
    new: false
  },
  {
    id: 7,
    name: "Vacay Chatbot",
    category: "local-guides",
    categoryLabel: "Local Guides",
    description: "AI travel assistant available on WhatsApp and Messenger.",
    features: ["AI Chat", "Mobile App", "Multi-language"],
    rating: 4.4,
    reviews: 876,
    pricing: "free",
    priceLabel: "Free",
    icon: "💬",
    url: "https://usevacay.com",
    featured: false,
    new: false
  },
  {
    id: 8,
    name: "GuideGeek",
    category: "local-guides",
    categoryLabel: "Local Guides",
    description: "Budget-savvy AI travel guide on WhatsApp.",
    features: ["AI Chat", "Mobile App", "Real-time Prices"],
    rating: 4.5,
    reviews: 1098,
    pricing: "free",
    priceLabel: "Free",
    icon: "🎯",
    url: "https://guidegeek.com",
    featured: false,
    new: false
  },
  {
    id: 9,
    name: "Curiosio",
    category: "road-trip",
    categoryLabel: "Road Trip Planning",
    description: "AI road trip planner with multi-stop customizable itineraries.",
    features: ["Itinerary Planning", "Offline Mode", "Group Planning"],
    rating: 4.7,
    reviews: 765,
    pricing: "freemium",
    priceLabel: "Free / Premium",
    icon: "🚗",
    url: "https://curiosio.com",
    featured: false,
    new: true
  },
  {
    id: 10,
    name: "Booked.ai",
    category: "luxury",
    categoryLabel: "Luxury Travel",
    description: "AI luxury travel agent for high-end accommodations.",
    features: ["Hotel Booking", "Activity Booking", "AI Chat"],
    rating: 4.3,
    reviews: 543,
    pricing: "paid",
    priceLabel: "Premium",
    icon: "💎",
    url: "https://booked.ai",
    featured: false,
    new: false
  },
  {
    id: 11,
    name: "Gondola",
    category: "flights",
    categoryLabel: "Points & Rewards",
    description: "Personal points optimizer for loyalty programs.",
    features: ["Flight Booking", "Price Comparison", "Real-time Prices"],
    rating: 4.6,
    reviews: 654,
    pricing: "freemium",
    priceLabel: "Free / Premium",
    icon: "🎁",
    url: "https://gondola.ai",
    featured: false,
    new: true
  },
  {
    id: 12,
    name: "iMean",
    category: "group",
    categoryLabel: "Group Travel",
    description: "Personal travel planner for group trips.",
    features: ["Group Planning", "Price Comparison", "Calendar Sync"],
    rating: 4.5,
    reviews: 432,
    pricing: "freemium",
    priceLabel: "Free / Premium",
    icon: "👥",
    url: "https://imean.ai",
    featured: false,
    new: false
  },
  {
    id: 13,
    name: "LetsTrip AI",
    category: "adventure",
    categoryLabel: "Adventure Travel",
    description: "AI for active, social travelers.",
    features: ["Itinerary Planning", "Group Planning", "Activity Booking"],
    rating: 4.4,
    reviews: 321,
    pricing: "freemium",
    priceLabel: "Free / Premium",
    icon: "🏕️",
    url: "https://letstrip.ai",
    featured: false,
    new: true
  },
  {
    id: 14,
    name: "Travel With Tern",
    category: "local-guides",
    categoryLabel: "Local Guides",
    description: "AI chat assistant for real-time suggestions.",
    features: ["AI Chat", "Itinerary Planning", "Real-time Prices"],
    rating: 4.3,
    reviews: 287,
    pricing: "free",
    priceLabel: "Free",
    icon: "🐦",
    url: "https://travelwithtern.com",
    featured: false,
    new: false
  },
  {
    id: 15,
    name: "Travlo",
    category: "luxury",
    categoryLabel: "Luxury Travel",
    description: "Premium trip planner for luxury travelers.",
    features: ["Itinerary Planning", "Hotel Booking", "Activity Booking"],
    rating: 4.2,
    reviews: 198,
    pricing: "paid",
    priceLabel: "$15/mo",
    icon: "🌟",
    url: "https://travlo.ai",
    featured: false,
    new: false
  },
  {
    id: 16,
    name: "GetTravelBuddy",
    category: "local-guides",
    categoryLabel: "Local Guides",
    description: "Chat-based AI travel assistant on WhatsApp.",
    features: ["AI Chat", "Mobile App", "Real-time Prices"],
    rating: 4.1,
    reviews: 156,
    pricing: "free",
    priceLabel: "Free",
    icon: "🤝",
    url: "https://gettravelbuddy.com",
    featured: false,
    new: false
  },
  {
    id: 17,
    name: "Triplan",
    category: "group",
    categoryLabel: "Family Travel",
    description: "Collaborative AI trip planner for groups.",
    features: ["Group Planning", "Itinerary Planning", "Calendar Sync"],
    rating: 4.4,
    reviews: 412,
    pricing: "freemium",
    priceLabel: "Free / Premium",
    icon: "👨‍👩‍👧‍👦",
    url: "https://triplan.ai",
    featured: false,
    new: true
  }
];

// Newsletter subscribers storage (use KV in production)
let newsletterSubscribers = [];

// Contact form submissions (use D1 or KV in production)
let contactSubmissions = [];

// Tool submissions (use D1 or KV in production)
let toolSubmissions = [];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // ============================================
    // API ROUTES
    // ============================================

    // API: Get all tools
    if (path === '/api/tools' && request.method === 'GET') {
      const category = url.searchParams.get('category');
      const pricing = url.searchParams.get('pricing');
      const featured = url.searchParams.get('featured');
      const newOnly = url.searchParams.get('new');
      const search = url.searchParams.get('search');
      const sort = url.searchParams.get('sort') || 'popular';
      const limit = parseInt(url.searchParams.get('limit')) || 50;

      let filtered = [...TOOLS_DATA];

      // Apply filters
      if (category) {
        filtered = filtered.filter(t => t.category === category);
      }
      if (pricing) {
        filtered = filtered.filter(t => t.pricing === pricing);
      }
      if (featured === 'true') {
        filtered = filtered.filter(t => t.featured);
      }
      if (newOnly === 'true') {
        filtered = filtered.filter(t => t.new);
      }
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(t =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.features.some(f => f.toLowerCase().includes(q))
        );
      }

      // Apply sorting
      switch (sort) {
        case 'rating':
          filtered.sort((a, b) => b.rating - a.rating);
          break;
        case 'reviews':
          filtered.sort((a, b) => b.reviews - a.reviews);
          break;
        case 'name':
          filtered.sort((a, b) => a.name.localeCompare(b.name));
          break;
        case 'newest':
          filtered = filtered.filter(t => t.new).concat(filtered.filter(t => !t.new));
          break;
        default: // popular
          filtered.sort((a, b) => b.reviews - a.reviews);
      }

      // Apply limit
      filtered = filtered.slice(0, limit);

      return new Response(JSON.stringify({
        success: true,
        count: filtered.length,
        data: filtered
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${API_CACHE_TTL}`,
          ...corsHeaders
        }
      });
    }

    // API: Get single tool by ID
    if (path.match(/^\/api\/tools\/\d+$/) && request.method === 'GET') {
      const id = parseInt(path.split('/').pop());
      const tool = TOOLS_DATA.find(t => t.id === id);

      if (!tool) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Tool not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: tool
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${API_CACHE_TTL}`,
          ...corsHeaders
        }
      });
    }

    // API: Get categories
    if (path === '/api/categories' && request.method === 'GET') {
      const categories = [
        { id: 'trip-planning', name: 'Trip Planning', icon: '🗺️', count: TOOLS_DATA.filter(t => t.category === 'trip-planning').length },
        { id: 'local-guides', name: 'Local Guides', icon: '📍', count: TOOLS_DATA.filter(t => t.category === 'local-guides').length },
        { id: 'flights', name: 'Points & Rewards', icon: '✈️', count: TOOLS_DATA.filter(t => t.category === 'flights').length },
        { id: 'road-trip', name: 'Road Trip', icon: '🚗', count: TOOLS_DATA.filter(t => t.category === 'road-trip').length },
        { id: 'luxury', name: 'Luxury Travel', icon: '💎', count: TOOLS_DATA.filter(t => t.category === 'luxury').length },
        { id: 'group', name: 'Group Travel', icon: '👥', count: TOOLS_DATA.filter(t => t.category === 'group').length },
        { id: 'adventure', name: 'Adventure', icon: '🏕️', count: TOOLS_DATA.filter(t => t.category === 'adventure').length },
      ];

      return new Response(JSON.stringify({
        success: true,
        data: categories
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${API_CACHE_TTL}`,
          ...corsHeaders
        }
      });
    }

    // API: Get stats
    if (path === '/api/stats' && request.method === 'GET') {
      const totalTools = TOOLS_DATA.length;
      const totalReviews = TOOLS_DATA.reduce((sum, t) => sum + t.reviews, 0);
      const categories = new Set(TOOLS_DATA.map(t => t.category)).size;
      const avgRating = (TOOLS_DATA.reduce((sum, t) => sum + t.rating, 0) / totalTools).toFixed(1);

      return new Response(JSON.stringify({
        success: true,
        data: {
          totalTools,
          totalReviews,
          categories,
          avgRating,
          lastUpdated: new Date().toISOString()
        }
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${API_CACHE_TTL}`,
          ...corsHeaders
        }
      });
    }

    // API: Newsletter subscription
    if (path === '/api/newsletter' && request.method === 'POST') {
      try {
        const body = await request.json();
        const email = body.email;

        if (!email || !email.includes('@')) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Valid email required'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // In production, use KV storage:
        // await env.NEWSLETTER_KV.put(email, JSON.stringify({ subscribedAt: new Date().toISOString() }));

        // For demo, store in memory (will reset on worker restart)
        newsletterSubscribers.push({
          email,
          subscribedAt: new Date().toISOString()
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Successfully subscribed to newsletter'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid request body'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // API: Contact form submission
    if (path === '/api/contact' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { name, email, subject, message } = body;

        if (!name || !email || !message) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Name, email, and message are required'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // In production, use D1 database or send email via SendGrid/Mailgun
        contactSubmissions.push({
          id: Date.now(),
          name,
          email,
          subject: subject || 'General Inquiry',
          message,
          submittedAt: new Date().toISOString()
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Message sent successfully'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid request body'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // API: Submit tool
    if (path === '/api/submit-tool' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { toolName, toolUrl, category, description, contactEmail } = body;

        if (!toolName || !toolUrl || !category || !description || !contactEmail) {
          return new Response(JSON.stringify({
            success: false,
            error: 'All fields are required'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // In production, use D1 database
        toolSubmissions.push({
          id: Date.now(),
          toolName,
          toolUrl,
          category,
          description,
          contactEmail,
          status: 'pending',
          submittedAt: new Date().toISOString()
        });

        return new Response(JSON.stringify({
          success: true,
          message: 'Tool submitted for review'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid request body'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // API: Advertise inquiry
    if (path === '/api/advertise' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { companyName, contactEmail, adType, budget, message } = body;

        if (!companyName || !contactEmail || !adType) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Company name, email, and ad type are required'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }

        // In production, send to CRM or email
        return new Response(JSON.stringify({
          success: true,
          message: 'Advertising inquiry received. We will contact you within 24 hours.'
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (e) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid request body'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }

    // ============================================
    // REDIRECTS
    // ============================================

    // Redirect non-www to www
    if (url.hostname === 'aiventure.me') {
      return Response.redirect(`https://www.aiventure.me${path}`, 301);
    }

    // Common redirects
    const redirects = {
      '/tools': '/pages/all-tools.html',
      '/blog': '/pages/blog.html',
      '/about': '/pages/about.html',
      '/contact': '/pages/contact.html',
      '/submit': '/pages/submit.html',
      '/advertise': '/pages/advertise.html',
      '/categories': '/pages/categories.html',
      '/guides': '/pages/guides.html',
      '/newsletter': '/pages/newsletter.html',
      '/new': '/pages/new-additions.html',
      '/top': '/pages/top-rated.html',
    };

    if (redirects[path]) {
      return Response.redirect(`${url.origin}${redirects[path]}`, 301);
    }

    // ============================================
    // STATIC ASSET HANDLING
    // ============================================

    // For static files, pass to Cloudflare Pages asset handling
    // This worker should be used alongside Pages, not replace it

    // If no route matched, return 404
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({
        success: false,
        error: 'API endpoint not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    // For non-API routes, let Cloudflare Pages handle static files
    // This requires the worker to be configured as a Pages Function
    return env.ASSETS.fetch(request);
  }
};

// ============================================
// SCHEDULED TASKS (Cron Triggers)
// ============================================

export async function scheduled(event, env, ctx) {
  // This runs on a schedule (configure in wrangler.toml)
  // Example: Update tool ratings from external sources

  switch (event.cron) {
    case '0 0 * * *': // Daily at midnight
      // Refresh tool data from Notion or external API
      console.log('Running daily data refresh...');
      break;

    case '0 */6 * * *': // Every 6 hours
      // Update ratings/reviews
      console.log('Running rating updates...');
      break;
  }
}
