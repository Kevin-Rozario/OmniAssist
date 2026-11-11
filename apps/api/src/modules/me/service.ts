import type { MeResponse } from '@omni/types';
import type { AuthSession } from '../../lib/context';
import type { UserDirectory, UserProfile } from './repo';

const PROFILE_CACHE_TTL_MS = 60_000;

export interface MeServiceOptions {
  directory: UserDirectory;
  ttlMs?: number;
  now?: () => number;
}

export interface MeService {
  getMe: (session: AuthSession) => Promise<MeResponse>;
}

export function createMeService({ directory, ttlMs = PROFILE_CACHE_TTL_MS, now = Date.now }: MeServiceOptions): MeService {
  const cache = new Map<string, { profile: UserProfile; expiresAt: number }>();

  async function getProfile(userId: string): Promise<UserProfile> {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now())
      return cached.profile;

    const profile = await directory.getUser(userId);
    cache.set(userId, { profile, expiresAt: now() + ttlMs });
    return profile;
  }

  return {
    async getMe(session) {
      const profile = await getProfile(session.userId);
      return { userId: session.userId, ...profile, role: session.role };
    },
  };
}
