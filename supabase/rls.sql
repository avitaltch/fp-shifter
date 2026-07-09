-- Enable Row Level Security
alter table customers enable row level security;
alter table users enable row level security;
alter table service_types enable row level security;
alter table employee_skills enable row level security;
alter table appointments enable row level security;
alter table appointment_items enable row level security;
alter table availabilities enable row level security;

-- Policies for users
create policy "Authenticated users can view users" 
on users for select 
using (auth.role() = 'authenticated');

create policy "Users can update their own profile" 
on users for update 
using (auth.uid() = id);

create policy "Admins can update any profile" 
on users for update 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

create policy "Admins can delete any profile" 
on users for delete 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

-- Policies for customers
create policy "Authenticated users can view customers" 
on customers for select 
using (auth.role() = 'authenticated');

create policy "Anyone can insert customers" 
on customers for insert 
with check (true);

create policy "Admins can update customers" 
on customers for update 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

create policy "Admins can delete customers" 
on customers for delete 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

-- Policies for service_types
create policy "Anyone can view service types" 
on service_types for select 
using (deleted_at is null);

create policy "Admins can manage service types" 
on service_types for all 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

-- Policies for employee_skills
create policy "Anyone can view employee skills" 
on employee_skills for select 
using (true);

create policy "Admins can manage employee skills" 
on employee_skills for all 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

-- Policies for appointments
create policy "Authenticated users can view appointments" 
on appointments for select 
using (auth.role() = 'authenticated' and deleted_at is null);

create policy "Anyone can insert appointments" 
on appointments for insert 
with check (true);

create policy "Admins can update appointments" 
on appointments for update 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

create policy "Admins can delete appointments" 
on appointments for delete 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

-- Policies for appointment_items
create policy "Authenticated users can view appointment items" 
on appointment_items for select 
using (auth.role() = 'authenticated' and deleted_at is null);

create policy "Anyone can insert appointment items" 
on appointment_items for insert 
with check (true);

create policy "Admins can update appointment items" 
on appointment_items for update 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

create policy "Users can update their own appointment items status" 
on appointment_items for update 
using (user_id = auth.uid());

create policy "Admins can delete appointment items" 
on appointment_items for delete 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));

-- Policies for availabilities
create policy "Authenticated users can view availabilities" 
on availabilities for select 
using (auth.role() = 'authenticated');

create policy "Users can manage their own availability" 
on availabilities for all 
using (user_id = auth.uid());

create policy "Admins can manage any availability" 
on availabilities for all 
using (exists (select 1 from users where id = auth.uid() and role = 'Admin'));
