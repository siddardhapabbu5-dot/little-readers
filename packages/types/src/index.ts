/** Legacy Express roles (preserved). Prefer PlatformRole for NestJS multi-school SaaS. */
export type UserRole = "PARENT" | "ADMIN" | "SUPER_ADMIN";

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

export type AgeGroupCode = "FOUNDATION" | "ELEMENTARY" | "ADVANCED";

export type LearningLevelCode =
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
