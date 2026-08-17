const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TenantScope {
  readonly businessId: string;

  private constructor(businessId: string) {
    this.businessId = businessId;
    Object.freeze(this);
  }

  static forBusiness(businessId: string): TenantScope {
    if (!UUID_PATTERN.test(businessId)) {
      throw new Error('Tenant business ID must be a valid UUID');
    }
    return new TenantScope(businessId.toLowerCase());
  }
}
