//Define los roles de sistema permitidos
export enum Rol {
    SUPERADMIN = 'superadmin',
    ADMIN_NEGOCIO = 'admin_negocio',
    RECEPCIONISTA = 'recepcionista',
    // Profesional ya dispone de representación persistida desde M1-T015.
    PROFESIONAL = 'profesional',
}
