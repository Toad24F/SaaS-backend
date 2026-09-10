import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';

@Module({ imports: [AuditoriaModule] })
export class CodigosModule {}
