import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JwtPayload } from './auth.types';

// Compared against when the user doesn't exist, so a missing account takes as long as a wrong password
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12);

type UserWithBranches = User & { branchAccess: { branchId: string }[] };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    this.refreshTtlMs = parseDuration(this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d');
  }

  /**
   * Email + password login — owners and managers.
   */
  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { branchAccess: { select: { branchId: true } } },
    });

    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.passwordHash || !ok || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      throw new UnauthorizedException('Use PIN login on the POS');
    }

    return this.startSession(user);
  }

  /**
   * POS PIN login — any active staff assigned to the branch who has a PIN set.
   * PINs must be unique within a branch; the first match wins.
   */
  async pinLogin(branchId: string, pin: string): Promise<TokenPair> {
    const candidates = await this.prisma.user.findMany({
      where: { isActive: true, pinHash: { not: null }, branchAccess: { some: { branchId } } },
      include: { branchAccess: { select: { branchId: true } } },
    });

    for (const user of candidates) {
      if (await bcrypt.compare(pin, user.pinHash!)) {
        return this.startSession(user);
      }
    }
    throw new UnauthorizedException('Invalid PIN');
  }

  /**
   * Rotate a refresh token: revoke the presented one, issue a new pair.
   * Re-use of a revoked token revokes the entire family (likely theft).
   */
  async refresh(rawToken: string): Promise<TokenPair> {
    const record = await this.findRefreshToken(rawToken);

    if (record.revokedAt) {
      await this.revokeFamily(record.familyId);
      this.logger.warn(`Refresh token reuse detected for user ${record.userId} — family revoked`);
      throw new UnauthorizedException('Refresh token reused — please sign in again');
    }
    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
      include: { branchAccess: { select: { branchId: true } } },
    });
    if (!user || !user.isActive) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Account disabled');
    }

    const { token, id, tokenHash } = this.generateRefreshToken();

    // Conditional revoke guards against two concurrent refreshes with the same token
    const rotated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { id: record.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: id },
      });
      if (count === 0) return false;
      await tx.refreshToken.create({
        data: {
          id,
          userId: user.id,
          familyId: record.familyId,
          tokenHash,
          expiresAt: new Date(Date.now() + this.refreshTtlMs),
        },
      });
      return true;
    });

    if (!rotated) {
      await this.revokeFamily(record.familyId);
      throw new UnauthorizedException('Refresh token reused — please sign in again');
    }

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: token,
      expiresIn: this.accessExpiresIn,
    };
  }

  /** Sign out this device — revokes the token's whole family. */
  async logout(rawToken: string): Promise<void> {
    const record = await this.findRefreshToken(rawToken).catch(() => null);
    if (record) await this.revokeFamily(record.familyId);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        branchAccess: { select: { branch: { select: { id: true, name: true } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { branchAccess, ...rest } = user;
    return { ...rest, branches: branchAccess.map((a) => a.branch) };
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private get accessExpiresIn(): string {
    return this.config.get<string>('JWT_EXPIRES_IN') ?? '15m';
  }

  private async startSession(user: UserWithBranches): Promise<TokenPair> {
    const { token, id, tokenHash } = this.generateRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        id,
        userId: user.id,
        familyId: randomUUID(),
        tokenHash,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    this.logger.log(`Login: ${user.role} ${user.id}`);
    return {
      accessToken: await this.signAccessToken(user),
      refreshToken: token,
      expiresIn: this.accessExpiresIn,
    };
  }

  private signAccessToken(user: UserWithBranches): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      role: user.role,
      branchIds: user.branchAccess.map((a) => a.branchId),
    };
    return this.jwt.signAsync(payload, { expiresIn: this.accessExpiresIn });
  }

  /** Token format: `<recordId>.<secret>`; only sha256(secret) is stored. */
  private generateRefreshToken() {
    const id = randomUUID();
    const secret = randomBytes(48).toString('base64url');
    return { id, token: `${id}.${secret}`, tokenHash: sha256(secret) };
  }

  private async findRefreshToken(rawToken: string) {
    const [id, secret] = rawToken.split('.');
    if (!id || !secret) throw new UnauthorizedException('Invalid refresh token');

    const record = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!record) throw new UnauthorizedException('Invalid refresh token');

    const expected = Buffer.from(record.tokenHash, 'hex');
    const actual = Buffer.from(sha256(secret), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return record;
  }

  private revokeFamily(familyId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Parse "15m" / "7d" / "12h" / "30s" into milliseconds. */
function parseDuration(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) throw new Error(`Invalid duration "${value}" — use e.g. 15m, 12h, 7d`);
  const unit = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 's' | 'm' | 'h' | 'd'];
  return Number(match[1]) * unit;
}
