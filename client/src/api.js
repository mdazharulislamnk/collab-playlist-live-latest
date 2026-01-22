const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function jsonOrThrow(res) {
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const err = new Error('Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function fetchTracks() {
  const res = await fetch(`${API_URL}/api/tracks`);
  return jsonOrThrow(res);
}

export async function fetchPlaylist() {
  const res = await fetch(`${API_URL}/api/playlist`);
  return jsonOrThrow(res);
}

export async function addToPlaylist(trackId, addedBy = 'Anonymous') {
  const res = await fetch(`${API_URL}/api/playlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track_id: trackId, added_by: addedBy })
  });
  return jsonOrThrow(res);
}

export async function deleteFromPlaylist(id) {
  const res = await fetch(`${API_URL}/api/playlist/${id}`, { method: 'DELETE' });
  if (res.status === 204) return { ok: true };
  return jsonOrThrow(res);
}

export async function voteTrack(id, direction) {
  const res = await fetch(`${API_URL}/api/playlist/${id}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction })
  });
  return jsonOrThrow(res);
}

export async function updatePlaylistItem(id, data) {
  const res = await fetch(`${API_URL}/api/playlist/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return jsonOrThrow(res);
}

export function connectSSE(onEvent, onStatusChange) {
  const source = new EventSource(`${API_URL}/api/stream`);
  onStatusChange && onStatusChange('connecting');

  source.onopen = () => onStatusChange && onStatusChange('online');
  source.onerror = () => onStatusChange && onStatusChange('offline');

  source.onmessage = (event) => {
    if (!event.data) return;
    try {
      const msg = JSON.parse(event.data);
      onEvent(msg);
    } catch (e) {
      console.error('Bad SSE message', e, event.data);
    }
  };

  return source;
}

export { API_URL };