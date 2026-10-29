// Deletes all Vercel deployments of the project except the one currently serving production.
const { VERCEL_TOKEN: token, VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: project } = process.env;
if (!token || !team || !project) throw new Error('VERCEL_TOKEN, VERCEL_ORG_ID and VERCEL_PROJECT_ID are required');

const api = async (path, init = {}) => {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://api.vercel.com${path}${sep}teamId=${team}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const prod = (await api(`/v9/projects/${project}`)).targets?.production?.id;
if (!prod) throw new Error('Project has no production deployment; refusing to delete anything.');
console.log(`Keeping production deployment ${prod}`);

let until;
let deleted = 0;
for (;;) {
  const page = await api(`/v6/deployments?projectId=${project}&limit=100${until ? `&until=${until}` : ''}`);
  for (const d of page.deployments) {
    if (d.uid === prod) continue;
    await api(`/v13/deployments/${d.uid}`, { method: 'DELETE' });
    console.log(`Deleted ${d.uid} (${d.url}, ${d.target ?? 'preview'})`);
    deleted++;
  }
  until = page.pagination?.next;
  if (!until) break;
}
console.log(`Done: ${deleted} deployment(s) deleted.`);
