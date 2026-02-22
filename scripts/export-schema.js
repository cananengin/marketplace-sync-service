const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Get the database URL from environment or use default
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://user:password@localhost:5432/marketplace_sync?schema=public';
  
  // Extract connection details (simplified - in production, use proper parsing)
  console.log('Exporting database schema to schema.sql...');
  
  // Use pg_dump to export schema
  // Note: This requires pg_dump to be installed and accessible
  const schemaPath = path.join(__dirname, '..', 'schema.sql');
  
  // Try to use pg_dump if available
  try {
    const dbUrl = new URL(databaseUrl.replace('postgresql://', 'http://'));
    const host = dbUrl.hostname;
    const port = dbUrl.port || 5432;
    const dbName = dbUrl.pathname.split('/')[1]?.split('?')[0] || 'marketplace_sync';
    const user = dbUrl.username || 'user';
    const password = dbUrl.password || 'password';
    
    // Set PGPASSWORD environment variable for pg_dump
    process.env.PGPASSWORD = password;
    
    const pgDumpCommand = `pg_dump -h ${host} -p ${port} -U ${user} -d ${dbName} --schema-only --no-owner --no-acl > ${schemaPath}`;
    
    execSync(pgDumpCommand, { stdio: 'inherit' });
    console.log(`Schema exported successfully to ${schemaPath}`);
  } catch (error) {
    console.warn('pg_dump not available, generating schema from Prisma migrations...');
    
    // Fallback: Read from Prisma migrations
    const migrationsPath = path.join(__dirname, '..', 'prisma', 'migrations');
    
    if (fs.existsSync(migrationsPath)) {
      const migrations = fs.readdirSync(migrationsPath)
        .filter(dir => fs.statSync(path.join(migrationsPath, dir)).isDirectory())
        .sort()
        .reverse();
      
      if (migrations.length > 0) {
        const latestMigration = migrations[0];
        const migrationSqlPath = path.join(migrationsPath, latestMigration, 'migration.sql');
        
        if (fs.existsSync(migrationSqlPath)) {
          let sql = fs.readFileSync(migrationSqlPath, 'utf8');
          
          // Add header
          const header = `-- Marketplace Sync Service Database Schema
-- Generated from Prisma migrations
-- Latest migration: ${latestMigration}

`;
          
          fs.writeFileSync(schemaPath, header + sql);
          console.log(`Schema exported from Prisma migrations to ${schemaPath}`);
        } else {
          console.error('Migration SQL file not found');
          process.exit(1);
        }
      } else {
        console.error('No migrations found. Please run: npm run prisma:migrate');
        process.exit(1);
      }
    } else {
      console.error('Prisma migrations directory not found');
      process.exit(1);
    }
  }
} catch (error) {
  console.error('Error exporting schema:', error.message);
  process.exit(1);
}
