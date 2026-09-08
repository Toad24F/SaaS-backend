import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

//Este decorador se utiliza para obtener el usuario actual de la solicitud HTTP
export const CurrentUser = createParamDecorator(
    (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user as JwtPayload;
        return data ? user?.[data] : user;
    },
);