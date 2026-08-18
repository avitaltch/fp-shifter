import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { ApplicationEnvironment } from '../config/environment';
import { TenantScope } from '../tenancy/tenant-scope';
import type { CreatePublicWaitlistEntryDto } from './dto/create-public-waitlist-entry.dto';
import type { PublicWaitlistEntryResponseDto } from './dto/public-waitlist-entry-response.dto';
import type { PublicBookingResponseDto } from './dto/public-booking-response.dto';
import { PublicActionRateLimiter } from './public-booking-rate-limiter.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import {
  DuplicateWaitlistEntryError,
  InvalidWaitlistRequestError,
  WaitlistOfferExpiredError,
  WaitlistOfferInvalidError,
} from './waitlist.errors';
import { WaitlistRepository } from './waitlist.repository';
import { WaitlistOfferTokenService } from './waitlist-offer-token.service';
import { readBearerCapability } from './capability-token';

const MAX_WAITLIST_WINDOW_MS = 31 * 86_400_000;

@Injectable()
export class PublicWaitlistService {
  constructor(
    private readonly directory: PublicSchedulingRepository,
    private readonly waitlist: WaitlistRepository,
    private readonly rateLimiter: PublicActionRateLimiter,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
    private readonly offerTokens: WaitlistOfferTokenService,
  ) {}

  async create(
    businessSlug: string,
    request: CreatePublicWaitlistEntryDto,
    clientAddress: string,
    now = new Date(),
  ): Promise<PublicWaitlistEntryResponseDto> {
    const windowStartsAt = new Date(request.windowStartsAt);
    const windowEndsAt = new Date(request.windowEndsAt);
    if (
      windowStartsAt.getTime() <= now.getTime() ||
      windowEndsAt.getTime() <= windowStartsAt.getTime() ||
      windowEndsAt.getTime() - windowStartsAt.getTime() > MAX_WAITLIST_WINDOW_MS
    ) {
      throw new BadRequestException({
        code: 'INVALID_WAITLIST_WINDOW',
        message: 'Waitlist window must be future, ordered, and at most 31 days',
      });
    }
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) {
      throw new NotFoundException({
        code: 'BUSINESS_NOT_FOUND',
        message: 'Business was not found',
      });
    }
    await this.rateLimiter.assertAllowed({
      action: 'public-waitlist',
      businessSlug: context.businessSlug,
      clientAddress,
      phoneE164: request.customer.phoneE164,
    });

    try {
      const entry = await this.waitlist.create(
        TenantScope.forBusiness(context.businessId),
        context,
        {
          windowStartsAt,
          windowEndsAt,
          serviceIds: request.serviceIds,
          customer: request.customer,
          demandFingerprint: this.fingerprint(context.businessId, request),
        },
      );
      return {
        ...entry,
        windowStartsAt: entry.windowStartsAt.toISOString(),
        windowEndsAt: entry.windowEndsAt.toISOString(),
        serviceIds: [...entry.serviceIds],
      };
    } catch (error) {
      if (error instanceof DuplicateWaitlistEntryError) {
        throw new ConflictException({
          code: 'DUPLICATE_WAITLIST_ENTRY',
          message: 'An active waitlist entry already exists for this request',
        });
      }
      if (error instanceof InvalidWaitlistRequestError) {
        throw new BadRequestException({
          code: 'INVALID_SERVICE_SELECTION',
          message: error.message,
        });
      }
      throw error;
    }
  }

  async accept(
    businessSlug: string,
    authorization: string | undefined,
  ): Promise<PublicBookingResponseDto> {
    const token = readBearerCapability(authorization, 'wo');
    if (!token) throw offerNotFound();
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) throw offerNotFound();
    try {
      const accepted = await this.waitlist.accept(
        TenantScope.forBusiness(context.businessId),
        this.offerTokens.hash(token),
        context,
      );
      return {
        ...accepted,
        startsAt: accepted.startsAt.toISOString(),
        endsAt: accepted.endsAt.toISOString(),
        managementTokenExpiresAt:
          accepted.managementTokenExpiresAt.toISOString(),
        steps: accepted.steps.map((step) => ({
          ...step,
          startsAt: step.startsAt.toISOString(),
          endsAt: step.endsAt.toISOString(),
        })),
      };
    } catch (error) {
      if (error instanceof WaitlistOfferInvalidError) throw offerNotFound();
      if (error instanceof WaitlistOfferExpiredError) {
        throw new ConflictException({
          code: 'WAITLIST_OFFER_EXPIRED',
          message: 'The waitlist offer has expired',
        });
      }
      throw error;
    }
  }

  async reject(
    businessSlug: string,
    authorization: string | undefined,
  ): Promise<void> {
    const token = readBearerCapability(authorization, 'wo');
    if (!token) throw offerNotFound();
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) throw offerNotFound();
    try {
      await this.waitlist.reject(
        TenantScope.forBusiness(context.businessId),
        this.offerTokens.hash(token),
      );
    } catch (error) {
      if (error instanceof WaitlistOfferInvalidError) throw offerNotFound();
      throw error;
    }
  }

  private fingerprint(
    businessId: string,
    request: CreatePublicWaitlistEntryDto,
  ): string {
    const secret = this.config.get('MANAGEMENT_TOKEN_SECRET', { infer: true });
    return createHmac('sha256', secret)
      .update(
        JSON.stringify({
          purpose: 'waitlist-demand-v1',
          businessId,
          phoneE164: request.customer.phoneE164,
          windowStartsAt: new Date(request.windowStartsAt).toISOString(),
          windowEndsAt: new Date(request.windowEndsAt).toISOString(),
          serviceIds: request.serviceIds,
        }),
      )
      .digest('hex');
  }
}

function offerNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'WAITLIST_OFFER_NOT_FOUND',
    message: 'Waitlist offer was not found',
  });
}
