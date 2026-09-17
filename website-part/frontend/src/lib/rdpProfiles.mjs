import { requestJSON } from './apiClient.mjs';

// Named, per-account RDP profiles. Passwords stay on the server and are only
// returned when a profile is explicitly loaded.
export async function listRdpProfiles(request = requestJSON) {
  const data = await request('/api/rdp/profiles');
  return {
    available: Boolean(data?.available),
    profiles: Array.isArray(data?.profiles) ? data.profiles : [],
  };
}

export async function loadRdpProfile(id, request = requestJSON) {
  const data = await request(`/api/rdp/profiles/${encodeURIComponent(id)}`);
  return data?.profile || null;
}

export async function saveRdpProfile(profile, { id = null, request = requestJSON } = {}) {
  const result = await request(
    `/api/rdp/profiles${id ? `/${encodeURIComponent(id)}` : ''}`,
    {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    },
  );
  return result?.id ?? id;
}

export async function deleteRdpProfile(id, request = requestJSON) {
  await request(`/api/rdp/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
