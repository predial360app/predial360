import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '@predial360/shared';

/** Injeta o payload JWT do usuário autenticado no parâmetro */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | JwtPayload[keyof JwtPayload] => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);
