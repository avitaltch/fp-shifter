import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { PasswordService } from './password.service';

async function createService(): Promise<PasswordService> {
  const module = await Test.createTestingModule({
    providers: [PasswordService],
  }).compile();
  return module.get(PasswordService);
}

describe('PasswordService', () => {
  it('hashes with Argon2id and verifies only the correct password', async () => {
    const service = await createService();
    const passwordHash = await service.hash('Correct Horse Battery Staple!7');

    expect(passwordHash).toMatch(/^\$argon2id\$/);
    await expect(
      service.verify('Correct Horse Battery Staple!7', passwordHash),
    ).resolves.toBe(true);
    await expect(service.verify('wrong password', passwordHash)).resolves.toBe(false);
  });

  it('performs a dummy verification for unknown accounts', async () => {
    const service = await createService();
    await expect(service.verify('any password')).resolves.toBe(false);
  });
});
