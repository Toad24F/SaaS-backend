import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

//Este guardia en específico se utiliza para proteger rutas privadas, 
//bloqueando el acceso a cualquiera que no envíe un token JWT (JSON Web Token) válido.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') { }