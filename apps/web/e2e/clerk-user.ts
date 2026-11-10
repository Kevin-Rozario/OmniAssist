import process from 'node:process';

/** The Clerk user the signed-in tests sign in as: `E2E_CLERK_USER_EMAIL`, else the admin (or first) user. */
export async function clerkEmail(): Promise<string | undefined> {
  if (process.env.E2E_CLERK_USER_EMAIL)
    return process.env.E2E_CLERK_USER_EMAIL;

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret)
    return undefined;

  const response = await fetch('https://api.clerk.com/v1/users?limit=50', {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok)
    return undefined;

  const users = await response.json() as Array<{
    public_metadata?: { role?: string };
    email_addresses?: Array<{ email_address?: string }>;
  }>;
  const admin = users.find(user => user.public_metadata?.role === 'admin') ?? users[0];
  return admin?.email_addresses?.[0]?.email_address;
}
