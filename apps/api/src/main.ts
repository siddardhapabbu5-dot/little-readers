import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3100";
  app.enableCors({
    origin: corsOrigin.split(",").map((value) => value.trim()),
    credentials: true,
  });

  app.setGlobalPrefix("api");

  const port = Number(process.env.API_PORT ?? 4200);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Little Readers NestJS API listening on http://localhost:${port}/api/health`);
}

void bootstrap();
