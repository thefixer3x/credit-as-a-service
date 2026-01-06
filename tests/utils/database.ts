import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { testConfig } from '../setup/test-env';
import * as schema from '@services/database/src/schema';

// Test database connection
let testDb: ReturnType<typeof drizzle>;
let connection: postgres.Sql;

export async function initializeTestDatabase() {
  try {
    // Create connection
    connection = postgres(testConfig.database.url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 60,
    });

    testDb = drizzle(connection, { schema });
    global.testDbConnection = testDb;

    // Run test migrations
    await runTestMigrations();
    
  } catch (error) {
    console.error('Failed to initialize test database:', error);
    throw error;
  }
}

export async function resetDatabase() {
  if (!testDb) {
    throw new Error('Test database not initialized');
  }

  try {
    // Disable foreign key checks temporarily
    await testDb.execute(sql`SET session_replication_role = replica`);

    // Get all table names
    const tables = await testDb.execute(sql`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'drizzle_%'
    `);

    // Truncate all tables
    for (const table of tables) {
      await testDb.execute(sql.raw(`TRUNCATE TABLE ${table.tablename} CASCADE`));
    }

    // Re-enable foreign key checks
    await testDb.execute(sql`SET session_replication_role = DEFAULT`);

  } catch (error) {
    console.error('Failed to reset database:', error);
    throw error;
  }
}

export async function runTestMigrations() {
  if (!testDb) {
    throw new Error('Test database not initialized');
  }

  try {
    // Create tables if they don't exist
    await testDb.execute(sql`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'active',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await testDb.execute(sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES tenants(id),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        role VARCHAR(50) DEFAULT 'user',
        status VARCHAR(50) DEFAULT 'active',
        kyc_status VARCHAR(50) DEFAULT 'pending',
        two_factor_enabled BOOLEAN DEFAULT false,
        two_factor_secret VARCHAR(255),
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await testDb.execute(sql`
      CREATE TABLE IF NOT EXISTS credit_applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        tenant_id UUID REFERENCES tenants(id),
        amount DECIMAL(15,2) NOT NULL,
        purpose VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        risk_score INTEGER,
        decision VARCHAR(50),
        submitted_at TIMESTAMP DEFAULT NOW(),
        processed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await testDb.execute(sql`
      CREATE TABLE IF NOT EXISTS credit_offers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id UUID REFERENCES credit_applications(id),
        amount DECIMAL(15,2) NOT NULL,
        interest_rate DECIMAL(5,4) NOT NULL,
        term_months INTEGER NOT NULL,
        monthly_payment DECIMAL(15,2),
        status VARCHAR(50) DEFAULT 'pending',
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Test database migrations completed');
  } catch (error) {
    console.error('Failed to run test migrations:', error);
    throw error;
  }
}

export function getTestDb() {
  if (!testDb) {
    throw new Error('Test database not initialized');
  }
  return testDb;
}

export async function closeTestDatabase() {
  if (connection) {
    await connection.end();
  }
}

// Helper functions for test data
export async function createTestTenant(overrides: Partial<any> = {}) {
  const tenant = {
    name: 'Test Tenant',
    slug: `test-tenant-${Date.now()}`,
    status: 'active',
    settings: {},
    ...overrides,
  };

  const [created] = await testDb.insert(schema.tenants).values(tenant).returning();
  return created;
}

export async function createTestUser(tenantId: string, overrides: Partial<any> = {}) {
  const user = {
    tenant_id: tenantId,
    email: `test-${Date.now()}@example.com`,
    password_hash: 'hashed-password',
    first_name: 'Test',
    last_name: 'User',
    role: 'user',
    status: 'active',
    kyc_status: 'verified',
    ...overrides,
  };

  const [created] = await testDb.insert(schema.users).values(user).returning();
  return created;
}

export async function createTestCreditApplication(userId: string, tenantId: string, overrides: Partial<any> = {}) {
  const application = {
    user_id: userId,
    tenant_id: tenantId,
    amount: 10000.00,
    purpose: 'Business expansion',
    status: 'pending',
    risk_score: 750,
    submitted_at: new Date(),
    ...overrides,
  };

  const [created] = await testDb.insert(schema.creditApplications).values(application).returning();
  return created;
}
