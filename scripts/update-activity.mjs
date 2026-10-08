import { readFile, mkdir, writeFile } from 'node:fs/promises';

const login = 'rntxbr';
const projects = [
  ['cvats-app', 'cvats'],
  ['lib-speedact', 'SpeedAct'],
  ['devfinder-app', 'DevFinder'],
  ['astro-theme-jucelito-silva', 'Jucelito Silva'],
  ['astro-theme-sofia-luna', 'Sofia Luna'],
];
const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'rntxbr-profile',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GitHub request failed: HTTP ${response.status}`);
  const data = await response.json();
  if (data.errors) throw new Error('GitHub GraphQL returned errors');
  return data;
}
async function contributionDays() {
  // A local calendar fixture permits previewing without a personal access token.
  if (process.env.PROFILE_CALENDAR_FILE) {
    return JSON.parse(await readFile(process.env.PROFILE_CALENDAR_FILE, 'utf8')).days;
  }
  if (!token) throw new Error('GITHUB_TOKEN is required to read the contribution calendar');
  const data = await request('https://api.github.com/graphql', {
    method: 'POST',
    body: JSON.stringify({
      query: 'query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar { weeks { contributionDays { date contributionCount } } } } } }',
      variables: { login },
    }),
  });
  return data.data?.user?.contributionsCollection.contributionCalendar.weeks.flatMap(w => w.contributionDays);
}
const [calendar, repositories] = await Promise.all([
  contributionDays(),
  Promise.all(projects.map(async ([name, label]) => {
    const repo = await request(`https://api.github.com/repos/${login}/${name}`);
    if (repo.private || !Number.isSafeInteger(repo.stargazers_count)) throw new Error('Invalid public repository data');
    return { label, stars: repo.stargazers_count };
  })),
]);
if (!Array.isArray(calendar) || calendar.length === 0) throw new Error('Empty contribution calendar');
const today = new Date().toISOString().slice(0, 10);
const days = calendar.filter(d => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));
if (!days.length || days.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || !Number.isSafeInteger(d.contributionCount) || d.contributionCount < 0)) {
  throw new Error('Invalid contribution calendar');
}
const months = new Map();
for (const day of days) {
  const month = day.date.slice(0, 7);
  months.set(month, (months.get(month) ?? 0) + day.contributionCount);
}
const total = days.reduce((sum, d) => sum + d.contributionCount, 0);
const active = days.filter(d => d.contributionCount > 0).length;
const monthlyMax = Math.max(1, ...months.values());
const starMax = Math.max(1, ...repositories.map(r => r.stars));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
function svg(dark) {
  const c = dark
    ? { bg: '#0d1117', text: '#e6edf3', muted: '#9198a1', line: '#30363d', accent: '#3fb950', track: '#161b22' }
    : { bg: '#ffffff', text: '#1f2328', muted: '#59636e', line: '#d1d9e0', accent: '#238636', track: '#f6f8fa' };
  const text = (x, y, value, size = 12, fill = c.text, anchor = 'start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escape(value)}</text>`;
  const monthly = [...months].map(([month, count], index) => {
    const x = 36 + index * (768 / months.size);
    const h = count / monthlyMax * 110;
    const label = new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `<g><title>${month}: ${count} contributions</title><rect x="${x + 8}" y="${210 - h}" width="${Math.max(8, 768 / months.size - 18)}" height="${h}" rx="3" fill="${c.accent}"/>${text(x + 768 / months.size / 2, 224, label, 11, c.muted, 'middle')}${text(x + 768 / months.size / 2, 239, month.slice(2, 4), 10, c.muted, 'middle')}${count ? text(x + 768 / months.size / 2, 203 - h, count, 11, c.text, 'middle') : ''}</g>`;
  }).join('');
  const stars = repositories.map((repo, index) => {
    const y = 308 + index * 29;
    return `<g><title>${escape(repo.label)}: ${repo.stars} stars</title>${text(36, y + 12, repo.label)}<rect x="180" y="${y}" width="570" height="16" rx="4" fill="${c.track}"/><rect x="180" y="${y}" width="${repo.stars / starMax * 570}" height="16" rx="4" fill="${c.accent}"/>${text(790, y + 12, repo.stars, 12, c.text, 'end')}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="495" viewBox="0 0 840 495" role="img" aria-labelledby="title description">
<title id="title">Renato Khael · GitHub activity</title>
<desc id="description">${total} contributions across ${active} active days from ${days[0].date} to ${days.at(-1).date}. Monthly totals: ${escape([...months].map(([m,n]) => `${m}: ${n}`).join('; '))}. Public project stars: ${escape(repositories.map(r => `${r.label}: ${r.stars}`).join('; '))}.</desc>
<rect x="0.5" y="0.5" width="839" height="494" rx="12" fill="${c.bg}" stroke="${c.line}"/>
<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif">
${text(36, 37, 'Contributions by month', 18)}
${text(36, 61, `${total} contributions · ${active} active days`, 13, c.muted)}
${text(804, 61, `${days[0].date} → ${days.at(-1).date}`, 12, c.muted, 'end')}
<path d="M36 211H804" stroke="${c.line}"/>${monthly}
<path d="M36 262H804" stroke="${c.line}"/>
${text(36, 288, 'Community interest · public project stars', 16)}${stars}
${text(36, 479, `Source: GitHub · updated ${today} UTC · partial months included`, 11, c.muted)}
</g></svg>\n`;
}
await mkdir('assets', { recursive: true });
await Promise.all([writeFile('assets/activity.svg', svg(false)), writeFile('assets/activity-dark.svg', svg(true))]);
console.log(`Updated charts: ${total} contributions, ${active} active days, ${repositories.length} public projects.`);
