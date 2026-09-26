//Define los roles de sistema permitidos
export enum Rol {
    SUPERADMIN = 'superadmin',
    ADMIN_NEGOCIO = 'admin_negocio',
    RECEPCIONISTA = 'recepcionista',
    // El rol se habilita en la política; su persistencia llega con M1-T014–T015.
    PROFESIONAL = 'profesional',
}
