import type { PrismaClient } from '@prisma/client';
import { generateBootstrapPassword, hashPassword } from './security/password.js';

const BOOTSTRAP_ADMIN_EMAIL = 'admin@example.com';

export async function bootstrapAdminIfNeeded(args: {
  prisma: PrismaClient;
  enabled: boolean;
}): Promise<void> {
  if (!args.enabled) {
    return;
  }

  const existingUsers = await args.prisma.user.count();
  if (existingUsers > 0) {
    return;
  }

  const initialPassword = generateBootstrapPassword();
  const passwordHash = await hashPassword(initialPassword);
  try {
    await args.prisma.user.create({
      data: {
        email: BOOTSTRAP_ADMIN_EMAIL,
        name: 'Bootstrap Admin',
        passwordHash,
        mustChangePassword: true,
        emailVerified: false,
      },
    });
  } catch {
    // Another process may have created the first user concurrently.
    return;
  }

  // Intentionally printed once for initial bootstrap flow.
  console.error(`Bootstrap admin created: ${BOOTSTRAP_ADMIN_EMAIL}`);
  console.error(`Initial password (shown once): ${initialPassword}`);
}
