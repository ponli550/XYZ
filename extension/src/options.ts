// Settings. Deliberately the only place the agent's powers can be granted, and
// deliberately empty by default: a fresh install can write nowhere.
const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

const KEYS = ['githubToken', 'openrouterKey', 'model', 'repos', 'capabilities', 'paused'] as const;

async function restore(): Promise<void> {
  const s = await chrome.storage.local.get([...KEYS]);
  $('gh').value = s.githubToken ?? '';
  $('or').value = s.openrouterKey ?? '';
  $('model').value = s.model ?? 'openai/gpt-4o-mini';
  $('repos').value = (s.repos ?? []).join(', ');
  const caps: string[] = s.capabilities ?? [];
  $('cap-comment').checked = caps.includes('comment');
  $('cap-transition').checked = caps.includes('transition');
  $('paused').checked = Boolean(s.paused);
}

async function save(): Promise<void> {
  const capabilities = [
    ...($('cap-comment').checked ? ['comment'] : []),
    ...($('cap-transition').checked ? ['transition'] : []),
  ];
  await chrome.storage.local.set({
    githubToken: $('gh').value.trim(),
    openrouterKey: $('or').value.trim(),
    model: $('model').value.trim() || 'openai/gpt-4o-mini',
    repos: $('repos').value.split(',').map((r) => r.trim()).filter(Boolean),
    capabilities,
    paused: $('paused').checked,
  });
  const badge = document.getElementById('saved')!;
  badge.classList.add('on');
  setTimeout(() => badge.classList.remove('on'), 1200);
}

document.getElementById('save')!.addEventListener('click', () => void save());
void restore();
