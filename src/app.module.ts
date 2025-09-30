import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatasusModule } from './datasus/datasus.module';
import { HttpClientModule } from './axios/http-client.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpClientModule,
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        synchronize: String(process.env.DB_SYNC).toLowerCase() === 'true',
        logging: String(process.env.DB_LOGGING).toLowerCase() === 'true',
        autoLoadEntities: true,
      }),
    }),
    DatasusModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}