import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { isDateString, isUUID } from 'class-validator';
import { AppModule } from 'src/app.module';
import { EmailInUseError } from 'src/errors/email-in-use.error';
import { PrismaInterceptor } from 'src/interceptors/prisma.interceptor';
import { PrismaService } from 'src/prisma/prisma.service';
import * as request from 'supertest';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    app.useGlobalInterceptors(new PrismaInterceptor());

    await app.init();

    const prisma = app.get<PrismaService>(PrismaService);
    await prisma.user.deleteMany();

    await request(app.getHttpServer()).post('/user').send({
      email: 'tester0@example.com',
      password: 'abc123456',
    });

    const response = await request(app.getHttpServer())
      .post('/login')
      .send({ email: 'tester0@example.com', password: 'abc123456' });

    token = response.body.accessToken;
  });

  describe('Post /user', () => {
    it('should create user', () => {
      return request(app.getHttpServer())
        .post('/user')
        .send({
          email: 'tester@example.com',
          password: 'abc123456',
        })
        .expect(201);
    });

    it('should not create user if email is already in use', () => {
      return expect(
        request(app.getHttpServer())
          .post('/user')
          .send({
            email: 'tester0@example.com',
            password: 'abc123456',
          })
          .expect(400),
      ).resolves.toMatchObject({
        text: JSON.stringify(new EmailInUseError().getResponse()),
      });
    });

    it('should not create user if email is invalid', () => {
      return request(app.getHttpServer())
        .post('/user')
        .send({
          email: 'tester',
          password: 'abc123456',
        })
        .expect(400);
    });

    it('should not create user if password is too weak', () => {
      return request(app.getHttpServer())
        .post('/user')
        .send({
          email: 'tester@example.com',
          password: 'abc123',
        })
        .expect(400);
    });
  });

  describe('Get /user', () => {
    it('should get user profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/user')
        .set({ Authorization: `Bearer ${token}` })
        .send()
        .expect(200);

      const user = response.body;

      expect(user).not.toHaveProperty('password');

      expect(isUUID(user.id, 4)).toBeTruthy();
      expect(user.email).toEqual('tester0@example.com');
      expect(user.address).toBeNull();
      expect(user.name).toBeNull();
      expect(isDateString(user.createdAt)).toBeTruthy();
      expect(isDateString(user.updatedAt)).toBeTruthy();
    });

    it('should not get user profile if unauthenticated', () => {
      return request(app.getHttpServer()).get('/user').send().expect(401);
    });
  });
});
