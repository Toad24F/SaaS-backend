import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

// DTO (Data Transfer Object) para el inicio de sesión 
// Contiene las validaciones de los datos que vamos a recibir en el inicio de sesión.
export class LoginDto {
    @IsEmail({}, { message: 'El correo electrónico no es válido' })
    @IsNotEmpty({ message: 'El correo es obligatorio' })
    email: string;

    @IsString()
    @IsNotEmpty({ message: 'La contraseña es obligatoria' })
    // Login compara credenciales y responde 401 uniforme; la longitud mínima se
    // exige al establecer una contraseña mediante la política de contraseñas.
    password: string;
}
