/** Express + Prisma roles (Batch 9 adds TEACHER / SCHOOL_ADMIN). */
export type UserRole =
  | "PARENT"
  | "TEACHER"
  | "SCHOOL_ADMIN"
  | "ADMIN"
  | "SUPER_ADMIN";

/** Multi-school SaaS roles (NestJS). */
export type PlatformRole =
  | "SUPER_ADMIN"
  | "SCHOOL_ADMIN"
  | "TEACHER"
  | "PARENT"
  | "STUDENT";

export type SubscriptionStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "CANCELLED"
  | "PENDING"
  | "GRACE"
  | "SUSPENDED";

export type AgeGroupCode =
  | "LEVEL_1"
  | "LEVEL_2"
  | "LEVEL_3"
  | "LEVEL_4"
  | "FOUNDATION"
  | "ELEMENTARY"
  | "ADVANCED";

export type LearningLevelCode =
  | "LEVEL_1"
  | "LEVEL_2"
  | "LEVEL_3"
  | "LEVEL_4"
  | "FOUNDATION"
  | "ELEMENTARY"
  | "ADVANCED";

export type SubscriptionPlanCode =
  | "STARTER"
  | "STANDARD"
  | "PREMIUM"
  | "ENTERPRISE";

export type AnyUserRole = UserRole | PlatformRole;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AnyUserRole;
  schoolId?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: string;
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface RegisterResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface LoginResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface ChildSummary {
  id: string;
  displayName: string;
  birthYear: number;
  level: LearningLevelCode;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  phase: number;
  architecture: "multi-tenant-school-saas";
  timestamp: string;
}

export interface PortalShellMeta {
  portal:
    | "super-admin"
    | "school"
    | "teacher"
    | "student"
    | "parent";
  phase: number;
  ready: boolean;
}
