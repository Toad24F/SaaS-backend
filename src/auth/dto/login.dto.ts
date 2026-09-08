import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

// DTO (Data Transfer Object) para el inicio de sesión 
// Contiene las validaciones de los datos que vamos a recibir en el inicio de sesión.
export class LoginDto {
    @IsEmail({}, { message: 'El correo electrónico no es válido' })
    @IsNotEmpty({ message: 'El correo es obligatorio' })
    email: string;

    @IsString()
    @IsNotEmpty({ message: 'La contraseña es obligatoria' })
    @MinLength(6, { message: 'La contraseña debe tener al menos 6 caracteres' })
    password: string;
}