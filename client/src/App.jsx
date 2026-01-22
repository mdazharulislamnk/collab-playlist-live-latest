import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTracks,
  fetchPlaylist,
  addToPlaylist,
  deleteFromPlaylist,
  voteTrack,
  updatePlaylistItem,
  connectSSE
} from './api';
import { calculatePosition } from './position';
import { dequeueAll, enqueue, loadQueue } from './offlineQueue';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function App() {
  const [tracks, setTracks] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('connecting');

  // ✅ NEW: reactive queue counter (fix "Queue stuck at 1")
  const [queueCount, setQueueCount] = useState(() => loadQueue().length);

  const [sortMode, setSortMode] = useState('manual'); // 'manual' | 'votes'
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [draggingId, setDraggingId] = useState(null);
  const [reorderPulse, setReorderPulse] = useState(0);

  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const baseStartMsRef = useRef(null);
  const isSeekingRef = useRef(false);

  const sseRef = useRef(null);
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const lastEventIdRef = useRef(0);

  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragIdRef = useRef(null);

  const progressRef = useRef(null);
  const rowRefs = useRef(new Map());

  const nowPlaying = useMemo(
    () => playlist.find((p) => p.is_playing) || null,
    [playlist]
  );

  // ✅ helper: keep queue count in sync with localStorage changes
  function syncQueueCount() {
    setQueueCount(loadQueue().length);
  }

  // ✅ keep queue count synced when storage changes (same tab + other tabs)
  useEffect(() => {
    syncQueueCount();

    const onStorage = (e) => {
      // if key is null, means clear() happened; safe to update anyway
      if (!e || e.key == null || e.key === 'collab_playlist_offline_queue_v1') {
        syncQueueCount();
      }
    };

    window.addEventListener('storage', onStorage);

    // same-tab localStorage writes don't fire "storage" event,
    // so we also patch saveQueue calls by syncing after our own enqueue/dequeue usage (below).
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // IMPORTANT: keep library stable & serial (original first, then demo)
  const tracksSorted = useMemo(() => {
    const arr = tracks.slice();
    arr.sort((a, b) => {
      // Primary: numeric id ascending (original seeded first should stay first)
      if (typeof a.id === 'number' && typeof b.id === 'number' && a.id !== b.id) {
        return a.id - b.id;
      }
      // Secondary: title, then artist
      const t = String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base' });
      if (t !== 0) return t;
      return String(a.artist || '').localeCompare(String(b.artist || ''), undefined, { sensitivity: 'base' });
    });
    return arr;
  }, [tracks]);

  const genres = useMemo(() => {
    const set = new Set(tracksSorted.map((t) => t.genre).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [tracksSorted]);

  const playlistSorted = useMemo(() => {
    const arr = playlist.slice();
    if (sortMode === 'votes') {
      return arr.sort((a, b) => (b.votes - a.votes) || (a.position - b.position));
    }
    return arr.sort((a, b) => a.position - b.position);
  }, [playlist, sortMode]);

  const inPlaylistIds = useMemo(
    () => new Set(playlist.map((p) => p.track_id)),
    [playlist]
  );

  const filteredTracks = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tracksSorted.filter((t) => {
      const matchesGenre = selectedGenre === 'All' || t.genre === selectedGenre;

      const matchesQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.genre || '').toLowerCase().includes(q);

      return matchesGenre && matchesQuery;
    });
  }, [tracksSorted, search, selectedGenre]);

  const playlistTotal = useMemo(
    () => playlist.reduce((sum, i) => sum + i.track.duration_seconds, 0),
    [playlist]
  );

  const nowDurationSec = nowPlaying ? nowPlaying.track.duration_seconds : 0;
  const progress = nowDurationSec ? clamp(elapsedSec / nowDurationSec, 0, 1) : 0;

  useEffect(() => {
    async function load() {
      const [t, p] = await Promise.all([fetchTracks(), fetchPlaylist()]);
      setTracks(t);
      setPlaylist(p);
    }
    load();
  }, []);

  useEffect(() => {
    function setup() {
      if (sseRef.current) sseRef.current.close();

      const source = connectSSE(handleEvent, (st) => {
        setStatus(st);
        if (st === 'online') {
          reconnectDelay.current = 1000;
          flushOfflineQueue();
        }
      });

      sseRef.current = source;

      source.onerror = () => {
        setStatus('offline');
        source.close();

        if (!reconnectTimer.current) {
          reconnectTimer.current = setTimeout(() => {
            reconnectTimer.current = null;
            reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
            setup();
          }, reconnectDelay.current);
        }
      };
    }

    setup();

    return () => {
      if (sseRef.current) sseRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEvent(msg) {
    if (msg.type === 'ping') return;

    if (typeof msg.eventId === 'number') {
      if (msg.eventId <= lastEventIdRef.current) return;
      lastEventIdRef.current = msg.eventId;
    }

    if (msg.type === 'playlist.reordered' && Array.isArray(msg.items)) {
      setPlaylist(msg.items);
      return;
    }

    setPlaylist((prev) => {
      let next = prev.slice();
      switch (msg.type) {
        case 'track.added':
          next.push(msg.item);
          break;
        case 'track.removed':
          next = next.filter((i) => i.id !== msg.id);
          break;
        case 'track.moved':
          next = next.map((i) =>
            i.id === msg.item.id ? { ...i, position: msg.item.position } : i
          );
          break;
        case 'track.voted':
          next = next.map((i) =>
            i.id === msg.item.id ? { ...i, votes: msg.item.votes } : i
          );
          break;
        case 'track.playing':
          next = next.map((i) => ({ ...i, is_playing: i.id === msg.id }));
          setElapsedSec(0);
          baseStartMsRef.current = Date.now();
          break;
        default:
          break;
      }
      return next;
    });
  }

  useEffect(() => {
    if (!nowPlaying) return;

    if (baseStartMsRef.current == null) {
      baseStartMsRef.current = Date.now() - elapsedSec * 1000;
    }

    if (isPaused) return;

    const tick = () => {
      if (!nowPlaying) return;
      if (isSeekingRef.current) return;

      const start = baseStartMsRef.current ?? Date.now();
      const e = (Date.now() - start) / 1000;

      if (e >= nowPlaying.track.duration_seconds) {
        setElapsedSec(nowPlaying.track.duration_seconds);
        clearInterval(id);
        playNext();
        return;
      }

      setElapsedSec(e);
    };

    const id = setInterval(tick, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlaying, isPaused]);

  useEffect(() => {
    if (!nowPlaying) return;
    const el = rowRefs.current.get(nowPlaying.id);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [nowPlaying?.id]);

  async function flushOfflineQueue() {
  // dequeueAll clears queue in storage; update UI immediately
  const queued = dequeueAll();
  syncQueueCount();

  if (!queued.length) return;

  for (const action of queued) {
    try {
      if (action.type === 'add') await addToPlaylist(action.trackId, action.addedBy || 'Anonymous');
      if (action.type === 'remove') await deleteFromPlaylist(action.id);
      if (action.type === 'vote') await voteTrack(action.id, action.direction);
      if (action.type === 'move') await updatePlaylistItem(action.id, { position: action.position });
      if (action.type === 'play') await updatePlaylistItem(action.id, { is_playing: true });
    } catch (e) {
      // ✅ If server says item not found, drop this action (prevents queue stuck forever)
      if (e && e.status === 404) {
        continue;
      }

      // Otherwise re-queue and stop to preserve order
      enqueue(action);
      syncQueueCount();
      break;
    }
  }

  // after successful flush
  syncQueueCount();
 }

  function isOnline() {
    return status === 'online';
  }

  async function handleAdd(trackId) {
    if (!isOnline()) {
      enqueue({ type: 'add', trackId, addedBy: 'Anonymous' });
      syncQueueCount();
      return;
    }
    try {
      await addToPlaylist(trackId, 'Anonymous');
    } catch (e) {
      console.error(e);
    }
  }

  async function handleRemove(id) {
    const prev = playlist;
    setPlaylist((p) => p.filter((i) => i.id !== id));

    if (!isOnline()) {
      enqueue({ type: 'remove', id });
      syncQueueCount();
      return;
    }

    try {
      await deleteFromPlaylist(id);
    } catch (e) {
      console.error(e);
      setPlaylist(prev);
    }
  }

  async function handleVote(id, direction) {
    setPlaylist((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, votes: i.votes + (direction === 'up' ? 1 : -1), _votePulse: Date.now() }
          : i
      )
    );

    if (!isOnline()) {
      enqueue({ type: 'vote', id, direction });
      syncQueueCount();
      return;
    }

    try {
      await voteTrack(id, direction);
    } catch (e) {
      console.error(e);
      const fresh = await fetchPlaylist();
      setPlaylist(fresh);
    }
  }

  async function setNowPlaying(id) {
    setPlaylist((prev) => prev.map((i) => ({ ...i, is_playing: i.id === id })));
    setElapsedSec(0);
    baseStartMsRef.current = Date.now();

    if (!isOnline()) {
      enqueue({ type: 'play', id });
      syncQueueCount();
      return;
    }

    try {
      await updatePlaylistItem(id, { is_playing: true });
    } catch (e) {
      console.error(e);
      const fresh = await fetchPlaylist();
      setPlaylist(fresh);
    }
  }

  function playNext() {
    setPlaylist((prev) => {
      if (!prev.length) return prev;
      const sorted = prev.slice().sort((a, b) => a.position - b.position);
      const currentIndex = sorted.findIndex((i) => i.is_playing);
      const next = sorted[(currentIndex + 1) % sorted.length];
      if (next) setNowPlaying(next.id);
      return prev;
    });
  }

  function onDragStart(e, id) {
    dragIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  }

  function onDragEnd() {
    setDraggingId(null);
    setDragOverIndex(null);
  }

  function onDragOverRow(e, index) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function onDragLeave() {
    setDragOverIndex(null);
  }

  async function onDropReorder(e, index) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain') || dragIdRef.current;
    setDragOverIndex(null);
    setDraggingId(null);
    if (!draggedId) return;

    setPlaylist((prev) => {
      const ordered = prev.slice().sort((a, b) => a.position - b.position);
      const currentIndex = ordered.findIndex((i) => i.id === draggedId);
      if (currentIndex === -1) return prev;

      const [dragged] = ordered.splice(currentIndex, 1);
      ordered.splice(index, 0, dragged);

      const prevItem = ordered[index - 1] || null;
      const nextItem = ordered[index + 1] || null;

      const newPosition = calculatePosition(
        prevItem ? prevItem.position : null,
        nextItem ? nextItem.position : null
      );

      const updated = ordered.map((i) =>
        i.id === dragged.id ? { ...i, position: newPosition, _movedAt: Date.now() } : i
      );

      if (!isOnline()) {
        enqueue({ type: 'move', id: dragged.id, position: newPosition });
        syncQueueCount();
      } else {
        updatePlaylistItem(dragged.id, { position: newPosition }).catch(async () => {
          const fresh = await fetchPlaylist();
          setPlaylist(fresh);
        });
      }

      return updated;
    });

    setReorderPulse(Date.now());
  }

  function setElapsedAndBase(newElapsed) {
    const dur = nowDurationSec || 0;
    const clamped = clamp(newElapsed, 0, dur);
    setElapsedSec(clamped);
    baseStartMsRef.current = Date.now() - clamped * 1000;
  }

  function seekBy(deltaSec) {
    if (!nowPlaying) return;
    setElapsedAndBase(elapsedSec + deltaSec);
  }

  function seekToFraction(fraction) {
    if (!nowPlaying) return;
    const dur = nowPlaying.track.duration_seconds;
    setElapsedAndBase(dur * clamp(fraction, 0, 1));
  }

  function onProgressPointerDown(e) {
    if (!nowPlaying) return;
    isSeekingRef.current = true;

    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const frac = (x - rect.left) / rect.width;
    seekToFraction(frac);
  }

  function onProgressPointerMove(e) {
    if (!isSeekingRef.current || !nowPlaying) return;

    const rect = progressRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX ?? (e.touches && e.touches[0]?.clientX);
    const frac = (x - rect.left) / rect.width;
    seekToFraction(frac);
  }

  function onProgressPointerUp() {
    isSeekingRef.current = false;
  }

  useEffect(() => {
    function onKeyDown(ev) {
      const tag = (ev.target && ev.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (ev.key === 'ArrowLeft') {
        ev.preventDefault();
        seekBy(-5);
      } else if (ev.key === 'ArrowRight') {
        ev.preventDefault();
        seekBy(5);
      } else if (ev.key === ' ') {
        ev.preventDefault();
        setIsPaused((p) => !p);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedSec, nowPlaying, isPaused]);

  const playlistTotalMinutes = Math.floor(playlistTotal / 60);
  const playlistTotalSeconds = String(playlistTotal % 60).padStart(2, '0');

  return (
    <div className="app">
      <div className="bg-aurora" aria-hidden="true" />
      <div className="bg-noise" aria-hidden="true" />

      <div className="layout-shell">
        <header className="app-header">
          <div className="header-inner">
            <div className="brand-row">
              <div className="brand">
                <div className="brand-title">
                  <span className="brand-mark" aria-hidden="true" />
                  Realtime Collaborative Playlist
                </div>
                <div className="brand-sub">SQLite + Prisma • Express • SSE • React</div>
              </div>

              <div className="status-wrap">
                <span className={`status status-${status}`}>{status}</span>
                <span className="queue-pill" title="Queued actions while offline">
                  Queue: {queueCount}
                </span>
              </div>
            </div>

            <div className={`now-card ${nowPlaying ? 'now-card-live' : ''}`}>
              {nowPlaying ? (
                <>
                  <div className="now-meta">
                    <div className="now-title">
                      {nowPlaying.track.title} <span className="pill">Now Playing</span>
                    </div>
                    <div className="now-sub">{nowPlaying.track.artist}</div>

                    <div className="eq" aria-hidden="true" title="Live stream">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>

                  <div className="seek">
                    <div className="time">{formatTime(elapsedSec)}</div>

                    <div
                      className="progress"
                      ref={progressRef}
                      role="slider"
                      aria-label="Track progress"
                      aria-valuemin={0}
                      aria-valuemax={nowDurationSec}
                      aria-valuenow={Math.floor(elapsedSec)}
                      tabIndex={0}
                      onMouseDown={onProgressPointerDown}
                      onMouseMove={onProgressPointerMove}
                      onMouseUp={onProgressPointerUp}
                      onMouseLeave={onProgressPointerUp}
                      onTouchStart={onProgressPointerDown}
                      onTouchMove={onProgressPointerMove}
                      onTouchEnd={onProgressPointerUp}
                    >
                      <div className="progress-bar" style={{ width: `${progress * 100}%` }} />
                      <div className="progress-knob" style={{ left: `${progress * 100}%` }} />
                      <div className="progress-sheen" aria-hidden="true" />
                    </div>

                    <div className="time">{formatTime(nowDurationSec)}</div>
                  </div>

                  <div className="now-controls">
                    <button className="btn btn-ghost" onClick={() => setIsPaused((p) => !p)}>
                      {isPaused ? 'Play' : 'Pause'}
                    </button>
                    <button className="btn btn-primary" onClick={playNext}>
                      Skip
                    </button>
                  </div>

                  <div className="hint">
                    Shortcuts: <kbd>Space</kbd> Play/Pause • <kbd>←</kbd>/<kbd>→</kbd> Seek 5s
                  </div>
                </>
              ) : (
                <div className="now-empty">
                  No track playing. Click <b>Play</b> on a playlist item.
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="main layout-main">
          <section className="panel panel-playlist">
            <div className="panel-header">
              <div className="panel-header-left">
                <h2>Playlist</h2>
                <div className="panel-sub">
                  Total {playlistTotalMinutes}:{playlistTotalSeconds}
                </div>
              </div>

              <div className="toolbar">
                <div className="segmented" role="group" aria-label="Playlist sort mode">
                  <button
                    type="button"
                    className={`segmented-btn ${sortMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setSortMode('manual')}
                    title="Sort by manual drag order"
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${sortMode === 'votes' ? 'active' : ''}`}
                    onClick={() => setSortMode('votes')}
                    title="Sort by votes (desc)"
                  >
                    Top Voted
                  </button>
                </div>
              </div>
            </div>

            <div className="panel-body panel-scroll" data-reorder-pulse={reorderPulse}>
              {playlistSorted.map((item, index) => (
                <div key={item.id} className="drop-row">
                  {sortMode === 'manual' && dragOverIndex === index && <div className="drop-indicator" />}

                  <div
                    ref={(el) => {
                      if (el) rowRefs.current.set(item.id, el);
                      else rowRefs.current.delete(item.id);
                    }}
                    className={[
                      'row',
                      'row-playlist',
                      item.is_playing ? 'row-playing' : '',
                      item._movedAt ? 'row-moved' : '',
                      draggingId === item.id ? 'row-dragging' : '',
                      sortMode === 'votes' ? 'row-drag-disabled' : ''
                    ].join(' ')}
                    draggable={sortMode === 'manual'}
                    onDragStart={(e) => onDragStart(e, item.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => onDragOverRow(e, index)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDropReorder(e, index)}
                  >
                    <div
                      className="drag-handle"
                      title={sortMode === 'manual' ? 'Drag to reorder' : 'Switch to Manual to reorder'}
                    >
                      ☰
                    </div>

                    <div className="row-main">
                      <div className="row-title">
                        {item.track.title}
                        {item.is_playing && <span className="badge">Now Playing</span>}
                      </div>
                      <div className="row-sub">
                        {item.track.artist} • added by {item.added_by}
                      </div>
                    </div>

                    <div className="vote" data-pulse={item._votePulse || 0}>
                      <button className="btn-icon" onClick={() => handleVote(item.id, 'up')} aria-label="Upvote">
                        ▲
                      </button>
                      <span className={`vote-count ${item.votes > 0 ? 'pos' : item.votes < 0 ? 'neg' : ''}`}>
                        {item.votes}
                      </span>
                      <button className="btn-icon" onClick={() => handleVote(item.id, 'down')} aria-label="Downvote">
                        ▼
                      </button>
                    </div>

                    <div className="row-actions">
                      <button className="btn btn-ghost" onClick={() => setNowPlaying(item.id)}>
                        Play
                      </button>
                      <button className="btn btn-danger" onClick={() => handleRemove(item.id)}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {!playlistSorted.length && (
                <div className="empty-state">Playlist is empty. Add tracks from the library.</div>
              )}

              {sortMode === 'manual' && dragOverIndex === playlistSorted.length && <div className="drop-indicator" />}
            </div>
          </section>

          <section className="panel panel-library">
            <div className="panel-header">
              <div className="panel-header-left">
                <h2>Track Library</h2>
                <div className="panel-sub">Search and add songs</div>
              </div>

              <div className="toolbar">
                <select
                  className="select select-genre"
                  value={selectedGenre}
                  onChange={(e) => setSelectedGenre(e.target.value)}
                  aria-label="Filter by genre"
                >
                  {genres.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>

                <input
                  className="input"
                  placeholder="Search title, artist, genre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="panel-body panel-scroll">
              {filteredTracks.map((track) => {
                const inPlaylist = inPlaylistIds.has(track.id);

                return (
                  <div key={track.id} className="row row-library">
                    <div className="row-main">
                      <div className="row-title">{track.title}</div>
                      <div className="row-sub">
                        {track.artist} • {track.genre} • {formatTime(track.duration_seconds)}
                      </div>
                    </div>

                    <button
                      className={`btn ${inPlaylist ? 'btn-disabled' : 'btn-primary'}`}
                      disabled={inPlaylist}
                      onClick={() => handleAdd(track.id)}
                    >
                      {inPlaylist ? 'In Playlist' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}