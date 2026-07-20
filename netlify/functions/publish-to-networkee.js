/**
 * Netlify Function: Publish article to Networkee
 *
 * Usage:
 *   POST /.netlify/functions/publish-to-networkee
 *   Content-Type: application/json
 *
 *   {
 *     "title": "My Article Title",
 *     "url": "https://digitalblueskye.com/blog/my-article",
 *     "content": "Optional: just the text if no title/url"
 *   }
 */

exports.handler = async (event) => {
  // CORS headers for requests from your blog
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Use POST' }),
      headers,
    };
  }

  try {
    // Parse request body
    let { title, url, content } = {};
    try {
      const parsed = JSON.parse(event.body);
      title = parsed.title;
      url = parsed.url;
      content = parsed.content;
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON' }),
        headers,
      };
    }

    // Validate input
    if (!title && !content) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'title or content is required' }),
        headers,
      };
    }

    // Get token from environment
    const token = process.env.NETWORKEE_TOKEN;
    if (!token) {
      console.error('NETWORKEE_TOKEN not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server misconfiguration' }),
        headers,
      };
    }

    // Compose message for Networkee
    let message = title || content;
    if (title && url) {
      message = `${title} 📖\n${url}`;
    } else if (title && content) {
      message = `${title}\n\n${content}`;
    }

    // Call Networkee API
    const networkeeResponse = await fetch(
      'https://networkee.up.railway.app/api/posts.php',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: message }),
      }
    );

    const responseData = await networkeeResponse.json();

    // Return response from Networkee
    return {
      statusCode: networkeeResponse.status,
      body: JSON.stringify(responseData),
      headers,
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
      headers,
    };
  }
};
