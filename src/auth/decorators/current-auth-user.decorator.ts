import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithAuthUser } from '../interfaces/authenticated-request.interface';

export const CurrentAuthUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request =
      context.switchToHttp().getRequest<RequestWithAuthUser>();

    return request.user;
  },
);
