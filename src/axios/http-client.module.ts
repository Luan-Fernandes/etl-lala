import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        maxRedirects: Number(config.get<string>('HTTP_MAX_REDIRECTS') ?? 5),
        headers: { 'User-Agent': 'etl-mult/axios' },
      }),
    }),
  ],
  exports: [HttpModule],
})
export class HttpClientModule {}
