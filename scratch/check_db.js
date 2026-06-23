const fs = require('fs');
const path = require('path');

// Manually parse env file
const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1);
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1);
    }
    env[key] = value.trim();
  }
});

async function check() {
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/apps_analysis?select=id,app_name,status,created_at&order=created_at.desc`;
  try {
    const res = await fetch(url, {
      headers: {
        'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP error: ${res.status} - ${text}`);
    }
    const data = await res.json();
    console.log('Apps analyses list:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error fetching:', error);
  }
}

check();
