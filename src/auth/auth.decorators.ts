import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const SkipAuth = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_ADMIN_KEY = 'isAdmin';
export const AdminOnly = () => SetMetadata(IS_ADMIN_KEY, true);

export interface AuthUser {
  id: number;
  email: string;
  admin: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
