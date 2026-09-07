export function validateEnv(config: Record<string, unknown>) {
    const secret = config.JWT_SECRET;
    const expiration = config.JWT_EXPIRES_IN;

    // Comprobar que exista una clave con una longitud mínima.
    if (typeof secret !== 'string' || secret.trim().length < 32) {
        throw new Error(
            'JWT_SECRET es obligatorio y debe tener al menos 32 caracteres.',
        );
    }

    // Exigir una duración con unidad: segundos, minutos, horas o días.
    if (typeof expiration !== 'string') {
        throw new Error(
            'JWT_EXPIRES_IN es obligatorio. Ejemplos: 30s, 15m, 1h o 1d.',
        );
    }

    const match = /^([1-9]\d*)(s|m|h|d)$/.exec(expiration.trim());

    if (!match) {
        throw new Error(
            'JWT_EXPIRES_IN debe ser un entero positivo seguido de s, m, h o d.',
        );
    }

    const amount = Number(match[1]);
    const unit = match[2];

    const secondsPerUnit: Record<string, number> = {
        s: 1,
        m: 60,
        h: 3600,
        d: 86400,
    };

    const expiresInSeconds = amount * secondsPerUnit[unit];

    if (!Number.isSafeInteger(expiresInSeconds)) {
        throw new Error('JWT_EXPIRES_IN es demasiado grande.');
    }

    // Conservar las demás variables y convertir la duración a segundos.
    return {
        ...config,
        JWT_SECRET: secret,
        JWT_EXPIRES_IN: expiresInSeconds,
    };
}