import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Exclusivo de logout: permite retirar una sesión sin exigir licencia vigente.
@Injectable()
export class JwtLogoutGuard extends AuthGuard('jwt-logout') {}
