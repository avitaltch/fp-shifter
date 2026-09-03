import { Injectable } from '@nestjs/common';
import { hash, verify, argon2id } from 'argon2';
import { randomBytes } from 'node:crypto';

const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService {
  private readonly dummyHash = hash(randomBytes(32), ARGON2_OPTIONS);

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  async verify(password: string, passwordHash?: string): Promise<boolean> {
    const candidateHash = passwordHash ?? (await this.dummyHash);
    try {
      const matches = await verify(candidateHash, password);
      return Boolean(passwordHash) && matches;
    } catch {
      return false;
    }
  }
}
