const required = ['VERCEL_TOKEN', 'VERCEL_ORG_ID', 'VERCEL_PROJECT_ID', 'VERCEL_PRODUCTION_DOMAINS'];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const token = process.env.VERCEL_TOKEN;
const teamId = process.env.VERCEL_ORG_ID;
const projectId = process.env.VERCEL_PROJECT_ID;
const domains = [...new Set(process.env.VERCEL_PRODUCTION_DOMAINS.split(',').map(value => value.trim()).filter(Boolean))];
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};

async function responseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

for (const domain of domains) {
  const encodedProject = encodeURIComponent(projectId);
  const encodedDomain = encodeURIComponent(domain);
  const query = `teamId=${encodeURIComponent(teamId)}`;
  const existing = await fetch(`https://api.vercel.com/v9/projects/${encodedProject}/domains/${encodedDomain}?${query}`, {
    headers,
  });

  if (existing.ok) {
    const current = await responseBody(existing);
    console.log(`${domain}: already attached (verified=${Boolean(current.verified)})`);
    continue;
  }
  if (existing.status !== 404) {
    const failure = await responseBody(existing);
    throw new Error(`${domain}: lookup failed (${existing.status}) ${failure.error?.message ?? failure.message ?? ''}`.trim());
  }

  const added = await fetch(`https://api.vercel.com/v10/projects/${encodedProject}/domains?${query}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: domain }),
  });
  const result = await responseBody(added);
  if (!added.ok) {
    throw new Error(`${domain}: attach failed (${added.status}) ${result.error?.message ?? result.message ?? ''}`.trim());
  }
  console.log(`${domain}: attached (verified=${Boolean(result.verified)})`);
}
