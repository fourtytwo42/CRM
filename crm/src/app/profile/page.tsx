"use client";
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import Dialog, { DialogActions } from '@/components/ui/Dialog';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';

type Profile = { id: number; username: string; email?: string | null; avatar_url?: string | null; theme_preference?: string };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingSince, setPendingSince] = useState<string | null>(null);

  // Dialog state
  const [editUsernameOpen, setEditUsernameOpen] = useState(false);
  const [editEmailOpen, setEditEmailOpen] = useState(false);
  const [editPasswordOpen, setEditPasswordOpen] = useState(false);
  const [editAvatarOpen, setEditAvatarOpen] = useState(false);

  // Dialog form state
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Feedback state
  const [globalNotice, setGlobalNotice] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogSuccess, setDialogSuccess] = useState<string | null>(null);

  // Resend cooldown
  const [resendCooldownMs, setResendCooldownMs] = useState<number>(0);

  useEffect(() => {
    const u = localStorage.getItem('auth.user');
    if (u) {
      const parsed = JSON.parse(u);
      setProfile(parsed);
    }
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch('/api/profile', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json();
        if (json.ok) {
          setPendingEmail(json.data?.user?.new_email || null);
          setPendingSince(json.data?.user?.new_email_verification_sent_at || null);
        }
      } catch {}
    })();
    const bc = new BroadcastChannel('auth');
    bc.onmessage = (ev) => {
      if (ev.data?.type === 'profile') {
        try {
          const stored = localStorage.getItem('auth.user');
          if (stored) setProfile(JSON.parse(stored));
        } catch {}
      }
    };
    return () => bc.close();
  }, []);

  // Handle verify-email redirect banner
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const verified = params.get('verified');
      if (verified === '1') setGlobalNotice('Email verified successfully.');
      if (verified === '0') setGlobalError('Email verification failed or expired.');
    } catch {}
  }, []);

  useEffect(() => {
    if (resendCooldownMs <= 0) return;
    const id = setInterval(() => setResendCooldownMs((ms) => (ms > 1000 ? ms - 1000 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendCooldownMs]);

  const initial = useMemo(() => profile?.username?.[0]?.toUpperCase() || '', [profile?.username]);

  return (
    <main className="container-hero py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Your Profile</h1>

        {(globalNotice || globalError) && (
          <div className="text-sm">
            {globalNotice && (
              <div className="mb-2 rounded-lg bg-green-100 text-green-900 dark:bg-green-900/20 dark:text-green-200 px-4 py-2">{globalNotice}</div>
            )}
            {globalError && (
              <div className="mb-2 rounded-lg bg-red-100 text-red-900 dark:bg-red-900/20 dark:text-red-200 px-4 py-2">{globalError}</div>
            )}
          </div>
        )}

        {profile ? (
          <Card>
            <CardHeader
              title="Account"
              subtitle="Manage how you appear and how to sign in"
            />
            <CardBody>
              <div className="flex gap-5 items-start">
                <div className="relative w-24 h-24 shrink-0 rounded-full overflow-hidden ring-2 ring-black/10 dark:ring-white/10 bg-gray-200 dark:bg-gray-700 flex items-center justify-center group">
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xl font-semibold">{initial}</span>
                  )}
                  <button
                    type="button"
                    aria-label="Change avatar"
                    onClick={() => setEditAvatarOpen(true)}
                    className="absolute inset-x-0 bottom-0 h-6 flex items-center justify-center bg-black/50 text-white text-xs backdrop-blur-sm hover:bg-black/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      className="h-4 w-4"
                      fill="currentColor"
                    >
                      <path d="M9 3a1 1 0 0 0-.894.553L7.382 5H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3h-1.382l-.724-1.447A1 1 0 0 0 14 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs opacity-70">Username</div>
                      <div className="text-sm font-medium">{profile.username}</div>
                      <div className="text-xs opacity-70 mt-0.5">Your public handle and sign-in name.</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { setUsernameInput(profile.username); setDialogError(null); setDialogSuccess(null); setEditUsernameOpen(true); }}>Edit</Button>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs opacity-70">Email</div>
                      <div className="text-sm font-medium">{profile.email || '—'}</div>
                      {pendingEmail ? (
                        <div className="mt-1 flex items-center gap-2">
                          <Badge color="yellow">Pending: {pendingEmail}</Badge>
                          <span className="text-xs opacity-70">{pendingSince ? `sent ${new Date(pendingSince).toLocaleString()}` : ''}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleResend}
                            disabled={resendCooldownMs > 0}
                          >
                            {resendCooldownMs > 0 ? `Resend (${Math.ceil(resendCooldownMs / 1000)}s)` : 'Resend link'}
                          </Button>
                        </div>
                      ) : (
                        <div className="text-xs opacity-70 mt-0.5">Add an email to recover your account and receive notifications.</div>
                      )}
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { setEmailInput(''); setDialogError(null); setDialogSuccess(null); setEditEmailOpen(true); }}>Edit</Button>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs opacity-70">Password</div>
                      <div className="text-sm font-medium">••••••••</div>
                      <div className="text-xs opacity-70 mt-0.5">Use a strong, unique password.</div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setDialogError(null); setDialogSuccess(null); setEditPasswordOpen(true); }}>Change</Button>
                  </div>
                </div>
              </div>

              {/* Avatar change entrypoint moved into overlay button on the avatar */}
            </CardBody>
          </Card>
        ) : (
          <div className="text-sm opacity-70">No profile loaded.</div>
        )}

        {/* Username Dialog */}
        <Dialog open={editUsernameOpen} onOpenChange={setEditUsernameOpen} title="Edit username">
          <div className="space-y-3">
            {dialogError && <div className="rounded-md bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200 px-3 py-2 text-sm">{dialogError}</div>}
            {dialogSuccess && <div className="rounded-md bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 px-3 py-2 text-sm">{dialogSuccess}</div>}
            <label className="block text-sm">
              <span className="text-xs opacity-70">New username</span>
              <Input
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="your_name"
              />
            </label>
            <p className="text-xs opacity-70">3–20 characters, lowercase letters, numbers, and underscore only.</p>
          </div>
          <DialogActions>
            <Button variant="secondary" onClick={() => setEditUsernameOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateUsername}>Update</Button>
          </DialogActions>
        </Dialog>

        {/* Email Dialog */}
        <Dialog open={editEmailOpen} onOpenChange={setEditEmailOpen} title="Change email">
          <div className="space-y-3">
            {dialogError && <div className="rounded-md bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200 px-3 py-2 text-sm">{dialogError}</div>}
            {dialogSuccess && <div className="rounded-md bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 px-3 py-2 text-sm">{dialogSuccess}</div>}
            <label className="block text-sm">
              <span className="text-xs opacity-70">New email</span>
              <Input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={profile?.email || 'email@example.com'}
              />
            </label>
            <p className="text-xs opacity-70">We will send a verification link to confirm this change.</p>
          </div>
          <DialogActions>
            <Button variant="secondary" onClick={() => setEditEmailOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateEmail}>Send link</Button>
          </DialogActions>
        </Dialog>

        {/* Password Dialog */}
        <Dialog open={editPasswordOpen} onOpenChange={setEditPasswordOpen} title="Change password">
          <div className="space-y-3">
            {dialogError && <div className="rounded-md bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200 px-3 py-2 text-sm">{dialogError}</div>}
            {dialogSuccess && <div className="rounded-md bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 px-3 py-2 text-sm">{dialogSuccess}</div>}
            <Input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <Input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
          <DialogActions>
            <Button variant="secondary" onClick={() => setEditPasswordOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdatePassword}>Update Password</Button>
          </DialogActions>
        </Dialog>

        {/* Avatar Dialog */}
        <Dialog open={editAvatarOpen} onOpenChange={(o) => { setEditAvatarOpen(o); if (!o) resetAvatarDialog(); }} title="Update avatar">
          <div className="space-y-3">
            {dialogError && <div className="rounded-md bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200 px-3 py-2 text-sm">{dialogError}</div>}
            {dialogSuccess && <div className="rounded-md bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200 px-3 py-2 text-sm">{dialogSuccess}</div>}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 ring-2 ring-black/10 dark:ring-white/10 flex items-center justify-center">
                {avatarPreview || profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={(avatarPreview || profile?.avatar_url) as string} alt="preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold">{initial}</span>
                )}
              </div>
              <label className="block text-sm flex-1">
                <span className="text-xs opacity-70">Choose image</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setAvatarFile(file);
                    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
                    setAvatarPreview(file ? URL.createObjectURL(file) : null);
                  }}
                  className="block w-full text-sm"
                />
              </label>
            </div>
            <p className="text-xs opacity-70">Images are cropped to a square and optimized.</p>
          </div>
          <DialogActions>
            <Button variant="destructive" onClick={handleRemoveAvatar}>Remove</Button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={() => setEditAvatarOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateAvatar} disabled={!avatarFile}>Save</Button>
          </DialogActions>
        </Dialog>
      </div>
    </main>
  );

  async function handleUpdateUsername() {
    setDialogError(null); setDialogSuccess(null);
    const value = usernameInput.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(value)) {
      setDialogError('Username must be 3–20 chars, lowercase letters, numbers, underscore.');
      return;
    }
    const token = await getAccessToken();
    if (!token) { setDialogError('You are not signed in.'); return; }
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: value }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) {
      setDialogError(json?.error?.message || (json?.error?.code === 'USERNAME_TAKEN' ? 'That username is already taken.' : 'Failed to update username'));
      return;
    }
    try {
      const u = localStorage.getItem('auth.user');
      if (u) {
        const parsed = JSON.parse(u);
        parsed.username = value;
        localStorage.setItem('auth.user', JSON.stringify(parsed));
        new BroadcastChannel('auth').postMessage({ type: 'profile' });
      }
    } catch {}
    setProfile((p) => (p ? { ...p, username: value } : p));
    setDialogSuccess('Updated');
    setEditUsernameOpen(false);
  }

  async function handleUpdateEmail() {
    setDialogError(null); setDialogSuccess(null);
    const value = emailInput.trim().toLowerCase();
    if (!value) { setDialogError('Please enter an email.'); return; }
    const token = await getAccessToken();
    if (!token) { setDialogError('You are not signed in.'); return; }
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: value }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) {
      setDialogError(json?.error?.code === 'EMAIL_TAKEN' ? 'Email already in use.' : json?.error?.message || 'Failed to request change');
      return;
    }
    if (json?.data?.immediate) {
      // Email changed immediately (verification disabled)
      setProfile((p) => (p ? { ...p, email: value } : p));
      try {
        const u = localStorage.getItem('auth.user');
        if (u) { const parsed = JSON.parse(u); parsed.email = value; localStorage.setItem('auth.user', JSON.stringify(parsed)); new BroadcastChannel('auth').postMessage({ type: 'profile' }); }
      } catch {}
      setGlobalNotice('Email updated.');
    } else {
      setPendingEmail(value);
      setPendingSince(new Date().toISOString());
      setDialogSuccess('Verification link sent. Check your inbox.');
    }
    setEditEmailOpen(false);
  }

  async function handleUpdatePassword() {
    setDialogError(null); setDialogSuccess(null);
    if (newPassword !== confirmPassword) { setDialogError('New passwords do not match'); return; }
    const token = await getAccessToken();
    if (!token) { setDialogError('You are not signed in.'); return; }
    const res = await fetch('/api/profile/password', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) { setDialogError(json?.error?.message || 'Failed to change password'); return; }
    setDialogSuccess('Password updated.');
    setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    setEditPasswordOpen(false);
  }

  async function handleUpdateAvatar() {
    setDialogError(null); setDialogSuccess(null);
    if (!avatarFile) { setDialogError('Please choose an image'); return; }
    const token = await getAccessToken();
    if (!token) { setDialogError('You are not signed in.'); return; }
    const fd = new FormData();
    fd.set('avatar', avatarFile);
    const res = await fetch('/api/profile', { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: fd });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) { setDialogError(json?.error?.message || 'Failed to update avatar'); return; }
    try {
      const u = localStorage.getItem('auth.user');
      if (u && json.data?.avatar_url) {
        const parsed = JSON.parse(u);
        parsed.avatar_url = json.data.avatar_url;
        localStorage.setItem('auth.user', JSON.stringify(parsed));
        new BroadcastChannel('auth').postMessage({ type: 'profile' });
        setProfile(parsed);
      }
    } catch {}
    resetAvatarDialog();
    setEditAvatarOpen(false);
  }

  async function handleRemoveAvatar() {
    setDialogError(null); setDialogSuccess(null);
    const token = await getAccessToken();
    if (!token) { setDialogError('You are not signed in.'); return; }
    await fetch('/api/profile', { method: 'DELETE', headers: { authorization: `Bearer ${token}` } });
    try {
      const u = localStorage.getItem('auth.user');
      if (u) {
        const parsed = JSON.parse(u);
        parsed.avatar_url = null;
        localStorage.setItem('auth.user', JSON.stringify(parsed));
        new BroadcastChannel('auth').postMessage({ type: 'profile' });
        setProfile(parsed);
      }
    } catch {}
    resetAvatarDialog();
    setEditAvatarOpen(false);
  }

  async function handleResend() {
    setGlobalError(null); setGlobalNotice(null);
    const token = await getAccessToken();
    if (!token) return;
    const res = await fetch('/api/profile/email/resend', { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) {
      if (json?.error?.code === 'COOLDOWN') {
        const ms = Number(json?.error?.ms || 0);
        setResendCooldownMs(ms);
        return;
      }
      setGlobalError('Unable to resend verification link right now.');
      return;
    }
    setGlobalNotice('Verification email resent.');
  }

  function resetAvatarDialog() {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(null);
    setAvatarFile(null);
  }
}

async function getAccessToken(): Promise<string> {
  const refresh = localStorage.getItem('auth.refreshToken');
  if (!refresh) return '';
  const res = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: refresh }) });
  const json = await res.json();
  if (!json.ok) return '';
  localStorage.setItem('auth.refreshToken', json.data.refreshToken);
  localStorage.setItem('auth.user', JSON.stringify(json.data.user));
  try { new BroadcastChannel('auth').postMessage({ type: 'profile' }); } catch {}
  return json.data.accessToken as string;
}

