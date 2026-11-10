import process from 'node:process';

process.env.NEXT_PUBLIC_API_URL ??= 'http://127.0.0.1:3000';
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??= 'pk_test_vitest';
process.env.CLERK_SECRET_KEY ??= 'sk_test_vitest';
