import type { ClerkClient } from '@clerk/backend';
import { UpstreamError } from '../../lib/errors';

export interface UserProfile {
  displayName: string;
  primaryEmail: string | null;
}

export interface UserDirectory {
  getUser: (userId: string) => Promise<UserProfile>;
}

type ClerkUser = Awaited<ReturnType<ClerkClient['users']['getUser']>>;

function toUserProfile(user: Pick<ClerkUser, 'firstName' | 'lastName' | 'username' | 'primaryEmailAddressId' | 'emailAddresses'>): UserProfile {
  const primaryEmail = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId)?.emailAddress
    ?? user.emailAddresses[0]?.emailAddress
    ?? null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return {
    displayName: fullName || user.username || primaryEmail || 'Unknown user',
    primaryEmail,
  };
}

export function clerkUserDirectory(clerk: Pick<ClerkClient, 'users'>): UserDirectory {
  return {
    async getUser(userId) {
      try {
        return toUserProfile(await clerk.users.getUser(userId));
      }
      catch (error) {
        throw new UpstreamError('Could not load the user profile from the identity provider.', { cause: error });
      }
    },
  };
}
