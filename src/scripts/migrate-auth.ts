#!/usr/bin/env tsx
// src/scripts/migrate-auth.ts
// Database migration script for authentication and organization tables
import "dotenv/config";
import { pool as db } from "../repo/pg";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

async function runMigration() {
  console.log('Starting authentication and organization database migration...');

  try {
    // Read the extended schema
    const schemaPath = path.join(process.cwd(), 'schema-extended.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Remove comments from the entire schema first
    const cleanSchema = schema
      .split('\n')
      .map(line => {
        // Remove inline comments
        const commentIndex = line.indexOf('--');
        if (commentIndex !== -1) {
          line = line.substring(0, commentIndex);
        }
        return line.trim();
      })
      .filter(line => line.length > 0)
      .join('\n');

    // Handle dollar-quoted functions by replacing them temporarily
    const functionPattern = /CREATE OR REPLACE FUNCTION[\s\S]*?\$\$[\s\S]*?\$\$ language 'plpgsql';/gi;
    const functions: string[] = [];
    let schemaWithPlaceholders = cleanSchema;
    
    // Extract functions and replace with placeholders
    let match;
    let functionIndex = 0;
    while ((match = functionPattern.exec(cleanSchema)) !== null) {
      functions.push(match[0]);
      schemaWithPlaceholders = schemaWithPlaceholders.replace(match[0], `__FUNCTION_${functionIndex}__`);
      functionIndex++;
    }
    
    // Split the schema with placeholders
    const statements = schemaWithPlaceholders
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0)
      .map(stmt => {
        // Replace placeholders back with actual functions
        for (let i = 0; i < functions.length; i++) {
          stmt = stmt.replace(`__FUNCTION_${i}__`, functions[i]);
        }
        return stmt;
      });

    console.log(`Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}: ${statement.substring(0, 60)}...`);
          await db.query(statement);
        } catch (error: any) {
          // Some statements might fail if they already exist (like extensions)
          // Log the error but continue with other statements
          if (error.code === '42710' || // Extension already exists
              error.code === '42P07' || // Table already exists
              error.code === '42P16' || // Multiple primary key constraints
              error.code === '23505') {  // Unique constraint already exists
            console.log(`Warning: ${error.message} (continuing...)`);
          } else {
            console.error(`Error executing statement: ${error.message}`);
            console.error(`Statement: ${statement.substring(0, 100)}...`);
            console.error(`Error`,error);
            throw error;
          }
        }
      }
    }

    console.log('Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Set up your Supabase project at https://supabase.com');
    console.log('2. Configure environment variables in .env.local:');
    console.log('   - NEXT_PUBLIC_SUPABASE_URL');
    console.log('   - NEXT_PUBLIC_SUPABASE_ANON_KEY');
    console.log('   - SUPABASE_SERVICE_ROLE_KEY');
    console.log('3. Update your application to use the new authentication system');

  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration if this script is executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  runMigration().then(() => {
    console.log('Migration script completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

export { runMigration };
