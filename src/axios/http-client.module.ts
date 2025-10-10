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
        maxBodyLength: 900 * 1024 * 1024, // 900 MB (multipart/form-data adiciona overhead)
        maxContentLength: 900 * 1024 * 1024, // 900 MB
        timeout: Number(config.get<string>('HTTP_TIMEOUT') ?? 1800000), // 30 minutos - processamento DBC é lento
      }),
    }),
  ],
  exports: [HttpModule],
})
export class HttpClientModule {}
