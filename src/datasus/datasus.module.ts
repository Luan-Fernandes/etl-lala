import { Module } from '@nestjs/common';
import { DatasusService } from './datasus.service';
import { DatasusController } from './datasus.controller';
import { HttpClientModule } from 'src/axios/http-client.module';

@Module({
  imports: [HttpClientModule],
  controllers: [DatasusController],
  providers: [DatasusService],
})
export class DatasusModule {}
