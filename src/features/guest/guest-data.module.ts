import { Module } from '@nestjs/common';

import { PrismaModule } from '@/infra/prisma/prisma.module';
import { GuestRepository } from '@/features/guest/guest.repository';

@Module({
  imports: [PrismaModule],
  providers: [GuestRepository],
  exports: [GuestRepository],
})
export class GuestDataModule {}
