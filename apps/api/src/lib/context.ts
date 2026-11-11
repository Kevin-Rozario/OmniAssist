import type { Role } from '@omni/types';
import type { Logger } from './logger';

export interface AuthSession {
  userId: string;
  role: Role;
}

interface AppVariables {
  requestId: string;
  logger: Logger;
  auth: AuthSession | null;
}

export interface AppEnv {
  Variables: AppVariables;
}
