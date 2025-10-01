import { Module } from '@nestjs/common';
import { DatasusService } from './datasus.service';
import { DatasusController } from './datasus.controller';
import { HttpClientModule } from 'src/axios/http-client.module';
import { BullModule } from '@nestjs/bull';
import { DatasusProcessor } from './datasus.processor';

@Module({
  imports: [
    HttpClientModule,
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: Number(process.env.REDIS_PORT || 6379),
      },
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'fixed', delay: 5000 },
      },
    }),
    BullModule.registerQueue({ name: 'datasus' }),
  ],
  controllers: [DatasusController],
  providers: [DatasusService, DatasusProcessor],
})
export class DatasusModule {}
