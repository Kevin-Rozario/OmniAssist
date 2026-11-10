import type { ClerkClient } from '@clerk/backend';
import { MeResponseSchema } from '@omni/types';
import { describe, expect, it, vi } from 'vitest';
import { clerkUserDirectory } from '../src/modules/me/repo';
import { createMeService } from '../src/modules/me/service';
import { buildTestApp, fakeVerifier } from './harness';

interface StubUser {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  primaryEmailAddressId: string | null;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
}

function stubUser(firstName: string, lastName: string, email: string): StubUser {
  return {
    firstName,
    lastName,
    username: null,
    primaryEmailAddressId: 'idn_primary',
    emailAddresses: [
      { id: 'idn_primary', emailAddress: email },
    ],
  };
}

function appWithDirectory(getUser: ClerkClient['users']['getUser'], now: () => number = Date.now) {
  return buildTestApp({
    verifier: fakeVerifier({
      'member-token': { userId: 'user_member', role: 'member' },
      'admin-token': { userId: 'user_admin', role: 'admin' },
    }),
    meService: createMeService({
      directory: clerkUserDirectory({
        users: { getUser },
      } as Pick<ClerkClient, 'users'>),
      now,
    }),
  });
}

describe('/v1/me', () => {
  it('returns the member and admin profiles from Clerk', async () => {
    const getUser = vi.fn(async (userId: string) => {
      if (userId === 'user_admin')
        return stubUser('Grace', 'Hopper', 'grace@omni.test');
      return stubUser('Ada', 'Lovelace', 'ada@omni.test');
    });
    const { app } = appWithDirectory(getUser as unknown as ClerkClient['users']['getUser']);

    const member = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer member-token' },
    });
    const admin = await app.request('/v1/me', {
      headers: { Authorization: 'Bearer admin-token' },
    });

    expect(member.status).toBe(200);
    expect(MeResponseSchema.parse(await member.json())).toEqual({
      userId: 'user_member',
      displayName: 'Ada Lovelace',
      primaryEmail: 'ada@omni.test',
      role: 'member',
    });
    expect(admin.status).toBe(200);
    expect(MeResponseSchema.parse(await admin.json())).toEqual({
      userId: 'user_admin',
      displayName: 'Grace Hopper',
      primaryEmail: 'grace@omni.test',
      role: 'admin',
    });
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(getUser).toHaveBeenNthCalledWith(1, 'user_member');
    expect(getUser).toHaveBeenNthCalledWith(2, 'user_admin');
  });

  it('does not call Clerk again for the same user within 60 seconds', async () => {
    let now = 1_700_000_000_000;
    const getUser = vi.fn(async () => stubUser('Ada', 'Lovelace', 'ada@omni.test'));
    const { app } = appWithDirectory(getUser as unknown as ClerkClient['users']['getUser'], () => now);
    const headers = { Authorization: 'Bearer member-token' };

    expect((await app.request('/v1/me', { headers })).status).toBe(200);
    now += 59_999;
    expect((await app.request('/v1/me', { headers })).status).toBe(200);
    expect(getUser).toHaveBeenCalledTimes(1);

    now += 1;
    expect((await app.request('/v1/me', { headers })).status).toBe(200);
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
