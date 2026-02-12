import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, setHours, setMinutes } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create organization
  const org = await prisma.organization.create({
    data: {
      name: 'Sunrise Care Services',
      active: true,
    },
  });

  console.log('✅ Created organization:', org.name);

  // Create locations
  const locations = await Promise.all([
    prisma.location.create({
      data: {
        name: 'Maple House',
        address: '123 Maple St, Vancouver, BC',
        organizationId: org.id,
      },
    }),
    prisma.location.create({
      data: {
        name: 'Oak Villa',
        address: '456 Oak Ave, Vancouver, BC',
        organizationId: org.id,
      },
    }),
    prisma.location.create({
      data: {
        name: 'Cedar Home',
        address: '789 Cedar Rd, Burnaby, BC',
        organizationId: org.id,
      },
    }),
  ]);

  console.log('✅ Created locations:', locations.length);

  // Create users
  const hashedPassword = await bcrypt.hash('password123', 10);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      phone: '+1-604-555-0100',
      role: 'ADMIN',
      organizationId: org.id,
    },
  });

  const manager = await prisma.user.create({
    data: {
      email: 'manager@demo.com',
      password: hashedPassword,
      firstName: 'Sarah',
      lastName: 'Manager',
      phone: '+1-604-555-0101',
      role: 'MANAGER',
      organizationId: org.id,
    },
  });

  // Create staff members with varying seniority
  const staff = await Promise.all([
    prisma.user.create({
      data: {
        email: 'staff@demo.com',
        password: hashedPassword,
        firstName: 'John',
        lastName: 'Smith',
        phone: '+1-604-555-0201',
        role: 'STAFF',
        seniority: 10,
        hireDate: new Date('2020-01-15'),
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'alice@demo.com',
        password: hashedPassword,
        firstName: 'Alice',
        lastName: 'Johnson',
        phone: '+1-604-555-0202',
        role: 'STAFF',
        seniority: 8,
        hireDate: new Date('2021-03-20'),
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'bob@demo.com',
        password: hashedPassword,
        firstName: 'Bob',
        lastName: 'Williams',
        phone: '+1-604-555-0203',
        role: 'STAFF',
        seniority: 6,
        hireDate: new Date('2022-06-10'),
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'carol@demo.com',
        password: hashedPassword,
        firstName: 'Carol',
        lastName: 'Davis',
        phone: '+1-604-555-0204',
        role: 'STAFF',
        seniority: 5,
        hireDate: new Date('2023-01-05'),
        organizationId: org.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'david@demo.com',
        password: hashedPassword,
        firstName: 'David',
        lastName: 'Martinez',
        phone: '+1-604-555-0205',
        role: 'STAFF',
        seniority: 3,
        hireDate: new Date('2024-02-15'),
        organizationId: org.id,
      },
    }),
  ]);

  console.log('✅ Created users:', 2 + staff.length);

  // Create shifts for the next 7 days
  const today = new Date();
  const shifts = [];

  for (let day = 0; day < 7; day++) {
    const date = addDays(today, day);
    
    // Day shift (7am-3pm)
    shifts.push(
      prisma.shift.create({
        data: {
          organizationId: org.id,
          locationId: locations[0].id,
          assignedToId: staff[0].id,
          date,
          startTime: setHours(setMinutes(date, 0), 7),
          endTime: setHours(setMinutes(date, 0), 15),
          role: 'Caregiver',
          status: 'SCHEDULED',
        },
      })
    );

    // Afternoon shift (3pm-11pm)
    shifts.push(
      prisma.shift.create({
        data: {
          organizationId: org.id,
          locationId: locations[1].id,
          assignedToId: staff[1].id,
          date,
          startTime: setHours(setMinutes(date, 0), 15),
          endTime: setHours(setMinutes(date, 0), 23),
          role: 'Caregiver',
          status: 'SCHEDULED',
        },
      })
    );

    // Night shift (11pm-7am)
    shifts.push(
      prisma.shift.create({
        data: {
          organizationId: org.id,
          locationId: locations[2].id,
          assignedToId: staff[2].id,
          date,
          startTime: setHours(setMinutes(date, 0), 23),
          endTime: setHours(setMinutes(addDays(date, 1), 0), 7),
          role: 'Night Supervisor',
          status: 'SCHEDULED',
        },
      })
    );
  }

  await Promise.all(shifts);
  console.log('✅ Created shifts:', shifts.length);

  console.log('\n🎉 Database seeded successfully!\n');
  console.log('📧 Login credentials:');
  console.log('   Admin:   admin@demo.com / password123');
  console.log('   Manager: manager@demo.com / password123');
  console.log('   Staff:   staff@demo.com / password123\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
