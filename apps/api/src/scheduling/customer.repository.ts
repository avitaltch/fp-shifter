import { Injectable } from '@nestjs/common';
import type { TenantTransaction } from '../database/tenant-database.service';
import type { BookingCustomerInput } from './booking.types';

export interface CustomerRecord {
  id: string;
  firstName: string;
  email: string | null;
  phoneE164: string;
}

@Injectable()
export class CustomerRepository {
  async findOrCreate(
    transaction: TenantTransaction,
    customer: BookingCustomerInput,
  ): Promise<CustomerRecord> {
    const inserted = await transaction.query<CustomerRecord>(
      `insert into customers
         (business_id, first_name, last_name, email, phone_e164)
       values ($1, $2, $3, $4, $5)
       on conflict (business_id, phone_e164) where deleted_at is null
       do nothing
       returning id,
                 first_name as "firstName",
                 email::text as email,
                 phone_e164 as "phoneE164"`,
      [
        customer.firstName,
        customer.lastName,
        customer.email ?? null,
        customer.phoneE164,
      ],
    );
    if (inserted[0]) return inserted[0];

    const existing = await transaction.query<CustomerRecord>(
      `select id,
              first_name as "firstName",
              email::text as email,
              phone_e164 as "phoneE164"
       from customers
       where business_id = $1
         and phone_e164 = $2
         and deleted_at is null`,
      [customer.phoneE164],
    );
    if (!existing[0]) throw new Error('Customer lookup did not return a customer');
    return existing[0];
  }
}
